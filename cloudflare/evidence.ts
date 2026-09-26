import { AuditEvidenceSchema, type AuditEvidence } from "../src/domain/index.js";
import { FIXTURE_EVIDENCE } from "../src/adapters/tools/fixture-tool-client.js";

// Cloudflare's incident is an observation, not a diagnosed missing index.
// Keep the original MCP fixture and previously persisted investigations unchanged.
export const SYNTHETIC_EVIDENCE = AuditEvidenceSchema.parse({
  ...FIXTURE_EVIDENCE,
  findings: [{
    severity: "info", category: "table_statistics", table: "orders",
    detail: "Synthetic table counters and live-row estimate. Query-level timing, plans, predicates and the counter observation window are not provided; no cause or change is established.",
    safe_to_apply: false, requires_downtime: false,
    evidence: { ...FIXTURE_EVIDENCE.findings[0]!.evidence },
  }],
  summary: { ...FIXTURE_EVIDENCE.summary, high: 0, info: 1 },
});

export function observedFacts(evidence: AuditEvidence): string {
  const metrics = evidence.findings[0]?.evidence;
  for (const name of ["seq_scans", "idx_scans", "live_rows"] as const) {
    if (typeof metrics?.[name] !== "number" || !Number.isFinite(metrics[name]) || metrics[name] < 0) throw new Error("Unsupported synthetic metric");
  }
  return `Saved table counters: ${metrics!.seq_scans} sequential scans and ${metrics!.idx_scans} index scans; live-row estimate: ${metrics!.live_rows}. These are separate measurements, not scans out of rows. No scan ratio or query-slowness cause is established. The snapshot lacks query-level timing, representative plans, predicates and a counter observation window.`;
}

// In particular, legacy saved fixture narrative is not evidence of causation.
// Pass only measured values to synthesis, retaining the original snapshot/hash.
export function measuredEvidence(evidence: AuditEvidence) {
  observedFacts(evidence);
  return { findings: evidence.findings.map(f => ({ category: f.category, evidence: f.evidence })) };
}
