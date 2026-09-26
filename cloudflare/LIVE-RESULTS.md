# Live staging results

## 2026-09-25 — preflight paused; no live inference

- Authorization: Free plan only, sole confirmed email, shared 20-attempt quota,
  protection/ownership verified before inference, synthetic data, shutdown afterward.
- Wrangler check: not authenticated. Dashboard: sign-in page. No new credential or
  permission grant was performed. Sole allowlist email has not yet been confirmed.
- Account plan/entitlements: **not verified**; no purchase or plan change made.
- Deployment: **not performed**. Local staging build (`wrangler deploy --dry-run`)
  succeeded, with inference disabled. Dry-run is not a deployment or hosted check.
- Live Access/ownership verification: **not run**.
- Actual Workers AI attempts: **0**. Initial/refresh/follow-up acceptance: **not run**.
- Live failures/corrections: none observed because live testing has not started.
- Final state: no hosted resources created by this work; checked-in staging
  inference flag is false and the live-window timestamp is empty.

## Local and mocked validation — not live results

The staging suite uses locally signed JWTs, mocked JWKS/provider responses, and real
local Workers/Durable Object storage. It covers invalid identity/signature/issuer/
audience/expiry, missing configuration, protected routes, subject-bound cookies,
durable ownership, shutdown, global quota exhaustion including failures, concurrent
calls, and retained reservations after timeout/eviction. The original local suite
also covers persisted evidence with the transcript removed and values changed.

Development corrections: the first new quota test run failed on RPC promise/error
handling (two tests and unhandled rejection reports). Returning an explicit failure
result fixed that behavior. Type checking then caught a non-serializable `unknown`
RPC output; the envelope was changed to bounded JSON text. These were local
development failures, not Cloudflare provider failures. Final counts are recorded
in the corresponding public prompt-history entry after checks finish.

Private account identifiers and login material are intentionally excluded. Future
redactions within quoted prompts must be explicitly labeled.

## 2026-09-26 — OAuth permission review; no deployment or inference

- User confirmed the sole staging allowlist identity; **[REDACTED: private email]**.
- Opened Wrangler's OAuth request in the in-app browser, as requested. Actual
  consent page shows User Read, Background Access, Account Read, Workers Scripts
  Write, and Workers AI write. Stopped before Authorize; permission review pending.
- No hosted allowlist policy has been created yet. Account Free-plan verification,
  deployment, live access/ownership checks, and live acceptance remain pending.
- Actual Workers AI attempts remain **0**. No live-model success or failure is
  claimed. Deployment and inference remain paused; no plan or billing changes.

## 2026-09-26 — authentication-only verification

- User approved authorization and explicitly limited this step to authentication
  verification. Read-only `wrangler whoami` reported **not authenticated**.
- The preceding login callback wait timed out. No authenticated CLI session or
  granted scopes were verified. Login was not restarted during this check.
- Deployment and live inference remain paused; no new live attempts or resource
  changes were made.

## 2026-09-26 — device authorization verified; incorrect scope report, superseded below

- After the user completed device authorization independently, read-only
  `wrangler whoami` confirmed **authenticated via OAuth**.
- The assistant incorrectly classified **27** scope names as granted: its parser
  included warning bullets for missing default permissions. The excess-scope
  conclusion was false; see the structured verification below.
- Previously reviewed: `user:read`, `offline_access`, `account:read`,
  `workers_scripts:write`, `ai:write`.
- Warning names mistakenly classified as additional granted scopes (not proof of a grant):

```text
workers:write
workers_kv:write
workers_routes:write
workers_tail:read
d1:write
pages:write
zone:read
ssl_certs:write
ai-search:write
ai-search:run
agent-memory:write
queues:write
pipelines:write
secrets_store:write
artifacts:write
flagship:write
containers:write
cloudchamber:write
connectivity:admin
email_routing:write
email_sending:write
browser:write
```

- No credential changes, revocation, deployment, model call, or billing changes
  were performed. Deployment and inference remain paused. Actual live model
  attempts performed by this work remain **0**. Account identifiers are excluded.

## 2026-09-26 — corrected structured authentication/scope verification

- `wrangler whoami --json`: **authenticated**, auth type **OAuth Token**.
- `tokenPermissions` contains exactly five scopes: `user:read`, `offline_access`,
  `account:read`, `workers_scripts:write`, `ai:write`.
- **No additional scopes; no missing approved scopes.** The earlier 27-scope
  report was an assistant parsing error, not an established permission expansion.
