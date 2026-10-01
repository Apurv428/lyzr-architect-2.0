import type { FileMap } from "@/lib/ai/schema";
import { SANDBOX_DEPENDENCIES, withRuntime } from "./sandbox";

// Generated apps are written for the in-browser sandbox: `/App.tsx` at the root, Tailwind from the
// Play CDN, no entry file. This wraps them in a minimal Vite project so the same files run in a
// WebContainer, or locally after a ZIP export, with `npm install && npm run dev`.

const INDEX_HTML = (title: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title.replace(/[<>&"]/g, "")}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`;

const MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: true },
});
`;

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
  },
  null,
  2,
);

const packageJson = (name: string) =>
  JSON.stringify(
    {
      name: name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "architect-app",
      private: true,
      type: "module",
      scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "lucide-react": SANDBOX_DEPENDENCIES["lucide-react"],
      },
      devDependencies: {
        vite: "^5.4.0",
        "@vitejs/plugin-react": "^4.3.1",
        typescript: "^5.6.0",
        "@types/react": "^18.3.0",
        "@types/react-dom": "^18.3.0",
      },
    },
    null,
    2,
  );

const README = (name: string) => `# ${name}

Built with Architect 2.0.

\`\`\`bash
npm install
npm run dev
\`\`\`

Then open http://localhost:3000.
`;

/**
 * A runnable Vite project around the generated files. Projects that already bring their own
 * `package.json` (full-stack runtimes) are returned unchanged apart from the platform helpers.
 */
export function viteProject(files: FileMap, name = "Architect app"): FileMap {
  const app = withRuntime(files);
  if (app["/package.json"]) return app;
  return {
    "/package.json": packageJson(name),
    "/index.html": INDEX_HTML(name),
    "/main.tsx": MAIN_TSX,
    "/vite.config.ts": VITE_CONFIG,
    "/tsconfig.json": TSCONFIG,
    "/README.md": README(name),
    ...app,
  };
}

type FileNode = { file: { contents: string } };
export type DirectoryNode = { directory: FileTree };
export type FileTree = { [name: string]: FileNode | DirectoryNode };

/** Nested tree in the shape WebContainer's `mount()` expects (flat "a/b.ts" keys are rejected). */
export function toFileTree(files: FileMap): FileTree {
  const root: FileTree = {};
  for (const [path, contents] of Object.entries(files)) {
    const parts = path.split("/").filter(Boolean);
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      const next = dir[part];
      if (next && "directory" in next) dir = next.directory;
      else {
        const created: DirectoryNode = { directory: {} };
        dir[part] = created;
        dir = created.directory;
      }
    }
    dir[parts[parts.length - 1]] = { file: { contents } };
  }
  return root;
}
