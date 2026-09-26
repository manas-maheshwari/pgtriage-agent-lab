import { DurableObject } from "cloudflare:workers";
import type { Env } from "./worker.js";
import { MODEL } from "./model.js";

export const SHARED_QUOTA = "approved-staging-window-v1";
export const ATTEMPT_LIMIT = 20;
type FailureReason = "structured-output" | "usage-or-billing-limit" | "provider-unavailable";
type Attempt = { number: number; startedAt: string; outcome: "reserved" | "provider-returned" | "provider-error"; failureReason?: FailureReason };
type Ledger = { disabled: boolean; attempts: Attempt[]; adviceReviewApprovalUsedAt?: string; evidenceReviewApprovalUsedAt?: string };

// Only a fixed category is persisted; never provider messages, prompts or credentials.
export function providerFailureReason(error: unknown): FailureReason {
  const message = error instanceof Error ? error.message : "";
  if (/quota|billing|payment|upgrade|allocation|daily limit|rate limit|too many requests/i.test(message)) return "usage-or-billing-limit";
  if (/json mode|json schema|json_schema|grammar|structured output|schema/i.test(message)) return "structured-output";
  return "provider-unavailable";
}

export function liveWindowOpen(env: Pick<Env, "INFERENCE_ENABLED" | "LIVE_UNTIL">): boolean {
  const until = Date.parse(env.LIVE_UNTIL ?? "");
  return env.INFERENCE_ENABLED === "true" && Number.isFinite(until) && until > Date.now() && until <= Date.now() + 3_600_000;
}

// One named object owns every live invocation. No reset or enable HTTP/RPC method.
// Reservations survive failures, new sessions, eviction, and ordinary redeploys.
export class InferenceQuota extends DurableObject<Env> {
  private inFlight = false;
  // One explicitly authorized deployment migration, not a general enable/reset API.
  // It cannot create a ledger, discard attempts, extend the cap, or reopen twice.
  async #applyApprovedReviewResume() {
    const approval = this.env.ADVICE_REVIEW_RESUME === "advice-v3-from-8"
      ? { count: 8, marker: "adviceReviewApprovalUsedAt" as const }
      : this.env.ADVICE_REVIEW_RESUME === "evidence-v4-from-11"
        ? { count: 11, marker: "evidenceReviewApprovalUsedAt" as const } : undefined;
    if (!approval || !liveWindowOpen(this.env)) return;
    await this.ctx.storage.transaction(async (tx) => {
      const ledger = await tx.get<Ledger>("ledger");
      if (!ledger?.disabled || ledger[approval.marker] || ledger.attempts.length !== approval.count ||
          ledger.attempts.some((attempt, i) => attempt.number !== i + 1 || attempt.outcome === "reserved")) return;
      ledger[approval.marker] = new Date().toISOString();
      ledger.disabled = false;
      await tx.put("ledger", ledger);
    });
  }
  private async ledger(): Promise<Ledger> {
    return (await this.ctx.storage.get<Ledger>("ledger")) ?? { disabled: false, attempts: [] };
  }
  async status() {
    await this.#applyApprovedReviewResume();
    const ledger = await this.ledger();
    return { enabled: liveWindowOpen(this.env) && !ledger.disabled, limit: ATTEMPT_LIMIT,
      used: ledger.attempts.length, remaining: ATTEMPT_LIMIT - ledger.attempts.length, attempts: ledger.attempts };
  }
  async disable() {
    await this.ctx.storage.transaction(async (tx) => {
      const ledger = (await tx.get<Ledger>("ledger")) ?? { disabled: false, attempts: [] };
      ledger.disabled = true;
      // Shutdown wins even if the approved migration has not been activated yet.
      if (this.env.ADVICE_REVIEW_RESUME === "advice-v3-from-8") ledger.adviceReviewApprovalUsedAt ??= new Date().toISOString();
      if (this.env.ADVICE_REVIEW_RESUME === "evidence-v4-from-11") ledger.evidenceReviewApprovalUsedAt ??= new Date().toISOString();
      await tx.put("ledger", ledger);
    });
    return this.status();
  }
  async infer(model: string, input: Record<string, unknown>): Promise<{ ok: true; outputJson: string } | { ok: false }> {
    if (model !== MODEL || !this.env.AI || !liveWindowOpen(this.env) || this.inFlight) return { ok: false };
    this.inFlight = true;
    let number: number | undefined;
    try {
      await this.#applyApprovedReviewResume();
      number = await this.ctx.storage.transaction(async (tx) => {
        const ledger = (await tx.get<Ledger>("ledger")) ?? { disabled: false, attempts: [] };
        if (ledger.disabled || ledger.attempts.length >= ATTEMPT_LIMIT) throw new Error("Inference budget exhausted or disabled");
        const next = ledger.attempts.length + 1;
        ledger.attempts.push({ number: next, startedAt: new Date().toISOString(), outcome: "reserved" });
        await tx.put("ledger", ledger);
        return next;
      });
      // Persisted reservation always precedes the billable boundary. Never refunded.
      const result = await this.env.AI.run(MODEL, input);
      const outputJson = JSON.stringify(result);
      if (!outputJson || outputJson.length > 40_000) throw new Error("Invalid provider response");
      await this.finish(number, "provider-returned");
      return { ok: true, outputJson };
    } catch (error) {
      if (number !== undefined) await this.finish(number, "provider-error", providerFailureReason(error));
      return { ok: false };
    } finally { this.inFlight = false; }
  }
  private async finish(number: number, outcome: Attempt["outcome"], failureReason?: FailureReason) {
    await this.ctx.storage.transaction(async (tx) => {
      const ledger = (await tx.get<Ledger>("ledger"))!;
      const attempt = ledger.attempts.find((item) => item.number === number);
      if (attempt) { attempt.outcome = outcome; if (failureReason) attempt.failureReason = failureReason; }
      await tx.put("ledger", ledger);
    });
  }
}
