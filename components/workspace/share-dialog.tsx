"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/workspace/store";

export function ShareDialog() {
  const open = useWorkspace((s) => s.dialog === "invite");
  const projectId = useWorkspace((s) => s.projectId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Editor");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/p/${projectId}/preview`;

  async function invite() {
    setSending(true);
    await new Promise((r) => setTimeout(r, 600));
    setSending(false);
    toast(`Team workspaces are coming soon — we'll email ${email} when ${role.toLowerCase()} access is ready.`);
    setEmail("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => useWorkspace.getState().set({ dialog: o ? "invite" : null })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="size-4 text-primary" /> Share & collaborate</DialogTitle>
          <DialogDescription>Invite teammates to build with you, or share a preview link.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm">
              <option>Editor</option>
              <option>Viewer</option>
            </select>
            <Button size="lg" onClick={invite} disabled={!/.+@.+\..+/.test(email) || sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Preview link (signed-in teammates)</p>
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 py-1 pr-1 pl-3">
              <span className="truncate font-mono text-xs">{link}</span>
              <Button size="icon-xs" variant="ghost" className="ml-auto shrink-0" aria-label="Copy link" onClick={() => navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
