# Maintainer-labeled diagnosis cases

`labeled-cases.json` freezes 21 public-safe synthetic cases: three materially
varied observable scenarios for each top-level category. The fixture contains no
private repository content, hidden verifier material, vendor output, prompt, or
model-generated label.

The quality test expands each compact scenario into normalized observable events
and deterministic gate results, runs the production feature/rule pipeline, and
then measures high-confidence finding precision and case coverage against the
maintainer label. Capability cases intentionally remain unclassified by the rule
engine: model capability requires the separate controlled-peer classifier, and
unclassified evidence is safer than a fabricated high-confidence rule.
