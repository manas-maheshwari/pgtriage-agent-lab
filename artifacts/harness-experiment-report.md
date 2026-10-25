# Controlled harness experiment: retrieval limit

Generated: 2026-10-25T00:10:08.325Z

- Experiment: retrieval-limit-v1 (contract 1)
- Method: controlled-propose-probe-compare
- Varied surface: retrieval_limit
- Scenario hash: `0692d95e58ca698715c6eca34f16d298afeef2e7a0c331f9fad02b8ae1dd365e`
- Model hash: `b665d446e52a829f9d0788332e862d71fb077c526760f9ad7650ab938dc07f62`
- Report hash: `58105f9fc68f39e850126df3fa8b2ec09bb704494dd775575e7b25d63c9e1ec5`
- Identical scenario set: true
- Held-out generalization measured: false

| Variant | Config | Retrieval limit | Safety eligible | Passed | Citations | Unsafe completions | Unbounded loops |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| Baseline | baseline-retrieval-2-v1 | 2 | true | 16/16 | 12 | 0 | 0 |
| Candidate | candidate-retrieval-1-v1 | 1 | true | 16/16 | 6 | 0 | 0 |

## Decision

**RETAIN_BASELINE.** The candidate preserved safety but reduced citation coverage without a measured token or cost benefit.

The active configuration remains `baseline-retrieval-2-v1`. This
runner cannot update it, and no candidate is adopted automatically.

## Evidence-supported lesson

Reducing retrieval from two chunks to one preserved deterministic safety but removed supporting citations. Keep the baseline until a measured token or latency benefit justifies that evidence tradeoff.

## Limits

This first experiment reuses the conformance scenarios. It does not establish transfer to unseen tasks. Wall-clock latency is recorded for
inspection but excluded from the reproducible report hash and adoption decision.
The deterministic fixture model reports zero token use and model cost, so this
run provides no evidence of a cost reduction.
