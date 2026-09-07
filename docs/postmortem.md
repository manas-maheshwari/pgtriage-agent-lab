# Postmortem

## What Changed During Implementation

The initial design treated durable persistence as a later concern. That was too weak for an agent runtime story because idempotency and leases are central to preventing repeated expensive work. SQLite was added earlier than planned so the runtime can demonstrate duplicate request handling and exclusive workflow ownership.

The retrieval layer was also kept deliberately narrow. A broad vector database would make the demo look bigger, but it would not prove the core platform behavior. The current retriever shows the important contract: evidence goes in, cited context comes out, and retrieved text cannot change policy or tool permissions.

The first retry implementation also treated transient tool failures too uniformly. That became unsafe once the current pgtriage contract explicitly marked `full_audit` non-idempotent. The runtime now distinguishes failures proven to occur before dispatch from ambiguous failures after dispatch. Startup and capability discovery can recover within budget; an ambiguous `full_audit` timeout terminates after one dispatch and requires operator reconciliation.

Schema scope originally lived only in model-generated arguments. That gave the planner authority it should not have. Scope now enters through the typed request boundary, is copied through the plan, checked for exact equality by deterministic policy, and mapped to MCP `schema_name` only at the transport boundary.

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

## Known Gaps

- There is no HTTP API, queue, or UI yet.
- SQLite recovery primitives exist, but there is no resume CLI command yet.
- The corpus is small and local.
- Real model calls are implemented but not part of deterministic CI.
- Cost estimation is left as zero until real provider pricing is configured.
- There is no multi-tenant deployment boundary beyond request metadata and policy checks.
- An ambiguous real `full_audit` failure has no server-side operation ID for reconciliation; the safe local behavior is to stop rather than retry.
- The local runner assumes the selected Python environment already has the pgtriage checkout installed or importable.

## Scale Discussion

At platform scale, this would need a service boundary around request intake, tenant identity, quota, policy, workflow state, and tool isolation. Tool servers should be registered from controlled configuration, not arbitrary user input. Expensive model and tool calls should sit behind durable queues, idempotency keys, leases, budget enforcement, and per-tenant cost attribution.

The local POC does not claim to implement that platform. It implements the part that matters first: a narrow, testable control loop where the model proposes work, deterministic code authorizes it, and every terminal state is explainable.
