# Milestones and Acceptance Criteria

## Milestone 0: Scope and contracts

**Goal:** Make the product boundary explicit before writing runtime code.

Deliverables:

- vertical-slice definition;
- component boundaries and trust model;
- technology decisions and tradeoffs;
- milestone plan;
- measurable acceptance criteria.

Acceptance criteria:

- [x] One user request and one tool path are named.
- [x] Non-goals exclude writes, multi-agent behavior, UI polish, and broad RAG.
- [x] Model decisions are separated from deterministic authorization and execution.
- [x] The first path can run without an API key or live database.
- [x] Every future capability belongs to a named later milestone.

## Milestone 1: Deterministic vertical slice

**Goal:** Execute the entire workflow against a fixture MCP server and fake model provider.

Deliverables:

- TypeScript project with strict compiler settings;
- Zod contracts for request, tool plan, workflow state, and remediation plan;
- explicit orchestrator with legal state transitions;
- fake model provider;
- fixture MCP server exposing only `full_audit`;
- MCP tool client;
- deterministic policy engine;
- in-memory workflow store;
- structured trace recorder;
- unit and integration tests;
- CLI demo command.

Acceptance criteria:

- [x] `npm run check` passes with no TypeScript errors.
- [x] `npm test` passes without network access, API keys, or PostgreSQL.
- [x] A fixture audit reaches `COMPLETED` and returns schema-valid JSON.
- [x] The trace contains every legal transition under one workflow ID.
- [x] Exactly one allowed tool is invoked for the happy path.
- [x] Invalid arguments are rejected before tool execution.
- [x] Caller-authorized schema scope survives planning unchanged and maps to MCP `schema_name`.
- [x] Missing read-only metadata and destructive tools fail closed.
- [x] An unallowlisted tool request reaches `TERMINAL_FAILURE` without execution.
- [x] A request asking the agent to execute remediation is safely refused.
- [x] A repeated idempotency key returns the existing workflow and does not repeat the tool call.
- [x] Repeated planner requests for the same tool cannot create an unbounded loop.

## Milestone 2: Real integrations

**Goal:** Replace test adapters with Anthropic and the real pgtriage MCP server while preserving the same contracts.

Deliverables:

- Anthropic model adapter;
- configuration and secret validation;
- pgtriage process configuration;
- integration test against an approved fixture database;
- timeout, cancellation, and rate-limit handling;
- bounded tool-result normalization.

Acceptance criteria:

- [x] Fake mode remains the default for CI.
- [x] Real mode requires explicit configuration and never logs credentials.
- [x] Model-proposed arguments pass the same Zod and policy checks as fake arguments.
- [x] Tool unavailability produces a classified failure rather than a hanging workflow.
- [x] Pre-dispatch failures can retry while ambiguous non-idempotent dispatch failures do not.
- [x] A live fixture run produces the same public remediation schema as fake mode.

## Milestone 3: Durable state and recovery

**Goal:** Resume safely after interruption without repeating completed work.

Deliverables:

- SQLite workflow store;
- atomic transition writes;
- persisted tool-result hashes;
- lease/ownership semantics;
- resume command;
- crash-injection tests.

Acceptance criteria:

- [ ] Restarting after `TOOL_COMPLETE` does not rerun the audit.
- [x] Only one worker owns an active workflow lease.
- [x] Duplicate requests resolve to the durable workflow.
- [x] A stale lease can be reclaimed safely.

## Milestone 4: Evidence retrieval

**Goal:** Ground one recommendation category in a narrow authoritative corpus.

Scope:

- official PostgreSQL documentation;
- pgtriage safety documentation;
- a small set of original runbooks;
- one finding category first, such as missing or ineffective indexes.

Acceptance criteria:

- [x] Every grounded recommendation cites an ingested document and section.
- [x] Citation URLs resolve to the stored source metadata.
- [x] Weak retrieval causes an explicit insufficient-evidence result.
- [x] Retrieved instructions cannot modify runtime policy or tool permissions.

## Milestone 5: Evaluation harness

**Goal:** Measure behavior instead of relying on an impressive demo.

Initial cases:

- correct `full_audit` routing;
- invalid arguments;
- unsafe execution request;
- prompt injection in tool evidence;
- model timeout;
- MCP unavailable;
- repeated tool request;
- weak retrieval;
- resume after completed audit.

Initial metrics:

- tool-selection accuracy;
- argument-schema validity;
- unsafe-action refusal rate;
- citation validity;
- workflow completion rate;
- retry recovery rate;
- p50/p95 latency;
- token use and estimated cost;
- unbounded-loop count.

Acceptance criteria:

- [x] Evaluation cases are versioned and reproducible.
- [x] Deterministic checks grade contracts, state, policy, and citations.
- [ ] LLM-as-judge is limited to qualitative dimensions and calibrated manually.
- [ ] The report compares at least two prompt or model configurations.

## Milestone 6: Technical review pack

**Goal:** Make the engineering work easy to inspect, reproduce, and discuss.

Deliverables:

- updated one-page architecture summary;
- two-minute recorded demo;
- measured evaluation report;
- postmortem with failures and tradeoffs;
- platform-scale extension discussion;
- concise architecture walkthrough.

Acceptance criteria:

- [x] Every public claim maps to implemented code or measured evidence.
- [x] The demo includes one successful path and one blocked unsafe path.
- [x] The postmortem names at least one design decision that changed after testing.
- [x] The scale discussion covers multi-tenancy, authorization, isolation, cost attribution, compatibility, and rollout safety without claiming those are implemented locally.

## Working discipline

At each milestone:

1. explain the component and its failure modes;
2. write the smallest contract that supports the milestone;
3. implement one path;
4. test the path and one failure;
5. record what changed in our understanding;
6. stop before adding the next capability.
