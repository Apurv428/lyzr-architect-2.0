import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DEMO_QUESTIONS, demoBuild, demoEdit, demoIntro, demoPlan } from "@/lib/ai/demo";
import { SYSTEM_PROMPT, TOOLS } from "@/lib/ai/prompt";
import { loadAttachments, toClaudeBlocks, toOpenAIParts } from "@/lib/ai/attachments";
import { resolveProvider, userAI, type ResolvedProvider } from "@/lib/ai/keys";
import { MAX_ATTACHMENTS, activeAttachments } from "@/lib/attachments";
import { CLAUDE_MODEL, OPENAI_MODEL, supportsReasoningEffort, toOpenAITools } from "@/lib/ai/provider";
import {
  PlanSchema,
  QuestionsSchema,
  WriteFilesSchema,
  type ChangesData,
  type ChatAction,
  type ChatEvent,
  type ChatMessage,
  type ErrorData,
  type FileMap,
  type Plan,
  type Questions,
  type UserMessageData,
  type WriteFiles,
} from "@/lib/ai/schema";
import { track } from "@/lib/analytics";
import { OUT_OF_CREDITS, currentCredits, spendCredit } from "@/lib/credits";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Mode } from "@/lib/types";

export const maxDuration = 300;


const Body = z.object({
  projectId: z.string().uuid(),
  action: z.enum(["start", "message", "approve"]),
  input: z.string().trim().max(4000).optional(),
  retry: z.boolean().optional(),
  /** The message answers (or skips) the question card. */
  intent: z.enum(["answers", "skip"]).optional(),
  attachments: z
    .array(z.object({ path: z.string().max(300), mime: z.string().max(60), name: z.string().max(200), size: z.number().int().nonnegative() }))
    .max(MAX_ATTACHMENTS)
    .optional(),
});

type Project = {
  id: string;
  name: string;
  description: string | null;
  github_repo: string | null;
  prompt: string | null;
  mode: Mode;
  framework: string | null;
  template_id: string | null;
};

type Turn = {
  supabase: SupabaseClient;
  project: Project;
  action: ChatAction;
  input?: string;
  history: ChatMessage[];
  files: FileMap;
  send: (event: ChatEvent) => void;
  signal: AbortSignal;
  startedAt: number;
  llm: ResolvedProvider;
  userId: string;
};

