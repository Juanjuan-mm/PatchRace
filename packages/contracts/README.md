# @patchrace/contracts

Stable error, exit-code, and wire-format contracts shared by PatchRace packages.

The normalized suite contract is exported as `NormalizedSuiteConfig`; its JSON Schema is published at `@patchrace/contracts/schemas/suite-v1.json`.

The normalized observable trace envelope is exported as `TraceEventV1`; its JSON Schema is published at `@patchrace/contracts/schemas/trace-event-v1.json`.

Task/grader exports include immutable task, command/assertion evidence, hidden
verification, split, validity, integrity, and repeated-run statistics wire types.

Comparison exports define frozen task snapshots, independent variant dimensions,
race plans, trial evidence, unavailable metrics, and durable race execution views.

Diagnosis exports cover immutable evidence citations, trajectory features/deltas,
cross-Agent observable alignment, deterministic/reflected findings,
workflow-versus-capability classification, validated diagnosis reports, and
labeled quality measurements.

Optimizer exports cover Pi resource inventory and lint, conservative mutation
routes, candidate/review/recommendation lineage, frozen ablation and
successive-halving plans, teaching split ledgers, provenance-bearing objective
vectors, Pareto decisions, and promotion/rollback plans.
