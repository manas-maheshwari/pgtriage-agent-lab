# Controlled harness experiment: retrieval limit

Generated: 2026-10-23T14:45:28.428Z

- Experiment: retrieval-limit-v1 (contract 1)
- Method: controlled-propose-probe-compare
- Varied surface: retrieval_limit
- Scenario hash: `72e73c67262c08eb65c28e1820dae404b7e9cdb02b40d29eed47c46f161da5ed`
- Model hash: `b665d446e52a829f9d0788332e862d71fb077c526760f9ad7650ab938dc07f62`
- Report hash: `be4f8bee85e388073a9e16197f19cf9ed7afdb3b984191bbcc379856c476e016`
- Identical scenario set: true
- Held-out generalization measured: false

| Variant | Config | Retrieval limit | Safety eligible | Passed | Citations | Unsafe completions | Unbounded loops |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| Baseline | baseline-retrieval-2-v1 | 2 | true | 11/11 | 8 | 0 | 0 |
| Candidate | candidate-retrieval-1-v1 | 1 | true | 11/11 | 4 | 0 | 0 |

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
