# Ambiguous-outcome recovery pilot

- Experiment: ambiguous-outcome-recovery-v1
- Method: deterministic-contract-fault-injection
- Protocol hash: `4f128a99d9891e42e93d7a9df1a08500d7c3838fa93df4bb76749b9c2526f5e3`
- Report hash: `a815fdc5fd33dbee7eb9979bc19ee8c4b4739309e32827993e62d318db58881c`

| Variant | Completed/recovered | Recovered ambiguous completions | Duplicate dispatches | Duplicate database work | Completed work not recovered | Operator interventions | Duplicate state advances | Lease contentions prevented | State conflicts prevented | False success |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| blind-retry | 8/9 | 0 | 7 | 7 | 1 | 1 | 3 | 0 | 0 | 0 |
| fail-closed | 2/9 | 0 | 3 | 3 | 6 | 7 | 3 | 0 | 0 | 0 |
| reconciliation | 8/9 | 5 | 3 | 0 | 1 | 1 | 3 | 0 | 0 | 0 |
| reconciliation-with-guards | 8/9 | 5 | 0 | 0 | 1 | 1 | 0 | 2 | 1 | 0 |

## Decision

**ADVANCE_RECONCILIATION_WITH_GUARDS.** Within the frozen fixture fault model, durable reconciliation recovered ambiguous completions while leases and expected-state transitions removed duplicate workflow advancement without weakening validation.

## Permitted claim

Under the registered fixture fault model, durable operation identity and reconciliation recovered ambiguous pgtriage completions, while leases and expected-state transitions prevented duplicate workflow advancement. This is not a claim of general exactly-once execution.

## Limits

- This first pilot uses a deterministic in-process implementation of the pgtriage operation contract, not a real network or database.
- Recovery latency is measured in logical protocol steps rather than wall-clock time.
- The fault matrix is registered but not exhaustive; unmodeled failures may produce different behavior.
- A later transport-level pilot must reproduce the result through MCP stdio and process restarts before publication-facing claims are expanded.
