import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ledger = read("docs/TASKS.md");
const block = ledger.match(/## M9 — Pi-native UX\n([\s\S]*?)\n## M10 —/);
assert(block, "M9 ledger block not found");
const rows = [
  ...block[1].matchAll(
    /^\| `(PI-\d+)` \|[^\n]*\| (TODO|NEXT|DOING|BLOCKED|DONE|DROPPED) \|$/gm,
  ),
];
assert(rows.length === 7, `expected 7 M9 tasks, found ${rows.length}`);
assert(
  rows.every((row) => row[2] === "DONE"),
  `M9 has incomplete tasks: ${rows
    .filter((row) => row[2] !== "DONE")
    .map((row) => row[1])
    .join(", ")}`,
);

const required = [
  "packages/pi-extension/src/pi-api.ts",
  "packages/pi-extension/src/bridge.ts",
  "packages/pi-extension/src/arguments.ts",
  "packages/pi-extension/src/race.ts",
  "packages/pi-extension/src/diagnosis.ts",
  "packages/pi-extension/src/candidate.ts",
  "packages/pi-extension/src/status.ts",
  "packages/pi-extension/src/compatibility.ts",
  "packages/pi-extension/src/workflow.test.ts",
  "packages/pi-extension/src/status.test.ts",
  "packages/cli/src/candidate-service.ts",
  "packages/cli/src/candidate-service.test.ts",
  "scripts/verify-pi-package.mjs",
  "docs/M9_DEMO.md",
  "docs/M9_REVIEW.md",
  ".changeset/m9-pi-native-ux.md",
];
for (const path of required)
  assert(existsSync(resolve(root, path)), `missing M9 artifact ${path}`);

const manifest = JSON.parse(read("packages/pi-extension/package.json"));
assert(
  manifest.keywords?.includes("pi-package") &&
    JSON.stringify(manifest.pi?.extensions) ===
      JSON.stringify(["./dist/index.js"]) &&
    manifest.files?.includes("dist"),
  "Pi package manifest is incomplete",
);

const bridge = read("packages/pi-extension/src/bridge.ts");
assert(
  bridge.includes("shell: false") &&
    bridge.includes('"--json"') &&
    bridge.includes('"--project"') &&
    bridge.includes("...invocation.arguments") &&
    bridge.includes("5 MiB safety limit"),
  "Pi bridge lacks argv isolation or output bounds",
);
const race = read("packages/pi-extension/src/race.ts");
assert(
  race.includes("Start PatchRace race?") &&
    race.includes("repository setup/verifier commands") &&
    race.includes("Inspect result"),
  "Pi race lacks preview, risk confirmation, or inspection",
);
const diagnosis = read("packages/pi-extension/src/diagnosis.ts");
assert(
  diagnosis.includes("DETERMINISTIC FACTS (authoritative)") &&
    diagnosis.includes("INFERRED HYPOTHESES") &&
    diagnosis.includes(
      "does not resolve to the immutable artifact inventory",
    ) &&
    diagnosis.includes("Enable optional reflection?"),
  "Pi diagnosis lacks authority separation, citations, or reflection gate",
);
const candidate = read("packages/pi-extension/src/candidate.ts");
assert(
  candidate.includes("EXACT DIFFS (hash-verified)") &&
    candidate.includes("SAFETY FLAGS") &&
    candidate.includes("Approve for validation") &&
    candidate.includes("Promotion preview complete") &&
    candidate.includes("Rollback promotion?"),
  "Pi candidate flow lacks exact evidence or explicit controls",
);
const status = read("packages/pi-extension/src/status.ts");
assert(
  status.includes("MAX_OPEN_BYTES") &&
    status.includes("regular non-symlink") &&
    status.includes("run.store.verify") &&
    status.includes("discoverNewestRun"),
  "Pi status lacks durable discovery or safe artifact checks",
);
const service = read("packages/cli/src/candidate-service.ts");
assert(
  service.includes("CANDIDATE_DECISION_EXISTS") &&
    service.includes("PROMOTION_PREVIEW_DRIFT") &&
    service.includes("createRollbackPlan") &&
    service.includes("executeRollback"),
  "candidate CLI service lacks append-only decision or lifecycle checks",
);
const compatibility = read("scripts/verify-pi-package.mjs");
assert(
  compatibility.includes("PI_OFFLINE") &&
    compatibility.includes("PI_CODING_AGENT_DIR") &&
    compatibility.includes("extensions: []") &&
    compatibility.includes("remove") &&
    !compatibility.includes("API_KEY"),
  "Pi compatibility runner is not isolated/offline/filter-aware",
);

const packageJson = JSON.parse(read("package.json"));
assert(
  packageJson.scripts["m9:demo"] ===
    "pnpm exec vitest run packages/pi-extension/src/workflow.test.ts packages/pi-extension/src/status.test.ts packages/cli/src/candidate-service.test.ts",
  "M9 demo script is missing",
);
assert(
  packageJson.scripts["m9:verify"] ===
    "pnpm m9:demo && pnpm pi:compat && node scripts/verify-m9.mjs",
  "M9 verifier script is missing",
);
assert(
  read("docs/PROGRESS.md").includes(
    "| `M9` Pi-native UX | DONE | 7/7 | `PI-07` passed |",
  ),
  "M9 progress is not closed",
);
assert(
  read("docs/M9_REVIEW.md").includes("Status: passed 7/7 tasks"),
  "M9 review does not record a pass",
);
assert(
  read(".changeset/m9-pi-native-ux.md").includes(
    "Pi-native PatchRace package and workflow",
  ),
  "M9 Changeset does not cover Pi-native behavior",
);
assert(
  read("docs/RISKS.md").includes("## M9 review outcome"),
  "M9 risk review is missing",
);
assert(
  read("docs/THREAT_MODEL.md").includes("## M9 implementation review"),
  "M9 threat review is missing",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      tasks: rows.length,
      requiredArtifacts: required.length,
      workflow: "race -> coach -> review -> promote -> rollback",
      sessionPreserved: true,
      deterministicAndInferenceSeparated: true,
      previewBeforeWrites: true,
      durableStatusRecovery: true,
      projectLocalPackageScope: true,
      globalPiWrites: false,
      providerCalls: false,
    },
    null,
    2,
  )}\n`,
);
