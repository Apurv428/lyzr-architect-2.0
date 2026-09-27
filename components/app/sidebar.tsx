"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BarChart3,
  Boxes,
  FolderGit2,
  FolderKanban,
  House,
  LayoutTemplate,
  LogOut,
  Plus,
  Rocket,
  Settings,
  Store,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "./theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/app/(auth)/actions";
import { DAILY_CREDITS } from "@/lib/credits";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; soon?: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/deployments", label: "Deployments", icon: Rocket },
  { href: "/import", label: "Import project", icon: FolderGit2 },
  { href: "/integrations", label: "Integrations", icon: Boxes },
  { href: "/settings", label: "Settings", icon: Settings },
];

export type SidebarUser = {
  name: string;
  email: string;
  avatarUrl: string | null;
  credits: number;
  isAdmin?: boolean;
};

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const used = DAILY_CREDITS - Math.max(0, Math.min(DAILY_CREDITS, user.credits));
  const usedPct = (used / DAILY_CREDITS) * 100;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar p-3 md:flex">
      <div className="flex items-center justify-between py-2 pl-2">
        <Logo href="/dashboard" />
        <ThemeToggle />
      </div>

      <Link href="/dashboard#new" className={cn(buttonVariants({ size: "lg" }), "mt-4 h-9 justify-start")}>
        <Plus /> New project
      </Link>

      <nav className="mt-4 flex flex-col gap-0.5">
        {[...NAV, ...(user.isAdmin ? [{ href: "/metrics", label: "Metrics", icon: BarChart3 }] : [])].map(({ href, label, icon: Icon, ...rest }) => {
          const soon = "soon" in rest && !!(rest as { soon?: boolean }).soon;
          const active = !soon && pathname === href.split("#")[0] && !href.includes("#");
          const item = (
            <span
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition",
                active && "bg-sidebar-accent text-foreground",
                !soon && "hover:bg-sidebar-accent hover:text-foreground",
                soon && "opacity-60",
              )}
            >
              <Icon className="size-4" />
              {label}
              {soon && <span className="ml-auto rounded bg-muted px-1.5 text-[10px] uppercase tracking-wide">soon</span>}
            </span>
          );
          return soon ? (
            <Tooltip key={href}>
              <TooltipTrigger render={<div className="cursor-not-allowed" />}>{item}</TooltipTrigger>
              <TooltipContent side="right">Coming in the next build</TooltipContent>
            </Tooltip>
          ) : (
            <Link key={href} href={href}>
              {item}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-xl border bg-card/60 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Zap className="size-3.5 text-primary" /> Free plan
            </span>
            <span className="text-muted-foreground">{user.credits} left today</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${usedPct}%` }} />
          </div>
          <Link href="/pricing" className="mt-2 block text-xs text-primary hover:underline">Upgrade for more →</Link>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none transition hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="size-8">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
              <AvatarFallback>{initials || "U"}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
