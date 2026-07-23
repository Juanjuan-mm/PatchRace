import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const verifier = join(root, "scripts", "verify-private-beta.mjs");
const temporaryRoots = [];

function reportHash(index) {
  return `sha256:${String(index).padStart(64, "0")}`;
}

function participant(index) {
  const successfulPrepared = index <= 4;
  const successfulRealistic = index <= 3;
  return {
    schemaVersion: "1.0.0",
    participantId: `beta-p${String(index).padStart(2, "0")}`,
    sample: false,
    implementationAuthor: false,
    consent: {
      study: true,
      minimizedRetention: true,
      recordedAt: `2026-07-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
    },
    environment: {
      os: index % 2 === 0 ? "linux" : "macos",
      architecture: index % 2 === 0 ? "x64" : "arm64",
      nodeMajor: index % 2 === 0 ? 24 : 22,
      gitAvailable: true,
      agentMode: "provider-free",
    },
    session: {
      startedAt: `2026-07-${String(10 + index).padStart(2, "0")}T01:00:00.000Z`,
      endedAt: `2026-07-${String(10 + index).padStart(2, "0")}T01:10:00.000Z`,
      activationSeconds: index * 60 + 60,
      installSeconds: index * 10 + 10,
      preparedRunSeconds: index * 5 + 5,
      liveMaintainerIntervention: !successfulPrepared,
      preparedExampleValidReport: true,
      realisticRepositoryValidReport: successfulRealistic,
      reportExplanationCorrect: index <= 4,
      diagnosisCandidateUnderstood: index <= 3,
      repeatUse: {
        outcome: index <= 3 ? "concrete-intent" : "none",
        detail:
          index <= 3
            ? "Plans a second comparison on a maintained regression."
            : "Would wait for a published package.",
      },
    },
    failures:
      index === 5
        ? [
            {
              id: "beta-issue-001",
              phase: "install",
              classification: "documentation-or-usability",
              impact: "P2",
              status: "fixed",
              summary:
                "Needed a clearer reminder to use the pinned package manager.",
            },
          ]
        : [],
    feedback: {
      valuable: "The deterministic gates made the result inspectable.",
      confusing: "The local and shareable report distinction required reading.",
      missing: "A published package would reduce setup steps.",
      repeatUseReason:
        "Would compare a maintained regression before changing workflow.",
    },
    evidence: {
      preparedReportHash: reportHash(index),
      realisticReportHash: successfulRealistic ? reportHash(index + 10) : null,
    },
  };
}

async function createCollection(records) {
  const collection = await mkdtemp(
    join(tmpdir(), "patchrace-private-beta-selftest-"),
  );
  temporaryRoots.push(collection);
  const participants = join(collection, "participants");
  await mkdir(participants);
  for (const [index, record] of records.entries())
    await writeFile(
      join(participants, `${String(index + 1).padStart(2, "0")}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
    );
  return collection;
}

function verify(collection) {
  return spawnSync(
    process.execPath,
    [verifier, "--self-test-root", collection],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
}

try {
  const validRecords = Array.from({ length: 5 }, (_, index) =>
    participant(index + 1),
  );
  const validRoot = await createCollection(validRecords);
  const validResult = verify(validRoot);
  assert.equal(validResult.status, 0, validResult.stderr);
  const valid = JSON.parse(validResult.stdout);
  assert.equal(valid.status, "SELFTEST_PASS");
  assert.equal(valid.selfTest, true);
  assert.equal(valid.metrics.independentParticipants, 5);
  assert.equal(valid.metrics.preparedWithoutIntervention, 4);
  assert.equal(valid.metrics.realisticRepositoryReports, 3);
  assert.equal(valid.metrics.reportExplanationCorrect, 4);
  assert.equal(valid.metrics.diagnosisCandidateUnderstood, 3);
  assert.equal(valid.metrics.repeatUse, 3);
  assert.equal(valid.metrics.activationMedianSeconds, 240);
  assert.equal(valid.metrics.activationP90Seconds, 360);
  assert.equal(Object.values(valid.gates).every(Boolean), true);

  const fourRoot = await createCollection(validRecords.slice(0, 4));
  const fourResult = verify(fourRoot);
  assert.equal(fourResult.status, 1);
  const four = JSON.parse(fourResult.stdout);
  assert.equal(four.status, "SELFTEST_BLOCKED");
  assert.equal(four.missingParticipants, 1);

  for (const [name, mutate, expected] of [
    [
      "sample",
      (records) => {
        records[0].sample = true;
      },
      "samples do not count",
    ],
    [
      "author",
      (records) => {
        records[0].implementationAuthor = true;
      },
      "implementation authors do not count",
    ],
    [
      "duplicate",
      (records) => {
        records[1].participantId = records[0].participantId;
      },
      "Participant IDs must be unique",
    ],
    [
      "sensitive",
      (records) => {
        records[0].feedback.missing = "Contact person@example.invalid";
      },
      "contains unsafe data",
    ],
  ]) {
    const records = JSON.parse(JSON.stringify(validRecords));
    mutate(records);
    const collection = await createCollection(records);
    const result = verify(collection);
    assert.equal(result.status, 1, `${name} unexpectedly passed`);
    assert.match(result.stderr, new RegExp(expected));
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "PASS",
        positiveParticipants: 5,
        computedGates: 7,
        negativeCases: [
          "fewer-than-five",
          "sample",
          "implementation-author",
          "duplicate-id",
          "sensitive-contact-data",
        ],
        realParticipantRecordsCreated: false,
        realCollectionModified: false,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await Promise.all(
    temporaryRoots.map((temporaryRoot) =>
      rm(temporaryRoot, { recursive: true, force: true }),
    ),
  );
}
