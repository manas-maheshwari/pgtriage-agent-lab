# Architecture

## Design principle

The model may propose the next step. Deterministic application code decides whether that step is valid, authorized, affordable, executable, and complete.

```text
User / CLI
    |
    v
Request boundary
  - validate input
  - bind caller-authorized schema scope
  - assign workflow ID
  - enforce idempotency
    |
    v
Deterministic orchestrator ----------------------+
  - state transitions                            |
  - budgets                                      |
  - retry classification                         |
  - loop termination                             |
    |                                            |
    +--> ModelProvider                           |
    |      - propose a typed plan                 |
    |      - synthesize typed output              |
    |                                            |
    +--> Policy engine                            |
    |      - validate requested capability        |
    |      - authorize at execution time          |
    |      - reject executable remediation        |
    |                                            |
    +--> ToolClient --> MCP --> pgtriage/fixture  |
    |                                            |
    +--> WorkflowStore <--------------------------+
    |
    +--> TraceRecorder
```

## Request lifecycle

```text
RECEIVED
  -> PLANNING
  -> PLAN_VALIDATED
  -> TOOL_AUTHORIZED
  -> TOOL_RUNNING
  -> TOOL_COMPLETE
  -> SYNTHESIZING
  -> OUTPUT_VALIDATED
  -> POLICY_CHECKED
  -> COMPLETED

Any non-terminal state may transition to:
  -> RETRYABLE_FAILURE
  -> TERMINAL_FAILURE
  -> CANCELLED
```

The state machine is explicit rather than inferred from log messages. Each transition records the previous state, next state, timestamp, workflow ID, attempt number, and bounded metadata.

## Components and tradeoffs

### Request boundary

Responsibilities:

- validate the request shape;
- accept or generate an idempotency key;
- attach caller and environment context;
- return the existing workflow for a duplicate request.

Why it exists: retries can arrive from the CLI, HTTP layer, queue, or user. Deduplication must happen before expensive or side-effecting work.

First-slice limitation: the in-memory store deduplicates only within one process. Durable deduplication arrives with SQLite.

### Deterministic orchestrator

Responsibilities:

- own legal state transitions;
- call the planner, policy engine, and tool client in order;
- enforce maximum model calls, tool calls, elapsed time, and retries;
- classify failures;
- stop repeated tool requests;
- declare terminal success only after output validation and policy checks.

Why it is not an LLM agent loop: authorization, retries, budgets, and completion semantics must remain predictable and testable.

### Model provider

The port exposes two narrow operations:

```text
proposePlan(request, availableTools) -> ToolPlan
synthesize(request, toolEvidence) -> RemediationPlan
```

The fake adapter returns deterministic fixtures. The Anthropic adapter translates these contracts to and from the Messages API.

Why two calls: planning and synthesis have different inputs, validation rules, model-routing options, and evaluation metrics. Combining them hides where a failure occurred.

Tradeoff: two calls increase latency and cost. Later evaluation may show that simple requests can safely use one call.

### Policy engine

The policy engine is ordinary TypeScript, not a prompt.

It checks:

- the requested tool is on the allowlist;
- `readOnlyHint` is explicitly true;
- `destructiveHint` is not true;
- `idempotentHint` is retained for retry decisions;
- arguments match the schema;
- the planned schema exactly matches caller-authorized request context;
- the environment is an approved fixture or explicitly approved database;
- the final output does not claim that remediation was executed;
- dangerous recommendations require human review;
- executable DDL/DML is never passed to a tool in the MVP.

Planning-time filtering improves model behavior. Execution-time authorization remains mandatory because plans are untrusted and context can change.

### Tool client

The runtime depends on a `ToolClient` port rather than the pgtriage process directly.

The MCP adapter owns:

- server startup and shutdown;
- capability discovery;
- tool-schema normalization;
- timeouts and cancellation;
- bounded result conversion;
- transport failures.

It maps the TypeScript `schemaName` field to the pgtriage wire argument `schema_name`. The caller supplies this authorization-sensitive scope. The model cannot infer it from free text or substitute another schema.

MCP annotations describe server intent; they are not authorization. The runtime still requires a controlled server configuration, a tool allowlist, validated arguments, caller authorization, and a policy check immediately before execution.

