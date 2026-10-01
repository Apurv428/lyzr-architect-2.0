import type { FileMap } from "@/lib/ai/schema";

// Files the platform adds around the generated app. They never reach the user's
// code view or the model's context.
const ENTRY = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./__architect__/inspector";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;

// Runs inside the sandbox iframe: highlights hovered elements in select mode
// and reports the clicked element to the parent workspace.
const INSPECTOR = `import { toJpeg } from "html-to-image";

let active = false;
let box: HTMLDivElement | null = null;
let tag: HTMLDivElement | null = null;

function ensureOverlay() {
  if (box) return;
  box = document.createElement("div");
  box.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #6366f1;background:rgba(99,102,241,.08);border-radius:6px;transition:all 60ms ease-out;display:none";
  tag = document.createElement("div");
  tag.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;background:#6366f1;color:#fff;font:600 11px/1 system-ui;padding:4px 6px;border-radius:4px;display:none";
  document.body.append(box, tag);
}

function hide() {
  if (box) box.style.display = "none";
  if (tag) tag.style.display = "none";
}

function describe(el: Element) {
  const text = ((el as HTMLElement).innerText || "").trim().replace(/\\s+/g, " ").slice(0, 80);
  const path: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && path.length < 4) {
    path.unshift(node.tagName.toLowerCase());
    node = node.parentElement;
  }
  return {
    tag: el.tagName.toLowerCase(),
    text,
    classes: typeof el.className === "string" ? el.className.slice(0, 160) : "",
    path: path.join(" > "),
  };
}

// Thumbnail capture: render the visible viewport to a JPEG for the parent to upload.
window.addEventListener("message", async (e) => {
  if (e.data?.type !== "architect:capture") return;
  try {
    hide();
    const width = Math.min(window.innerWidth, 1280);
    const height = Math.min(window.innerHeight, 800);
    const dataUrl = await toJpeg(document.documentElement, { width, height, quality: 0.8, pixelRatio: 0.6, backgroundColor: "#ffffff", skipFonts: true });
    window.parent.postMessage({ type: "architect:captured", dataUrl }, "*");
  } catch {
    // Some pages can't be rasterised (e.g. tainted canvases); the dashboard keeps its placeholder.
  }
});

// Tell the parent the app has rendered, so it can ask for a thumbnail. The bundle usually
// runs after the iframe's load event, so don't rely on catching it.
const announceReady = () => setTimeout(() => window.parent.postMessage({ type: "architect:ready" }, "*"), 1200);
if (document.readyState === "complete") announceReady();
else window.addEventListener("load", announceReady);

window.addEventListener("message", (e) => {
  if (e.data?.type !== "architect:select-mode") return;
  active = !!e.data.on;
  document.body.style.cursor = active ? "crosshair" : "";
  if (!active) hide();
});

document.addEventListener("mousemove", (e) => {
  if (!active) return;
  ensureOverlay();
  const el = e.target as Element;
  const r = el.getBoundingClientRect();
  Object.assign(box!.style, { display: "block", top: r.top + "px", left: r.left + "px", width: r.width + "px", height: r.height + "px" });
  tag!.textContent = el.tagName.toLowerCase();
  Object.assign(tag!.style, { display: "block", top: Math.max(0, r.top - 20) + "px", left: r.left + "px" });
}, true);

document.addEventListener("click", (e) => {
  if (!active) return;
  e.preventDefault();
  e.stopPropagation();
  window.parent.postMessage({ type: "architect:selected", element: describe(e.target as Element) }, "*");
}, true);

export {};
`;

// Imported by generated apps. The sandbox has no backend, so posts go through the page hosting
// the preview, which sends them with the project's saved Slack webhook.
const CONNECTIONS = `export type SlackResult = { ok: boolean; simulated: boolean; error?: string };

/** Posts to the project's Slack channel when Slack is connected; otherwise the post is simulated. */
export function postToSlack(text: string): Promise<SlackResult> {
  const id = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    const done = (result: SlackResult) => {
      window.removeEventListener("message", onReply);
      clearTimeout(timer);
      resolve(result);
    };
    const onReply = (e: MessageEvent) => {
      if (e.data?.type === "architect:slack-result" && e.data.id === id) done(e.data.result);
    };
    // Outside Architect nothing answers, so fall back to a simulated post.
    const timer = setTimeout(() => done({ ok: true, simulated: true }), 12000);
    window.addEventListener("message", onReply);
    window.parent.postMessage({ type: "architect:slack", id, text: String(text) }, "*");
  });
}
`;

/** Platform files a generated app may import; exports carry them so the code still builds. */
export const RUNTIME_FILES: FileMap = { "/__architect__/connections.ts": CONNECTIONS };

const CONNECTIONS_IMPORT = /(["'])[^"'\n]*__architect__\/connections(?:\.ts)?\1/g;

/**
 * Points every import of the Slack helper at the right relative path (models often write
 * "./__architect__/connections" from /lib/), and adds the helper when the app uses it.
 */
export function withRuntime(files: FileMap): FileMap {
  const out: FileMap = {};
  let uses = false;
  for (const [path, content] of Object.entries(files)) {
    const depth = path.split("/").length - 2;
    const target = `${depth ? "../".repeat(depth) : "./"}__architect__/connections`;
    out[path] = content.replace(CONNECTIONS_IMPORT, (_, quote: string) => {
      uses = true;
      return `${quote}${target}${quote}`;
    });
  }
  return uses ? { ...out, ...RUNTIME_FILES } : out;
}

export type SlackResult = { ok: boolean; simulated: boolean; error?: string };

export type SelectedElement = { tag: string; text: string; classes: string; path: string };

// An imported project's own build setup would fight the sandbox's bundler; its runtime
// dependencies are passed separately (previewDependencies).
const PREVIEW_EXCLUDE = /^\/(package\.json|index\.html|vite\.config\.[cm]?[jt]s|tsconfig(\.[\w-]+)?\.json)$/;

// Packages that only matter at build time, or that the sandbox already provides.
const BUILD_ONLY = /^(react|react-dom|vite|@vitejs\/.*|next|typescript|@types\/.*|eslint.*|tailwindcss|@tailwindcss\/.*|postcss.*|autoprefixer|react-scripts|webpack.*|@babel\/.*|prettier|jest|vitest)$/;

/** The sandbox's packages plus an imported project's own runtime dependencies. */
export function previewDependencies(files: FileMap): Record<string, string> {
  let deps: Record<string, unknown> = {};
  try {
    deps = (JSON.parse(files["/package.json"] ?? "{}") as { dependencies?: Record<string, unknown> }).dependencies ?? {};
  } catch {
    // A broken package.json just means no extra packages.
  }
  const extra = Object.entries(deps).filter(([name, version]) => typeof version === "string" && !BUILD_ONLY.test(name));
  return { ...Object.fromEntries(extra), ...SANDBOX_DEPENDENCIES } as Record<string, string>;
}

export function sandboxFiles(files: FileMap): FileMap {
  const app = Object.fromEntries(Object.entries(withRuntime(files)).filter(([path]) => !PREVIEW_EXCLUDE.test(path)));
  return {
    ...app,
    ...RUNTIME_FILES,
    "/index.tsx": ENTRY,
    "/__architect__/inspector.ts": INSPECTOR,
  };
}

export const SANDBOX_DEPENDENCIES = { "lucide-react": "0.460.0", "html-to-image": "1.11.11" };

// Tailwind's Play CDN gives generated apps utility classes without a build step.
export const SANDBOX_RESOURCES = ["https://cdn.tailwindcss.com"];
