"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { finishTour } from "@/lib/actions/profile";
import { TOUR_STEPS, TOUR_STORAGE_KEY, findAnchor, placeCard, type TourStep } from "@/lib/tour";
import type { Mode } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

type Box = { top: number; left: number; width: number; height: number };

const PAD = 6;
const sameBox = (a: Box | null, b: Box) => !!a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

function readDone() {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDone() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, "1");
  } catch {
    // Storage can be blocked; the profile flag still records completion.
  }
}

export function clearTourDone() {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {}
}

/**
 * Coach marks with a spotlight. The overlay never takes pointer events, and the card sits beside
 * its target rather than over it, so the tour can't block anything the user needs to click.
 */
export function Tour({ steps, onFinish }: { steps: TourStep[]; onFinish: (completed: boolean, seen: number) => void }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCard] = useState({ width: 320, height: 180 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  // Follow the target: panels resize, chat scrolls, fonts load.
  useEffect(() => {
    const el = findAnchor(step.anchor);
    if (!el) {
      const t = setTimeout(() => (last ? onFinish(true, index + 1) : setIndex((i) => i + 1)), 0);
      return () => clearTimeout(t);
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const measure = () => {
      const target = findAnchor(step.anchor) ?? el;
      const r = target.getBoundingClientRect();
      const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      setBox((prev) => (sameBox(prev, next) ? prev : next));
      setViewport((v) => (v.width === innerWidth && v.height === innerHeight ? v : { width: innerWidth, height: innerHeight }));
    };
    const frame = requestAnimationFrame(measure);
    const timer = setInterval(measure, 250);
    addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      removeEventListener("resize", measure);
    };
  }, [step.anchor, index, last, onFinish]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCard({ width: el.offsetWidth, height: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish(false, index + 1);
      else if (e.key === "ArrowRight") {
        if (last) onFinish(true, index + 1);
        else setIndex(index + 1);
      }
      else if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [index, last, onFinish]);

  const place = box && viewport.width ? placeCard(box, card, viewport) : null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70]" data-testid="tour">
      {box && (
        <div
          aria-hidden
          className="absolute rounded-xl ring-2 ring-primary transition-all duration-300 ease-out"
          style={{ ...box, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)" }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className={cn(
          "pointer-events-auto absolute w-[min(20rem,calc(100vw-2rem))] rounded-2xl border bg-popover p-4 text-popover-foreground shadow-2xl transition-[top,left,opacity] duration-300 ease-out",
          !place && "opacity-0",
        )}
        style={place ? { top: place.top, left: place.left } : { top: 16, left: 16 }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-primary tabular-nums">
            {index + 1} of {steps.length}
          </span>
          <button onClick={() => onFinish(false, index + 1)} aria-label="Skip tour" className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
        <p id="tour-title" className="mt-1 font-medium">{step.title}</p>
        <p id="tour-body" className="mt-1 text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1" aria-hidden>
            {steps.map((s, i) => (
              <span key={s.anchor} className={cn("size-1.5 rounded-full transition", i === index ? "bg-primary" : "bg-muted-foreground/30")} />
            ))}
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onFinish(false, index + 1)}>
            Skip
          </Button>
          {index > 0 && (
            <Button size="icon-sm" variant="outline" aria-label="Previous step" onClick={() => setIndex(index - 1)}>
              <ArrowLeft />
            </Button>
          )}
          <Button ref={nextRef} size="sm" onClick={() => (last ? onFinish(true, index + 1) : setIndex(index + 1))}>
            {last ? <><Check /> Done</> : <>Next <ArrowRight /></>}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Shows the tour once per user, after the first plan or build has finished streaming. */
export function WorkspaceTour({ completed }: { completed: boolean }) {
  const mode = useWorkspace((s) => s.mode);
  const streaming = useWorkspace((s) => s.streaming);
  const dialog = useWorkspace((s) => s.dialog);
  const [steps, setSteps] = useState<{ mode: Mode; steps: TourStep[] } | null>(null);
  const decided = useRef(completed);

  useEffect(() => {
    if (decided.current || streaming || dialog) return;
    const t = setTimeout(() => {
      if (readDone()) {
        decided.current = true;
        return;
      }
      const available = TOUR_STEPS[mode].filter((s) => findAnchor(s.anchor));
      if (available.length >= 2) {
        decided.current = true;
        setSteps({ mode, steps: available });
      }
    }, 900);
    return () => clearTimeout(t);
  }, [mode, streaming, dialog]);

  if (!steps) return null;
  return (
    <Tour
      steps={steps.steps}
      onFinish={(done, seen) => {
        setSteps(null);
        writeDone();
        void finishTour({ completed: done, seen, total: steps.steps.length, mode: steps.mode });
      }}
    />
  );
}
