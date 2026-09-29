"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, BookOpen, HelpCircle, Library, ListChecks, Loader2, Rocket, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Attachment } from "@/lib/attachments";
import { useWorkspace } from "@/lib/workspace/store";
import { AttachButton, PendingChips, useAttachments } from "./attachments";
import { cn } from "@/lib/utils";

const PROMPT_LIBRARY: { category: string; prompts: { label: string; text: string }[] }[] = [
  {
    category: "Start from scratch",
    prompts: [
      { label: "Support ticket triage dashboard", text: "Build a support ticket triage agent that classifies tickets by urgency, drafts replies, and shows everything on a filterable dashboard." },
      { label: "Sales lead qualifier", text: "Build a lead qualification agent that scores inbound leads against our ideal customer profile and drafts a personalised first email." },
      { label: "Document Q&A (RAG)", text: "Build a document Q&A app where I upload PDFs and the agent answers questions with citations to the exact page it used." },
      { label: "Meeting summarizer", text: "Build a meeting summarizer that takes a transcript, extracts decisions and action items with owners, and posts a summary to Slack." },
    ],
  },
  {
    category: "Add to existing app",
    prompts: [
      { label: "Add an agent brain", text: "Add an AI agent that can answer user questions using the app's data. It should handle follow-up questions naturally." },
      { label: "Add a Slack notification", text: "When a key event happens in the app, send a Slack message to the team with the relevant details." },
      { label: "Add a data table", text: "Add a searchable, sortable table view for the main data in this app." },
      { label: "Add an email trigger", text: "When a form is submitted, send a confirmation email to the user and a notification to the team." },
    ],
  },
  {
    category: "Improve & polish",
    prompts: [
      { label: "Make it mobile-friendly", text: "Make this app look great on mobile. Fix any layout issues and ensure all interactions work on touch screens." },
      { label: "Add dark mode", text: "Add a proper dark mode to the app with a toggle button in the header." },
      { label: "Add empty states", text: "Add nice empty-state illustrations and messages for every list or table that could be empty." },
      { label: "Add loading skeletons", text: "Add skeleton loading states for all data-fetching areas so the app never feels broken while loading." },
    ],
  },
  {
    category: "Agent configuration",
    prompts: [
      { label: "Make it safer with guardrails", text: "Add guardrails to the agent: redact any personal data in replies, refuse off-topic questions politely, and never make promises about refunds or pricing." },
      { label: "Add web search capability", text: "Give the agent the ability to search the web for up-to-date information before answering questions." },
      { label: "Add a knowledge base", text: "Let me upload PDF documents for the agent to use as a knowledge base. It should cite the source and page number in every answer." },
      { label: "Multi-step workflow", text: "Redesign the agent to handle a multi-step workflow: first understand the user's request, then gather the right information, then take action, then confirm with the user." },
    ],
  },
];

function PromptLibraryPopover({ onSelect }: { onSelect: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Prompt library"
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Library className="size-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-xl border bg-popover shadow-xl">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-semibold">Prompt library</span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {PROMPT_LIBRARY.map((group) => (
                <div key={group.category}>
                  <p className="sticky top-0 bg-popover px-3 py-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{group.category}</p>
                  {group.prompts.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => { onSelect(p.text); setOpen(false); }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted/60"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const COMMANDS = [
  { cmd: "/plan", label: "Re-plan", hint: "Propose a new plan for a change in direction", icon: ListChecks, fill: "Propose a new plan: " },
  { cmd: "/fix", label: "Fix something", hint: "Describe what looks broken", icon: Wrench, fill: "Something's not working: " },
  { cmd: "/ask", label: "Ask me first", hint: "Get clarifying questions before planning", icon: HelpCircle, send: "Before planning, ask me a few clarifying questions with options." },
  { cmd: "/explain", label: "Explain this app", hint: "Plain-English tour of what was built", icon: BookOpen, send: "Explain how this app works, in simple terms." },
  { cmd: "/deploy", label: "Deploy", hint: "Ship it to a live URL", icon: Rocket },
] as const;

export type ComposerHandle = { focusWith: (text: string) => void };

const noSubscribe = () => () => {};
// The modifier key users actually press: ⌘ on Apple devices, Ctrl elsewhere (⌘ while rendering on the server).
const useModKey = () => useSyncExternalStore(noSubscribe, () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"), () => "⌘");

export const Composer = forwardRef<ComposerHandle, { onSend: (text: string, attachments?: Attachment[]) => void; busy: boolean }>(
  function Composer({ onSend, busy }, ref) {
    const mod = useModKey();
    const files = useAttachments();
    const draft = useWorkspace((s) => s.draft);
    const mode = useWorkspace((s) => s.mode);
    const setDraft = (draft: string) => useWorkspace.getState().set({ draft });
    const [active, setActive] = useState(0);
    const textarea = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focusWith(text) {
        setDraft(text);
        requestAnimationFrame(() => {
          const el = textarea.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(text.length, text.length);
        });
      },
    }));

    const matches = useMemo(
      () => (draft.startsWith("/") && !draft.includes(" ") ? COMMANDS.filter((c) => c.cmd.startsWith(draft.toLowerCase())) : []),
      [draft],
    );

    function runCommand(c: (typeof COMMANDS)[number]) {
      setActive(0);
      if (c.cmd === "/deploy") {
        setDraft("");
        toast("One-click deploy lands in the next build.");
      } else if ("send" in c) {
        setDraft("");
        onSend(c.send);
      } else {
        setDraft(c.fill);
        textarea.current?.focus();
      }
    }

    function submit() {
      const text = draft.trim() || (files.ready.length ? "Use the attached file(s) as a reference." : "");
      if (!text || busy || files.uploading) return;
      setDraft("");
      onSend(text, files.ready);
      files.clear();
    }

    return (
      <div className="relative">
        {matches.length > 0 && (
          <div className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-xl border bg-popover p-1 shadow-xl">
            {matches.map((c, i) => (
              <button
                key={c.cmd}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => runCommand(c)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm", i === active && "bg-muted")}
              >
                <c.icon className="size-4 text-primary" />
                <span className="font-mono text-xs text-muted-foreground">{c.cmd}</span>
                <span className="font-medium">{c.label}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">{c.hint}</span>
              </button>
            ))}
          </div>
        )}
        <div data-tour="composer" className="rounded-xl border bg-card/80 p-2 transition focus-within:border-primary/60" {...files.dropTarget}>
          <PendingChips items={files.items} onRemove={files.remove} />
          <textarea
            ref={textarea}
            value={draft}
            rows={2}
            onChange={(e) => {
              setDraft(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (matches.length) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => (a + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  runCommand(matches[active]);
                  return;
                }
              }
              // ⌘Enter or Enter (without Shift) both send the message
              const cmdEnter = (e.metaKey || e.ctrlKey) && e.key === "Enter";
              const plainEnter = e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey;
              if (cmdEnter || plainEnter) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={mode === "guided" ? "Ask for a change… (type / for shortcuts)" : "Describe a change, or / for commands"}
            className="max-h-40 min-h-12 w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <AttachButton onFiles={files.add} disabled={busy} />
              <PromptLibraryPopover onSelect={(text) => { setDraft(text); textarea.current?.focus(); }} />
              <span className="hidden text-[11px] text-muted-foreground sm:inline">Paste or drop a screenshot · Enter to send · {mod}. to stop</span>
            </span>
            <Button size="icon-sm" aria-label="Send" onClick={submit} disabled={(!draft.trim() && !files.ready.length) || busy || files.uploading}>
              {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
        </div>
      </div>
    );
  },
);
