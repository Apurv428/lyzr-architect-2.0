"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ArrowUp, BookOpen, HelpCircle, ListChecks, Loader2, Rocket, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Attachment } from "@/lib/attachments";
import { useWorkspace } from "@/lib/workspace/store";
import { AttachButton, PendingChips, useAttachments } from "./attachments";
import { cn } from "@/lib/utils";

const COMMANDS = [
  { cmd: "/plan", label: "Re-plan", hint: "Propose a new plan for a change in direction", icon: ListChecks, fill: "Propose a new plan: " },
  { cmd: "/fix", label: "Fix something", hint: "Describe what looks broken", icon: Wrench, fill: "Something's not working: " },
  { cmd: "/ask", label: "Ask me first", hint: "Get clarifying questions before planning", icon: HelpCircle, send: "Before planning, ask me a few clarifying questions with options." },
  { cmd: "/explain", label: "Explain this app", hint: "Plain-English tour of what was built", icon: BookOpen, send: "Explain how this app works, in simple terms." },
  { cmd: "/deploy", label: "Deploy", hint: "Ship it to a live URL", icon: Rocket },
] as const;

export type ComposerHandle = { focusWith: (text: string) => void };

export const Composer = forwardRef<ComposerHandle, { onSend: (text: string, attachments?: Attachment[]) => void; busy: boolean }>(
  function Composer({ onSend, busy }, ref) {
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
              if (e.key === "Enter" && !e.shiftKey) {
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
              <span className="hidden text-[11px] text-muted-foreground sm:inline">Paste or drop a screenshot · Enter to send</span>
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
