# Naming and Namespace Check

Checked: 2026-07-23

Status: GitHub repository reserved at `songjinmiao/PatchRace`

## Selected working names

| Surface | Selected name | Notes |
|---|---|---|
| Product and repository | `PatchRace` | Broad enough for cross-agent comparison; the Pi teaching loop is carried by the tagline and product language. |
| CLI executable | `patchrace` | Lowercase, memorable, and consistent with the product name. |
| Core npm package | `patchrace` | Preferred unscoped package if it remains available at publication time. |
| Pi package | `pi-patchrace` | Makes the Pi integration discoverable in the Pi package catalog. |
| Optimization command | `patchrace teach pi` | Explicitly identifies Pi as the optimization target. |
| Pi command | `/coach` | Provisional command name; final command collision check belongs to `PI-01`. |
| Tagline | “Race agents. Distill what wins. Make Pi better.” | Describes comparison, learning, and target in one line. |
| Launch hook | “When Pi loses, it learns.” | Marketing hook, not a claim of autonomous or guaranteed improvement. |

## Checks performed

The following checks are point-in-time discovery, not reservations or legal clearance.

### GitHub

- GitHub public repository search query `patchrace in:name` returned
  `total_count: 0` through the public API on both 2026-07-22 and 2026-07-23.
- Authenticated lookup confirmed `songjinmiao/PatchRace` did not already exist
  immediately before repository creation.
- General web search for exact `"PatchRace"` plus GitHub/software did not surface an existing software project with that name.

Conclusion: no public repository-name collision was found. The authenticated
owner `songjinmiao` created the public repository at
<https://github.com/songjinmiao/PatchRace> on 2026-07-23.

### npm

Read-only registry queries on 2026-07-22 and 2026-07-23 returned `E404` for:

- `patchrace`
- `pi-patchrace`
- `@patchrace/contracts`

Conclusion: the checked packages were absent from the public npm registry at
check time. The source-only GitHub preview does not reserve or publish any npm
namespace; availability can change at any moment and is not claimed.

### Domains

- `patchrace.com`: Verisign WHOIS returned “No match for domain” at check time.
- `patchrace.dev`: Google Registry RDAP returned HTTP 404 with `patchrace.dev not found` at check time.

Conclusion: both appeared unregistered at check time. This project does not require a domain for v0.1; domain purchase is optional and must be an explicit user action outside this planning task.

### Obvious trademark collision search

Exact-term web searches across general results and indexed USPTO, WIPO, EUIPO, and trademark aggregation pages did not surface an obvious `PatchRace` software mark. The string has incidental non-software uses, including an event name, but no discovered software product creates immediate category confusion.

This is a preliminary knockout search only. It is not a professional trademark search, legal opinion, or guarantee of registrability. If the project becomes commercial or a legal entity is formed, obtain appropriate legal review before investing materially in the brand.

## Name semantics and risks

Strengths:

- “Patch” anchors the product in software changes rather than general-purpose agent evaluation.
- “Race” immediately communicates controlled comparison and produces a demo-friendly verb.
- The name remains useful even when Pi is not one of the compared agents.

Risks:

- “Race” can imply a one-off speed contest; public language must emphasize correctness-first evaluation, repeated runs, and the teaching loop.
- The name alone does not communicate Pi. The subtitle, npm Pi package, and “When Pi loses, it learns” hook must remain visible.
- Search results may overlap with patching tools or non-software races. Project metadata should consistently include `coding agents`, `Pi`, `evals`, and `workflow optimization`.

## Fallback names

Use only if the selected name becomes unavailable or legally unsuitable:

1. `HarnessForge` — emphasizes improving the harness; weaker on comparison.
2. `PatchTutor` — emphasizes learning; weaker on cross-agent benchmarking.
3. `RepoSpar` — emphasizes controlled competition; less immediately understandable.

Fallback namespaces must receive the same fresh checks before adoption; this task does not claim they are available.

## Decision

Continue under `PatchRace`, `patchrace`, and `pi-patchrace`. Claim only the
GitHub repository after its authenticated creation. npm names, domains, and
social handles remain unreserved and are not required for the source-only
preview.