- Verification only. No credential changes, deployment, live model attempts,
  account-plan checks, or billing changes. Deployment and inference remain paused.

## 2026-09-26 — disabled staging deployment attempted; onboarding blocked

- Workers plan verified in the authenticated dashboard: **Free, current plan**.
- Config at deploy attempt: `INFERENCE_ENABLED=false`, `LIVE_UNTIL` empty,
  `LOCAL_ONLY=false`, preview URLs disabled; Access configuration absent, so the
  Worker is designed to deny all requests.
- Actual deployment command exited 1. Cloudflare API rejected script publishing
  with **10034 — account email must be verified to use Workers**. Before rejection,
  Wrangler registered the workers.dev subdomain and uploaded three static assets.
  Do not interpret this as a successful deployment or claim that nothing changed.
- Dashboard independently showed the account verification modal. User asked to
  complete email verification privately. No successful retry has occurred yet.
- Access is not yet initialized. Selected Zero Trust Free ($0/seat/month) to inspect
  onboarding; checkout requires billing/payment details, terms acceptance and
  authorization for charges beyond free limits. **No activation, billing entry,
  charge authorization, or paid upgrade was performed.** Awaiting user review.
- [Workers Access documentation](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
  requires Zero Trust setup before its built-in Access controls when not enabled.
- Sole-email Access policy: **not configured**. Hosted anonymous UI/API blocking,
  valid login, ownership and inference-disabled API behavior: **not verified**.
- Inference remains disabled; actual live model attempts remain **0**. No additional
  permissions were granted. Private account identity/hostnames and billing details
  are excluded from this public report.

## 2026-09-26 — private staging deployed; hosted Access checks passed

The user completed account-email verification and activated Zero Trust Free
privately. This section supersedes the preceding onboarding block; it does not
erase that failed deployment. **No actual model inference was enabled or run.**

- Retried `wrangler deploy --config wrangler.staging.jsonc`: succeeded. Deployed
  the UI corrections below afterward, also successfully. Workers remains Free;
  the dashboard confirms Zero Trust Free. No paid add-ons, plan upgrades, or
  additional OAuth permissions were enabled during this work.
- One self-hosted Access application protects the entire staging hostname. Its
  sole Allow policy includes exactly the privately confirmed email. No domain-wide,
  Everyone, bypass, service-token, or additional Allow policy was added.
- Authentication uses the existing Cloudflare identity provider and signed-in
  browser session, not the previously proposed separate email OTP provider.
  Accept-all-identity-providers and WARP authentication are off. Application
  session duration is 30 minutes; the policy inherits it. HttpOnly cookie is on.
- Installed private Access configuration through Wrangler secrets. Values, account
  identifiers, login material and the allowlist email are excluded from this report.
  The Worker independently verifies JWTs and binds investigation state to the
  verified subject. Missing/invalid configuration remains fail-closed.

| Hosted check | Actual result |
| --- | --- |
| Anonymous GET `/`, `/app.js`, `/style.css` | HTTP 302 redirect to Cloudflare Access; no app content returned |
| Anonymous GET `/api/investigation`, `/api/inference` | HTTP 302 redirect to Access; no investigation or quota data returned |
| Anonymous POST `/api/investigation` | HTTP 302 redirect to Access |
| Forged email header, invalid JWT header and fake session cookie | HTTP 302 redirect to Access; no app data returned |
| Confirmed user's existing Cloudflare browser login | UI and protected API reads succeeded |
| Authenticated quota display from GET `/api/inference` | **0/20 attempts; inference disabled** |
| New investigation session action and page refresh | Succeeded; empty investigation restored, still disabled with 0 attempts |
| Deployment configuration | `INFERENCE_ENABLED=false`, `LIVE_UNTIL` empty |
| Dashboard exposure | Preview URLs off; no custom domains or zone routes |

Corrections and limits:

- The first anonymous probe using Python urllib received Cloudflare edge HTTP 403
  error 1010. That was not the Worker's JSON authentication response and was not
  counted as proof of application authorization. Subsequent curl probes established
  the Access redirects listed above.
- Opening the JSON status endpoint directly in the in-app browser failed with
  `ERR_BLOCKED_BY_CLIENT`. A read-only quota display was added to the existing UI,
  fetching the same authenticated endpoint; it visibly confirmed 0/20 and disabled.
  Hosted copy was also corrected to remove local-only wording. Both existing
  local browser tests passed after these edits, and `git diff --check` passed.
- The submit button is disabled. An authenticated hosted investigation POST was
  not manually sent; its disabled-state rejection is covered by local tests.
  Second-identity/session ownership isolation is locally tested, not verified
  with a second live account. No second identity was allowlisted.
- No populated live investigation, live-model answer, saved-evidence follow-up,
  or real provider failure was tested. The empty-state refresh above does not
  substitute for that acceptance scenario. Existing mocked/local results remain
  separate. Actual live model attempts: **0**. Inference stays disabled pending
  fresh explicit approval.

## 2026-09-26 — actual live acceptance, correction and shutdown

**Final result: 8/20 model attempts used; inference disabled with the durable
shutdown latch set and deployment configuration off.** No upgrade, paid add-on,
additional credential scope or Access allowlist change was needed or performed.
This was actual Workers AI inference, separate from all mocked results below.

Run interval: approximately **15:52–16:02 UTC**. Model:
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`. The original 30-minute expiry was
`2026-09-26T16:22:18.708028Z`; testing ended before it. All redeployments preserved
the same Worker, quota namespace, fixed quota name and counter. No refunds/resets.
Checked-in configuration remained disabled; temporary CLI overrides enabled the
authorized window. No database was connected or modified.

### Actual call ledger and assertions

| Attempts | Version | Action | Observed result |
| --- | --- | --- | --- |
| 1–2 | synthetic-advisor-v1 | “Why is the synthetic orders table slow?” | Planning returned; synthetic evidence saved; synthesis ended in provider error; bounded failure shown, no fabricated answer |
| none | v1 | Refresh failed investigation | Exact error/history and evidence restored; count remained 2 |
| 3 | v1 | Explicit follow-up asking what to validate using saved evidence | Provider error again; evidence retained; no automatic retry |
| 4 | v1, safe error categorization added | Explicit diagnostic recovery attempt | Provider error classified as `structured-output`; count remained consumed |
| 5 | synthetic-advisor-v2 | Explicit recovery after schema correction | Validated advisory answer using the original saved evidence; previous failures remained in history |
| none | v2 | Refresh recovered investigation | Exact recovered history and evidence restored; count remained 5 |
| 6–7 | v2 | New investigation, same initial question | Planning and synthesis returned; full investigation completed; shared counter rose from 5 to 7 rather than resetting |
| none | v2 | Refresh completed investigation | Exact answer, evidence and hash restored; count remained 7 |
| 8 | v2 | Conflicting-assumption follow-up below | Used actual saved 18,250 sequential scans and 41 index scans, not the invented three; same evidence hash; validated answer |
| none | v2 | Durable shutdown, disabled redeploy, stale-tab submission and refresh | Server rejected new request as disabled; count remained 8; completed answers and evidence still readable |

Actual follow-up prompt:

```text
Suppose there were only three sequential scans. Using the saved diagnostic evidence, what should I validate first, and what remains uncertain? State the actual saved scan counts.
```

Synthetic evidence hash displayed throughout: `6cfdf13ea446` (full fixture hash:
`6cfdf13ea446aada3cb3d25f289905292315d5514f94299e3801da3517ce2a66`).
Both final answers reference this hash. Evidence text was compared before/after
refresh, follow-up, recovery and shutdown and was unchanged. The final follow-up
explicitly stated the saved counts, acknowledged that they do not prove an index
is needed, cited the supplied “Sequential Scans” runbook passage, and required
human review. The hosted observation supports saved-evidence grounding; the
separate local counterfactual test proves independence from prior chat by removing
the transcript and changing persisted metrics before a follow-up.

Final persisted provider outcomes: **5 returned, 3 provider errors**. The five
returns comprise two planning calls and three advisory answers. Failures 2 and 3
predated error categorization; their exact cause was not retained. Failure 4's
fixed category was structured-output. No real timeout, quota exhaustion, payment
requirement or provider outage is claimed from this run. These counts are model
attempts, not a dollar-cost or token-usage measurement.

### Correction and remaining quality limits

- The original synthesis schema had an open-ended `record<string, unknown>`
  evidence field. After the classified structured-output error, the provider-facing
  schema was constrained to the single synthetic finding's saved scalar metrics,
  category and mandatory human review. The correction succeeded on recovery and
  a fresh full investigation. This is evidence that the constrained schema works;
  the exact rejected provider keyword was not retained. No validation was relaxed.
- Runtime Zod parsing, output policy, exact evidence matching and citation membership
  checks still treat model output as untrusted. New turns record prompt/schema
  version `synthetic-advisor-v2`; historical failures were not rewritten as successes.
- Natural-language quality is **not fully accepted**. Recovery and final follow-up
  emphasized checking performance after index creation instead of fully answering
  what to validate first. Rollback text included `DROP INDEX IF EXISTS <index_name>;`.
  These are generic model suggestions, not validated executable SQL. The app cannot
  execute them. The fresh initial answer did suggest inspecting query plans and
  every successful answer expressed uncertainty, but stronger pre-change validation
  guidance and non-executable rollback prose remain improvements for a future review.

### Shutdown and access evidence

- Anonymous UI/API requests still returned Access HTTP 302 redirects before the
  first model question. The same confirmed identity authenticated throughout.
- Authenticated UI invoked the existing same-origin `DELETE /api/inference` endpoint;
  status immediately showed disabled at 8/20. This sets the durable one-way latch.
- Redeployed `INFERENCE_ENABLED=false`, empty `LIVE_UNTIL`; Wrangler exited 0.
  Final version: `0c9f0476-fc12-49e6-bc52-2cf8a3e92a30`.
- An authenticated tab loaded while enabled then submitted a new synthetic question
  after shutdown. It received “Live inference is disabled. Saved investigations
  remain available.” The main tab was refreshed: history/evidence exactly unchanged,
  submit disabled and count still 8/20. No ninth reservation or new turn was created.
- The unused 12 attempts are not permission to reopen this concluded window. Do
  not reset or replace its quota. Any further live test requires fresh approval.

### Local verification, explicitly not live provider evidence

- **35 original Node/MCP tests**, **23 Cloudflare runtime tests**, and **3 browser
  tests** passed (61 total). Type checks and `git diff --check` passed.
- Added an injected synthesis-failure test: evidence retained, no answer fabricated,
  raw private error omitted, eviction/refresh does not retry, explicit new turn
  recovers using stored evidence without another diagnostic call.
- Existing local tests cover model timeout, malformed outputs, forged citations,
  modified metrics, ownership, concurrent quota requests, 20 failed reservations
  exhausting the cap and durable shutdown. The new UI shutdown test mocks its API;
  the separate hosted shutdown observation above is the live proof.
- A local schema-inspection command initially failed because the `tsx` CLI could
  not open its sandbox IPC socket; reran with `node --import tsx`. This was a local
  tooling failure, unrelated to Workers AI and consuming no model attempt.

Public records exclude credentials, private account/Access configuration, identity
and login material. Raw provider errors were neither displayed nor persisted;
the ledger exposes only fixed outcome categories.

## 2026-09-26 — local advice regressions only; no further live inference

- At the user's request, revised the local prompt/response contract to
  `synthetic-advisor-v3`. Requires `answerToQuestion` and separate nonempty
  `validationPlan.beforeChange` / `afterChange` fields. The adapter maps them into
  the existing domain response in that order; the shared local MCP format is unchanged.
- This synthetic fixture cannot support a concrete rollback: it lacks the exact
  proposed change, affected object definition/dependencies and baseline validation
  results. A fixed application-owned notice names these missing facts. Both the
  generation schema and output validator reject replacement rollback text, including
  placeholder SQL, invented object-specific SQL and a vague unsupported disclaimer.
- Prompt instructions require the current question to be answered directly before
  discussing changes, distinguish scan counts from proof of a cause, and require
  pre-change evidence gathering rather than only post-change monitoring.
- Added mocked-provider regressions for rollback rejection and missing direct-answer/
  before-change fields, including the observed post-change-only response format.
  Extended browser coverage to verify answer → pre-change checks → conditional
  post-change checks order and the concrete evidence-gap notice with no placeholder SQL.
- **35 original tests + 25 Cloudflare tests + 3 browser tests = 63 passed.** Both
  type checks and diff checks passed. These are local/mock results, not new live proof.
- No deployment or model invocation occurred. Hosted v2, its disabled configuration,
  shutdown latch and **8/20** ledger were left untouched. Existing live answers and
  failures remain historical evidence; they were not regenerated or rewritten.
- The response structure is enforced; whether a model's prose adequately answers
  arbitrary questions still requires semantic review. Live v3 compatibility and
  answer quality remain unverified until a separately authorized test.

## 2026-09-26 — authorized v3 deployment and live advice review

**Final: inference off, durable latch set, 11/20 total attempts.** This review added
three actual provider calls to the original eight; no reset, refund, new quota or
cap increase occurred. No paid upgrade/add-on, new credential permission, or Access
policy change was requested or used. Synthetic data only; no database operations.

- Deployed v3 with inference disabled first (version
  `b727c70f-c6a7-499f-8e64-b46698ac9950`); confirmed authenticated status 8/20 disabled.
  Anonymous UI/API checks remained HTTP 302 redirects to Access.
- The previous latch was intentionally one-way. Explained and added a narrowly
  scoped, deployment-only resume for the user's newly authorized retest. It requires
  a disabled existing ledger with exactly eight settled consecutive attempts and
  a valid live window. It changes only the disabled flag and records consumption
  of this approval; every attempt remains. The same approval cannot reopen again,
  including after eviction or shutdown before a ninth call. Shutdown takes priority.
- Enabled the approved 15-minute window with expiry
  `2026-09-26T16:39:03.702899Z`, then confirmed all original eight ledger entries
  unchanged before submitting any model question. Model/prompt remained Llama 3.3
  (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) / `synthetic-advisor-v3`.

| Step | Actual result |
| --- | --- |
| Calls 9–10: fresh investigation about slowness and what to investigate before a change | Planning and synthesis returned; validated answer displayed |
| Refresh | Exact displayed answer and evidence restored; usage stayed 10/20 |
| Call 11: what to validate first and whether rollback can be specified | Validated follow-up; specific missing rollback facts; no placeholder rollback SQL |
| Stored evidence | Unchanged throughout; both answers reference `6cfdf13ea446` |
| Final shutdown and redeploy | Disabled at 11/20, submit disabled, both exact answers and evidence preserved after refresh |

**Both full actual responses and both user questions are preserved, unedited, in
[ADVICE-REVIEW-2026-09-26.md](ADVICE-REVIEW-2026-09-26.md).** They are actual displayed
responses, including application-provided labels and the enforced rollback notice.

Quality assessment: the follow-up leads with predicates/query plans, existing
indexes and a baseline; rollback names the missing exact change, object definition/
dependencies and baseline validation results. However, the first answer says the
table “is slow due to” scan counts before contradicting that claim with uncertainty,
and describes sequential scans “out of” row count. This causal/ratio interpretation
is not established by the evidence. Both post-change fields merely repeat a
conditional phrase instead of concrete checks. These remaining issues are reported,
not silently rewritten or accepted as correct. Rollback wording is enforced by the
application, not proof of independent model judgment. No fourth review call was made.

Final ledger: 8 provider-returned outcomes, 3 earlier provider errors. Calls 9, 10
and 11 all returned; no new provider failure or timeout. This is an attempt count,
not a measured monetary cost.

Shutdown: authenticated UI invoked the durable disable endpoint at 11/20, then
deployed `INFERENCE_ENABLED=false`, empty `LIVE_UNTIL`, with no resume flag. Final
version `edc19e43-cec8-4b27-b3c1-a6ec3bf321da`; Wrangler exit 0. A subsequent browser
refresh confirmed disabled status, disabled submit, unchanged exact responses,
unchanged evidence and all 11 ledger entries. The resume approval remains consumed.
The unused nine attempts do not authorize further inference.

Local corrections/testing, separate from live inference: a mock environment resume
flag leaked between tests, causing one guard test to fail. Assigning undefined to
an exact-optional property then failed type checking; deleting that mock property
fixed isolation. The enabled deployment had completed while these test corrections
were made, but no live question was submitted until all checks passed. Initially
29 Cloudflare tests passed; expanding wrong-count cases to 0, 7 and 9 yielded **31
passing Cloudflare tests**. Both type checks and diff checks passed. Original local
MCP and browser code were unchanged from their earlier passing runs.

## 2026-09-26 — v4 evidence separation, local regressions only

- The user identified that scan counts and row counts do not establish a scan
  ratio or the cause of query slowness. Inspection found the shared MCP fixture's
  narrative already asserted a high ratio and suggested index creation. Created a
  neutral Cloudflare-only fixture with the same three measurements, an informational
  table-statistics category and no suggested change. The original local MCP fixture
  is unchanged. New Cloudflare investigations use `orders-observations-v2`; existing
  saved snapshots, hashes and historical answers are not rewritten.
- `synthetic-advisor-v4` separates application-derived observations from explicitly
  unconfirmed model hypotheses and diagnostic next checks. Observations state the
  scan counters and live-row estimate as separate measurements; no derived ratio
  or causal explanation is asserted. The model cannot replace these observations.
- Synthesis receives a projection of the stored measurement values, not the old
  fixture's narrative/suggested fix. Legacy investigations can still use their
  original saved metrics without treating that narrative as an observed fact.
- The application sets `proposedChange: null`, requires a no-change-proposed notice,
  and removes the after-change output field and rendering. Targeted output guards
  reject the observed causal assertion, ratios/percentages and post-change advice
  in the remaining model prose. These guards are deliberately not presented as a
  complete semantic truth checker; unrecognized bad prose remains a review risk.
- Added mocked-provider regressions replaying the exact live causal/ratio sentence,
  invented percentages, alternative definite-cause claims and a confirmed hypothesis.
  Tested neutral/legacy evidence handling and post-change rejection/omission. Browser
  regression checks the visible observation → hypothesis → next-check order and
  absence of a confirmed missing-index label or post-change section. The persisted-
  evidence counterfactual still passes with changed counts and no prior transcript.
- **35 original tests + 33 Cloudflare tests + 3 browser tests = 71 passed**, with
  both type checks and diff checks passing. All results in this section are local
  or mocked. No deployment, live inference, account change or quota reset occurred.
  Staging remains the disabled v3 build at **11/20**; v4 model compatibility and
  live answer quality have not been verified. The earlier unedited response artifact
  remains intact for comparison.

## 2026-09-26 — v4 one fresh live investigation (actual Workers AI)

The user authorized deployment and exactly one fresh investigation from the existing
11/20 quota, with no retry if it failed and shutdown afterward. No quota reset,
purchase, paid add-on, new permissions or access-policy expansion occurred.

- Preflight: both type checks and all **78 local tests** passed (35 original,
  40 Cloudflare, 3 browser). These are offline/mocked results, distinct from below.
- Added a separate, one-use `evidence-v4-from-11` deployment approval, requiring
  exactly 11 settled attempts. Retains the consumed v3 marker, history and total cap.
  Regressions verify wrong-count refusal, cap preservation, eviction and shutdown.
- Deployed v4 disabled as `c73888b4-92c7-47a3-95b3-7f3287a63fa6`. Anonymous UI/API
  requests returned Access redirects (302); authenticated UI/API restored saved
  state and showed 11/20 disabled. No access settings were changed.
- Enabled a 15-minute window in `472dba46-1032-4b30-b2ff-89723eae57b8`; verified
  11/20 enabled before creating a fresh, empty investigation.
- Submitted exactly: “Why is the synthetic orders table slow? Separate what we
  observed from possible causes and what we need to check next.”
- Calls **12 and 13 both provider-returned** (planner and synthesis); application
  validation passed. Total **13/20**, no new provider failures, no retry/follow-up.
  Earlier three provider failures remain in the ledger. Model Llama 3.3,
  prompt `synthetic-advisor-v4`, synthetic evidence prefix `b4a1d736c5dd`.
- One browser locator wait expired while the response was pending. A read-only
  page inspection showed the successful result; no investigation was resubmitted.
  This was a browser wait failure, not a model or application failure.
- Full unedited displayed response: [EVIDENCE-REVIEW-2026-09-26.md](EVIDENCE-REVIEW-2026-09-26.md).
  Observations appear first, hypotheses are explicitly unconfirmed, and next checks
  ask for missing evidence. No computed ratio, proven cause, placeholder SQL or
  post-change advice. Hypotheses/last check are broad; not a universal quality proof.
  Observation/no-change/rollback text is application-constrained, not free model prose.
- Disabled inference through the authenticated durable shutdown endpoint immediately
  after capturing the answer. UI verified **13/20 disabled**, submit disabled.
- Final disabled deployment: `128c2701-771f-41d0-8f7a-4adadd6c4df9`, false inference,
  empty expiry, no resume flag. Refresh verified exact answer/evidence restoration,
  13 unchanged ledger entries and disabled submit. Both review approvals remain
  consumed. Remaining seven attempts do not authorize further inference.

## 2026-09-26 — Saved investigation walkthrough (read-only, no inference)

Captured two browser-content screenshots of the already saved v4 response for the
[public review walkthrough](../docs/review/WALKTHROUGH.md). They show synthetic data,
application-owned observations/rollback limits, model hypotheses/next checks and
stored evidence; no identity or login material is included.

A fresh page reload restored exact answer and evidence text, with 13/20 unchanged,
inference disabled and submit disabled. No investigation, follow-up or model call
was submitted. No deployment or Access change occurred. This is a read-only capture
of the previous live run, not another live inference test or a mocked answer.
