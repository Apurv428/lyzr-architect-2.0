import type { FileMap } from "@/lib/ai/schema";

// Turning an existing project (a GitHub repo or a ZIP) into Architect files: keep readable source,
// skip dependencies and build output, stay small enough to fit in the builder's context, and give
// the browser preview an entry point when the app lives under src/.

export const IMPORT_LIMITS = { files: 40, fileBytes: 60_000, totalBytes: 150_000 } as const;

export const IMPORT_LABEL = "Imported project";

const SKIP_DIR = /(^|\/)(node_modules|\.git|\.github|dist|build|out|\.next|\.vercel|\.turbo|coverage|vendor|__pycache__|\.venv|venv|\.idea|\.vscode)\//;
const SKIP_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|\.DS_Store)$|\.min\.(js|css)$|\.map$/i;
const TEXT_FILE = /\.(tsx?|jsx?|mjs|cjs|css|scss|html|json|md|mdx|svg|txt|ya?ml|toml|py)$/i;

/** Readable source worth importing (no dependencies, build output, lockfiles or binaries). */
export function importablePath(path: string) {
  const p = path.replace(/^\/+/, "");
  return TEXT_FILE.test(p) && !SKIP_DIR.test(`/${p}`) && !SKIP_FILE.test(p) && !/(^|\/)\.env(\.|$)(?!example)/.test(p);
}

// App code first, then config at the root, then everything else; shorter paths win ties.
function priority(path: string) {
  if (/^(src|app|components|lib|pages|hooks|utils)\//.test(path)) return 0;
  if (/^(App|main|index)\.(tsx?|jsx?)$/.test(path)) return 0;
  if (/^[^/]+\.(json|ts|js|mjs|md)$/.test(path)) return 1;
  return 2;
}

/** Chooses which files to import within the limits. Paths are relative ("src/App.tsx"). */
export function pickImportFiles(entries: { path: string; size: number }[], limits: { files: number; fileBytes: number; totalBytes: number } = IMPORT_LIMITS) {
  const candidates = entries
    .filter((e) => importablePath(e.path) && e.size <= limits.fileBytes)
    .sort((a, b) => priority(a.path) - priority(b.path) || a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
  const picked: string[] = [];
  let total = 0;
  for (const e of candidates) {
    if (picked.length >= limits.files) break;
    if (total + e.size > limits.totalBytes) continue;
    picked.push(e.path);
    total += e.size;
  }
  return { picked, skipped: entries.length - picked.length };
}

/** ZIPs of a folder usually wrap everything in "<name>/"; drop that shared top folder. */
export function stripCommonRoot(paths: string[]) {
  const first = paths[0]?.split("/")[0];
  const shared = first && paths.length > 0 && paths.every((p) => p.startsWith(`${first}/`));
  return shared ? paths.map((p) => p.slice(first.length + 1)) : paths;
}

/** Root shim so the sandbox's `import App from "./App"` finds an app that lives in src/. */
export const appShim = (target: string) => `// Added by Architect so the browser preview can find your app.\nexport { default } from "./${target}";\n`;

const placeholderApp = (count: number) => `// Added by Architect: this project has no React entry the browser preview can run.
export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">Imported ${count} files</h1>
        <p className="text-sm text-slate-600">
          There's no React App component to preview yet. Ask Architect to build a screen for it, or open the Code tab.
        </p>
      </div>
    </main>
  );
}
`;

const APP_ENTRY = /^\/(App)\.(tsx|jsx|ts|js)$/;
const SRC_APP = /^\/src\/App\.(tsx|jsx|ts|js)$/;

/**
 * Normalises imported files (leading "/", preview entry). Returns the files plus the paths
 * Architect added, so a pull request back to the repo can leave them out.
 */
export function prepareImport(raw: FileMap): { files: FileMap; added: string[]; previewable: boolean } {
  const files: FileMap = {};
  for (const [path, content] of Object.entries(raw)) files[`/${path.replace(/^\/+/, "")}`] = content;
  const paths = Object.keys(files);
  if (paths.some((p) => APP_ENTRY.test(p))) return { files, added: [], previewable: true };
  const srcApp = paths.find((p) => SRC_APP.test(p));
  if (srcApp && !files["/App.tsx"]) {
    files["/App.tsx"] = appShim(srcApp.slice(1).replace(/\.(tsx|jsx|ts|js)$/, ""));
    return { files, added: ["/App.tsx"], previewable: true };
  }
  if (!files["/App.tsx"]) files["/App.tsx"] = placeholderApp(paths.length);
  return { files, added: ["/App.tsx"], previewable: false };
}

/** The files a pull request should carry: everything new or changed since the import, minus Architect's own additions. */
export function changedSinceImport(baseline: FileMap, current: FileMap, added: string[]) {
  return Object.entries(current)
    .filter(([path, content]) => !path.startsWith("/__architect__/") && !(added.includes(path) && baseline[path] === content) && baseline[path] !== content)
    .map(([path, content]) => ({ path: path.replace(/^\/+/, ""), content }));
}
