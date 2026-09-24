import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict Mode's double-mount drops Sandpack's "done" listener in dev, leaving the
  // preview stuck behind its loading overlay. Production is unaffected either way.
  reactStrictMode: false,
};

export default nextConfig;
