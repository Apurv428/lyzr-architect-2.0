"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileMap } from "@/lib/ai/schema";

type BootPhase = "idle" | "booting" | "installing" | "starting" | "ready" | "error";

type Props = {
  files: FileMap;
  projectId: string;
  /** Callback once the preview URL is available. */
  onReady?: (url: string) => void;
};

type WCInstance = {
  mount(tree: Record<string, unknown>): Promise<void>;
  spawn(cmd: string, args: string[]): Promise<{ output: ReadableStream<string>; exit: Promise<number> }>;
  on(event: "server-ready", cb: (port: number, url: string) => void): void;
  teardown(): void;
};

/** Lazily load the @webcontainer/api package to avoid bundling it server-side. */
async function bootWebContainer(): Promise<WCInstance> {
  // Optional peer dep — not declared in package.json, loaded only in WebContainer mode.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import("@webcontainer/api" as any) as { WebContainer: { boot(): Promise<WCInstance> } };
  return mod.WebContainer.boot();
}

export function WebContainerPreview({ files, projectId, onReady }: Props) {
  const [phase, setPhase] = useState<BootPhase>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const instance = useRef<WCInstance | null>(null);

  function log(line: string) {
    setLogs((prev) => [...prev.slice(-199), line]);
  }

  async function boot() {
    if (phase === "booting" || phase === "installing" || phase === "starting") return;
    setError(null);
    setUrl(null);
    setLogs([]);
    setPhase("booting");

    try {
      const container = await bootWebContainer();

      // Mount files.
      const mountTree: Record<string, { file: { contents: string } }> = {};
      for (const [path, content] of Object.entries(files)) {
        const key = path.startsWith("/") ? path.slice(1) : path;
        mountTree[key] = { file: { contents: typeof content === "string" ? content : JSON.stringify(content) } };
      }

      // Ensure a minimal package.json with a dev script exists.
      if (!mountTree["package.json"]) {
        mountTree["package.json"] = {
          file: {
            contents: JSON.stringify({
              name: "architect-preview",
              private: true,
              scripts: { dev: "vite --port 3000" },
              dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
              devDependencies: { vite: "^5.4.0", "@vitejs/plugin-react": "^4.3.1" },
            }, null, 2),
          },
        };
      }

      await container.mount(mountTree);

      setPhase("installing");
      log("$ npm install");
      const install = await container.spawn("npm", ["install"]);
      install.output.pipeTo(new WritableStream({ write: (chunk) => log(chunk) }));
      const installCode = await install.exit;
      if (installCode !== 0) throw new Error(`npm install exited with ${installCode}`);

      setPhase("starting");
      log("$ npm run dev");
      const dev = await container.spawn("npm", ["run", "dev"]);
      dev.output.pipeTo(new WritableStream({ write: (chunk) => log(chunk) }));

      container.on("server-ready", (port, serverUrl) => {
        log(`Server ready on port ${port}: ${serverUrl}`);
        setUrl(serverUrl);
        setPhase("ready");
        onReady?.(serverUrl);
      });

      instance.current = container;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase("error");
      log(`Error: ${msg}`);
    }
  }

  // Boot on mount; tear down on unmount.
  useEffect(() => {
    void boot();
    return () => { instance.current?.teardown?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col">
      {phase === "ready" && url ? (
        <div className="relative flex-1">
          <iframe
            src={url}
            className="h-full w-full border-0"
            allow="cross-origin-isolated"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
          <button
            onClick={boot}
            title="Restart"
            className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 text-muted-foreground shadow hover:text-foreground"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-sm">
          {phase !== "error" ? (
            <>
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">
                {phase === "booting" && "Booting WebContainer…"}
                {phase === "installing" && "Installing dependencies…"}
                {phase === "starting" && "Starting dev server…"}
                {phase === "idle" && "Ready to boot"}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-destructive">WebContainer failed to start</p>
              <p className="max-w-xs text-center text-xs text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={boot}>
                <RefreshCw className="size-3.5" /> Retry
              </Button>
            </>
          )}
        </div>
      )}

      {logs.length > 0 && phase !== "ready" && (
        <div className="border-t bg-black/90 text-green-400">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-1.5 text-xs text-white/60">
            <Terminal className="size-3" /> Boot log
          </div>
          <pre className="max-h-32 overflow-y-auto px-3 py-2 font-mono text-[10px] leading-relaxed">
            {logs.join("")}
          </pre>
        </div>
      )}
    </div>
  );
}

/** E2B-backed preview: creates a cloud sandbox and returns an iframe to its URL. */
export function E2BPreview({ files, projectId }: Props) {
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sandboxId = useRef<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/e2b", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, template: "base" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { sandboxId: sid, url } = (await res.json()) as { sandboxId: string; url: string };
      sandboxId.current = sid;
      setSandboxUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void start();
    return () => {
      if (sandboxId.current) {
        void fetch("/api/e2b", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxId: sandboxId.current }),
          keepalive: true,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <p>Spinning up E2B sandbox…</p>
    </div>
  );

  if (error) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
      <p className="font-medium text-destructive">E2B sandbox failed</p>
      <p className="max-w-xs text-center text-xs text-muted-foreground">{error}</p>
      <Button size="sm" variant="outline" onClick={start}><RefreshCw className="size-3.5" /> Retry</Button>
    </div>
  );

  if (!sandboxUrl) return null;

  return (
    <iframe
      src={sandboxUrl}
      className="h-full w-full border-0"
      allow="cross-origin-isolated"
    />
  );
}
