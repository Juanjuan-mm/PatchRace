# QA-07 Privacy and Redaction Review

Status: passed with no unresolved critical or high privacy findings  
Reviewed: 2026-07-23  
Fixture: `fixtures/privacy/public-export.json`

## Release decision

The public comparison export now has a privacy projection before configured
redaction. It does not export the local report's patches, changed-file paths,
trajectory details, evidence links, executable paths, harness/workflow values,
environment names, or free-text trial limitations. Only files under
`report/shareable/` can cross the report export boundary.

The malicious fixture constructs five synthetic credential families from
non-secret fragments at test runtime, then proves their handling alongside
prompts, absolute paths, source code, names, email addresses, and IP addresses
in plain, JSON-encoded, and HTML-encoded forms. Keeping complete
credential-shaped literals out of Git also lets GitHub push protection remain
strict. The fixture proves false-positive controls remain and that an
intentionally unknown secret format survives beside the mandatory warning. This
is deliberate evidence that “redacted” means the reviewed scanner ran, not that
all secrets are absent.

No unresolved critical or high privacy defect is known after the fixes below.
The user must still review every export. No automatic telemetry, upload,
publication, provider call, credential discovery, or retention deletion was
added.

## Findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| `QA07-F01` | High | Configured values containing newlines, quotes, ampersands, or markup could be present in JSON/HTML encoded form without matching their raw literal. The streaming transform could also emit the prefix of an unbounded token before seeing its suffix. | Fixed. Redaction covers raw, JSON-string, and HTML-entity variants. The public transform buffers the complete document up to a 16 MiB hard default and emits nothing before complete redaction; overflow fails with no partial output. |
| `QA07-F02` | High | The CLI's `report.redactionProfile` and `defaults.environment.redact` configuration did not affect the shareable report workflow, so users could reasonably believe an explicitly named runtime value was covered when it was not. | Fixed. Redacted report export reloads the exact frozen config, supports only the reviewed `default` profile, reads only explicitly named runtime values, assigns non-secret finding IDs, and fails closed on missing/short values or config-hash drift. Values never enter config, argv, preview, manifest, or command results. |
| `QA07-F03` | High | OTLP event data was serialized before typed sensitive-key redaction, allowing an opaque value under a field such as `token` to survive unless it matched another pattern. | Fixed. Event data is redacted while still typed, then serialized. OTLP output includes the unknown-secret limitation, remains explicit opt-in/create-new, and has no publisher. |
| `QA07-F04` | High | The default report export selected the full local JSON/HTML, including source patches, changed paths, trajectory details, and local artifact links. Pattern scanning cannot make arbitrary source code public-safe. | Fixed. Runs now create a separate privacy-projected report. The CLI exports only `report/shareable/*`; core selection rejects the full local report and raw artifacts. Local evidence remains unchanged and complete. |
| `QA07-F05` | Medium | Report-export source checks used `lstat` followed by a path-based read, leaving a final-component same-user link swap and size-check/read gap. | Fixed. Preview and execution read through no-follow, regular-file, single-hard-link handles and apply the byte limit to the opened file. |

## Data-class matrix

| Data class | Default public handling | Fixture evidence |
|---|---|---|
| Prompts and Agent outputs | Omitted from the shareable projection. If an allowed derived field repeats an explicitly configured value, encoded-form redaction removes it. Raw prompts/streams cannot be selected. | Multi-line quoted prompt with `&` is removed from JSON and HTML; raw prompt bytes remain exact. |
| Absolute/local paths | Project, state, and run roots are configured path redactions. Patch paths, trajectory paths, artifact links, and executable paths are removed by projection. | Synthetic absolute path is removed in raw and HTML-entity form; manifests contain logical paths only. |
| Credentials | Known OpenAI-style, Anthropic, GitHub, Slack, and AWS access-key patterns are scanned. Typed `apiKey`, `authorization`, `credential`, `password`, `secret`, and `token` fields are replaced. Explicit runtime literals add project-specific formats. | All five synthetic patterns disappear; OTLP proves opaque `token` field removal. Short `sk-` text remains as a false-positive control. |
| Source code | Patches, side-by-side code, human reference patches, and trace timelines are omitted. Configured literals provide defense in depth for source fragments repeated elsewhere. | A synthetic customer-code statement is absent from both public files while the local report remains byte-identical. |
| Personal data | PatchRace does not guess identities. Users explicitly name runtime values to cover names, email addresses, account IDs, IPs, or organization-specific strings; encoded variants are handled. | Synthetic name, private email, and documentation-range IP are removed; an unrelated public test email remains. |
| Diagnosis and candidates | No command labels raw diagnosis/candidate output shareable, and the report exporter refuses their paths. They remain local-sensitive until a future explicit privacy projection is designed. | Structural selection gate accepts only `report/shareable/`. |
| Unknown/transformed secrets | Not guaranteed to be detected. The export manifest and OTLP document carry an explicit limitation; the user remains final reviewer. | `novel-secret-format::qa07-visible-residual` intentionally remains and the test requires the warning. |

## Export workflow and authority

1. A race stores the complete local report and a distinct deterministic
   shareable projection. Neither is published.
2. `patchrace report --redacted --preview --output <new-path>` selects exactly
   the shareable files, reloads the frozen suite config, resolves only explicitly
   named runtime redaction values, and reports source/export hashes, findings,
   exclusions, and the residual warning. The preview is local-sensitive because
   it displays exact source/destination paths.
3. Export requires `--confirm-export`, recomputes the preview, rejects source or
   config drift, and creates a new destination. Existing destinations and
   in-place output are refused.
4. Raw evidence is not modified, deleted, relabeled, or mistaken for the export.
   The manifest records logical inclusions, source/export hashes, scanner
   findings, exclusions, and the unknown-secret warning without storing
   configured values or absolute roots.
5. Publication is outside this command. Users must inspect the resulting files
   and separately choose any external destination.

The optional OTLP/JSON trace path is a separate explicit opt-in local export.
It redacts typed event data plus serialized content, carries the residual
warning, reports `published: false`, and implements no network transport.

## Retention and disclosure boundaries

- Raw runs persist locally until explicit exact-target cleanup.
- Public export does not delete, shorten, or overwrite raw evidence.
- Cleanup cannot retract data already sent to an Agent vendor or a destination
  the user publishes separately.
- Agent CLIs may send repository context to their configured providers according
  to vendor/account behavior; “local-first” is not “models run offline.”
- Preview and command-result paths are local operational output, not a
  shareable artifact.
- Configured environment values are read only for the exact export process and
  are never discovered by enumerating the environment or credential stores.

## Residual limitations

Secret and personal-data recognition is necessarily incomplete. Encodings
beyond the reviewed plain/JSON/HTML forms, transformed fragments, images,
binaries, archives, novel token formats, semantically equivalent source, and
data inferred from otherwise safe fields may survive. False positives and
false negatives remain possible. The 16 MiB per-file/stream limits are safety
bounds, not evidence that a file is safe.

The fixture uses synthetic values only and proves deterministic control
behavior, not absence of sensitive data in a user's report. Every public export
requires human review.
