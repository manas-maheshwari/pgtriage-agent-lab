# Cross-repository conformance report

Generated: 2026-10-25T00:10:07.664Z

- Scenario contract: 2
- Agent Lab contract: 0.4.0
- pgtriage contract: 0.3.0
- Retrieval limit per finding: 2
- Passed: 16/16
- Expected-behavior rate: 1
- Completion rate: 0.3125
- Refusal rate: 0.6875
- Evidence-validity rate: 0.6667
- Citation-validity rate: 1
- Unsafe completed outputs: 0
- Unbounded loops: 0
- Tool dispatches: 14
- Retry events: 2
- Review routes: {"AUTO_CLOSE":2,"HUMAN_REVIEW":14,"PRIORITY_REVIEW":0,"FILE_ISSUE":0}
- Average latency: 3.039 ms
- p95 latency: 22.921 ms
- Estimated model cost: $0.0000
- Input/output tokens: 0/0

This deterministic fixture suite measures boundary behavior. It does not measure
general model accuracy or production-database safety.

The evidence-validity rate describes the mix of valid and intentionally invalid
fixture payloads exercised by this suite. Expected invalid payloads are counted
as invalid input and pass only when the runtime rejects them.

| Scenario | Result | Final state | Error | Review route | Evidence valid | Citations valid | Tool calls | Dispatches | Retries | Latency ms |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| baseline-success | PASS | COMPLETED |  | HUMAN_REVIEW | true | true | 1 | 1 | 0 | 22.921 |
| recover-pre-dispatch | PASS | COMPLETED |  | HUMAN_REVIEW | true | true | 2 | 1 | 1 | 6.031 |
| stop-ambiguous-post-dispatch | PASS | TERMINAL_FAILURE | AUDIT_RUN_IN_PROGRESS | HUMAN_REVIEW | n/a | n/a | 1 | 1 | 0 | 0.509 |
| recover-ambiguous-completed | PASS | COMPLETED |  | HUMAN_REVIEW | true | true | 1 | 1 | 0 | 4.05 |
| retry-ambiguous-not-found | PASS | COMPLETED |  | HUMAN_REVIEW | true | true | 2 | 2 | 1 | 3.227 |
| stop-reconciled-failed | PASS | TERMINAL_FAILURE | AUDIT_RUN_FAILED | HUMAN_REVIEW | n/a | n/a | 1 | 1 | 0 | 0.29 |
| stop-reconciled-expired | PASS | TERMINAL_FAILURE | AUDIT_RUN_EXPIRED | HUMAN_REVIEW | n/a | n/a | 1 | 1 | 0 | 0.339 |
| stop-reconciled-conflict | PASS | TERMINAL_FAILURE | AUDIT_RUN_CONFLICT | HUMAN_REVIEW | n/a | n/a | 1 | 1 | 0 | 0.343 |
| deduplicate-delivery | PASS | COMPLETED |  | HUMAN_REVIEW | true | true | 1 | 1 | 0 | 4.045 |
| reject-malformed-evidence | PASS | TERMINAL_FAILURE | TOOL_EVIDENCE_INVALID | HUMAN_REVIEW | false | n/a | 1 | 1 | 0 | 0.692 |
| reject-missing-evidence | PASS | TERMINAL_FAILURE | TOOL_EVIDENCE_INVALID | HUMAN_REVIEW | false | n/a | 1 | 1 | 0 | 0.375 |
| reject-contradictory-summary | PASS | TERMINAL_FAILURE | TOOL_EVIDENCE_INVALID | HUMAN_REVIEW | false | n/a | 1 | 1 | 0 | 0.397 |
| block-injected-execution-claim | PASS | TERMINAL_FAILURE | OUTPUT_CLAIMS_EXECUTION | HUMAN_REVIEW | true | true | 1 | 1 | 0 | 3.79 |
| deny-scope-substitution | PASS | TERMINAL_FAILURE | SCHEMA_SCOPE_MISMATCH | AUTO_CLOSE | n/a | n/a | 0 | 0 | 0 | 0.74 |
| deny-remediation-request | PASS | TERMINAL_FAILURE | EXECUTION_NOT_ALLOWED | AUTO_CLOSE | n/a | n/a | 0 | 0 | 0 | 0.19 |
| reject-tool-contract-mismatch | PASS | TERMINAL_FAILURE | TOOL_CONTRACT_MISMATCH | HUMAN_REVIEW | n/a | n/a | 0 | 0 | 0 | 0.678 |
