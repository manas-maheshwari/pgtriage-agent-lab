# Cloudflare chat implementation

[Back to project overview](../README.md) · [Illustrated walkthrough](../docs/review/WALKTHROUGH.md)

This adapter presents a synthetic PostgreSQL investigation through browser chat.
It was also used for a Cloudflare application assignment. The implementation and
its recorded limits are useful independently of that context; the requirement map
below is retained for assignment reviewers. No live PostgreSQL or MCP server is
connected to this path.

## What is synthetic, generated and enforced?

| Part | Responsibility |
| --- | --- |
| Synthetic diagnostics | An application-owned fixture supplies 18,250 sequential scans, 41 index scans and a 2,000,000 live-row estimate. These are separate measurements, not scans out of rows. No PostgreSQL query runs. |
| Real model | Workers AI Llama 3.3 proposes the one allowed diagnostic call, then supplies unconfirmed hypotheses and diagnostic next checks using the current question, saved measurements and retrieved runbook passages. |
| Application-owned advice | Exact observations come from saved metrics. The application requires a no-change-proposed notice and an explicit rollback evidence-gap notice. These are not free-form model conclusions. |
| Output enforcement | Zod schemas, advisory policy, exact evidence matching and citation membership checks reject invalid outputs. Targeted guards reject the known ratio/causal claims and post-change advice; they do not prove all natural-language claims true. |
| Execution and access | Only the synthetic fixture tool is available. No database credentials, SQL executor or change capability exists in the hosted app. The Worker verifies Access identity before UI/API access; session ownership is checked in the Durable Object. Missing auth configuration fails closed. |
| Usage | One persisted quota reserves before every live model call, including failed attempts; total cap 20, no refunds or automatic retries. Expiring live windows and a durable shutdown latch limit use. Billing alerts are notifications, not enforcement. |

There is no silent fallback from Workers AI to the test model. A provider error or
invalid answer produces a bounded failure message and retains any saved evidence.

## How the assignment requirements fit

| Requirement | Smallest implementation here | Code |
| --- | --- | --- |
| LLM | Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; real calls recorded separately from mocks | [Model adapter](model.ts) |
| Workflow / coordination | Worker serves assets and authenticates requests; one Durable Object per investigation coordinates planning → synthetic diagnostic → retrieval → synthesis | [Worker](worker.ts), [investigation](investigation.ts) |
| Chat input | Plain HTML/CSS/JavaScript question and answer UI, no frontend framework | [UI](../public/app.js) |
| Memory / state | Durable Object SQLite-backed storage keeps turns, evidence, retrieved passages and workflow checkpoints; a second named object owns the shared live quota | [Store](store.ts), [quota](quota.ts) |

An initial investigation uses at most two model calls and one fixture diagnostic.
A follow-up uses one model call with the **saved evidence and runbook passages,
not the prior chat transcript**, and does not rerun diagnostics. Refresh reads stored
state without inference. This is request-driven coordination, not a separate
Cloudflare Workflows service or an unattended background-job system.

The Cloudflare adapter reuses Agent Lab's contracts, policy, orchestrator, fixture
client and retrieval logic. It replaces local SQLite/filesystem/stdio adapters for
hosting. The [local MCP demo](../README.md#local-mcp-runtime) remains available separately. The hosted demo
preserves the diagnostic/advisory flow but does **not** demonstrate a live MCP
connection, PostgreSQL telemetry collection or remediation execution.

## Recorded live review status — September 26, 2026

The latest **v4 live run passed one fresh investigation on its first submission**,
using two calls. It separated observations, unconfirmed hypotheses and next checks,
without an invented ratio, definite cause, rollback SQL or post-change advice.
Earlier revisions had three provider failures and an advice-quality error; their
results remain in the [chronological live record](LIVE-RESULTS.md).
Earlier live tests also exercised follow-up and failure/recovery; these were not
repeated in v4's single-investigation review. Broad hypotheses remain a limitation.

Staging is **inference-disabled at 13/20 attempts**, with the durable shutdown latch
set. Refresh restored the exact saved v4 answer and evidence without another call.
Workers and Zero Trust remain on Free. No public enable/reset route exists; the two
explicitly authorized one-use review migrations are consumed. Remaining quota is
not authorization for another live test. See the [private staging procedure](STAGING.md).

Boundaries: eight turns per investigation; bounded inputs/outputs; a 25-second
model response deadline cannot cancel inference already accepted by the provider.
Interrupted turns fail without automatic replay. Citation/evidence checks and text
guards do not guarantee general root-cause correctness.
Credentials, Access identity settings, cookies and login material stay outside Git
and model inputs. See the [publication privacy check](../docs/review/PRIVACY-CHECK.md).
