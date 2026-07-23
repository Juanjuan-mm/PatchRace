# @patchrace/optimizer

Candidate, ablation, and promotion-decision foundations.

The Pi resource inventory reads project resources and an optional explicitly
selected global resource root without mutation. It records origin, precedence,
content hashes, deterministic context-cost estimates, shadowing, and bounded
lint findings. Symlinks are not followed, secret-like content is never copied
into inventory output, and executable resources remain informational only.

The built-in optimizer routes only high-confidence deterministic diagnoses,
generates bounded guidance/Skill/prompt candidates or inert recommendations,
stages exact project-local artifacts, and requires explicit review. Validation
uses one-variable ablations, protected train/validation/final-holdout access,
hard budgets, successive halving, separate objective dimensions, and
correctness-first Pareto selection. Promotion and rollback are explicit,
preimage-checked, project-local operations; neither commits nor touches global
Pi state.
