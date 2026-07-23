import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const selfTestRootIndex = process.argv.indexOf("--self-test-root");
const selfTest =
  selfTestRootIndex >= 0 && process.argv[selfTestRootIndex + 1] !== undefined;
const betaRoot = selfTest
  ? resolve(process.argv[selfTestRootIndex + 1])
  : join(root, ".artifacts", "private-beta");
if (
  selfTest &&
  (!betaRoot.startsWith(`${resolve(tmpdir())}/`) ||
    !betaRoot.split("/").at(-1)?.startsWith("patchrace-private-beta-selftest-"))
)
  throw new Error(
    "Self-test collection root must be a dedicated PatchRace temporary directory.",
  );
const participantsRoot = join(betaRoot, "participants");
const forbiddenValue =
  /(?:[A-Z]:\\|\/Users\/|\/home\/|https?:\/\/|git@|@[\w.-]+\.[a-z]{2,}|(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]|-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:sk|ghp|xox[baprs])-[A-Za-z0-9_-]{8,})/iu;
const participantId = /^beta-p[0-9]{2,3}$/u;
const issueId = /^beta-issue-[0-9]{3}$/u;
const hash = /^sha256:[a-f0-9]{64}$/u;
const failureClasses = new Set([
  "product-bug",
  "documentation-or-usability",
  "environment-or-adapter",
  "invalid-task",
  "agent-failure",
  "expected-budget-stop",
  "participant-choice",
  "unknown",
]);
const phases = new Set([
  "install",
  "prepared-example",
  "report",
  "teaching",
  "realistic-repository",
  "cleanup",
]);
const impacts = new Set(["P0", "P1", "P2", "P3"]);
const issueStatuses = new Set(["open", "fixed", "deferred", "not-a-bug"]);
const repeatOutcomes = new Set(["returned", "concrete-intent", "none"]);

function finiteNonNegative(value, path) {
  assert.equal(
    typeof value === "number" && Number.isFinite(value) && value >= 0,
    true,
    `${path} must be a finite non-negative number.`,
  );
}

function bounded(value, path, maximum) {
  assert.equal(typeof value, "string", `${path} must be a string.`);
  assert.ok(
    value.length > 0 && value.length <= maximum,
    `${path} is unbounded.`,
  );
  assert.equal(
    forbiddenValue.test(value),
    false,
    `${path} contains unsafe data.`,
  );
}

function validDate(value, path) {
  bounded(value, path, 40);
  assert.equal(Number.isFinite(Date.parse(value)), true, `${path} is invalid.`);
}

