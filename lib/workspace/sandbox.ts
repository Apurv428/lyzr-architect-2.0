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

export type SelectedElement = { tag: string; text: string; classes: string; path: string };

export function sandboxFiles(files: FileMap): FileMap {
  return {
    ...files,
    "/index.tsx": ENTRY,
    "/__architect__/inspector.ts": INSPECTOR,
  };
}

export const SANDBOX_DEPENDENCIES = { "lucide-react": "0.460.0", "html-to-image": "1.11.11" };

// Tailwind's Play CDN gives generated apps utility classes without a build step.
export const SANDBOX_RESOURCES = ["https://cdn.tailwindcss.com"];
