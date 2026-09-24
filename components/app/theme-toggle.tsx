"use client";

import { Moon, Sun } from "lucide-react";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { setTheme, useTheme } from "@/lib/theme";

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Button variant="ghost" size="icon-sm" className={className} aria-label={`Switch to ${next} theme`} onClick={() => setTheme(next)}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

export function ThemedToaster() {
  return <Toaster theme={useTheme()} position="bottom-right" richColors />;
}
