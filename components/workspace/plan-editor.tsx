"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react";
import type { Plan } from "@/lib/ai/schema";
import { cn } from "@/lib/utils";

const field = "w-full min-w-0 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:border-primary";

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
      {children}
    </button>
  );
}

/** Editable list of strings with add / remove / drag-or-arrow reordering. */
export function StringListEditor({
  items,
  onChange,
  placeholder,
  reorder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  reorder?: boolean;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li
            key={i}
            draggable={reorder}
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => reorder && e.preventDefault()}
            onDrop={() => {
              if (drag !== null) move(drag, i);
              setDrag(null);
            }}
            className={cn("flex items-center gap-1", drag === i && "opacity-50")}
          >
            {reorder && <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground" aria-hidden />}
            <input value={item} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className={field} />
            {reorder && (
              <>
                <IconButton label="Move up" onClick={() => move(i, i - 1)}><ArrowUp className="size-3" /></IconButton>
                <IconButton label="Move down" onClick={() => move(i, i + 1)}><ArrowDown className="size-3" /></IconButton>
              </>
            )}
            <IconButton label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}><X className="size-3.5" /></IconButton>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange([...items, ""])} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <Plus className="size-3" /> {placeholder}
      </button>
    </div>
  );
}

export function ScreensEditor({ screens, onChange }: { screens: Plan["screens"]; onChange: (s: Plan["screens"]) => void }) {
  return (
    <div className="space-y-1.5">
      {screens.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <input value={s.name} placeholder="Screen" onChange={(e) => onChange(screens.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={cn(field, "w-32 shrink-0 font-medium")} />
          <input value={s.purpose} placeholder="What it's for" onChange={(e) => onChange(screens.map((x, j) => (j === i ? { ...x, purpose: e.target.value } : x)))} className={field} />
          <IconButton label="Remove screen" onClick={() => onChange(screens.filter((_, j) => j !== i))}><X className="size-3.5" /></IconButton>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...screens, { name: "", purpose: "" }])} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <Plus className="size-3" /> Add screen
      </button>
    </div>
  );
}

export function DataEditor({ data, onChange }: { data: Plan["data"]; onChange: (d: Plan["data"]) => void }) {
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-1">
          <input value={d.entity} placeholder="Record" onChange={(e) => onChange(data.map((x, j) => (j === i ? { ...x, entity: e.target.value } : x)))} className={cn(field, "w-32 shrink-0 font-medium")} />
          <input
            value={d.fields.join(", ")}
            placeholder="fields, comma separated"
            onChange={(e) => onChange(data.map((x, j) => (j === i ? { ...x, fields: e.target.value.split(",").map((f) => f.trimStart()) } : x)))}
            className={field}
          />
          <IconButton label="Remove record" onClick={() => onChange(data.filter((_, j) => j !== i))}><X className="size-3.5" /></IconButton>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...data, { entity: "", fields: [] }])} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <Plus className="size-3" /> Add record
      </button>
    </div>
  );
}

export const editorField = field;
