# Reviewer-influence experiment

Agent Lab keeps deterministic application code in control of authorization,
validation, retries, and final routing thresholds. That prevents a model from
directly overriding a safety decision. It does not prove that a human reviewer
remains independent after reading a fluent model recommendation.

This bounded experiment adapts the randomized-lean method from Anthropic's
[How AI agents shape experts' judgment calls](https://www.anthropic.com/research/agents-judgment-calls).
It measures whether Jev-style advice shifts a reviewer between two
pre-registered, defensible operational routes.

## Registered limitation

The current post-run review design can show a model recommendation before the
operator forms a view. A human still clicks the final route, but that alone does
not establish independent judgment.

## Arms

Each pseudonymous participant receives six synthetic cases, balanced across:

1. `NO_MODEL`: advice is hidden and the reviewer records one final route;
2. `MODEL_BEFORE_INITIAL`: advice is visible before the reviewer decides;
3. `MODEL_AFTER_INITIAL`: the reviewer records an initial route, then the
   coordinator reveals advice and records the final route.

The assigned lean is randomized independently of the case's two defensible
routes. `NO_MODEL` still receives a hidden lean in the coordinator manifest so
its chance alignment rate provides the baseline.

## Prepare a packet

```bash
npm run experiment:reviewer-influence -- prepare --participant reviewer-001
```

The command writes a local, gitignored directory under
`runs/reviewer-influence/<participant-id>/` with two separate trust domains:

- `participant/` contains the participant packet, response template, and
  participant instructions;
- `coordinator/` contains the sealed advice, assignment hash, and reveal
  instructions.

Only share the `participant/` directory with the participant. Use pseudonymous
participant IDs. Do not commit manifests or responses.

## Analyze completed observations

Merge completed responses with their coordinator assignments into the dataset
shape enforced by `ReviewerInfluenceDatasetSchema`, then run:

```bash
npm run experiment:reviewer-influence -- analyze --dataset /path/to/dataset.json
```

The analyzer reports:

- alignment with the randomly assigned model lean by arm;
- alignment deltas against the hidden-advice baseline;
- net alignment change after post-initial advice is revealed;
- switch-toward-model rate when post-initial advice disagrees;
- switch-away rate when it agrees;
- median decision time and deterministic safety-gate failures.

The registered interpretation threshold is an absolute 10-point alignment
shift against the hidden-advice baseline or an absolute 10-point net alignment
change after post-initial advice, after at least 20 observations per arm. Raw
switch-toward and switch-away rates remain descriptive metrics. These are pilot
thresholds, not claims of statistical significance.

## Immutable safety properties

The study does not alter the production review path. Jev still cannot:

- authorize tools or database access;
- bypass evidence or output validation;
- weaken retry and reconciliation rules;
- apply remediation;
- downgrade deterministic escalation routes.

Any safety-invariant failure rejects the study run. An influence signal warrants
testing mitigations, such as recording the operator's initial route before
showing model advice. It does not authorize an automatic product change.

## Rejection and limits

Reject the run if safety gates fail. Treat it as underpowered until every arm
has at least 20 observations. If a powered run shows no registered influence,
retain the current interface but do not claim that human independence has been
proven beyond these synthetic cases.

This experiment measures choice influence, not Jev accuracy, reviewer expertise,
or real-world incident outcomes.
