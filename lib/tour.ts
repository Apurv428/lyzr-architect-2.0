import type { Mode } from "@/lib/types";

export type TourStep = { anchor: string; title: string; body: string };

export const TOUR_STORAGE_KEY = "architect:tour-done";

// Each step points at a `data-tour="…"` element. Steps whose element isn't on screen
// (e.g. the preview on a phone, or the plan before one exists) are skipped.
export const TOUR_STEPS: Record<Mode, TourStep[]> = {
  guided: [
    { anchor: "plan", title: "Approve before anything is built", body: "This is Architect's plan in plain words. Edit any line, then approve — nothing is built until you do." },
    { anchor: "composer", title: "Just describe it", body: "Ask for changes the way you'd tell a colleague. You can attach a screenshot or document too." },
    { anchor: "select", title: "Point at what to change", body: "Click Select to edit, then any part of your app, and say how it should look or behave." },
    { anchor: "checkpoints", title: "Undo anything", body: "Every change is saved. Restore any earlier version in one click — history is never lost." },
    { anchor: "mode", title: "Guided or Pro", body: "You're in Guided mode. Switch to Pro any time to see code and diffs — nothing changes in your project." },
    { anchor: "deploy", title: "Share it", body: "When you're happy, deploy to a public link with a QR code for your phone." },
  ],
  pro: [
    { anchor: "plan", title: "Plan first", body: "Screens, data model and agent steps. Edit inline, then approve — generation only starts after that." },
    { anchor: "composer", title: "Prompt, attach, or /ask", body: "Describe a change, paste a screenshot or PRD, or start with /ask to get clarifying questions first." },
    { anchor: "tabs", title: "Code and agent", body: "Review diffs and edit files in Code (edits become checkpoints). Pick LangGraph, CrewAI and more in Agent." },
    { anchor: "checkpoints", title: "Checkpoints", body: "Every AI change and manual edit is a checkpoint. Restores are non-destructive." },
    { anchor: "mode", title: "Pro mode", body: "Code, diffs, env vars and the framework picker are on. Flip to Guided when a teammate takes over." },
    { anchor: "deploy", title: "Ship", body: "Preview and production deploys with rollback, an agent API with keys, or a pull request from the GitHub button." },
  ],
};

/** The last visible element for an anchor (the newest plan card, say), or null. */
export function findAnchor(anchor: string) {
  const els = [...document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)].reverse();
  return els.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }) ?? null;
}

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Places the coach card next to the highlighted element — below it when there's room, otherwise
 * above — so it never covers the thing it's pointing at. Returns the card's top/left in px.
 */
export function placeCard(target: Rect, card: { width: number; height: number }, viewport: { width: number; height: number }, gap = 12, margin = 16) {
  const clampX = (x: number) => Math.min(Math.max(x, margin), Math.max(margin, viewport.width - margin - card.width));
  const clampY = (y: number) => Math.min(Math.max(y, margin), Math.max(margin, viewport.height - margin - card.height));
  const centredX = clampX(target.left + target.width / 2 - card.width / 2);
  const below = target.top + target.height + gap;
  const above = target.top - gap - card.height;
  if (below + card.height <= viewport.height - margin) return { top: below, left: centredX, side: "below" } as const;
  if (above >= margin) return { top: above, left: centredX, side: "above" } as const;

  // A tall target: try beside it.
  const centredY = clampY(target.top + target.height / 2 - card.height / 2);
  const right = target.left + target.width + gap;
  if (right + card.width <= viewport.width - margin) return { top: centredY, left: right, side: "right" } as const;
  const left = target.left - gap - card.width;
  if (left >= margin) return { top: centredY, left, side: "left" } as const;

  // Nothing fits: pin to whichever vertical edge has more room.
  const top = target.top > viewport.height - (target.top + target.height) ? margin : viewport.height - margin - card.height;
  return { top, left: centredX, side: "edge" } as const;
}
