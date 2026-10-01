"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addComment, listComments, resolveComment, type PreviewComment } from "@/lib/actions/workspaces";
import { timeAgo } from "@/lib/time";

type Pin = { comment: PreviewComment; open: boolean };

export function CommentOverlay({
  projectId,
  checkpointVersion,
  enabled,
}: {
  projectId: string;
  checkpointVersion: number;
  enabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [drafting, setDrafting] = useState<{ x: number; y: number } | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    listComments(projectId).then((cs) => {
      setPins(cs.map((c) => ({ comment: c, open: false })));
    });
  }, [projectId, enabled]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!enabled) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Ignore clicks on existing pins.
    if ((e.target as HTMLElement).closest("[data-pin]")) return;
    const x_pct = (e.clientX - rect.left) / rect.width;
    const y_pct = (e.clientY - rect.top) / rect.height;
    setDrafting({ x: x_pct, y: y_pct });
    setDraftBody("");
  }

  async function submitDraft() {
    if (!drafting || !draftBody.trim() || saving) return;
    setSaving(true);
    const res = await addComment(projectId, { x_pct: drafting.x, y_pct: drafting.y, body: draftBody, checkpoint_v: checkpointVersion });
    setSaving(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setPins((prev) => [...prev, { comment: res.comment, open: true }]);
    setDrafting(null);
    setDraftBody("");
  }

  async function resolve(id: string) {
    const res = await resolveComment(id);
    if ("error" in res) return toast.error(res.error);
    setPins((prev) => prev.filter((p) => p.comment.id !== id));
  }

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 cursor-crosshair"
      onClick={handleClick}
    >
      {/* Existing pins */}
      {pins.map((pin, i) => (
        <div
          key={pin.comment.id}
          data-pin
          className="absolute"
          style={{ left: `${pin.comment.x_pct * 100}%`, top: `${pin.comment.y_pct * 100}%`, transform: "translate(-50%, -50%)" }}
        >
          <button
            className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-md ring-2 ring-background"
            onClick={(e) => { e.stopPropagation(); setPins((prev) => prev.map((p, j) => ({ ...p, open: j === i ? !p.open : false }))); }}
          >
            {i + 1}
          </button>
          {pin.open && (
            <div
              className="absolute left-7 top-0 z-20 w-64 rounded-xl border bg-popover p-3 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <p className="flex-1 text-sm">{pin.comment.body}</p>
                <button
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setPins((prev) => prev.map((p, j) => ({ ...p, open: j === i ? false : p.open })))}
                  aria-label="Close"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(pin.comment.created_at)}</p>
              <Button size="sm" variant="outline" className="mt-2 h-7 w-full text-xs" onClick={() => resolve(pin.comment.id)}>
                <Check className="size-3" /> Resolve
              </Button>
            </div>
          )}
        </div>
      ))}

      {/* Draft pin */}
      {drafting && (
        <div
          className="absolute z-20"
          style={{ left: `${drafting.x * 100}%`, top: `${drafting.y * 100}%`, transform: "translate(-50%, -50%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex size-6 items-center justify-center rounded-full bg-primary/70 text-xs text-primary-foreground shadow-md ring-2 ring-background">
            +
          </div>
          <div className="absolute left-7 top-0 w-60 rounded-xl border bg-popover p-3 shadow-xl">
            <p className="mb-1.5 text-xs font-medium">Add comment</p>
            <textarea
              autoFocus
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitDraft(); }}
              placeholder="Leave a note…"
              rows={3}
              className="w-full resize-none rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" className="flex-1" onClick={submitDraft} disabled={!draftBody.trim() || saving}>
                {saving ? "Saving…" : "Comment"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDrafting(null)}><X /></Button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">⌘↵ to submit</p>
          </div>
        </div>
      )}
    </div>
  );
}
