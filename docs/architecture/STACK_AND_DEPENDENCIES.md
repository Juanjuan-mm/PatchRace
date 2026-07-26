# Implementation Stack and Dependency Policy

Status: current v0.1 architecture
Last updated: 2026-07-22

## Decision summary

PatchRace v0.1 is a strict ESM TypeScript monorepo on Node.js LTS, with pnpm
workspaces, Vitest, JSON Schema/Ajv validation, and a dependency-light static
HTML report. Python is optional and out-of-process only. Agent integrations
invoke official local CLIs; Pi additionally has a direct SDK path.

The three supported agents expose structured headless streams, Pi's SDK loads in
the same Node process, Git/process primitives cover the tested lifecycle, and no
critical Python-only library is required.

## Runtime and language

- Runtime support: latest patched Node `22.x` and `24.x` LTS plus Node `26.x`
  Current on supported macOS/Linux/Windows; engine range `>=22.22.0 <27`.
- CI matrix: the explicit 18-cell macOS arm64/x64, Ubuntu 22.04/24.04
  arm64/x64, and Windows x64 cross product with Node 22, 24, and 26.
- Language: TypeScript `6.0.x`, `strict`, ESM, `module`/`moduleResolution: NodeNext`, explicit `rootDir`, explicit `types`, declaration emit for public packages, and a fixed ES target supported by Node 22 (no floating compiler defaults).
- JavaScript output runs without a loader. No `tsx`/`ts-node` dependency is required for installed users.
- Public contracts use JSON Schema plus generated/hand-maintained TypeScript types; schema files are release artifacts and the wire-format source of truth.

