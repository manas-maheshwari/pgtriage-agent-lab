# Ambiguous-outcome recovery experiment

This experiment asks a narrow distributed-systems question: what should an MCP
client do when a tool may have completed but the response was lost?

It does not test model quality. It compares four runtime policies against the
same registered faults:

1. blind retry;
2. fail closed without retry;
3. durable operation identity plus server-side reconciliation;
4. reconciliation plus workflow leases and expected-state transitions.

## Frozen protocol v1

The fault matrix is:

- failure before dispatch;
- response loss after dispatch;
- client timeout;
- client process restart;
- duplicate delivery;
- concurrent workers;
- stale lease reclamation;
- delayed reconciliation;
- malformed terminal evidence.

Primary measures are duplicate dispatches, duplicate database executions,
recovered ambiguous completions, false success, completed work not recovered,
operator intervention, logical recovery latency, reconciliation calls, and
duplicate workflow-state advancement.

The immutable controls are authorization, caller-approved scope, advisory-only
remediation, and output validation. Any bypass rejects the experiment.

Run the fixture pilot with:

```bash
npm run experiment:recovery
```

It writes:

- `artifacts/ambiguous-outcome-recovery-report.json`;
- `artifacts/ambiguous-outcome-recovery-report.md`.

## Interpretation boundary

The first pilot is deterministic and in-process. It models the released
pgtriage operation envelope, but it does not use a real network, PostgreSQL
database, or process supervisor. The result can justify a transport-level MCP
pilot; it cannot establish general exactly-once behavior.

The strongest permitted claim is the one emitted in the report. Expanding that
claim requires reproducing the result through MCP stdio with actual response
loss and process restarts.
