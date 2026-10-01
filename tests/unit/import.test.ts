import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { changedSinceImport, importablePath, pickImportFiles, prepareImport, stripCommonRoot } from "@/lib/workspace/import";
import { previewDependencies, sandboxFiles } from "@/lib/workspace/sandbox";
import { toFileTree, viteProject } from "@/lib/workspace/scaffold";
import { buildZip, readZip } from "@/lib/zip";

describe("choosing files to import", () => {
  it("keeps source and skips dependencies, build output, lockfiles and secrets", () => {
    expect(importablePath("src/App.tsx")).toBe(true);
    expect(importablePath("README.md")).toBe(true);
    expect(importablePath("node_modules/react/index.js")).toBe(false);
    expect(importablePath("dist/assets/index.js")).toBe(false);
    expect(importablePath(".next/server/page.js")).toBe(false);
    expect(importablePath("package-lock.json")).toBe(false);
    expect(importablePath("public/logo.png")).toBe(false);
    expect(importablePath(".env.local")).toBe(false);
  });

  it("prefers app code and stays within the limits", () => {
    const entries = [
      { path: "docs/guide.md", size: 100 },
      { path: "src/App.tsx", size: 100 },
      { path: "package.json", size: 100 },
      { path: "src/big.ts", size: 999_999 },
      { path: "src/components/Card.tsx", size: 100 },
    ];
    const { picked, skipped } = pickImportFiles(entries, { files: 3, fileBytes: 50_000, totalBytes: 10_000 });
    expect(picked).toEqual(["src/App.tsx", "src/components/Card.tsx", "package.json"]);
    expect(skipped).toBe(2);
  });

  it("drops the folder a ZIP wraps everything in", () => {
    expect(stripCommonRoot(["my-app/src/App.tsx", "my-app/package.json"])).toEqual(["src/App.tsx", "package.json"]);
    expect(stripCommonRoot(["src/App.tsx", "package.json"])).toEqual(["src/App.tsx", "package.json"]);
  });
});

describe("preparing imported files", () => {
  it("points the preview at an app in src/", () => {
    const { files, added, previewable } = prepareImport({ "src/App.jsx": "export default () => null;", "src/main.jsx": "" });
    expect(previewable).toBe(true);
    expect(added).toEqual(["/App.tsx"]);
    expect(files["/App.tsx"]).toContain('export { default } from "./src/App"');
  });

  it("leaves a root App alone", () => {
    const { files, added } = prepareImport({ "/App.tsx": "export default function App() { return null; }" });
    expect(added).toEqual([]);
    expect(Object.keys(files)).toEqual(["/App.tsx"]);
  });

  it("adds a placeholder screen when there's nothing to preview", () => {
    const { files, previewable } = prepareImport({ "server.py": "print('hi')" });
    expect(previewable).toBe(false);
    expect(files["/App.tsx"]).toContain("Imported 1 files");
  });

  it("sends back only real changes, never Architect's own files", () => {
    const baseline = { "/App.tsx": "shim", "/src/App.tsx": "old", "/src/util.ts": "same" };
    const current = { ...baseline, "/src/App.tsx": "new", "/src/Agent.tsx": "added", "/__architect__/connections.ts": "helper" };
    expect(changedSinceImport(baseline, current, ["/App.tsx"])).toEqual([
      { path: "src/App.tsx", content: "new" },
      { path: "src/Agent.tsx", content: "added" },
    ]);
  });
});

// A two-file ZIP whose second entry is deflated, the way most zip tools write it.
function deflatedZip(files: [string, string][]) {
  const enc = new TextEncoder();
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const local: number[] = [];
  const central: number[] = [];
  for (const [name, text] of files) {
    const n = [...enc.encode(name)];
    const raw = enc.encode(text);
    const data = [...deflateRawSync(raw)];
    const offset = local.length;
    local.push(0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(raw.length), ...u16(n.length), ...u16(0), ...n, ...data);
    central.push(0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(raw.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...n);
  }
  const eocd = [0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(central.length), ...u32(local.length), ...u16(0)];
  return new Uint8Array([...local, ...central, ...eocd]);
}

describe("ZIP files", () => {
  it("round-trips what Architect exports", async () => {
    const entries = readZip(buildZip({ "/App.tsx": "export default 1;", "/lib/data.ts": "export const ü = 'ok';" }));
    expect(entries.map((e) => e.path)).toEqual(["App.tsx", "lib/data.ts"]);
    expect(await entries[1].read()).toBe("export const ü = 'ok';");
  });

  it("reads deflated entries from other tools", async () => {
    const text = "export default function App() { return <h1>Hello</h1>; }\n".repeat(20);
    const entries = readZip(deflatedZip([["my-app/src/App.tsx", text], ["my-app/package.json", "{}"]]));
    expect(entries.map((e) => e.path)).toEqual(["my-app/src/App.tsx", "my-app/package.json"]);
    expect(await entries[0].read()).toBe(text);
  });

  it("rejects files that aren't ZIPs", () => {
    expect(() => readZip(new TextEncoder().encode("not a zip at all, just some text"))).toThrow(/isn't a ZIP/);
  });
});

describe("running generated apps outside the sandbox", () => {
  it("wraps a sandbox app in a runnable Vite project", () => {
    const project = viteProject({ "/App.tsx": "export default () => null;" }, "Support Desk");
    expect(Object.keys(project)).toEqual(expect.arrayContaining(["/package.json", "/index.html", "/main.tsx", "/vite.config.ts", "/App.tsx"]));
    expect(JSON.parse(project["/package.json"]).name).toBe("support-desk");
    expect(project["/index.html"]).toContain("cdn.tailwindcss.com");
  });

  it("leaves projects that bring their own package.json alone", () => {
    const files = { "/package.json": '{"name":"mine"}', "/server.js": "" };
    expect(viteProject(files)).toEqual(files);
  });

  it("nests paths the way WebContainer expects", () => {
    expect(toFileTree({ "/App.tsx": "a", "/lib/data.ts": "b", "/lib/ui/Card.tsx": "c" })).toEqual({
      "App.tsx": { file: { contents: "a" } },
      lib: { directory: { "data.ts": { file: { contents: "b" } }, ui: { directory: { "Card.tsx": { file: { contents: "c" } } } } } },
    });
  });
});

describe("previewing imported projects", () => {
  const files = {
    "/package.json": JSON.stringify({ dependencies: { react: "^19.0.0", "react-router-dom": "^6.26.0" }, devDependencies: { vite: "^5" } }),
    "/index.html": "<script src='/src/main.tsx'></script>",
    "/vite.config.ts": "",
    "/App.tsx": "",
  };

  it("adds the project's runtime packages but keeps the sandbox's React", () => {
    const deps = previewDependencies(files);
    expect(deps["react-router-dom"]).toBe("^6.26.0");
    expect(deps.react).toBeUndefined();
    expect(deps.vite).toBeUndefined();
    expect(deps["lucide-react"]).toBeDefined();
  });

  it("keeps the project's own build setup out of the sandbox", () => {
    const sandbox = sandboxFiles(files);
    expect(sandbox["/package.json"]).toBeUndefined();
    expect(sandbox["/index.html"]).toBeUndefined();
    expect(sandbox["/vite.config.ts"]).toBeUndefined();
    expect(sandbox["/index.tsx"]).toBeDefined();
  });
});
