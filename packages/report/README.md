# @patchrace/report

Stable comparison report model and standalone static HTML renderer. The renderer
uses no scripts or remote resources, applies a default-deny CSP, escapes all
untrusted content, labels unavailable metrics, and keeps its claim scoped to the
recorded tasks, snapshots, variants, and attempts.

Patch comparison accepts bounded diff evidence as inert text, exposes changed
files and aligned rows, highlights protected-path violations, and withholds human
reference patches unless the caller explicitly authorizes the current phase.

Machine output is available as canonical JSON, JUnit XML, and SARIF 2.1.0.
Unavailable evidence is skipped rather than converted to a CI failure; failed
hard gates and compromised integrity remain explicit failures/findings.

Diagnosis output is available as canonical JSON and standalone inert HTML with
category, confidence, exact artifact/event/gate evidence, alternatives,
limitations, mutation eligibility, frozen facts, and no-mutation classification.
