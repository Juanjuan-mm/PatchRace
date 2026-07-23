import { describe, expect, it } from "vitest";

import type { PatchRaceBridge } from "./bridge.js";
import { registerDiagnosisCommands } from "./diagnosis.js";
import type {
  PiCommandDefinition,
  PiExtensionApi,
  PiExtensionCommandContext,
} from "./pi-api.js";
import { PATCHRACE_SESSION_ENTRY } from "./session-state.js";

const artifactHash = `sha256:${"a".repeat(64)}`;
const report = {
  source: {
    runId: "run_1",
    artifacts: [
      {
        trialId: "trial_1",
        logicalPath: "trials/trial_1/grade.json",
        hash: artifactHash,
      },
    ],
  },
  overview: {
    focusVariantId: "pi",
    claimBoundary: "Recorded task evidence only.",
  },
  cases: [
    {
      taskId: "task-1",
      trialId: "trial_1",
      variantId: "pi",
      deterministic: {
        deterministicFacts: {
          integrity: "valid",
          outcome: "failed",
          hardGates: [{ id: "tests", status: "failed" }],
        },
      },
      findings: [
        {
          id: "finding-1",
          category: "verification",
          confidence: "high",
          claim: "Tests failed after the last edit.",
          origin: "deterministic-rule",
          ruleId: "verification.failed",
          evidence: [
            {
              trialId: "trial_1",
              logicalPath: "trials/trial_1/grade.json",
              artifactHash,
              gradeGateIds: ["tests"],
            },
          ],
          alternatives: [{ claim: "The environment may differ." }],
          limitations: ["Single recorded task."],
        },
        {
          id: "hypothesis-1",
          category: "workflow",
          confidence: "low",
          claim: "An earlier focused test may help.",
          origin: "reflection",
          ruleId: null,
          evidence: [
            {
              trialId: "trial_1",
              logicalPath: "trials/trial_1/grade.json",
              artifactHash,
              gradeGateIds: ["tests"],
            },
          ],
          alternatives: [{ claim: "The model may lack capability." }],
          limitations: ["Inference only."],
        },
      ],
      classification: {
        classification: "workflow-or-configuration-gap",
        recommendation: "consider-project-workflow-mutation",
      },
    },
  ],
  caveats: ["deterministic_facts_and_hard_gates_remain_authoritative"],
};

function diagnosisHarness(confirmationsInput: readonly boolean[] = []) {
  const commands = new Map<string, PiCommandDefinition>();
  const calls: unknown[] = [];
  const editors: string[] = [];
  const notifications: { message: string; level: string }[] = [];
  const entries: unknown[] = [];
  const confirmations = [...confirmationsInput];
  const api: PiExtensionApi = {
    registerCommand: (name, definition) => commands.set(name, definition),
    appendEntry: (customType, data) => entries.push({ customType, data }),
    on: () => undefined,
  };
  const context: PiExtensionCommandContext = {
    cwd: "/repo",
    sessionManager: { getEntries: () => [] },
    waitForIdle: () => Promise.resolve(),
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      confirm: () => Promise.resolve(confirmations.shift() ?? false),
      input: () => Promise.resolve(undefined),
      select: () => Promise.resolve(undefined),
      editor: (_title, text) => {
        editors.push(text ?? "");
        return Promise.resolve(undefined);
      },
      setStatus: () => undefined,
      setWidget: () => undefined,
    },
  };
  const bridge: PatchRaceBridge = {
    execute: (invocation) => {
      calls.push(invocation);
      return Promise.resolve({
        schemaVersion: "1.0.0",
        ok: true,
        command: "diagnose",
        status: "completed",
        sideEffects: [],
        data: { runId: "run_1", report },
      });
    },
  };
  return {
    api,
    bridge,
    calls,
    commands,
    context,
    editors,
    notifications,
    entries,
  };
}

describe("Pi diagnosis commands", () => {
  it("shows facts separately from hypotheses with exact evidence", async () => {
    const value = diagnosisHarness();
    registerDiagnosisCommands(value.api, value.bridge);

    await value.commands
      .get("coach")
      ?.handler("run_1 --focus pi", value.context);

    expect(value.calls).toEqual([
      expect.objectContaining({
        arguments: ["diagnose", "run_1", "--format", "json", "--focus", "pi"],
      }),
    ]);
    expect(value.editors[0]).toContain("DETERMINISTIC FACTS (authoritative)");
    expect(value.editors[0]).toContain(
      "INFERRED HYPOTHESES (optional, low authority, cannot override facts)",
    );
    expect(value.editors[0]).toContain(
      `trials/trial_1/grade.json ${artifactHash}`,
    );
    expect(value.entries).toEqual([
      expect.objectContaining({ customType: PATCHRACE_SESSION_ENTRY }),
    ]);
  });

  it("requires explicit confirmation before requesting reflection", async () => {
    const value = diagnosisHarness([false]);
    registerDiagnosisCommands(value.api, value.bridge);

    await value.commands
      .get("diagnose")
      ?.handler("run_1 --reflect", value.context);

    expect(value.calls).toEqual([]);
    expect(value.notifications.at(-1)?.message).toContain(
      "before provider use",
    );
  });

  it("passes reflection only after confirmation and labels its authority", async () => {
    const value = diagnosisHarness([true]);
    registerDiagnosisCommands(value.api, value.bridge);

    await value.commands
      .get("diagnose")
      ?.handler("run_1 --reflect", value.context);

    expect(value.calls).toEqual([
      expect.objectContaining({
        arguments: ["diagnose", "run_1", "--format", "json", "--reflect"],
      }),
    ]);
    expect(value.editors[0]).toContain("Authority: reflection");
  });

  it("fails closed when evidence is outside the inventory", async () => {
    const value = diagnosisHarness();
    const broken = structuredClone(report);
    broken.cases[0]!.findings[0]!.evidence[0]!.artifactHash = `sha256:${"b".repeat(64)}`;
    registerDiagnosisCommands(value.api, {
      execute: () =>
        Promise.resolve({
          schemaVersion: "1.0.0",
          ok: true,
          command: "diagnose",
          status: "completed",
          sideEffects: [],
          data: { runId: "run_1", report: broken },
        }),
    });

    await value.commands.get("diagnose")?.handler("run_1", value.context);

    expect(value.editors).toEqual([]);
    expect(value.notifications.at(-1)).toEqual(
      expect.objectContaining({
        level: "error",
        message: expect.stringContaining("does not resolve"),
      }),
    );
  });
});
