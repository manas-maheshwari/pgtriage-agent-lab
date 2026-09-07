# Eval Report

Generated: 2026-09-07T00:53:36.936Z

Passed: 26/26

Success rate: 1

| Case | Result | State | Error | Tool calls | Dispatches | Citations | Notes |
|---|---|---|---|---:|---:|---:|---|
| happy-1 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-2 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-3 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-4 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-5 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-6 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-7 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-8 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-9 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-10 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-11 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| happy-12 | pass | COMPLETED |  | 1 | 1 | 2 |  |
| deny-execution-prompt | pass | TERMINAL_FAILURE | EXECUTION_NOT_ALLOWED | 0 | 0 | 0 |  |
| deny-approved-db-role | pass | TERMINAL_FAILURE | ENVIRONMENT_NOT_AUTHORIZED | 0 | 0 | 0 |  |
| allow-approved-db-role | pass | COMPLETED |  | 1 | 1 | 2 |  |
| deny-write-tool | pass | TERMINAL_FAILURE | WRITE_TOOL_NOT_ALLOWED | 0 | 0 | 0 |  |
| deny-missing-read-only-hint | pass | TERMINAL_FAILURE | WRITE_TOOL_NOT_ALLOWED | 0 | 0 | 0 |  |
| deny-destructive-tool | pass | TERMINAL_FAILURE | DESTRUCTIVE_TOOL_NOT_ALLOWED | 0 | 0 | 0 |  |
| recover-model-retry | pass | COMPLETED |  | 1 | 1 | 2 |  |
| recover-pre-dispatch-tool-retry | pass | COMPLETED |  | 2 | 1 | 2 |  |
| recover-capability-discovery | pass | COMPLETED |  | 1 | 1 | 2 |  |
| terminal-ambiguous-dispatch | pass | TERMINAL_FAILURE | MCP_AMBIGUOUS_TRANSPORT_FAILURE | 1 | 1 | 0 |  |
| deny-schema-scope-change | pass | TERMINAL_FAILURE | SCHEMA_SCOPE_MISMATCH | 0 | 0 | 0 |  |
| allow-schema-scoped-audit | pass | COMPLETED |  | 1 | 1 | 2 |  |
| reject-execution-claim | pass | TERMINAL_FAILURE | OUTPUT_CLAIMS_EXECUTION | 1 | 1 | 2 |  |
| terminal-tool-timeout | pass | TERMINAL_FAILURE | TOOL_TIMEOUT | 1 | 1 | 0 |  |
