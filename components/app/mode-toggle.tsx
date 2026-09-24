"use client";

import { motion } from "framer-motion";
import { Code2, Wand2 } from "lucide-react";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONS: { id: Mode; label: string; icon: typeof Wand2 }[] = [
  { id: "guided", label: "Guided", icon: Wand2 },
  { id: "pro", label: "Pro", icon: Code2 },
];

export function ModeToggle({
  value,
  onChange,
  layoutId = "mode-pill",
  className,
}: {
  value: Mode;
  onChange: (mode: Mode) => void;
  layoutId?: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Mode" className={cn("relative inline-flex rounded-lg bg-muted p-0.5", className)}>
      {OPTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "relative z-10 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === id && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 -z-10 rounded-md bg-background shadow-sm"
              transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
            />
          )}
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
