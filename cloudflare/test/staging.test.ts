import { env } from "cloudflare:workers";
import { runInDurableObject, evictDurableObject, reset } from "cloudflare:test";
import { afterEach, describe, it, expect, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import worker, { type Env } from "../worker.js";
import { verifiedOwner, investigationName } from "../access.js";
import { MODEL, modelFor, WorkersAiModelProvider } from "../model.js";
import { SHARED_QUOTA, liveWindowOpen, providerFailureReason } from "../quota.js";
import type { AuditRequest } from "../../src/domain/index.js";

const bindings = env as unknown as Env;
const config = { ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com", ACCESS_AUD: "test-app", ALLOWED_EMAIL: "owner@example.invalid", STAGING_HOST: "staging.example.invalid" };
afterEach(async () => { vi.restoreAllMocks(); await reset(); });

async function signedTokens() {
  const pair = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(pair.publicKey), kid: "test" };
  const key = createLocalJWKSet({ keys: [jwk] });
  const sign = (overrides = {}) => new SignJWT({ sub: "owner-one", email: config.ALLOWED_EMAIL, type: "app", ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer(`https://${config.ACCESS_TEAM_DOMAIN}`)
    .setAudience(config.ACCESS_AUD).setIssuedAt().setExpirationTime("5m").sign(pair.privateKey);
  return { key, sign, jwk };
}
function accessRequest(token: string, host = config.STAGING_HOST) {
  return new Request(`https://${host}/api/investigation`, { headers: { "Cf-Access-Jwt-Assertion": token } });
}

describe("staging protection (locally signed test tokens, no live Access)", () => {
  it("verifies signature and identity; rejects forged, expired, wrong-audience and missing configuration tokens", async () => {
    const { key, sign } = await signedTokens();
    const token = await sign();
    const owner = await verifiedOwner(accessRequest(token), config, key);
    expect(owner).not.toContain(config.ALLOWED_EMAIL);
    await expect(verifiedOwner(accessRequest(await sign({ email: "other@example.invalid" })), config, key)).rejects.toThrow();
    await expect(verifiedOwner(accessRequest(await sign({ type: "service" })), config, key)).rejects.toThrow();
    await expect(verifiedOwner(accessRequest(token), { ...config, ACCESS_AUD: "wrong" }, key)).rejects.toThrow();
    await expect(verifiedOwner(accessRequest(token), { ...config, ACCESS_TEAM_DOMAIN: "other.cloudflareaccess.com" }, key)).rejects.toThrow();
    await expect(verifiedOwner(accessRequest(token), {}, key)).rejects.toThrow();
    await expect(verifiedOwner(accessRequest(token, "alternate.example.invalid"), config, key)).rejects.toThrow();
    await expect(verifiedOwner(accessRequest(`${token.slice(0, -12)}invalidtoken`), config, key)).rejects.toThrow();
    vi.useFakeTimers();
    try { vi.setSystemTime(Date.now() + 600_000); await expect(verifiedOwner(accessRequest(token), config, key)).rejects.toThrow(); }
    finally { vi.useRealTimers(); }
  });

  it("denies all staging paths without Access, including assets and inference control", async () => {
    const staging = { ...bindings, LOCAL_ONLY: "false", ...config };
    for (const path of ["/", "/app.js", "/api/investigation", "/api/session", "/api/inference"]) {
      const response = await worker.fetch(new Request(`https://${config.STAGING_HOST}${path}`, { headers: { "Cf-Access-Authenticated-User-Email": config.ALLOWED_EMAIL } }), staging);
      expect(response.status).toBe(403);
      await response.text();
    }
    expect(() => modelFor({ ...staging, MODEL_MODE: "fixture" })).toThrow();
  });

  it("binds a copied cookie to the signed subject and refuses mismatched object ownership", async () => {
    const { key, sign } = await signedTokens();
    const a = await verifiedOwner(accessRequest(await sign()), config, key);
    const b = await verifiedOwner(accessRequest(await sign({ sub: "owner-two" })), config, key);
    const cookie = "a".repeat(64);
    expect(investigationName(a, cookie)).not.toBe(investigationName(b, cookie));
    const stub = bindings.INVESTIGATIONS.get(bindings.INVESTIGATIONS.idFromName(investigationName(a, cookie)));
    const first = await stub.fetch("https://internal/", { headers: { "X-Investigation-Owner": a } });
    expect(first.status).toBe(200); await first.text();
    await evictDurableObject(stub);
    const stolen = await stub.fetch("https://internal/", { headers: { "X-Investigation-Owner": b } });
    expect(stolen.status).toBe(403); await stolen.text();
  });

  it("routes a verified Access request to owned state and allows only same-origin shutdown", async () => {
    const { sign, jwk } = await signedTokens();
    // Only the public key discovery response is mocked; signatures are verified.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ keys: [jwk] }));
    const token = await sign();
    const staging = { ...bindings, ...config, LOCAL_ONLY: "false", INFERENCE_ENABLED: "false" };
    const initial = await worker.fetch(accessRequest(token), staging);
    expect(initial.status).toBe(200); await initial.json();
    const cookie = initial.headers.get("Set-Cookie")!;
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=Strict");
    const origin = `https://${config.STAGING_HOST}`;
    const headers = { "Cf-Access-Jwt-Assertion": token, Cookie: cookie.split(";")[0]!, Origin: origin };
    const blocked = await worker.fetch(new Request(`${origin}/api/investigation`, { method: "POST", headers }), staging);
    expect(blocked.status).toBe(503); await blocked.text();
    const csrf = await worker.fetch(new Request(`${origin}/api/inference`, { method: "DELETE", headers: { ...headers, Origin: "https://other.example.invalid" } }), staging);
    expect(csrf.status).toBe(405); await csrf.text();
    const disable = await worker.fetch(new Request(`${origin}/api/inference`, { method: "DELETE", headers }), staging);
    expect(disable.status).toBe(200);
    expect(await disable.json()).toMatchObject({ enabled: false, used: 0 });
  });
});

async function quotaWithModel(run: (model: string, input: Record<string, unknown>) => Promise<unknown>, observedReservations: number[] = []) {
  const stub = bindings.QUOTA!.get(bindings.QUOTA!.idFromName(SHARED_QUOTA));
  await runInDurableObject(stub, async (instance, ctx) => {
    const target = (instance as unknown as { env: Env }).env;
    target.INFERENCE_ENABLED = "true";
    delete target.ADVICE_REVIEW_RESUME;
    target.LIVE_UNTIL = new Date(Date.now() + 600_000).toISOString();
    target.AI = { run: async (model, input) => {
      const saved = await ctx.storage.get<{ attempts: unknown[] }>("ledger");
      observedReservations.push(saved?.attempts.length ?? 0);
      return run(model, input);
    } };
  });
  return stub;
}

describe("shared quota (mock inference in real local Durable Objects)", () => {
  it("resumes the approved eight-attempt ledger once, preserving all attempts and the total cap", async () => {
    const provider = vi.fn(async () => ({ response: {} }));
    const quota = await quotaWithModel(provider);
    for (let i = 0; i < 8; i++) await quota.infer(MODEL, {});
    const prior = (await quota.status()).attempts;
    await quota.disable();
    await runInDurableObject(quota, async instance => {
      const target = (instance as unknown as { env: Env }).env;
      target.ADVICE_REVIEW_RESUME = "advice-v3-from-8";
      target.INFERENCE_ENABLED = "false";
    });
    expect(await quota.status()).toMatchObject({ enabled: false, used: 8 });
    await runInDurableObject(quota, async instance => { (instance as unknown as { env: Env }).env.INFERENCE_ENABLED = "true"; });
    expect(await quota.status()).toMatchObject({ enabled: true, used: 8, remaining: 12, attempts: prior });
    for (let i = 0; i < 12; i++) await quota.infer(MODEL, {});
    expect((await quota.status()).attempts.slice(0, 8)).toEqual(prior);
    expect(await quota.infer(MODEL, {})).toEqual({ ok: false });
    expect(provider).toHaveBeenCalledTimes(20);
    expect(await quota.status()).toMatchObject({ used: 20, remaining: 0 });
  });

  it("cannot reopen the resumed latch again even without a ninth call and after eviction", async () => {
    const quota = await quotaWithModel(async () => ({ response: {} }));
    for (let i = 0; i < 8; i++) await quota.infer(MODEL, {});
    await quota.disable();
    const approve = async () => runInDurableObject(quota, async instance => {
      (instance as unknown as { env: Env }).env.ADVICE_REVIEW_RESUME = "advice-v3-from-8";
    });
    await approve();
    expect(await quota.status()).toMatchObject({ enabled: true, used: 8 });
    await quota.disable();
    expect(await quota.status()).toMatchObject({ enabled: false, used: 8 });
    await evictDurableObject(quota);
    await quotaWithModel(async () => ({ response: {} }));
    await approve();
    expect(await quota.status()).toMatchObject({ enabled: false, used: 8 });
    expect(await quota.infer(MODEL, {})).toEqual({ ok: false });
  });

  it.each([0, 7, 9])("refuses the deployment resume on a disabled ledger with %i attempts", async (count) => {
    const quota = await quotaWithModel(async () => ({ response: {} }));
    for (let i = 0; i < count; i++) await quota.infer(MODEL, {});
    await quota.disable();
    await runInDurableObject(quota, async instance => {
      (instance as unknown as { env: Env }).env.ADVICE_REVIEW_RESUME = "advice-v3-from-8";
    });
    expect(await quota.status()).toMatchObject({ enabled: false, used: count });
    expect(await quota.infer(MODEL, {})).toEqual({ ok: false });
  });

  it("shutdown cancels an unused deployment approval before it can reopen the latch", async () => {
    const quota = await quotaWithModel(async () => ({ response: {} }));
    for (let i = 0; i < 8; i++) await quota.infer(MODEL, {});
    await runInDurableObject(quota, async instance => {
      (instance as unknown as { env: Env }).env.ADVICE_REVIEW_RESUME = "advice-v3-from-8";
    });
    expect(await quota.disable()).toMatchObject({ enabled: false, used: 8 });
    expect(await quota.status()).toMatchObject({ enabled: false, used: 8 });
  });

  it("resumes the approved eleven-attempt ledger once, preserving all attempts and the total cap", async () => {
    const provider = vi.fn(async () => ({ response: {} }));
    const quota = await quotaWithModel(provider);
    for (let i = 0; i < 11; i++) await quota.infer(MODEL, {});
    const prior = (await quota.status()).attempts;
    await quota.disable();
    await runInDurableObject(quota, async instance => {
      const target = (instance as unknown as { env: Env }).env;
      target.ADVICE_REVIEW_RESUME = "evidence-v4-from-11";
      target.INFERENCE_ENABLED = "false";
    });
    expect(await quota.status()).toMatchObject({ enabled: false, used: 11 });
    await runInDurableObject(quota, async instance => { (instance as unknown as { env: Env }).env.INFERENCE_ENABLED = "true"; });
    expect(await quota.status()).toMatchObject({ enabled: true, used: 11, remaining: 9, attempts: prior });
    for (let i = 0; i < 9; i++) await quota.infer(MODEL, {});
    expect((await quota.status()).attempts.slice(0, 11)).toEqual(prior);
    expect(await quota.infer(MODEL, {})).toEqual({ ok: false });
    expect(provider).toHaveBeenCalledTimes(20);
    expect(await quota.status()).toMatchObject({ used: 20, remaining: 0 });
  });

  it("cannot reopen the resumed latch again even without a twelfth call and after eviction", async () => {
    const quota = await quotaWithModel(async () => ({ response: {} }));
    for (let i = 0; i < 11; i++) await quota.infer(MODEL, {});
    await quota.disable();
    const approve = async () => runInDurableObject(quota, async instance => {
      (instance as unknown as { env: Env }).env.ADVICE_REVIEW_RESUME = "evidence-v4-from-11";
    });
    await approve();
    expect(await quota.status()).toMatchObject({ enabled: true, used: 11 });
    await quota.disable();
    expect(await quota.status()).toMatchObject({ enabled: false, used: 11 });
    await evictDurableObject(quota);
    await quotaWithModel(async () => ({ response: {} }));
    await approve();
    expect(await quota.status()).toMatchObject({ enabled: false, used: 11 });
    expect(await quota.infer(MODEL, {})).toEqual({ ok: false });
  });

  it.each([0, 8, 10, 12])("refuses the deployment resume on a disabled ledger with %i attempts", async (count) => {
    const quota = await quotaWithModel(async () => ({ response: {} }));
    for (let i = 0; i < count; i++) await quota.infer(MODEL, {});
    await quota.disable();
    await runInDurableObject(quota, async instance => {
      (instance as unknown as { env: Env }).env.ADVICE_REVIEW_RESUME = "evidence-v4-from-11";
    });
    expect(await quota.status()).toMatchObject({ enabled: false, used: count });
    expect(await quota.infer(MODEL, {})).toEqual({ ok: false });
  });

  it("shutdown cancels an unused deployment approval before it can reopen the latch", async () => {
    const quota = await quotaWithModel(async () => ({ response: {} }));
    for (let i = 0; i < 11; i++) await quota.infer(MODEL, {});
    await runInDurableObject(quota, async instance => {
      (instance as unknown as { env: Env }).env.ADVICE_REVIEW_RESUME = "evidence-v4-from-11";
    });
    expect(await quota.disable()).toMatchObject({ enabled: false, used: 11 });
    expect(await quota.status()).toMatchObject({ enabled: false, used: 11 });
  });

  it("reports only fixed failure categories, never raw provider details", () => {
    expect(providerFailureReason(new Error("JSON Mode couldn't be met: private request"))).toBe("structured-output");
    expect(providerFailureReason(new Error("daily limit exceeded: private account"))).toBe("usage-or-billing-limit");
    expect(providerFailureReason(new Error("private token secret"))).toBe("provider-unavailable");
  });
  it("reserves before calling the provider; counts failures and caps all sessions at 20", async () => {
    const provider = vi.fn(async () => { throw new Error("Synthetic provider failure"); });
    const observed: number[] = [];
    const quota = await quotaWithModel(provider, observed);
    for (let i = 0; i < 20; i++) expect(await quota.infer(MODEL, {})).toEqual({ ok: false });
    expect(provider).toHaveBeenCalledTimes(20);
    expect(observed).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(await quota.status()).toMatchObject({ used: 20, remaining: 0 });
    expect(await quota.infer(MODEL, {})).toEqual({ ok: false });
    expect(provider).toHaveBeenCalledTimes(20);
    await evictDurableObject(quota);
    const restored = await quotaWithModel(provider);
    expect(await restored.infer(MODEL, {})).toEqual({ ok: false });
    expect(await restored.status()).toMatchObject({ used: 20 });
    expect(provider).toHaveBeenCalledTimes(20);
  });

  it("shares one quota between providers and preserves the disable latch across eviction", async () => {
    const provider = vi.fn(async () => ({ response: { toolName: "full_audit", args: { slowQueryLimit: 10 } } }));
    const quota = await quotaWithModel(provider);
    const conf = { ...bindings, MODEL_MODE: "workers-ai", INFERENCE_ENABLED: "true", LIVE_UNTIL: new Date(Date.now() + 600_000).toISOString() };
    const request = { prompt: "synthetic diagnostic" } as AuditRequest;
    // Schema invalidity also consumes an attempt, and cannot produce a fake fallback.
    await Promise.allSettled([modelFor(conf).proposePlan(request), modelFor(conf).proposePlan(request)]);
    expect((await quota.status()).used).toBeGreaterThan(0);
    expect(provider.mock.calls.length).toBe((await quota.status()).used);
    const used = provider.mock.calls.length;
    await quota.disable();
    expect(await quota.infer(MODEL, {})).toEqual({ ok: false });
    await evictDurableObject(quota);
    await quotaWithModel(provider);
    expect(await quota.infer(MODEL, {})).toEqual({ ok: false });
    expect(await quota.status()).toMatchObject({ enabled: false, used });
    expect(provider).toHaveBeenCalledTimes(used);
  });

  it("retains an ambiguous reservation when the caller times out; no automatic retry", async () => {
    // Resolve after the adapter times out to avoid an orphaned test request context.
    const provider = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); return { response: {} }; });
    const quota = await quotaWithModel(provider);
    const model = new WorkersAiModelProvider({ run: async (name, input) => { const result = await quota.infer(name, input); if (!result.ok) throw new Error("inference failed"); return JSON.parse(result.outputJson); } }, 5);
    await expect(model.proposePlan({ prompt: "synthetic" } as AuditRequest)).rejects.toThrow();
    expect(await quota.status()).toMatchObject({ used: 1 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await quota.status()).toMatchObject({ used: 1 });
  });

  it("admits one concurrent invocation across sessions and rejects the burst before inference", async () => {
    const provider = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); return { response: {} }; });
    const quota = await quotaWithModel(provider);
    const results = await Promise.all(Array.from({ length: 21 }, async () => await quota.infer(MODEL, {})));
    expect(results.filter((item) => item.ok)).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await quota.status()).toMatchObject({ used: 1 });
  });

  it("refuses missing, expired or excessively long live windows", () => {
    expect(liveWindowOpen({ INFERENCE_ENABLED: "true" })).toBe(false);
    expect(liveWindowOpen({ INFERENCE_ENABLED: "false", LIVE_UNTIL: new Date(Date.now() + 1000).toISOString() })).toBe(false);
    expect(liveWindowOpen({ INFERENCE_ENABLED: "true", LIVE_UNTIL: new Date(Date.now() - 1).toISOString() })).toBe(false);
    expect(liveWindowOpen({ INFERENCE_ENABLED: "true", LIVE_UNTIL: new Date(Date.now() + 7_200_000).toISOString() })).toBe(false);
  });
});
