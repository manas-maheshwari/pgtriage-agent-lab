# Random-negative shadow-audit experiment

- Experiment: random-negative-shadow-audit-v1
- Method: offline-random-negative-shadow-audit
- Fixture hash: `08de5a492b09f34f780ee5b70c4ea0505df6a2259be863388a490a3f4cbd6eab`
- Seed hash: `d215fe84834d414aefd3b40445234919695eb5a76a175fafc6c09cb3925916e5`
- Report hash: `ecb4f8f655c143f3f2ffbf5adbedfdb77d295d3da7d50f7a84ea1b12c53354fd`

| Metric | Baseline | 5% shadow audit |
| --- | ---: | ---: |
| Runs | 2000 | 2000 |
| Seeded violations | 177 | 177 |
| Combined detections | 135 | 138 |
| Combined recall | 0.7627 | 0.7797 |
| Shadow reviews | 0 | 98 |
| Newly detected false negatives | 0 | 3 |
| False-positive alerts | 0 | 1 |
| Production route mutations | 0 | 0 |
| Production latency added (ms) | 0 | 0 |
| Estimated review cost (USD) | 0 | 0.196 |

## Decision

**CONTINUE_EXPERIMENT.** The offline sample found seeded primary-screen misses without changing production routes or latency and remained within the registered false-positive threshold.

This result supports further offline evaluation only. It does not authorize a
production sampling rate or change any run's operational route.

## Limits

- This fixture experiment measures monitor coverage, not real-world model misalignment.
- The synthetic primary and shadow reviewers are deterministic and do not establish live-model precision or recall.
- A 5% sample is a cost-and-coverage probe, not a statistically justified production rate.
