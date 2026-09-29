# Run-review deterministic evaluation

Generated: 2026-09-29T04:42:39.118Z

- Passed: 7/7
- Route accuracy: 1
- Unsafe false-negative rate: 0

This fixture suite tests routing contracts and failure behavior. It does not measure Jev model quality.

| Case | Expected | Actual | Source | Provider calls | Result |
| --- | --- | --- | --- | ---: | --- |
| supported-completion | AUTO_CLOSE | AUTO_CLOSE | probabilistic | 1 | PASS |
| low-confidence-completion | HUMAN_REVIEW | HUMAN_REVIEW | probabilistic | 1 | PASS |
| high-urgency-completion | PRIORITY_REVIEW | PRIORITY_REVIEW | probabilistic | 1 | PASS |
| provider-failure | HUMAN_REVIEW | HUMAN_REVIEW | fallback | 1 | PASS |
| ambiguous-execution | PRIORITY_REVIEW | PRIORITY_REVIEW | deterministic | 0 | PASS |
| expected-policy-denial | AUTO_CLOSE | AUTO_CLOSE | deterministic | 0 | PASS |
| completed-without-output | FILE_ISSUE | FILE_ISSUE | deterministic | 0 | PASS |
