"use client";

import dynamic from "next/dynamic";
import type { FileMap } from "@/lib/ai/schema";

const LivePreview = dynamic(() => import("./live-preview").then((m) => m.LivePreview), { ssr: false });

export function FullPreview({ files }: { files: FileMap }) {
  return <LivePreview files={files} />;
}
