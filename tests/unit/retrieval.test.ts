import { describe, expect, it } from "vitest";
import { chunkDocs, describeSources, rank, tokenize } from "@/lib/agent/retrieval";

const docs = [
  {
    name: "Returns-Policy.pdf",
    pages: [
      "Returns are accepted within 30 days of delivery. Items must be unused.",
      "Refunds are issued to the original payment method within 5 business days of receiving the return.",
      "Shipping labels for returns are free for Pro customers.",
    ],
  },
  { name: "FAQ.md", pages: ["Our support team is available Monday to Friday, 9am to 6pm IST."] },
];

describe("retrieval", () => {
  const passages = chunkDocs(docs);

  it("keeps page numbers and never crosses pages", () => {
    expect(passages.map((p) => [p.doc, p.page])).toEqual([
      ["Returns-Policy.pdf", 1],
      ["Returns-Policy.pdf", 2],
      ["Returns-Policy.pdf", 3],
      ["FAQ.md", 1],
    ]);
  });

  it("ranks the passage that answers the question first", async () => {
    const top = await rank(passages, "How long does a refund take?");
    expect(top[0]).toMatchObject({ doc: "Returns-Policy.pdf", page: 2 });
  });

  it("returns nothing for unrelated questions", async () => {
    expect(await rank(passages, "quantum chromodynamics")).toEqual([]);
  });

  it("splits long pages into overlapping passages", () => {
    const long = { name: "Handbook.pdf", pages: [Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about onboarding.`).join(" ")] };
    const chunks = chunkDocs([long]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.text.length <= 900)).toBe(true);
  });

  it("drops stop words", () => {
    expect(tokenize("What is the refund window?")).toEqual(["refund", "window"]);
  });

  it("describes sources by file and page", () => {
    expect(describeSources([{ doc: "A.pdf", page: 3, text: "" }, { doc: "A.pdf", page: 1, text: "" }, { doc: "B.md", page: 1, text: "" }])).toBe(
      "A.pdf (p. 1, 3) · B.md (p. 1)",
    );
  });
});
