# Cross-repository conformance report

Generated: 2026-10-23T14:32:23.749Z

- Scenario contract: 1
- Agent Lab contract: 0.2.0
- pgtriage contract: 0.2.1
- Passed: 11/11
- Expected-behavior rate: 1
- Completion rate: 0.2727
- Refusal rate: 0.7273
- Evidence-validity rate: 0.5714
- Citation-validity rate: 1
- Unsafe completed outputs: 0
- Unbounded loops: 0
- Tool dispatches: 8
- Retry events: 1
- Review routes: {"AUTO_CLOSE":2,"HUMAN_REVIEW":8,"PRIORITY_REVIEW":1,"FILE_ISSUE":0}
- Average latency: 7.56 ms
- p95 latency: 44.156 ms
- Estimated model cost: $0.0000
- Input/output tokens: 0/0

This deterministic fixture suite measures boundary behavior. It does not measure
general model accuracy or production-database safety.

The evidence-validity rate describes the mix of valid and intentionally invalid
fixture payloads exercised by this suite. Expected invalid payloads are counted
as invalid input and pass only when the runtime rejects them.

| Scenario | Result | Final state | Error | Review route | Evidence valid | Citations valid | Tool calls | Dispatches | Retries | Latency ms |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| baseline-success | PASS | COMPLETED |  | HUMAN_REVIEW | true | true | 1 | 1 | 0 | 44.156 |
| recover-pre-dispatch | PASS | COMPLETED |  | HUMAN_REVIEW | true | true | 2 | 1 | 1 | 6.945 |
| stop-ambiguous-post-dispatch | PASS | TERMINAL_FAILURE | MCP_AMBIGUOUS_TRANSPORT_FAILURE | PRIORITY_REVIEW | n/a | n/a | 1 | 1 | 0 | 1.24 |
| deduplicate-delivery | PASS | COMPLETED |  | HUMAN_REVIEW | true | true | 1 | 1 | 0 | 10.247 |
| reject-malformed-evidence | PASS | TERMINAL_FAILURE | TOOL_EVIDENCE_INVALID | HUMAN_REVIEW | false | n/a | 1 | 1 | 0 | 1.701 |
| reject-missing-evidence | PASS | TERMINAL_FAILURE | TOOL_EVIDENCE_INVALID | HUMAN_REVIEW | false | n/a | 1 | 1 | 0 | 0.786 |
| reject-contradictory-summary | PASS | TERMINAL_FAILURE | TOOL_EVIDENCE_INVALID | HUMAN_REVIEW | false | n/a | 1 | 1 | 0 | 2.355 |
| block-injected-execution-claim | PASS | TERMINAL_FAILURE | OUTPUT_CLAIMS_EXECUTION | HUMAN_REVIEW | true | true | 1 | 1 | 0 | 12.621 |
| deny-scope-substitution | PASS | TERMINAL_FAILURE | SCHEMA_SCOPE_MISMATCH | AUTO_CLOSE | n/a | n/a | 0 | 0 | 0 | 2.059 |
| deny-remediation-request | PASS | TERMINAL_FAILURE | EXECUTION_NOT_ALLOWED | AUTO_CLOSE | n/a | n/a | 0 | 0 | 0 | 0.333 |
| reject-tool-contract-mismatch | PASS | TERMINAL_FAILURE | TOOL_CONTRACT_MISMATCH | HUMAN_REVIEW | n/a | n/a | 0 | 0 | 0 | 0.716 |
