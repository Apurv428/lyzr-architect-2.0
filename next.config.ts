import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict Mode's double-mount drops Sandpack's "done" listener in dev, leaving the
  // preview stuck behind its loading overlay. Production is unaffected either way.
  reactStrictMode: false,

  async headers() {
    return [
      {
        // WebContainers require SharedArrayBuffer, which requires COOP+COEP isolation. Isolation also
        // blocks the Sandpack preview iframe and cross-origin images (avatars), so it only applies when
        // the workspace is opened in WebContainer mode; switching runtimes reloads the page.
        source: "/p/:id",
        has: [{ type: "query", key: "runtime", value: "webcontainer" }],
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
