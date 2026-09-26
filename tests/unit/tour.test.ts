import { describe, expect, it } from "vitest";
import { TOUR_STEPS, placeCard } from "@/lib/tour";

const vp = { width: 1280, height: 800 };
const card = { width: 320, height: 180 };

describe("tour card placement", () => {
  it("goes below the target when there's room, above when there isn't", () => {
    expect(placeCard({ top: 10, left: 100, width: 80, height: 30 }, card, vp)).toMatchObject({ top: 52, side: "below" });
    const composer = { top: 680, left: 20, width: 400, height: 100 };
    const p = placeCard(composer, card, vp);
    expect(p.side).toBe("above");
    expect(p.top + card.height).toBeLessThanOrEqual(composer.top);
  });

  it("goes beside a target that's too tall for above or below", () => {
    const tall = { top: 60, left: 20, width: 440, height: 700 };
    const p = placeCard(tall, card, vp);
    expect(p.side).toBe("right");
    expect(p.left).toBeGreaterThanOrEqual(tall.left + tall.width);
  });

  it("stays inside the viewport horizontally, including at phone width", () => {
    expect(placeCard({ top: 10, left: 1250, width: 30, height: 30 }, card, vp).left).toBe(vp.width - 16 - card.width);
    expect(placeCard({ top: 10, left: 0, width: 30, height: 30 }, card, vp).left).toBe(16);
    const phone = { width: 390, height: 844 };
    const narrow = { width: 358, height: 200 };
    expect(placeCard({ top: 10, left: 300, width: 80, height: 32 }, narrow, phone).left).toBe(16);
  });

  it("never covers the highlighted element when either side has room", () => {
    for (let i = 0; i < 500; i++) {
      const height = 20 + Math.random() * 300;
      const target = { top: Math.random() * (vp.height - height), left: Math.random() * (vp.width - 50), width: 50 + Math.random() * 400, height };
      const p = placeCard(target, card, vp);
      if (p.side === "edge") continue;
      const overlapsY = p.top < target.top + target.height && p.top + card.height > target.top;
      const overlapsX = p.left < target.left + target.width && p.left + card.width > target.left;
      expect(overlapsX && overlapsY, JSON.stringify(target)).toBe(false);
      expect(p.top).toBeGreaterThanOrEqual(16);
      expect(p.top + card.height).toBeLessThanOrEqual(vp.height - 16);
    }
  });

  it("has Guided and Pro versions over the same anchors", () => {
    expect(TOUR_STEPS.guided.map((s) => s.anchor)).toContain("select");
    expect(TOUR_STEPS.pro.map((s) => s.anchor)).toContain("tabs");
    for (const steps of Object.values(TOUR_STEPS)) expect(new Set(steps.map((s) => s.anchor)).size).toBe(steps.length);
  });
});
