# Postmortem

## What Changed During Implementation

The initial design treated durable persistence as a later concern. That was too weak for an agent runtime story because idempotency and leases are central to preventing repeated expensive work. SQLite was added earlier than planned so the runtime can demonstrate duplicate request handling and exclusive workflow ownership.

The retrieval layer was also kept deliberately narrow. A broad vector database would make the demo look bigger, but it would not prove the core platform behavior. The current retriever shows the important contract: evidence goes in, cited context comes out, and retrieved text cannot change policy or tool permissions.

The first retry implementation also treated transient tool failures too uniformly. That became unsafe once the current pgtriage contract explicitly marked `full_audit` non-idempotent. The runtime now distinguishes failures proven to occur before dispatch from ambiguous failures after dispatch. Startup and capability discovery can recover within budget; an ambiguous `full_audit` timeout terminates after one dispatch and requires operator reconciliation.

Schema scope originally lived only in model-generated arguments. That gave the planner authority it should not have. Scope now enters through the typed request boundary, is copied through the plan, checked for exact equality by deterministic policy, and mapped to MCP `schema_name` only at the transport boundary.

The hosted adaptation exposed a second class of overclaim: table-level counters
were initially presented as if they proved a scan ratio and a cause of slowness.
The final contract separates application-owned observations, explicitly
unconfirmed model hypotheses, and diagnostic next checks. It removes the legacy
fixture's proposed index from model evidence and rejects the known unsupported
ratio, causal and post-change patterns. This is targeted enforcement, not a claim
that arbitrary natural-language output is universally correct.

Live review also changed the cost-control design. Per-session turn limits were not
enough because a new session could bypass them. One named Durable Object now owns
a shared attempt ledger, reserves before each provider call, counts failures, and
supports an irreversible shutdown latch. The application limit is still not an
invoice cap, and a timed-out provider request may continue after the caller stops waiting.

## Current Strengths

- The workflow state machine is explicit and tested.
- Planning, tool execution, retrieval, synthesis, and output policy are separate steps.
- MCP is exercised through a real stdio client and fixture server.
- MCP annotations are retained accurately without being treated as authorization.
- Caller-authorized schema scope cannot be changed by the model.
- Non-idempotent tool calls are not repeated after ambiguous dispatch.
- The same tool contract can call the real pgtriage server.
- Unsafe execution requests are denied before model or tool work.
- Generated output is rejected if it claims changes were executed.
- The eval harness measures behavior across success and failure cases.
- The Cloudflare path verifies Access identity, session ownership and same-origin requests.
- Durable Objects persist turns, evidence, workflow checkpoints and the shared inference ledger.
- Refresh and evidence-grounded follow-up do not repeat the synthetic diagnostic.
- The browser renders user and model content as text, and browser tests cover restoration and injection safety.

## Known Gaps

- The hosted HTTP/UI path is a private synthetic review application, not a production database service.
- There is no durable queue, automatic state retention policy, or multi-region recovery design.
- SQLite recovery primitives exist in the CLI path, but there is no resume CLI command yet.
- The corpus is small and local.
- Real Anthropic and Workers AI calls are implemented but not part of deterministic CI.
- Cost estimation is left as zero until real provider pricing is configured.
- Hosted Access is intentionally restricted to one owner; it does not prove multi-tenant isolation, delegated administration, or tenant billing.
- The hosted path uses a fixed synthetic diagnostic and does not demonstrate remote MCP or PostgreSQL telemetry collection.
- An ambiguous real `full_audit` failure has no server-side operation ID for reconciliation; the safe local behavior is to stop rather than retry.
- The local runner assumes the selected Python environment already has the pgtriage checkout installed or importable.
- Output schemas, exact evidence checks and targeted text guards constrain known failures but cannot prove every generated statement true.

## Scale Discussion

At platform scale, this would need a service boundary around request intake, tenant identity, quota, policy, workflow state, and tool isolation. Tool servers should be registered from controlled configuration, not arbitrary user input. Expensive model and tool calls should sit behind durable queues, idempotency keys, leases, budget enforcement, and per-tenant cost attribution.

The project does not claim to implement that full platform. It implements two
narrow, testable paths: a real MCP/database-capable CLI runtime and a private,
synthetic hosted review application. In both, the model proposes work while
deterministic code owns authorization, state, budgets and terminal outcomes.