function scanStrings(value, path = "record") {
  if (typeof value === "string") {
    assert.equal(
      forbiddenValue.test(value),
      false,
      `${path} contains a path, contact, URL, credential, or key marker.`,
    );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanStrings(item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object")
    for (const [key, item] of Object.entries(value))
      scanStrings(item, `${path}.${key}`);
}

function validate(record, file) {
  assert.equal(record.schemaVersion, "1.0.0", `${file}: schemaVersion`);
  assert.match(record.participantId, participantId, `${file}: participantId`);
  assert.equal(record.sample, false, `${file}: samples do not count`);
  assert.equal(
    record.implementationAuthor,
    false,
    `${file}: implementation authors do not count`,
  );
  assert.equal(record.consent?.study, true, `${file}: study consent`);
  assert.equal(
    record.consent?.minimizedRetention,
    true,
    `${file}: retention consent`,
  );
  validDate(record.consent?.recordedAt, `${file}.consent.recordedAt`);
  assert.ok(["macos", "linux"].includes(record.environment?.os));
  assert.ok(
    ["arm64", "x64", "other"].includes(record.environment?.architecture),
  );
  assert.ok([22, 24].includes(record.environment?.nodeMajor));
  assert.equal(record.environment?.gitAvailable, true);
  assert.ok(
    ["provider-free", "pi", "claude-code", "codex", "mixed"].includes(
      record.environment?.agentMode,
    ),
  );
  validDate(record.session?.startedAt, `${file}.session.startedAt`);
  validDate(record.session?.endedAt, `${file}.session.endedAt`);
  assert.ok(
    Date.parse(record.session.endedAt) >= Date.parse(record.session.startedAt),
    `${file}: session ends before it starts`,
  );
  finiteNonNegative(
    record.session?.activationSeconds,
    `${file}.session.activationSeconds`,
  );
  for (const field of ["installSeconds", "preparedRunSeconds"])
    if (record.session?.[field] !== null)
      finiteNonNegative(record.session?.[field], `${file}.session.${field}`);
  for (const field of [
    "liveMaintainerIntervention",
    "preparedExampleValidReport",
    "realisticRepositoryValidReport",
    "reportExplanationCorrect",
    "diagnosisCandidateUnderstood",
  ])
    assert.equal(
      typeof record.session?.[field],
      "boolean",
      `${file}: ${field}`,
    );
  assert.ok(repeatOutcomes.has(record.session?.repeatUse?.outcome));
  bounded(
    record.session?.repeatUse?.detail,
    `${file}.session.repeatUse.detail`,
    500,
  );
  assert.equal(Array.isArray(record.failures), true);
  for (const [index, failure] of record.failures.entries()) {
    assert.match(failure.id, issueId, `${file}.failures[${index}].id`);
    assert.ok(phases.has(failure.phase));
    assert.ok(failureClasses.has(failure.classification));
    assert.ok(impacts.has(failure.impact));
    assert.ok(issueStatuses.has(failure.status));
    bounded(failure.summary, `${file}.failures[${index}].summary`, 500);
  }
  for (const field of ["valuable", "confusing", "missing", "repeatUseReason"])
    bounded(record.feedback?.[field], `${file}.feedback.${field}`, 1000);
  for (const [field, required] of [
    ["preparedReportHash", record.session.preparedExampleValidReport],
    ["realisticReportHash", record.session.realisticRepositoryValidReport],
  ]) {
    const value = record.evidence?.[field];
    if (required) assert.match(value, hash, `${file}.evidence.${field}`);
    else assert.ok(value === null || hash.test(value));
  }
  scanStrings(record);
  return record;
}

const names = await readdir(participantsRoot).catch(() => []);
const jsonNames = names.filter((name) => name.endsWith(".json")).sort();
const records = [];
for (const name of jsonNames)
  records.push(
    validate(
      JSON.parse(await readFile(join(participantsRoot, name), "utf8")),
      name,
    ),
  );
assert.equal(
  new Set(records.map((record) => record.participantId)).size,
  records.length,
  "Participant IDs must be unique.",
);
const allIssueIds = records.flatMap((record) =>
  record.failures.map((failure) => failure.id),
);
assert.equal(
  new Set(allIssueIds).size,
  allIssueIds.length,
  "Issue IDs must be globally unique.",
);

const activation = records
  .map((record) => record.session.activationSeconds)
  .sort((left, right) => left - right);
const median =
  activation.length === 0
    ? null
    : activation.length % 2 === 1
      ? activation[(activation.length - 1) / 2]
      : (activation[activation.length / 2 - 1] +
          activation[activation.length / 2]) /
        2;
const p90 =
  activation.length === 0
    ? null
    : activation[Math.ceil(activation.length * 0.9) - 1];
const count = (select) => records.filter(select).length;
const metrics = {
  independentParticipants: records.length,
  preparedWithoutIntervention: count(
    (record) =>
      record.session.preparedExampleValidReport &&
      !record.session.liveMaintainerIntervention,
  ),
  realisticRepositoryReports: count(
    (record) => record.session.realisticRepositoryValidReport,
  ),
  reportExplanationCorrect: count(
    (record) => record.session.reportExplanationCorrect,
  ),
  diagnosisCandidateUnderstood: count(
    (record) => record.session.diagnosisCandidateUnderstood,
  ),
  repeatUse: count((record) => record.session.repeatUse.outcome !== "none"),
  activationMedianSeconds: median,
  activationP90Seconds: p90,
};
const issues = records
  .flatMap((record) =>
    record.failures.map((failure) => ({
      ...failure,
      participantId: record.participantId,
    })),
  )
  .sort(
    (left, right) =>
      left.id.localeCompare(right.id) ||
      left.participantId.localeCompare(right.participantId),
  );
const openBlockers = issues
  .filter(
    (issue) =>
      ["P0", "P1"].includes(issue.impact) &&
      !["fixed", "not-a-bug"].includes(issue.status),
  )
  .map((issue) => issue.id);
const gates = {
  sample: records.length >= 5,
  preparedWithoutIntervention: metrics.preparedWithoutIntervention >= 4,
  realisticRepositoryReports: metrics.realisticRepositoryReports >= 3,
  reportExplanationCorrect: metrics.reportExplanationCorrect >= 4,
  diagnosisCandidateUnderstood: metrics.diagnosisCandidateUnderstood >= 3,
  repeatUse: metrics.repeatUse >= 3,
  criticalUsabilityBlockersClosed: openBlockers.length === 0,
};
const status =
  records.length >= 5
    ? selfTest
      ? "SELFTEST_PASS"
      : "COLLECTED"
    : selfTest
      ? "SELFTEST_BLOCKED"
      : "BLOCKED";
const summary = {
  schemaVersion: "1.0.0",
  status,
  selfTest,
  requiredParticipants: 5,
  missingParticipants: Math.max(0, 5 - records.length),
  metrics,
  gates,
  openP0P1IssueIds: [...new Set(openBlockers)].sort(),
  participantIds: records.map((record) => record.participantId).sort(),
  privacy: {
    pseudonymous: true,
    rawArtifactsStored: false,
    contactDataStored: false,
  },
};
await writeFile(
  join(betaRoot, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
await writeFile(
  join(betaRoot, "issues.json"),
  `${JSON.stringify({ schemaVersion: "1.0.0", issues }, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (status === "BLOCKED" || status === "SELFTEST_BLOCKED") process.exitCode = 1;
