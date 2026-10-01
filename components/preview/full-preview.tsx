"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { MessageSquare } from "lucide-react";
import { CommentOverlay } from "@/components/preview/comment-overlay";
import { Button } from "@/components/ui/button";
import { postToProjectSlack } from "@/lib/actions/agents";
import type { FileMap } from "@/lib/ai/schema";

const LivePreview = dynamic(() => import("./live-preview").then((m) => m.LivePreview), { ssr: false });

/**
 * With a project id, the app's Slack posts go out for real when the project's owner is viewing.
 * `commentable` adds pinned preview comments for the project's owner and workspace members.
 */
export function FullPreview({ files, projectId, commentable = false, version = 1 }: { files: FileMap; projectId?: string; commentable?: boolean; version?: number }) {
  const onSlack = useCallback((text: string) => postToProjectSlack(projectId!, text), [projectId]);
  const [commenting, setCommenting] = useState(false);
  return (
    <div className="relative h-full">
      <LivePreview files={files} onSlack={projectId ? onSlack : undefined} />
      {commentable && projectId && (
        <>
          <CommentOverlay projectId={projectId} checkpointVersion={version} enabled={commenting} />
          <Button size="sm" variant={commenting ? "default" : "outline"} className="fixed top-4 right-4 z-20 shadow-lg" onClick={() => setCommenting((v) => !v)}>
            <MessageSquare /> {commenting ? "Click to pin a comment" : "Comment"}
          </Button>
        </>
      )}
    </div>
  );
}
