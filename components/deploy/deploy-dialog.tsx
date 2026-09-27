"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import QRCode from "qrcode";
import { Building2, Check, Copy, ExternalLink, Globe, Loader2, Mail, Plus, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DeployEvent, DeployLog } from "@/lib/deploy";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

type Phase = "config" | "building" | "done" | "failed";

export function DeployDialog() {
  const open = useWorkspace((s) => s.dialog === "deploy");
  const projectId = useWorkspace((s) => s.projectId);
  const mode = useWorkspace((s) => s.mode);
  const [phase, setPhase] = useState<Phase>("config");
  const [env, setEnv] = useState<"production" | "preview" | "enterprise">("production");
  const [vars, setVars] = useState<{ key: string; value: string }[]>([]);
  const [domain, setDomain] = useState("");
  const [logs, setLogs] = useState<DeployLog[]>([]);
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const terminal = useRef<HTMLDivElement>(null);

  const close = (o: boolean) => {
    if (!o && phase === "building") return;
    useWorkspace.getState().set({ dialog: o ? "deploy" : null });
    if (!o) setTimeout(() => setPhase("config"), 200);
  };

  useEffect(() => terminal.current?.scrollTo({ top: terminal.current.scrollHeight }), [logs]);

  async function deploy() {
    setPhase("building");
    setLogs([]);
    setProgress(0);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, env, envVars: vars.filter((v) => v.key.trim()), domain }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Deploy failed");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as DeployEvent;
          if (e.t === "log") setLogs((l) => [...l, e.log]);
          else if (e.t === "progress") setProgress(e.value);
          else if (e.t === "error") throw new Error(e.message);
          else if (e.t === "ready") {
            setUrl(e.url);
            setQr(await QRCode.toDataURL(e.url, { margin: 1, width: 160, color: { dark: "#0a0a0f", light: "#ffffff" } }));
            setPhase("done");
            useWorkspace.getState().set({ deployVersion: useWorkspace.getState().deployVersion + 1 });
            confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, colors: ["#6366f1", "#a78bfa", "#34d399", "#fbbf24"] });
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deploy failed");
      setPhase("failed");
    }
  }

  const share = encodeURIComponent(url);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg" showCloseButton={phase !== "building"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-4 text-primary" />
            {phase === "done" ? "You're live!" : phase === "building" ? "Deploying…" : "Deploy your app"}
          </DialogTitle>
          <DialogDescription>
            {phase === "done" ? "Anyone with the link can use it." : mode === "guided" ? "Put your app online with a shareable link." : "Ships the current checkpoint to the edge."}
          </DialogDescription>
        </DialogHeader>

        {phase === "config" && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "production", label: "Production", desc: "Your main public link" },
                { id: "preview", label: "Preview", desc: "A private test link" },
                { id: "enterprise", label: "Enterprise", desc: "Deploy to your VPC" },
              ] as const).map((e) => (
                <button
                  key={e.id}
                  onClick={() => setEnv(e.id)}
                  className={cn("rounded-xl border p-3 text-left transition", env === e.id ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "hover:border-primary/40")}
                >
                  <p className="text-sm font-medium">{e.label}</p>
                  <p className="text-xs text-muted-foreground">{e.desc}</p>
                </button>
              ))}
            </div>

            {env === "enterprise" && (
              <div className="rounded-xl border bg-card/60 p-5 space-y-3 text-center">
                <Building2 className="mx-auto size-8 text-primary" />
                <div>
                  <p className="font-medium text-sm">Enterprise VPC deployment</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                    Deploy into your own AWS, GCP or Azure environment — air-gapped, with your own auth and network controls.
                  </p>
                </div>
                <a
                  href="mailto:team@architect.run?subject=Enterprise%20VPC%20deployment"
                  className={cn("inline-flex items-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition")}
                >
                  <Mail className="size-4" /> Contact sales
                </a>
              </div>
            )}

            {mode === "pro" && env !== "enterprise" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Environment variables</p>
                  <Button size="xs" variant="ghost" onClick={() => setVars((v) => [...v, { key: "", value: "" }])}><Plus /> Add</Button>
                </div>
                {vars.length === 0 && <p className="text-xs text-muted-foreground">None — add API keys or config your agent needs.</p>}
                {vars.map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={v.key}
                      onChange={(e) => setVars((vs) => vs.map((x, j) => (j === i ? { ...x, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") } : x)))}
                      placeholder="KEY"
                      className="h-8 w-40 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:border-primary"
                    />
                    <input
                      type="password"
                      value={v.value}
                      onChange={(e) => setVars((vs) => vs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      placeholder="value"
                      className="h-8 flex-1 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:border-primary"
                    />
                    <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setVars((vs) => vs.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </div>
                ))}
              </div>
            )}

            {env !== "enterprise" && <div className="space-y-2">
              <p className="text-sm font-medium">Custom domain <span className="font-normal text-muted-foreground">(optional)</span></p>
              <label className="flex items-center gap-2 rounded-lg border bg-background px-3">
                <Globe className="size-4 text-muted-foreground" />
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="support.yourcompany.com" className="h-9 flex-1 bg-transparent text-sm outline-none" />
              </label>
            </div>}

            {env !== "enterprise" && <Button size="lg" className="w-full" onClick={deploy}><Rocket /> Deploy to {env}</Button>}
          </div>
        )}

        {(phase === "building" || phase === "failed") && (
          <div className="space-y-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-all duration-500", phase === "failed" ? "bg-destructive" : "bg-primary")} style={{ width: `${progress}%` }} />
            </div>
            <div ref={terminal} className="h-64 overflow-y-auto rounded-lg border bg-black/60 p-3 font-mono text-[11px] leading-relaxed">
              {logs.map((l, i) => (
                <p key={i} className={cn(l.level === "success" ? "text-emerald-600 dark:text-emerald-400" : l.level === "warn" ? "text-amber-600 dark:text-amber-400" : "text-zinc-300")}>
                  <span className="mr-2 text-zinc-600">{(l.at / 1000).toFixed(1).padStart(4, " ")}s</span>
                  {l.text}
                </p>
              ))}
              {phase === "building" && <Loader2 className="mt-1 size-3 animate-spin text-zinc-500" />}
            </div>
            {phase === "failed" && <Button className="w-full" onClick={deploy}>Retry deploy</Button>}
          </div>
        )}

        {phase === "done" && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL QR code */}
              {qr && <img src={qr} alt="QR code for the live app" className="size-28 rounded-lg" />}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-1 rounded-lg border bg-muted/40 py-1 pr-1 pl-3">
                  <span className="truncate font-mono text-xs">{url}</span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="ml-auto shrink-0"
                    aria-label="Copy link"
                    onClick={() => navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
                  >
                    {copied ? <Check /> : <Copy />}
                  </Button>
                </div>
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  Open live app <ExternalLink className="size-3.5" />
                </a>
                <p className="text-xs text-muted-foreground">Scan to try it on your phone.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <a className="rounded-lg border py-2 text-center hover:bg-muted" target="_blank" rel="noreferrer" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("I just shipped an AI app with Architect")}&url=${share}`}>Share on X</a>
              <a className="rounded-lg border py-2 text-center hover:bg-muted" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${share}`}>LinkedIn</a>
              <a className="rounded-lg border py-2 text-center hover:bg-muted" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${share}`}>WhatsApp</a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