The first fixture server exposes only `full_audit`. There is no generic SQL tool.

### Workflow store

The store persists:

- workflow identity and idempotency key;
- current state and transition history;
- plan hash;
- tool-call arguments and result hash;
- retry count and error classification;
- final result or terminal failure.

Large prompts and database evidence are not dumped into the event record. Store hashes and bounded previews; add encrypted artifact storage only if a later requirement justifies it.

### Trace recorder

Every model and tool operation receives the same workflow ID and a child span ID. Initial telemetry is structured JSON written through a port. The CLI writes JSONL traces under `runs/`. OpenTelemetry can replace the adapter later without changing orchestration logic.

The trace must answer:

- Which plan version ran?
- Which tool and arguments were used?
- What did validation and policy decide?
- How long did each step take?
- Was work retried or deduplicated?
- Why did the workflow stop?

## Core contracts

### Tool plan

```json
{
  "tool": "full_audit",
  "arguments": {
    "slowQueryLimit": 10,
    "schemaName": "pgtriage_demo"
  },
  "reason": "Collect bounded database-health evidence before making recommendations"
}
```

Only tool and arguments affect execution. `reason` is explanatory model output and never grants permission.

### Remediation plan

```json
{
  "summary": "string",
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "string",
      "evidence": {},
      "recommendation": "string",
      "citations": [],
      "confidence": 0.0,
      "requiresHumanReview": true,
      "validationPlan": "string",
      "rollbackPlan": "string"
    }
  ]
}
```

Citation requirements are satisfied by the local Markdown corpus retriever. The corpus is intentionally narrow and uses source metadata from local runbooks. Weak retrieval should become an explicit insufficient-evidence result in a later extension rather than fabricated citations.

## Failure semantics

| Failure | Classification | Behavior |
|---|---|---|
| Model timeout or 429 | Retryable | Back off within attempt and time budgets |
| MCP startup or capability discovery failure | Retryable before dispatch | Retry within budget because the tool was not invoked |
| Invalid model tool arguments | Correctable once | Return validation feedback to planner once; repeated failure is terminal |
| Unauthorized tool | Terminal | Reject without invoking the tool |
| `full_audit` timeout or ambiguous transport failure | Terminal after one dispatch | Do not automatically repeat a non-idempotent audit that may already be running |
| Invalid final schema | Correctable once | Ask synthesizer to repair structure once |
| Policy violation in final output | Terminal | Return a safe refusal, preserve the rejected result hash |
| Process interruption | Not recoverable in milestone 1 | Becomes resumable after durable persistence is added |

Retries are based on error class, not a blanket retry count. A deterministic policy failure never becomes valid because it was tried three times.

Tool failures carry an explicit dispatch state. `PreDispatchToolError` means no tool invocation occurred and can be retried within budget. `AmbiguousToolDispatchError` means the request may have reached pgtriage. A post-dispatch retry requires both a locally safe tool classification and `idempotentHint: true`; `full_audit` satisfies neither condition.

## Security boundaries

1. User input, retrieved documents, and tool output are untrusted data.
2. Tool descriptions come from an allowlisted server configuration, not arbitrary remote discovery.
3. The model cannot add tools to the registry.
4. Credentials remain in process environment/configuration and are never included in prompts, traces, or results.
5. The runtime never exposes a generic SQL execution capability.
6. The POC is advisory-only even if a recommendation contains SQL-like text.
7. Schema scope is caller-owned context and must survive planning unchanged.

## Implemented Modes

| Mode | Model | Tool | Persistence | Use |
|---|---|---|---|---|
| `demo:fixture` | deterministic fake | in-process fixture | memory by default | fastest local smoke test |
| `demo:mcp` | deterministic fake | fixture MCP over stdio | memory by default | protocol-boundary demo |
| `demo:real` | Anthropic if configured, fake otherwise | configurable real pgtriage command plus structured arguments | memory or SQLite | approved database run |

Set `SQLITE_WORKFLOWS=1` to use the SQLite store from the CLI.

## Later Evolution

After the narrow slice works, the same orchestrator can add approvals, durable resume commands, provider routing, queues, and a web/API boundary. Those are extensions of tested contracts, not reasons to turn the first version into a broad autonomous system.
