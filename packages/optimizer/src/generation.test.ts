import { describe, expect, it } from "vitest";

import {
  PatchRaceError,
  sha256,
  type DiagnosisFindingV1,
  type DiagnosisMutationRouteV1,
  type EvidenceCitationV1,
} from "@patchrace/contracts";

import {
  generateAgentsGuidanceCandidate,
  generatePiSkillCandidate,
  generatePromptTemplateCandidate,
} from "./generation.js";

const evidence: EvidenceCitationV1 = {
  runId: "run_01K0FAKE000000000000000000",
  trialId: "trial_01K0FAKE000000000000000000",
  artifactHash: sha256("grade"),
  logicalPath: "trials/focus/grade.json",
  gradeGateIds: ["constraint:package-manager"],
};
const finding: DiagnosisFindingV1 = {
  schemaVersion: "1.0.0",
  id: "diag_context",
  category: "context",
  confidence: "high",
  claim: "A project constraint failed.",
  evidence: [evidence],
  alternatives: [{ claim: "The task may be unclear." }],
  eligibleMutationTargets: ["agents-guidance"],
  limitations: [],
  origin: "deterministic-rule",
  ruleId: "explicit-constraint-gate-failure-v1",
};
const route: DiagnosisMutationRouteV1 = {
  schemaVersion: "1.0.0",
  routeSchemaVersion: "1.0.0",
  id: "route_context",
  disposition: "candidate",
  mutationType: "agents-guidance",
  recommendationKind: null,
  sourceFindingIds: [finding.id],
  evidence: [evidence],
  rationale: ["stable_project_constraint"],
  invokedWorkflow: null,
  limitations: [],
};
const common = {
  baselineId: "pi-main",
  createdAt: "2026-07-23T00:00:00Z",
  route,
  finding,
  visibleSplitHash: sha256("train"),
  configHash: sha256("config"),
};

describe("AGENTS.md candidate generation", () => {
  it("adds one cited stable fact with exact diff and token delta", () => {
    const result = generateAgentsGuidanceCandidate({
      ...common,
      currentContent: "# Existing\n\nKeep this.\n",
      change: {
        kind: "add-stable-fact",
        fact: "Use pnpm for repository package commands.",
      },
    });

    expect(result.candidate.mutation).toMatchObject({
      type: "agents-guidance",
      declaredVariable: "add-stable-project-fact",
    });
    expect(result.changeEvidence[0]).toMatchObject({
      sourceFindingIds: [finding.id],
      evidence: [evidence],
    });
    expect(result.complexity.addedLines).toBeGreaterThan(0);
    expect(result.complexity.contextTokenDelta).toBeGreaterThan(0);
    expect(Buffer.from(result.files[0]!.patch).toString("utf8")).toContain(
      "+- Use pnpm for repository package commands.",
    );
  });

  it("removes only explicitly selected conflict lines and reports savings", () => {
    const result = generateAgentsGuidanceCandidate({
      ...common,
      currentContent:
        "Always use npm.\nUse pnpm in this repository.\nKeep tests focused.\n",
      change: {
        kind: "remove-lines",
        lineNumbers: [1],
        reason: "conflict",
      },
    });
    const output = Buffer.from(result.files[0]!.after!).toString("utf8");

    expect(output).not.toContain("Always use npm.");
    expect(output).toContain("Use pnpm");
    expect(result.complexity).toMatchObject({
      addedLines: 0,
      removedLines: 1,
    });
    expect(result.complexity.contextTokenDelta).toBeLessThan(0);
  });

  it("rejects duplicate, secret-like, and over-budget additions", () => {
    expect(() =>
      generateAgentsGuidanceCandidate({
        ...common,
        currentContent: "- Use pnpm for repository package commands.\n",
        change: {
          kind: "add-stable-fact",
          fact: "Use pnpm for repository package commands.",
        },
      }),
    ).toThrowError(PatchRaceError);
    expect(() =>
      generateAgentsGuidanceCandidate({
        ...common,
        currentContent: null,
        change: {
          kind: "add-stable-fact",
          fact: "Set api_key = a-secret-value-that-must-not-appear.",
        },
      }),
    ).toThrowError(PatchRaceError);
    expect(() =>
      generateAgentsGuidanceCandidate({
        ...common,
        currentContent: null,
        maxContextTokens: 1,
        change: {
          kind: "add-stable-fact",
          fact: "Use pnpm for repository package commands.",
        },
      }),
    ).toThrowError(PatchRaceError);
  });
});

