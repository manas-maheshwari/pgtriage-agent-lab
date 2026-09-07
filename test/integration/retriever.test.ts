import { describe, expect, it } from "vitest";

import { MarkdownCorpusRetriever } from "../../src/adapters/retrieval/markdown-corpus-retriever.js";
import type { PgTriageFinding } from "../../src/domain/index.js";

describe("MarkdownCorpusRetriever", () => {
  it("retrieves cited runbook chunks for missing-index evidence", async () => {
    const retriever = new MarkdownCorpusRetriever("corpus");
    const finding: PgTriageFinding = {
      severity: "high",
      category: "missing_index",
      table: "orders",
      detail: "Large table has repeated sequential scans and frequent predicates.",
      suggested_fix: "Consider CREATE INDEX CONCURRENTLY after validation.",
      safe_to_apply: false,
      requires_downtime: false,
      evidence: { seq_scans: 18250, live_rows: 2000000 },
    };

    const chunks = await retriever.retrieve(finding, 2);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.url).toMatch(/^https:\/\/www\.postgresql\.org\/docs\/current\//);
    expect(chunks.some((chunk) => chunk.document === "missing-indexes")).toBe(true);
  });
});