export async function POST(request: Request) {
  if (!isSupabaseConfigured) return Response.json({ error: "Backend not configured" }, { status: 503 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { projectId, action, input, retry, intent, attachments } = parsed.data;
  if (action === "message" && !input) return Response.json({ error: "Empty message" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: project }, credits, { data: rows }, { data: checkpoint }, ai] = await Promise.all([
    supabase.from("projects").select("id, name, description, github_repo, prompt, mode, framework, template_id").eq("id", projectId).single(),
    currentCredits(supabase),
    supabase
      .from("messages")
      .select("id, role, kind, content, data, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("checkpoints")
      .select("files")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    userAI(supabase, user.id),
  ]);

  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  const llm = resolveProvider(ai);
  if (credits <= 0 && !llm.byok) return Response.json({ error: OUT_OF_CREDITS }, { status: 402 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const turn: Turn = {
        supabase,
        project: project as Project,
        action,
        input,
        history: ((rows ?? []) as ChatMessage[]).reverse(),
        files: (checkpoint?.files ?? {}) as FileMap,
        send,
        signal: request.signal,
        startedAt: Date.now(),
        llm,
        userId: user.id,
      };

      try {
        if (!retry && action !== "start") {
          const userText = action === "approve" ? "Looks good — build it." : input!;
          const message = await insertMessage(turn, {
            role: "user",
            kind: "text",
            content: userText,
            data:
              action === "approve"
                ? { approved: true }
                : attachments?.length
                  ? { attachments: attachments.filter((a) => a.path.startsWith(`${user.id}/`)) }
                  : null,
          });
          turn.history.push(message);
          if (action === "approve") await track(supabase, "plan_approved", { mode: turn.project.mode }, projectId);
          if (intent) await track(supabase, "questions_answered", { skipped: intent === "skip" }, projectId);
        }

        const ran =
          llm.provider === "anthropic" ? await runModelTurn(turn) : llm.provider === "openai" ? await runOpenAITurn(turn) : await runDemoTurn(turn);
        if (ran && !llm.byok) send({ t: "credits", credits: await spendCredit(supabase) });
      } catch (err) {
        if (!request.signal.aborted) {
          console.error("[chat]", err);
          await failTurn(turn, "Something went wrong on our side. Try again in a moment.");
        }
      } finally {
        send({ t: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ─────────────────────────── model turn ───────────────────────────

function historyToParams(history: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const params: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of history) {
    if (m.kind === "error" || !m.content) continue;
    if (m.role === "user") {
      const files = (m.data as UserMessageData | null)?.attachments;
      params.push({ role: "user", content: files?.length ? `${m.content}\n[Attached: ${files.map((f) => f.name).join(", ")}]` : m.content });
    } else if (m.role === "system") {
      params.push({ role: "user", content: `[Workspace event: ${m.content}]` });
    } else if (m.kind === "questions") {
      const q = m.data as Questions;
      params.push({ role: "assistant", content: `[I asked]\n${q.questions.map((x) => `- ${x.question} (${x.options.join(" / ")})`).join("\n")}` });
    } else if (m.kind === "plan") {
      params.push({ role: "assistant", content: `[I proposed this plan]\n${JSON.stringify(m.data)}` });
    } else if (m.kind === "changes") {
      const d = m.data as ChangesData;
      params.push({
        role: "assistant",
        content: `[I updated ${d.files.join(", ")} — "${d.label}"]\n- ${d.summary.join("\n- ")}`,
      });
    } else {
      params.push({ role: "assistant", content: m.content });
    }
  }
  return params;
}

function latestPlan(history: ChatMessage[]) {
  return [...history].reverse().find((m) => m.kind === "plan")?.data as Plan | undefined;
}

function turnContext({ project, action, files, history }: Turn) {
  const fileList = Object.entries(files);
  const filesBlock = fileList.length
    ? fileList.map(([path, content]) => `<file path="${path}">\n${content}\n</file>`).join("\n")
    : "(no files yet — nothing has been built)";
  const directive =
    action === "start"
      ? project.mode === "guided"
        ? "This is a brand-new project. If the request leaves the users, data source or outcome unclear, ask with ask_questions; otherwise propose a plan with propose_plan."
        : "This is a brand-new project. Propose a plan with propose_plan."
      : action === "approve"
        ? latestPlan(history)?.edited
          ? "The user edited the latest plan themselves, then approved it. Follow the edited version exactly and build the complete app now with write_files."
          : "The user approved the latest plan. Build the complete app now with write_files."
        : "Respond to the user's latest message.";

  return `<context>
Mode: ${project.mode === "pro" ? "Pro" : "Guided"}
Project: ${project.name}${project.framework ? `\nPreferred agent framework: ${project.framework}` : ""}${
    project.github_repo
      ? `\nImported repository: ${project.description}\nThe user's repo is not modified directly — plan the agent to fit their stack, and build a demo UI for it in the sandbox. Changes reach their repo later as a pull request.`
      : ""
  }
Current app files:
${filesBlock}
</context>

${directive}`;
}

function friendlyPath(path: string, mode: Mode) {
  if (mode === "pro") return `Writing ${path}`;
  const base = path.split("/").pop()!.replace(/\.(tsx|ts|css)$/, "");
  if (base === "App") return "Laying out the main screen…";
  if (base === "data") return "Adding sample data…";
  return `Building ${base.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}…`;
}

async function runModelTurn(turn: Turn): Promise<boolean> {
  const { send, project } = turn;
  const client = new Anthropic(turn.llm.apiKey ? { apiKey: turn.llm.apiKey } : {});

  const files = await loadAttachments(turn.supabase, turn.userId, activeAttachments(turn.history));
  if (files.length) send({ t: "status", label: `Reading ${files.length === 1 ? files[0].name : `${files.length} attachments`}…` });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...historyToParams(turn.history),
    { role: "user", content: [...toClaudeBlocks(files), { type: "text", text: turnContext(turn) }] },
  ];

  const stream = client.beta.messages.stream(
    {
      model: CLAUDE_MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: turn.action === "approve" ? "high" : "medium" },
      cache_control: { type: "ephemeral" },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    },
    { signal: turn.signal },
  );

  let toolName: string | null = null;
  let partial = "";
  const announced = new Set<string>();
  let final: Anthropic.Beta.BetaMessage;

  send({ t: "status", label: "Thinking…" });
  try {
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          toolName = event.content_block.name;
          partial = "";
          send({ t: "status", label: toolName === "propose_plan" ? "Drafting the plan…" : toolName === "ask_questions" ? "Preparing a few questions…" : "Writing code…" });
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          send({ t: "text", delta: event.delta.text });
        } else if (event.delta.type === "input_json_delta" && toolName === "write_files") {
          partial += event.delta.partial_json;
          for (const match of partial.matchAll(/"path"\s*:\s*"([^"]+)"/g)) {
            if (announced.has(match[1])) continue;
            announced.add(match[1]);
            send({ t: "status", label: friendlyPath(match[1], project.mode) });
          }
        }
      }
    }
    final = await stream.finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.warn("[chat] Anthropic auth failed — falling back to demo mode");
      return runDemoTurn(turn);
    }
    if (err instanceof Anthropic.RateLimitError) {
      await failTurn(turn, "Architect is busy right now. Give it a few seconds and retry.");
      return false;
    }
    if (err instanceof Anthropic.APIError) throw err;
    // Unparseable streamed tool input — nothing was persisted, so a retry is safe.
    await failTurn(turn, "I produced a malformed response. Retrying usually fixes it.");
    return false;
  }

  if (final.stop_reason === "refusal") {
    await failTurn(turn, "I can't help build that. Try rephrasing what you need.");
    return false;
  }
  const toolUses = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
  if (final.stop_reason === "max_tokens" && toolUses.length) {
    await failTurn(turn, "That was too much to write in one go. Try asking for a smaller change.");
    return false;
  }

  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (text) await insertMessage(turn, { role: "assistant", kind: "text", content: text, data: null });

  for (const block of toolUses) {
    if (!(await applyToolCall(turn, block.name, block.input))) return false;
  }
  return true;
}

/** Validate a tool call's input and persist it. Shared by every provider. */
async function applyToolCall(turn: Turn, name: string, input: unknown): Promise<boolean> {
  if (name === "ask_questions") {
    const questions = QuestionsSchema.safeParse(input);
    if (!questions.success) {
      await failTurn(turn, "My questions came out garbled. Retry and I'll ask again — or just describe more detail.");
      return false;
    }
    await insertMessage(turn, { role: "assistant", kind: "questions", content: questions.data.intro ?? null, data: questions.data });
  } else if (name === "propose_plan") {
    const plan = PlanSchema.safeParse(input);
    if (!plan.success) {
      await failTurn(turn, "My plan came out incomplete. Retry and I'll draft it again.");
      return false;
    }
    await savePlan(turn, plan.data);
  } else if (name === "write_files") {
    const write = WriteFilesSchema.safeParse(input);
    if (!write.success) {
      await failTurn(turn, "Some files came out incomplete, so I didn't apply them. Retry to regenerate.");
      return false;
    }
    await saveFiles(turn, write.data);
  }
  return true;
}

// ─────────────────────────── OpenAI turn ───────────────────────────

async function runOpenAITurn(turn: Turn): Promise<boolean> {
  const { send, project } = turn;
  const client = new OpenAI(turn.llm.apiKey ? { apiKey: turn.llm.apiKey } : {});
  const files = await loadAttachments(turn.supabase, turn.userId, activeAttachments(turn.history));
  if (files.length) send({ t: "status", label: `Reading ${files.length === 1 ? files[0].name : `${files.length} attachments`}…` });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historyToParams(turn.history).map((m) => ({ role: m.role, content: m.content as string })),
    { role: "user", content: [...toOpenAIParts(files), { type: "text", text: turnContext(turn) }] },
  ];

  const calls: { name: string; args: string }[] = [];
  const announced = new Set<string>();
  let text = "";
  let finish: string | null = null;

  send({ t: "status", label: "Thinking…" });
  try {
    const stream = await client.chat.completions.create(
      {
        model: OPENAI_MODEL,
        messages,
        tools: toOpenAITools(TOOLS),
        stream: true,
        max_completion_tokens: 32000,
        ...(supportsReasoningEffort(OPENAI_MODEL) ? { reasoning_effort: turn.action === "approve" ? ("medium" as const) : ("low" as const) } : {}),
      },
      { signal: turn.signal },
    );

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.finish_reason) finish = choice.finish_reason;
      const delta = choice.delta;
      if (delta?.content) {
        text += delta.content;
        send({ t: "text", delta: delta.content });
      }
      for (const tc of delta?.tool_calls ?? []) {
        const call = (calls[tc.index] ??= { name: "", args: "" });
        if (tc.function?.name) {
          call.name += tc.function.name;
          send({ t: "status", label: call.name === "propose_plan" ? "Drafting the plan…" : call.name === "ask_questions" ? "Preparing a few questions…" : "Writing code…" });
        }
        if (tc.function?.arguments) {
          call.args += tc.function.arguments;
          if (call.name === "write_files") {
            for (const match of call.args.matchAll(/"path"\s*:\s*"([^"]+)"/g)) {
              if (announced.has(match[1])) continue;
              announced.add(match[1]);
              send({ t: "status", label: friendlyPath(match[1], project.mode) });
            }
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof OpenAI.AuthenticationError) {
      console.warn("[chat] OpenAI auth failed — falling back to demo mode");
      return runDemoTurn(turn);
    }
    if (err instanceof OpenAI.RateLimitError) {
      await failTurn(turn, "Architect is busy right now. Give it a few seconds and retry.");
      return false;
    }
    throw err;
  }

  if (finish === "content_filter") {
    await failTurn(turn, "I can't help build that. Try rephrasing what you need.");
    return false;
  }
  if (finish === "length" && calls.length) {
    await failTurn(turn, "That was too much to write in one go. Try asking for a smaller change.");
    return false;
  }

  if (text.trim()) await insertMessage(turn, { role: "assistant", kind: "text", content: text.trim(), data: null });

  for (const call of calls.filter(Boolean)) {
    let input: unknown;
    try {
      input = JSON.parse(call.args);
    } catch {
      await failTurn(turn, "I produced a malformed response. Retrying usually fixes it.");
      return false;
    }
    if (!(await applyToolCall(turn, call.name, input))) return false;
  }
  return true;
}

// ─────────────────────────── demo turn ───────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function streamText(turn: Turn, text: string) {
  for (const chunk of text.match(/[\s\S]{1,6}/g) ?? []) {
    turn.send({ t: "text", delta: chunk });
    await sleep(18);
  }
  await insertMessage(turn, { role: "assistant", kind: "text", content: text, data: null });
}

async function runDemoTurn(turn: Turn): Promise<boolean> {
  const { project, action, send } = turn;
  const latestPlan = [...turn.history].reverse().find((m) => m.kind === "plan")?.data as Plan | undefined;

  if (activeAttachments(turn.history)?.length && action !== "approve") {
    await streamText(turn, "Heads up: demo mode can't read attachments, so I'll plan from your text. Add an Anthropic or OpenAI key to build straight from a screenshot or spec.");
  }

  // Guided + a free-form prompt: ask first, like the model would.
  if (action === "start" && project.mode === "guided" && !project.template_id) {
    send({ t: "status", label: "Preparing a few questions…" });
    await sleep(700);
    await insertMessage(turn, { role: "assistant", kind: "questions", content: DEMO_QUESTIONS.intro ?? null, data: DEMO_QUESTIONS });
    return true;
  }

  if (action === "start" || (action === "message" && !latestPlan)) {
    const answered = [...turn.history].reverse().find((m) => m.role === "assistant")?.kind === "questions";
    send({ t: "status", label: "Thinking…" });
    await sleep(600);
    await streamText(turn, demoIntro(project.mode));
    send({ t: "status", label: "Drafting the plan…" });
    await sleep(700);
    const plan = demoPlan(project.prompt ?? turn.input ?? "", project.name, project.template_id);
    if (answered && turn.input) plan.assumptions.unshift(`From your answers — ${turn.input.replace(/\n+/g, " · ")}`);
    await savePlan(turn, plan);
    return true;
  }

  if (action === "approve") {
    const plan = latestPlan ?? demoPlan(project.prompt ?? "", project.name, project.template_id);
    const build = demoBuild(plan, project.name);
    await streamText(turn, project.mode === "guided" ? "On it — building your app now." : "Generating the app from the approved plan.");
    for (const f of build.files) {
      send({ t: "status", label: friendlyPath(f.path, project.mode) });
      await sleep(650);
    }
    await saveFiles(turn, build);
    return true;
  }

  const edit = demoEdit(turn.input ?? "", turn.files);
  if (edit) {
    await streamText(turn, "Sure — updating that now.");
    send({ t: "status", label: "Writing code…" });
    await sleep(700);
    await saveFiles(turn, edit);
    return true;
  }
  await streamText(
    turn,
    "I'm running in demo mode, so I can only do a few scripted edits (try “make it green”). Connect an Anthropic API key to unlock full AI edits.",
  );
  return false;
}

// ─────────────────────────── persistence ───────────────────────────

async function insertMessage(
  turn: Turn,
  row: Pick<ChatMessage, "role" | "kind" | "content" | "data"> & { id?: string },
): Promise<ChatMessage> {
  const { data, error } = await turn.supabase
    .from("messages")
    .insert({ ...row, project_id: turn.project.id })
    .select("id, role, kind, content, data, created_at")
    .single();
  if (error || !data) throw error ?? new Error("insert failed");
  const message = data as ChatMessage;
  turn.send({ t: "message", message });
  return message;
}

async function failTurn(turn: Turn, content: string) {
  const retryInput = turn.action === "message" ? turn.input : undefined;
  const data: ErrorData = { retry: turn.action, input: retryInput };
  await insertMessage(turn, { role: "assistant", kind: "error", content, data }).catch(() =>
    turn.send({
      t: "message",
      message: { id: crypto.randomUUID(), role: "assistant", kind: "error", content, data, created_at: new Date().toISOString() },
    }),
  );
}

async function savePlan(turn: Turn, plan: Plan) {
  await insertMessage(turn, { role: "assistant", kind: "plan", content: plan.summary, data: plan });
  await track(turn.supabase, "plan_proposed", { mode: turn.project.mode }, turn.project.id);
  await turn.supabase.from("projects").update({ status: "planning" }).eq("id", turn.project.id);
}

async function saveFiles(turn: Turn, write: WriteFiles) {
  const files: FileMap = { ...turn.files };
  for (const path of write.deleted ?? []) delete files[path];
  for (const f of write.files) files[f.path] = f.content;

  const messageId = crypto.randomUUID();
  const checkpointId = crypto.randomUUID();
  const data: ChangesData = {
    label: write.checkpoint_label,
    summary: write.summary,
    files: write.files.map((f) => f.path),
    suggestions: write.next_suggestions,
    checkpointId,
  };

  await insertMessage(turn, { id: messageId, role: "assistant", kind: "changes", content: write.checkpoint_label, data });
  const { data: checkpoint, error } = await turn.supabase
    .from("checkpoints")
    .insert({ id: checkpointId, project_id: turn.project.id, message_id: messageId, label: write.checkpoint_label, files })
    .select("id, label, created_at")
    .single();
  if (error || !checkpoint) throw error ?? new Error("checkpoint insert failed");

  await turn.supabase.from("projects").update({ status: "ready" }).eq("id", turn.project.id);
  turn.files = files;
  turn.send({ t: "files", files, checkpoint });
  await track(turn.supabase, "build_succeeded", { ms: Date.now() - turn.startedAt, files: write.files.length }, turn.project.id);
}
