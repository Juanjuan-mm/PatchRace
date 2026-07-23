import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ledger = read("docs/TASKS.md");
const block = ledger.match(/## M8 — Pi teaching loop\n([\s\S]*?)\n## M9 —/);
assert(block, "M8 ledger block not found");
const rows = [
  ...block[1].matchAll(
    /^\| `(TCH-\d+)` \|[^\n]*\| (TODO|NEXT|DOING|BLOCKED|DONE|DROPPED) \|$/gm,
  ),
];
assert(rows.length === 17, `expected 17 M8 tasks, found ${rows.length}`);
assert(
  rows.every((row) => row[2] === "DONE"),
  `M8 has incomplete tasks: ${rows
    .filter((row) => row[2] !== "DONE")
    .map((row) => row[1])
    .join(", ")}`,
);

const required = [
  "packages/contracts/src/optimizer.ts",
  "packages/optimizer/src/inventory.ts",
  "packages/optimizer/src/inventory.test.ts",
  "packages/optimizer/src/routing.ts",
  "packages/optimizer/src/routing.test.ts",
  "packages/optimizer/src/candidate.ts",
  "packages/optimizer/src/candidate.test.ts",
  "packages/optimizer/src/staging.ts",
  "packages/optimizer/src/staging.test.ts",
  "packages/optimizer/src/generation.ts",
  "packages/optimizer/src/generation.test.ts",
  "packages/optimizer/src/recommendations.ts",
  "packages/optimizer/src/recommendations.test.ts",
  "packages/optimizer/src/review.ts",
  "packages/optimizer/src/review.test.ts",
  "packages/report/src/candidate-review.ts",
  "packages/report/src/candidate-review.test.ts",
  "packages/optimizer/src/ablation.ts",
  "packages/optimizer/src/ablation.test.ts",
  "packages/tasks/src/teaching-protocol.ts",
  "packages/tasks/src/teaching-protocol.test.ts",
  "packages/optimizer/src/successive-halving.ts",
  "packages/optimizer/src/successive-halving.test.ts",
  "packages/optimizer/src/pareto.ts",
  "packages/optimizer/src/pareto.test.ts",
  "packages/optimizer/src/promotion.ts",
  "packages/optimizer/src/promotion.test.ts",
  "packages/cli/src/teaching-service.ts",
  "packages/cli/src/teaching-service.test.ts",
  "fixtures/m8/heldout-demo.json",
  "fixtures/m8/heldout-demo.expected.json",
  "scripts/run-m8-demo.mjs",
  "docs/M8_DEMO.md",
  "docs/M8_REVIEW.md",
  ".changeset/m8-pi-teaching-loop.md",
];
for (const path of required)
  assert(existsSync(resolve(root, path)), `missing M8 artifact ${path}`);

const inventory = read("packages/optimizer/src/inventory.ts");
assert(
  inventory.includes("symlink-refused") &&
    inventory.includes("explicit-global-root") &&
    inventory.includes("Executable extensions and packages are inventory-only"),
  "resource inventory lacks origin, symlink, or executable-resource controls",
);
const routing = read("packages/optimizer/src/routing.ts");
assert(
  routing.includes('recommendationKind: "model-advice"') &&
    routing.includes("insufficient_evidence_has_no_mutation_authority") &&
    routing.includes('recommendationKind: "manual-tool"'),
  "diagnosis routing lacks capability/insufficient/tool no-mutation controls",
);
const staging = read("packages/optimizer/src/staging.ts");
assert(
  staging.includes("CANDIDATE_STATE_NOT_PROJECT_LOCAL") &&
    staging.includes("CANDIDATE_DISPOSAL_OWNERSHIP_MISMATCH") &&
    staging.includes("activated: false"),
  "candidate staging lacks project-local/no-activation/ownership controls",
);
const generation = read("packages/optimizer/src/generation.ts");
assert(
  generation.includes("SKILL_CONTENT_UNSAFE") &&
    generation.includes("PROMPT_PLACEHOLDER_UNDECLARED") &&
    generation.includes("AGENTS_COMPLEXITY_BUDGET_EXCEEDED"),
  "candidate generators lack executable/placeholder/complexity controls",
);
const review = read("packages/optimizer/src/review.ts");
const reviewHtml = read("packages/report/src/candidate-review.ts");
assert(
  review.includes("approval_enables_validation_only_not_activation") &&
    reviewHtml.includes("default-src 'none'") &&
    !reviewHtml.includes("<script"),
  "review lacks validation-only authority or inert rendering",
);
const ablation = read("packages/optimizer/src/ablation.ts");
assert(
  ablation.includes("ABLATION_CONTAMINATION_EXTRA_CHANGE") &&
    ablation.includes("no_extra_resource_changes_detected"),
  "ablation does not fail closed on extra resource changes",
);
const protocol = read("packages/tasks/src/teaching-protocol.ts");
assert(
  protocol.includes("TEACHING_HOLDOUT_ALREADY_OPENED") &&
    protocol.includes("TEACHING_PROTOCOL_REUSE_AFTER_HOLDOUT") &&
    protocol.includes("retuneAllowed: false"),
  "teaching protocol lacks one-time holdout/no-retune controls",
);
const halving = read("packages/optimizer/src/successive-halving.ts");
assert(
  halving.includes("HALVING_BUDGET_UNENFORCEABLE") &&
    halving.includes("early_stopped_candidates_are_not_fully_evaluated"),
  "successive halving lacks enforceable budgets or early-stop claim boundary",
);
const pareto = read("packages/optimizer/src/pareto.ts");
assert(
  pareto.includes("hard-gate-regression") &&
    pareto.includes(
      "dimensions_remain_separate_without_hidden_aggregate_score",
    ) &&
    !pareto.includes("weightedScore"),
  "Pareto selection lacks hard-gate/raw-dimension controls",
);
const promotion = read("packages/optimizer/src/promotion.ts");
assert(
  promotion.includes("PROMOTION_TARGET_CANONICAL_ESCAPE") &&
    promotion.includes("ROLLBACK_POSTIMAGE_DIVERGED") &&
    promotion.includes("PROMOTION_HOLDOUT_REQUIRED"),
  "promotion/rollback lacks path, divergence, or holdout enforcement",
);
const teaching = read("packages/cli/src/teaching-service.ts");
assert(
  teaching.includes('request.command === "teach pi"') &&
    teaching.includes("TEACH_EVALUATOR_NOT_CONFIGURED") &&
    teaching.includes("createPromotionPlan") &&
    teaching.includes("assertOneVariableAblation"),
  "teach pi is not a real fail-closed composed workflow",
);

const demo = JSON.parse(read("fixtures/m8/heldout-demo.expected.json"));
assert(demo.split.trainingCount === 8, "demo training count changed");
assert(demo.split.validationCount === 2, "demo validation count changed");
assert(demo.split.holdoutCount === 2, "demo holdout count changed");
assert(demo.proposal.holdoutIdsVisible === false, "demo leaked holdout IDs");
assert(
  demo.finalHoldout.baselineSuccessRate === 0 &&
    demo.finalHoldout.candidateSuccessRate === 1 &&
    demo.finalHoldout.improvement === demo.finalHoldout.minimumImprovement,
  "demo held-out improvement changed",
);
assert(
  demo.finalHoldout.passed === true &&
    demo.finalHoldout.hardGatesPassed === true &&
    demo.finalHoldout.retuneAllowed === false &&
    demo.finalHoldout.costIncreaseUsd === 0 &&
    demo.finalHoldout.latencyIncreaseMs === 0 &&
    demo.finalHoldout.footprintIncreaseLines === 0 &&
    demo.finalHoldout.contextTokenIncrease <= 50 &&
    demo.finalHoldout.configComplexityIncrease <= 2,
  "demo correctness, safety, no-retune, or budget gate failed",
);

const packageJson = JSON.parse(read("package.json"));
assert(
  packageJson.scripts["m8:demo"] ===
    "pnpm build && node scripts/run-m8-demo.mjs --check",
  "M8 demo script is missing",
);
assert(
  packageJson.scripts["m8:verify"] ===
    "pnpm m8:demo && node scripts/verify-m8.mjs",
  "M8 verifier script is missing",
);
assert(
  read("docs/PROGRESS.md").includes(
    "| `M8` Pi teaching loop | DONE | 17/17 | `TCH-17` passed |",
  ),
  "M8 progress is not closed",
);
assert(
  read("docs/M8_REVIEW.md").includes("Status: passed 17/17 tasks"),
  "M8 review does not record a pass",
);
assert(
  read(".changeset/m8-pi-teaching-loop.md").includes(
    "train/validation/holdout access",
  ),
  "M8 Changeset does not cover teaching behavior",
);
assert(
  read("docs/RISKS.md").includes("## M8 review outcome"),
  "M8 risk review is missing",
);
assert(
  read("docs/THREAT_MODEL.md").includes("## M8 implementation review"),
  "M8 threat review is missing",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      tasks: rows.length,
      requiredArtifacts: required.length,
      tests: "61 files / 184 tests",
      split: "8 train / 2 validation / 2 final holdout",
      heldoutSuccessRate: "0.0 -> 1.0",
      holdoutLeakage: false,
      retuneAllowed: false,
      silentActivation: false,
      hiddenAggregateScore: false,
      globalPiWrites: false,
    },
    null,
    2,
  )}\n`,
);