describe("Pi Skill candidate generation", () => {
  const skillFinding: DiagnosisFindingV1 = {
    ...finding,
    id: "diag_workflow",
    category: "workflow",
    eligibleMutationTargets: ["skill"],
  };
  const skillRoute: DiagnosisMutationRouteV1 = {
    ...route,
    id: "route_workflow",
    mutationType: "skill",
    sourceFindingIds: [skillFinding.id],
  };

  it("creates valid narrowly triggered declarative SKILL.md content", () => {
    const result = generatePiSkillCandidate({
      ...common,
      route: skillRoute,
      finding: skillFinding,
      name: "focused-verification",
      description: "Verify the final edit with the narrowest relevant checks",
      trigger: "Use when an implementation changes after its last verification",
      steps: [
        "Identify the smallest check that covers the final changed behavior.",
        "Run the focused check and inspect every reported failure.",
        "Escalate to broader configured checks only after the focused check passes.",
      ],
    });
    const content = Buffer.from(result.files[0]!.after!).toString("utf8");

    expect(result.candidate.mutation).toMatchObject({
      type: "skill",
      files: [{ logicalPath: ".pi/skills/focused-verification/SKILL.md" }],
    });
    expect(content).toMatch(
      /^---\nname: focused-verification\ndescription: .+\n---\n/u,
    );
    expect(content).toContain(
      "Use when an implementation changes after its last verification",
    );
    expect(content).not.toContain("```");
    expect(result.changeEvidence[0]!.evidence).toEqual([evidence]);
  });

  it("rejects executable, project/version-specific, and broad triggers", () => {
    const base = {
      ...common,
      route: skillRoute,
      finding: skillFinding,
      name: "focused-verification",
      description: "Verify the final edit with relevant configured checks",
      trigger: "Use when an implementation changes after verification",
    };
    expect(() =>
      generatePiSkillCandidate({
        ...base,
        steps: ["Run `pnpm install` now.", "Then execute every hook."],
      }),
    ).toThrowError(PatchRaceError);
    expect(() =>
      generatePiSkillCandidate({
        ...base,
        steps: [
          "Read the PatchRace version 1.2.3 instructions.",
          "Apply the recorded procedure.",
        ],
      }),
    ).toThrowError(PatchRaceError);
    expect(() =>
      generatePiSkillCandidate({
        ...base,
        trigger: "Always",
        steps: [
          "Inspect the changed behavior before selecting a check.",
          "Use the configured verification surface.",
        ],
      }),
    ).toThrowError(PatchRaceError);
  });
});

describe("Pi prompt-template candidate generation", () => {
  const promptFinding: DiagnosisFindingV1 = {
    ...finding,
    id: "diag_prompt_workflow",
    category: "verification",
    eligibleMutationTargets: ["prompt-template"],
  };
  const promptRoute: DiagnosisMutationRouteV1 = {
    ...route,
    id: "route_prompt_workflow",
    mutationType: "prompt-template",
    sourceFindingIds: [promptFinding.id],
    invokedWorkflow: "verify-change",
  };

  it("documents an explicitly invoked workflow and typed arguments", () => {
    const result = generatePromptTemplateCandidate({
      ...common,
      route: promptRoute,
      finding: promptFinding,
      name: "verify-change",
      description: "Review a selected change and its configured verification",
      arguments: [
        {
          name: "scope",
          type: "path",
          required: true,
          description: "Project-relative scope selected by the user",
        },
      ],
      steps: [
        "Inspect the user-selected project-relative scope {{scope}}.",
        "Identify the narrowest configured verification for the changed behavior.",
        "Report the observed result and ask before expanding the scope.",
      ],
    });
    const content = Buffer.from(result.files[0]!.after!).toString("utf8");

    expect(result.candidate.mutation).toMatchObject({
      type: "prompt-template",
      files: [{ logicalPath: ".pi/prompts/verify-change.md" }],
    });
    expect(content).toContain("Invocation: user invokes `/verify-change`.");
    expect(content).toContain("type: path");
    expect(content).toContain("{{scope}}");
    expect(result.changeEvidence[0]!.evidence).toEqual([evidence]);
  });

  it("rejects unevidenced invocation, undeclared placeholders, and automatic action", () => {
    const base = {
      ...common,
      route: promptRoute,
      finding: promptFinding,
      name: "verify-change",
      description: "Review a selected change and its configured verification",
      arguments: [
        {
          name: "scope",
          type: "path" as const,
          required: true,
          description: "Project-relative scope selected by the user",
        },
      ],
    };
    expect(() =>
      generatePromptTemplateCandidate({
        ...base,
        route: { ...promptRoute, invokedWorkflow: null },
        steps: [
          "Inspect the selected scope {{scope}}.",
          "Report the configured verification surface.",
        ],
      }),
    ).toThrowError(PatchRaceError);
    expect(() =>
      generatePromptTemplateCandidate({
        ...base,
        steps: [
          "Inspect the selected scope {{missing}}.",
          "Report the configured verification surface.",
        ],
      }),
    ).toThrowError(PatchRaceError);
    expect(() =>
      generatePromptTemplateCandidate({
        ...base,
        steps: [
          "Inspect the selected scope {{scope}}.",
          "Automatically execute every configured command.",
        ],
      }),
    ).toThrowError(PatchRaceError);
  });
});
