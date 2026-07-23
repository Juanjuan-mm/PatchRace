import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const evidenceRoot = join(root, ".artifacts", "dogfood");
const summary = JSON.parse(
  await readFile(join(evidenceRoot, "summary.json"), "utf8"),
);
const issues = JSON.parse(
  await readFile(join(evidenceRoot, "issues.json"), "utf8"),
);
const guide = (
  await readFile(join(root, "docs", "BETA_DOGFOOD.md"), "utf8")
).replaceAll(/\s+/g, " ");

assert.equal(summary.status, "PASS");
assert.equal(summary.scope, "deterministic-local-dogfood");
assert.ok(summary.runs.successfulEndToEnd >= 50);
assert.ok(summary.runs.distinctTasks >= 10);
assert.ok(summary.runs.readableRate >= 0.98);
assert.deepEqual(Object.keys(summary.runs.adapterRuns).sort(), [
  "claude-code",
  "codex",
  "pi",
]);
assert.equal(
  Object.values(summary.runs.adapterRuns).every((count) => count > 0),
  true,
);
assert.ok(summary.runs.cleanupScenarios >= 10);
assert.equal(summary.runs.orphanedPatchRaceWorktrees, 0);
assert.equal(summary.runs.unrelatedStateDamage, 0);
assert.equal(summary.failureClassification.unclassified, 0);
assert.ok(summary.teaching.cycleCount >= 5);
assert.ok(summary.teaching.rejectedCandidates >= 3);
assert.equal(
  summary.teaching.protectedHoldout.holdoutIdsVisibleDuringProposal,
  false,
);
assert.equal(summary.teaching.protectedHoldout.passed, true);
assert.equal(summary.teaching.protectedHoldout.retuneAllowed, false);
assert.ok(summary.chaos.length >= 10);
assert.equal(issues.issues.length, summary.issueLog.length);
assert.equal(summary.authorization.providerCalls, false);
assert.equal(summary.authorization.credentialAccess, false);
assert.equal(summary.authorization.networkAccess, false);
assert.equal(summary.authorization.paidCalls, false);
assert.equal(summary.authorization.liveModelQualityMeasured, false);

const reportNames = (await readdir(join(evidenceRoot, "reports")))
  .filter((name) => name.endsWith(".json"))
  .sort();
assert.equal(reportNames.length, summary.runs.started);
assert.equal(summary.records.length, summary.runs.started);
for (const [index, name] of reportNames.entries()) {
  const report = JSON.parse(
    await readFile(join(evidenceRoot, "reports", name), "utf8"),
  );
  const record = summary.records[index];
  assert.equal(report.trials.length, 1);
  assert.equal(report.trials[0].outcome, record.outcome);
  assert.equal(
    `sha256:${createHash("sha256")
      .update(JSON.stringify(report))
      .digest("hex")}`,
    record.reportHash,
  );
  assert.equal(record.readableTerminalArtifact, true);
  assert.equal(record.cleanupPreviewed, true);
  assert.equal(record.cleanupConfirmed, true);
  assert.equal(record.unrelatedStatePreserved, true);
}

for (const phrase of [
  "50 passing end-to-end runs",
  "55/55 (100%)",
  "Pi 17, Claude Code 17, and Codex 16",
  "10 maintained chaos classes",
  "Five cycles",
  "3 | `reject`",
  "4 | `reject`",
  "5 | `reject`",
  "No new product defect",
  "do not measure live vendor model quality",
  "`BETA-02`",
])
  assert.equal(
    guide.includes(phrase),
    true,
    `Dogfood record omits '${phrase}'.`,
  );

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      successfulEndToEnd: summary.runs.successfulEndToEnd,
      started: summary.runs.started,
      distinctTasks: summary.runs.distinctTasks,
      adapters: summary.runs.adapterRuns,
      chaosScenarios: summary.chaos.length,
      teachingCycles: summary.teaching.cycleCount,
      rejectedCandidates: summary.teaching.rejectedCandidates,
      issues: issues.issues.length,
      reportsVerified: reportNames.length,
      liveModelQualityMeasured: false,
    },
    null,
    2,
  )}\n`,
);
