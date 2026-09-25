"use client";

import { useState } from "react";
import { toast } from "sonner";
import { restoreCheckpoint } from "@/lib/actions/checkpoints";
import { useWorkspace } from "./store";

export function useRestore() {
  const [restoring, setRestoring] = useState<string | null>(null);

  async function restore(checkpointId: string) {
    const { projectId, streaming } = useWorkspace.getState();
    if (streaming || restoring) return;
    setRestoring(checkpointId);
    const res = await restoreCheckpoint(projectId, checkpointId);
    setRestoring(null);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    const s = useWorkspace.getState();
    s.applyFiles(res.files, res.checkpoint);
    s.upsertMessage(res.message);
    s.set({ tab: "preview" });
    toast.success(res.checkpoint.label);
  }

  return { restore, restoring };
}
