import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <defs>
        <linearGradient id="a2-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.17 277)" />
          <stop offset="100%" stopColor="oklch(0.52 0.24 290)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#a2-grad)" />
      <path
        d="M9 23 16 8l7 15M11.8 17.5h8.4"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>
        Architect <span className="text-primary">2.0</span>
      </span>
    </Link>
  );
}
