"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ATTACHMENT_MIME, MAX_ATTACHMENTS, isImage, type Attachment } from "@/lib/attachments";
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment } from "@/lib/workspace/upload";
import { cn } from "@/lib/utils";

type Pending = { id: string; name: string; mime: string; preview?: string; done?: Attachment };

/** Upload state for a composer: add from picker, paste or drop; remove; hand finished attachments to send. */
export function useAttachments() {
  const [items, setItems] = useState<Pending[]>([]);

  const add = useCallback(
    async (files: File[]) => {
      const room = MAX_ATTACHMENTS - items.length;
      if (room <= 0) return void toast.error(`Up to ${MAX_ATTACHMENTS} files per message.`);
      for (const file of files.slice(0, room)) {
        const id = crypto.randomUUID();
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setItems((xs) => [...xs, { id, name: file.name || "pasted-image.png", mime: file.type, preview }]);
        try {
          const named = file.name ? file : new File([file], "pasted-image.png", { type: file.type });
          const done = await uploadAttachment(named);
          setItems((xs) => xs.map((x) => (x.id === id ? { ...x, done } : x)));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Upload failed");
          setItems((xs) => xs.filter((x) => x.id !== id));
        }
      }
    },
    [items.length],
  );

  const remove = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));
  const clear = () => setItems([]);
  const uploading = items.some((x) => !x.done);
  const ready = items.flatMap((x) => (x.done ? [x.done] : []));

  /** Props to spread on the element that should accept paste and drop. */
  const dropTarget = {
    onPaste: (e: React.ClipboardEvent) => {
      const files = [...e.clipboardData.files];
      if (files.length) {
        e.preventDefault();
        void add(files);
      }
    },
    onDragOver: (e: React.DragEvent) => {
      if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      void add([...e.dataTransfer.files]);
    },
  };

  return { items, add, remove, clear, uploading, ready, dropTarget };
}

export function AttachButton({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  return (
    <Button variant="ghost" size="icon" aria-label="Attach screenshot or document" disabled={disabled} render={<label />} nativeButton={false}>
      <Paperclip />
      <input
        type="file"
        multiple
        hidden
        accept={[...ATTACHMENT_MIME, ".md"].join(",")}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </Button>
  );
}

export function PendingChips({ items, onRemove }: { items: Pending[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {items.map((x) => (
        <span key={x.id} className="inline-flex max-w-52 items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-1 text-xs">
          {x.preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={x.preview} alt="" className="size-7 rounded object-cover" />
          ) : (
            <FileText className="ml-1 size-4 text-muted-foreground" />
          )}
          <span className="truncate">{x.name}</span>
          {x.done ? (
            <button aria-label={`Remove ${x.name}`} onClick={() => onRemove(x.id)} className="grid size-5 place-items-center rounded hover:bg-muted">
              <X className="size-3" />
            </button>
          ) : (
            <Loader2 className="mr-1 size-3 animate-spin text-muted-foreground" />
          )}
        </span>
      ))}
    </div>
  );
}

/** Attachment thumbnails inside a sent chat bubble (signed URLs, fetched lazily). */
export function SentAttachments({ files, className }: { files: Attachment[]; className?: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const images = files.filter((f) => isImage(f.mime));
    if (!images.length) return;
    let alive = true;
    createClient()
      .storage.from("attachments")
      .createSignedUrls(images.map((f) => f.path), 3600)
      .then(({ data }) => {
        if (!alive || !data) return;
        setUrls(Object.fromEntries(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : []))));
      });
    return () => {
      alive = false;
    };
  }, [files]);

  return (
    <div className={cn("flex flex-wrap justify-end gap-1.5", className)}>
      {files.map((f) =>
        isImage(f.mime) && urls[f.path] ? (
          <a key={f.path} href={urls[f.path]} target="_blank" rel="noreferrer" title={f.name}>
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
            <img src={urls[f.path]} alt={f.name} className="h-20 max-w-40 rounded-lg border object-cover" />
          </a>
        ) : (
          <span key={f.path} className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2 py-1 text-xs">
            {isImage(f.mime) ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />} {f.name}
          </span>
        ),
      )}
    </div>
  );
}
