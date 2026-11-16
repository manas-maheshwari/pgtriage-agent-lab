# Reviewer-influence procedural pilot runbook

This run is a procedure test, not a research dataset. Use one person who did
not help design the harness. Their case choices must be discarded after the
pilot; retain only procedural problems and improvements.

## Prepare

Choose a pseudonymous label that does not identify the person, then run:

```bash
npm run experiment:reviewer-influence -- prepare --participant pilot-001
```

This creates two directories under `runs/reviewer-influence/pilot-001/`:

- share only `participant/` with the tester;
- keep `coordinator/` private.

Confirm that the participant directory contains no coordinator manifest or
sealed advice for `NO_MODEL` and `MODEL_AFTER_INITIAL` cases.

## Message to send

> Could you help me test a set of study instructions? It should take about
> 20–30 minutes. You will review six short synthetic operational cases and
> choose between two defensible actions. I am testing whether the process and
> files are understandable, not evaluating your expertise. Your choices will
> be discarded and will not be included in any research results. Please do not
> include your name, employer, or other personal information in the files. If
> anything is confusing or information appears too early, stop and note it
> rather than guessing. I will send you a participant folder with the full
> instructions.

## Coordinate the run

1. Ask the participant to follow `participant/README.md` in order.
2. Do not explain the purpose of individual study arms or reveal any assignment.
3. For a `MODEL_AFTER_INITIAL` case, confirm that the participant has saved the
   initial choice before revealing only that case's advice.
4. Never send the coordinator manifest.
5. Do not coach, defend, or interpret the advice.
6. Record procedural incidents separately: premature reveal, confusion,
   overwritten initial response, missing field, timing problem, or coordinator
   intervention.

## Close the pilot

Collect `pilot-feedback.md`. Verify that all six cases could be completed and
that no sealed advice leaked. Then delete or quarantine the response choices so
they cannot be merged into the real dataset. Make any procedural corrections,
freeze a new study version if necessary, and run another discarded pilot only
if the corrections materially change the procedure.

Before collecting real observations for a publication, separately settle
ethics/IRB requirements, recruitment and exclusion rules, sample-size rationale,
case order, primary outcome, and repeated-measures analysis.
