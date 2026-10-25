# Cross-repository conformance

The conformance suite treats pgtriage as the deterministic MCP evidence source
and Agent Lab as the client runtime responsible for authorization, retries,
validation, and terminal routing.

It answers a narrower question than a model benchmark:

> Does the runtime preserve the tool boundary when delivery, transport,
> evidence, scope, or generated output is unsafe or ambiguous?

## Run it

```bash
npm run eval:conformance
```

The command needs no database, model key, or cloud account. It writes:

- `artifacts/conformance-report.json` for machines;
- `artifacts/conformance-report.md` for review.

## Covered boundaries

- successful governed tool use;
- retry after a proven pre-dispatch failure;
- completed-result recovery after an ambiguous dispatch response;
- retry only after reconciliation proves an operation was not committed;
- fail-closed handling for in-progress, failed, expired, and conflicting runs;
- process-restart recovery from a persisted `TOOL_RUNNING` workflow;
- duplicate request delivery;
- missing, malformed, and internally contradictory tool evidence;
- an execution claim injected through tool evidence;
- caller-scope substitution;
- remediation requests;
- incompatible discovered tool schemas.

Every scenario records the terminal state, error code, operational review route,
model and tool call counts, dispatches, retries, citations, latency, and estimated
cost. Contract versions are embedded in the report.

The evidence-validity rate describes the scenario inputs, not a success score:
intentionally malformed fixtures count as invalid evidence and succeed only when
the runtime refuses to trust them. `expectedBehaviorRate` is the suite's primary
pass metric.

## Interpretation

A passing scenario means the implementation behaved according to the versioned
contract. It does not prove general model accuracy, correctness against every
PostgreSQL installation, or safety against unknown attacks.

Deterministic safety checks remain authoritative. A future harness experiment
cannot trade away any passing conformance behavior for a higher task-quality
score.