Node 22 is Maintenance LTS, Node 24 is Active LTS, and Node 26 is Current in
July 2026; Node 20/23/25 are EOL. Node 24 remains supported through April
2028. TypeScript 6.0 changes defaults, so PatchRace pins all relevant compiler
options rather than relying on them. Sources: [Node release status](https://nodejs.org/en/about/previous-releases), [Node release schedule](https://github.com/nodejs/Release), [TypeScript 6.0 notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html).

## Workspace and package manager

- pnpm `11.x`, pinned to an exact version plus integrity through the root `packageManager` field at scaffold time.
- One committed `pnpm-lock.yaml`; CI uses `pnpm install --frozen-lockfile` and rejects drift.
- `pnpm-workspace.yaml` declares packages/fixtures explicitly. No implicit recursive glob may include agent-created run directories.
- Core build graph uses TypeScript project references and `pnpm --filter`; no Nx/Turborepo dependency in v0.1.
- Published packages are independently packable, but internal packages use workspace protocol and release together until a need for independent versioning is proven.

pnpm is selected for workspace support, strict dependency resolution, disk reuse across repeated fixtures, overrides, and lifecycle-script controls. Installation remains a standard npm package for users; users do not need pnpm to run the published CLI. Source: [pnpm documentation](https://pnpm.io/).

## Package boundaries

```text
packages/
  contracts       schemas, canonical JSON, IDs, errors
  core            planner, artifacts, processes, worktrees, budgets
  adapters        shared contract and Pi/Claude/Codex adapters
  tasks           suite/task loaders, mining, graders
  diagnosis       trace features, comparison, diagnosis
  optimizer       candidates, ablation, decisions, promotion
  report          report model and static renderer
  cli             patchrace executable and presentation
  pi-extension    thin Pi-native entry over core APIs
fixtures/         deterministic repos/traces/adapter streams
```

Cycles are forbidden. `contracts` has no side effects and minimal dependencies;
`core` does not import CLI/report; adapters do not grade; reports read stable
artifacts.

## CLI, config, and validation

Current choices:

- `commander` for CLI parsing/help only; services own behavior and exit semantics.
- `yaml` for YAML 1.2 parsing with aliases/custom tags disabled or bounded.
- `ajv` plus formats only where required for JSON Schema Draft 2020-12 validation; errors are converted to stable path-level PatchRace errors.
- Node `crypto`, `fs`, `path`, `child_process`, streams, and `AbortController` for hashing/files/processes rather than wrapper libraries until a fixture demonstrates a gap.
- A small color library may be used for TTY output; color is disabled for machine output and snapshots.

No config library may execute JavaScript, resolve shell expressions, or interpolate environment values implicitly.

## Testing

- Vitest `4.x` with Node environment for unit, contract, fixture, and snapshot tests; Vitest 4 supports the selected Node lines.
- Node's built-in test runner remains available inside minimal external fixtures so fixture repositories do not inherit product test dependencies.
- Contract fixtures use captured/redacted JSONL from supported CLI versions plus malformed/oversized streams.
- Integration tests spawn real child processes and temporary Git repositories under exact `mkdtemp` roots.
- E2E tests exercise built package tarballs and resolved official CLIs only in opt-in/authenticated jobs.
- Coverage uses V8 for diagnostic visibility; release gates prioritize named behaviors/fixtures over a meaningless global percentage.
- Time, random IDs, paths, and versions are injected/canonicalized; no snapshot silently masks nondeterministic fields.

Vitest 4 requires Node 20 or newer; its process isolation and Node API fit contract/integration tests. Source: [Vitest 4 migration prerequisites](https://vitest.dev/guide/migration).

## Report/UI stack

- Stable `report.json` is primary; HTML is a derived, standalone artifact.
- Renderer uses server-side string generation for the document shell plus bundled vanilla TypeScript modules and CSS. No React/Vue/Svelte runtime in v0.1.
- Browser bundle uses `esbuild` as the single report-only bundler if native modules cannot be embedded directly; core Node packages continue to use `tsc` output.
- All untrusted content is inserted as text or escaped by one audited renderer; no raw HTML from agents/tasks.
- Strict CSP, no remote scripts/fonts/analytics, no network requirement, deterministic asset hashes, accessible semantic controls, and printable fallback.
- Large patches/traces are chunked/capped in the report model rather than depending on a heavyweight virtualized UI framework initially.

A diff-rendering or syntax-highlighting dependency may be added only after security, license, bundle-size, no-network, and HTML-injection fixtures. Raw unified diff always remains available without it.

## Agent integration choices

- Pi package: `@earendil-works/pi-coding-agent` (the current official package observed at `0.81.1`); the deprecated `@mariozechner` namespace is not a new dependency.
- Pi primary internal path: SDK for typed in-process session/resource control; JSON CLI remains a compatibility/containment path and RPC is a documented subprocess alternative.
- Claude Code: official `claude -p --output-format stream-json --verbose`, with explicit tools, permission mode, cwd, settings sources, session policy, and version/auth probes.
- Codex: resolved healthy official `codex exec --json`, explicit `-C`, sandbox, ephemeral/session policy, version/auth probes. PATH presence alone is not sufficient.
- Adapters are optional runtime capabilities. PatchRace does not bundle, install, update, authenticate, or copy credentials for the three CLIs.

Exact supported CLI ranges are established by adapter compatibility tests.
Observed versions are evidence points, not universal promises. Health probing
is mandatory because PATH presence alone does not establish a usable CLI.

## Optional Python bridge

Python is not required to install or use v0.1. A future GEPA/EvoSkill or domain grader bridge may be an optional subprocess plugin with:

- explicit executable/version preflight and user opt-in;
- versioned JSONL stdin/stdout protocol, stderr logs, cancellation, time/size budgets;
- no shared in-process state, no pip install by PatchRace, and no access to hidden/holdout data beyond its declared contract;
- separate optional package/docs and lock/provenance policy.

If a core feature later requires Python, that is a material architecture change requiring an ADR and activation-time measurement.

## Dependency admission policy

A dependency is admitted only when the standard library or a small local implementation cannot meet a tested requirement and the dependency has:

1. a clear owner/use site and measurable value;
2. compatible license (prefer Apache-2.0/MIT/BSD/ISC) and notice requirements recorded;
3. active maintenance, bounded transitive graph, supported Node/ESM behavior, and no unexplained native binary;
4. lockfile integrity and registry provenance; exact version for tools with unstable output, bounded range only where tested;
5. no lifecycle script by default; exceptions are reviewed, documented, and checked in clean install/package audits;
6. no automatic telemetry/network access or credential discovery;
7. security review for parsers/renderers/process/path/Git code and malicious fixtures where exposed to untrusted input;
8. an exit/removal plan when it owns a public format or critical behavior.

New runtime dependencies require review; dev dependencies use the same license/supply-chain rules. Direct imports must be declared in the owning package. Duplicate libraries and broad utility bundles are rejected. Optional integrations remain peer/optional or subprocess capabilities, never surprise installs.

## Supply-chain and release rules

- Commit the lockfile; use frozen installs, dependency allow/deny overrides, and minimum release age where CI/tooling permits.
- Automated updates open reviewable changes and must pass fixtures; no unattended merge for agent adapters, parsers, Git/process, report rendering, or release tooling.
- Audit production and development graphs, generate license inventory/notices, and review package contents with `npm pack --dry-run`.
- Publish only compiled output, schemas, required static assets, license/readme, and source maps according to the privacy/source policy; exclude fixtures, raw runs, credentials, and local paths.
- Use npm provenance/signing capabilities selected in the release task; publishing credentials exist only in protected release jobs.
- Pin GitHub Actions to reviewed commit SHAs at CI/release setup time.

## Rejected choices

- Node 20: EOL in March 2026.
- Node 26 as minimum: Current, not LTS at this milestone, and would unnecessarily narrow adoption.
- Python-first core: adds a second required runtime without spike evidence of need.
- Electron/server dashboard: static local report meets v0.1 and avoids daemon/account/browser-security scope.
- Heavy monorepo/build framework: project references and pnpm filters are sufficient for the planned graph.
- Bundling agent CLIs or extracting their auth: conflicts with official local-tool/auth boundaries and version control by the user.

## Acceptance mapping

Node/TypeScript versions and compiler posture, package manager, tests, report/UI stack, optional Python bridge, agent package/interface choices, dependency admission, supply chain, and release/package rules are recorded from spike evidence.
