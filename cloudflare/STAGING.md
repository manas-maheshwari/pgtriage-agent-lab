# Private staging procedure

Current phase: v4 evidence review completed with **13/20 attempts used**,
including three provider failures. Inference is disabled in configuration and the
durable shutdown latch is set. Investigation, refresh, grounded follow-up and
recovery passed after a structured-output correction; advice-quality limitations
remain documented. **Do not reopen or replace this quota to use its remaining
allowance. Any further live testing requires fresh authorization and review.**
Existing Free plans only, one user-confirmed email,
synthetic data, and 20 shared attempts including failures. Stop for purchases, paid
add-ons, or broader permissions. Actual results and remaining test gaps are recorded
in [LIVE-RESULTS.md](LIVE-RESULTS.md).

The earlier revision `synthetic-advisor-v3` received a three-call live review.
The user explicitly authorized resuming the existing ledger from 8/20. The
deployment-only `ADVICE_REVIEW_RESUME=advice-v3-from-8` migration required eight
settled attempts and consumed its approval durably; no attempt was removed and
the cap remained 20. That one-use migration cannot reopen the final shutdown.
The flag is absent from the final disabled deployment and checked-in config.
Rollback gaps and pre-change order passed; causal certainty and useful post-change
checks still need improvement. See the exact response artifact in LIVE-RESULTS.

Deployed v4 separates observations/hypotheses/next checks, removes the fixture's
unsupported ratio and index proposal, and omits post-change advice when no change
is proposed. The user authorized one fresh investigation from the existing 11/20.
The separate `ADVICE_REVIEW_RESUME=evidence-v4-from-11` migration required exactly
11 settled attempts and consumed its approval durably, retaining the entire ledger
and the old v3 approval. Calls 12–13 completed the investigation without retries.
The response passed this review: no invented ratio or definite cause; hypotheses
are unconfirmed. Its broad hypotheses are not proof of a root cause. See the full
[EVIDENCE-REVIEW-2026-09-26.md](EVIDENCE-REVIEW-2026-09-26.md) response.
Inference is disabled via the durable latch and final deployment configuration;
the expiry is empty and resume flag absent. No further live calls are authorized.

## Preflight and protected deployment

1. Sign in privately; confirm the intended account and **Workers Free** plan in the
   dashboard. Check Workers AI and SQLite Durable Objects are available without
   upgrade. If Access onboarding requires a purchase or new terms, pause for review.
2. Inspect existing deployment credentials. No CLI login existed at initial check;
   do not grant Wrangler's broad default OAuth scopes automatically. Review the
   minimum deployment permissions with the user before authorizing new access.
   Keep tokens in the OS keychain or a private operator shell, never in this repo.
3. Deploy the staging configuration with `INFERENCE_ENABLED=false`, empty
   `LIVE_UNTIL`, and preview URLs disabled. Until Access configuration is installed,
   the application denies all requests, including static assets. No custom domain
   or alternate public route is needed. Never deploy the local fixture config.
4. Configure Cloudflare Access on the staging workers.dev hostname. Use one exact
   confirmed email allow rule and a 30-minute session. The deployed setup uses the
   existing Cloudflare identity provider; no separate email OTP provider was added.
   Accept-all-identity-providers and WARP authentication are off; HttpOnly is on.
   No Everyone, domain-wide, bypass, service-token, or extra allow policies.
5. Privately configure `ACCESS_TEAM_DOMAIN` (hostname only), `ACCESS_AUD`,
   `ALLOWED_EMAIL`, and `STAGING_HOST`. These may be Worker secrets to keep identity
   and account details out of checked-in config. No external model or DB key exists.
6. Verify signed-in access to assets and API. In a separate unauthenticated client,
   verify neither assets nor API are readable; spoofed email/JWT headers and a copied
   app cookie must fail. Verify logout/access denial. Only the allowed identity is
   admitted; second-identity ownership isolation is also covered with locally signed
   test tokens. Label that test as local rather than pretending a second user signed in.
7. On the original preflight, authenticated `GET /api/inference` showed zero attempts,
   disabled. For later checks, preserve the existing count; never expect or force a reset. Verify new
   investigation POSTs fail while disabled and saved-state GETs work. Inspect deployed
   routes and confirm version/preview URLs are disabled. Do not enable until these pass.

## One live acceptance scenario

Record timestamps, configured model/prompt version, aggregate attempt counts,
synthetic evidence hashes, completed/error status, and observed assertions in
`LIVE-RESULTS.md`. Never record emails, account IDs, private hostnames, login URLs,
cookies, JWTs, OTPs, or credentials. Keep local/mocked and real provider results separate.

1. Only after fresh user approval and preflight, briefly enable inference with an explicit UTC `LIVE_UNTIL` no
   more than one hour away. Preserve the same Worker, quota namespace, and fixed
   quota name; never reset the counter or create a second quota to extend the budget.
2. Ask: “Why is the synthetic orders table slow?” Expect two reserved calls, one
   synthetic audit, saved evidence, and a validated advisory answer. Inspect
   citations, exact diagnostic numbers, uncertainty, validation steps and review flag.
3. Refresh. The answer and evidence hash must be identical, with zero new attempts.
4. Ask: “Suppose there were only three sequential scans. Using the saved diagnostic
   evidence, what should I validate first, and what remains uncertain?” Expect one
   call, the same evidence hash, actual saved counts rather than the invented three,
   and no new audit. The separate local counterfactual test removes prior chat and
   changes stored evidence, proving the code does not rely on transcript text.
5. Any actual provider/validation failure must remain in the report and attempt
   ledger: visible bounded error, no fabricated answer, no automatic retry, preserved
   evidence, and an explicit new follow-up only within the remaining quota. Controlled
   malformed-output/provider-error/timeout injections are local tests, not evidence
   of a real provider outage; do not claim a live failure if none occurs.
6. **Always shut down**, including if acceptance fails: authenticated same-origin
   `DELETE /api/inference` irreversibly latches this test quota off. Then redeploy
   `INFERENCE_ENABLED=false` and empty `LIVE_UNTIL`. Verify status disabled and that
   a fresh POST cannot increment the count; saved-state refresh should still work.
   An accepted provider request can finish after shutdown/timeout; its reservation
   remains counted. The expiry is a backstop if the operator disconnects.

There is no public enable/reset route. Further test windows require a fresh explicit
authorization and code/config review. Do not change the quota ID to bypass this run.

## Cost and data boundaries

The application limit is 20 reservations, not a dollar budget or invoice cap. One
attempt allows at most 1,800 generated tokens; inputs are bounded and consist of
instructions, the current synthetic question, audit and runbook chunks. No prior
chat transcript, Access identity, cookies, or credentials enter the model prompt.
Cloudflare hosts the Worker/assets, stores investigation records in Durable Objects,
and processes inference through Workers AI. No database is contacted or changed.
State currently persists until explicitly removed; there is no automatic retention
cleanup. Raw provider errors and Access tokens are not logged by the application.

Stay on the existing Free plan. Its platform limits can reject requests independently
of the app quota; account-wide usage can already have consumed the free allocation.
Billing alerts do not reject model requests and may arrive after usage. The original
runtime's `estimatedCostUsd=0` placeholder is not a billing measurement.

Sources: [Access on workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/),
[JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
[AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/),
[Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
