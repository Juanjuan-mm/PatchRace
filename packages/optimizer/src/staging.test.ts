import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PatchRaceError,
  sha256,
  type DiagnosisMutationRouteV1,
} from "@patchrace/contracts";

import { createCandidateSnapshot } from "./candidate.js";
import {
  disposeCandidate,
  planCandidateDisposal,
  stageCandidate,
} from "./staging.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-staging-"));
  roots.push(root);
  return root;
}

function fixture() {
  const before = Buffer.from("---\nname: focused\n---\nOld.\n");
  const after = Buffer.from("---\nname: focused\n---\nNew.\n");
  const patch = Buffer.from(
    "--- a/.pi/skills/focused/SKILL.md\n+++ b/.pi/skills/focused/SKILL.md\n@@ -4 +4 @@\n-Old.\n+New.\n",
  );
  const route: DiagnosisMutationRouteV1 = {
    schemaVersion: "1.0.0",
    routeSchemaVersion: "1.0.0",
    id: "route_1234567890abcdef",
    disposition: "candidate",
    mutationType: "skill",
    recommendationKind: null,
    sourceFindingIds: ["diag_workflow"],
    evidence: [
      {
        runId: "run_01K0FAKE000000000000000000",
        trialId: "trial_01K0FAKE000000000000000000",
        artifactHash: sha256("artifact"),
        logicalPath: "trials/focus/trace.jsonl",
      },
    ],
    rationale: [],
    invokedWorkflow: null,
    limitations: [],
  };
  const candidate = createCandidateSnapshot({
    baselineId: "pi-main",
    createdAt: "2026-07-23T00:00:00Z",
    generator: {
      kind: "builtin-bounded-v1",
      id: "fixture",
      version: "1.0.0",
      model: null,
      promptHash: null,
      deterministic: true,
    },
    routes: [route],
    visibleSplitHash: sha256("train"),
    configHash: sha256("config"),
    declaredVariable: "focused-workflow",
    files: [
      {
        logicalPath: ".pi/skills/focused/SKILL.md",
        operation: "update",
        beforeHash: sha256(before),
        afterHash: sha256(after),
        patchHash: sha256(patch),
      },
    ],
    objective: {
      policy: "correctness-first-v1",
      primary: "success-rate",
      constraints: {},
    },
  });
  return { candidate, before, after, patch };
}

describe("candidate staging", () => {
  it("creates an isolated diffable candidate without activating it", async () => {
    const project = await temporaryRoot();
    const value = fixture();

    const staged = await stageCandidate({
      projectRoot: project,
      candidate: value.candidate,
      files: [
        {
          logicalPath: ".pi/skills/focused/SKILL.md",
          before: value.before,
          after: value.after,
          patch: value.patch,
        },
      ],
      lint: { findings: [] },
    });

    expect(staged).toMatchObject({
      activated: false,
      relativeRoot: `.patchrace/candidates/${value.candidate.candidateId}`,
    });
    expect(
      await readFile(join(project, staged.relativeRoot, "mutation.diff")),
    ).toEqual(value.patch);
    await expect(
      access(join(project, ".pi", "skills", "focused", "SKILL.md")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      stageCandidate({
        projectRoot: project,
        candidate: value.candidate,
        files: [
          {
            logicalPath: ".pi/skills/focused/SKILL.md",
            before: value.before,
            after: value.after,
            patch: value.patch,
          },
        ],
        lint: {},
      }),
    ).rejects.toBeInstanceOf(PatchRaceError);
  });

  it("refuses non-project state and symlinked staging components", async () => {
    const project = await temporaryRoot();
    const outside = await temporaryRoot();
    const value = fixture();
    await mkdir(join(project, ".patchrace"));
    await symlink(outside, join(project, ".patchrace", "candidates"));

    await expect(
      stageCandidate({
        projectRoot: project,
        candidate: value.candidate,
        files: [
          {
            logicalPath: ".pi/skills/focused/SKILL.md",
            before: value.before,
            after: value.after,
            patch: value.patch,
          },
        ],
        lint: {},
      }),
    ).rejects.toBeInstanceOf(PatchRaceError);
    await expect(
      stageCandidate({
        projectRoot: project,
        stateRoot: outside,
        candidate: value.candidate,
        files: [],
        lint: {},
      }),
    ).rejects.toBeInstanceOf(PatchRaceError);
  });

  it("dry-runs and disposes only the matching owned candidate", async () => {
    const project = await temporaryRoot();
    const value = fixture();
    const staged = await stageCandidate({
      projectRoot: project,
      candidate: value.candidate,
      files: [
        {
          logicalPath: ".pi/skills/focused/SKILL.md",
          before: value.before,
          after: value.after,
          patch: value.patch,
        },
      ],
      lint: {},
    });
    await writeFile(join(project, "sentinel.txt"), "preserve\n");
    const plan = await planCandidateDisposal({
      projectRoot: project,
      candidateId: value.candidate.candidateId,
      expectedCandidateHash: value.candidate.candidateHash,
    });

    expect(await disposeCandidate(plan, { confirm: false })).toEqual({
      removed: [],
    });
    expect(await readFile(join(project, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );
    expect(
      (await disposeCandidate(plan, { confirm: true })).removed,
    ).toHaveLength(1);
    await expect(
      access(join(project, staged.relativeRoot)),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(join(project, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });
});
