import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { CommandResult } from "@patchrace/core";

import type { PatchRaceBridge } from "./bridge.js";
import { createPatchRaceExtension } from "./index.js";
import type {
  PiCommandDefinition,
  PiExtensionApi,
  PiExtensionCommandContext,
  PiSessionEntry,
} from "./pi-api.js";

const runId = "run_01K0FAKE000000000000000000";
const candidateId = `cand_${"a".repeat(20)}`;
const promotionId = `promotion_${"b".repeat(20)}`;
const artifactHash = `sha256:${"c".repeat(64)}`;
const unifiedDiff =
  "--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1 +1 @@\n-old\n+new\n";
const patchHash = `sha256:${createHash("sha256")
  .update(unifiedDiff)
  .digest("hex")}`;

function result(
  command: CommandResult["command"],
  data: unknown,
  status: CommandResult["status"] = "completed",
): CommandResult {
  return {
    schemaVersion: "1.0.0",
    ok: true,
    command,
    status,
    sideEffects: [],
    data,
  };
}

const diagnosis = {
  runId,
  report: {
    source: {
      runId,
      artifacts: [
        {
          trialId: "trial_01K0FAKE000000000000000000",
          logicalPath: "trials/pi/grade.json",
          hash: artifactHash,
        },
      ],
    },
    overview: {
      focusVariantId: "pi",
      claimBoundary: "Recorded workflow fixture only.",
    },
    cases: [
      {
        taskId: "task-1",
        trialId: "trial_01K0FAKE000000000000000000",
        deterministic: {
          deterministicFacts: {
            integrity: "valid",
            outcome: "failed",
            hardGates: [{ id: "tests", status: "failed" }],
          },
        },
        findings: [
          {
            category: "workflow",
            confidence: "high",
            claim: "The recorded workflow skipped focused verification.",
            origin: "deterministic-rule",
            ruleId: "verification.stale",
            evidence: [
              {
                trialId: "trial_01K0FAKE000000000000000000",
                logicalPath: "trials/pi/grade.json",
                artifactHash,
                gradeGateIds: ["tests"],
              },
            ],
            alternatives: [{ claim: "The task may be environment-sensitive." }],
            limitations: ["One recorded task."],
          },
        ],
        classification: {
          classification: "workflow-or-configuration-gap",
          recommendation: "consider-project-workflow-mutation",
        },
      },
    ],
    caveats: ["deterministic_facts_and_hard_gates_remain_authoritative"],
  },
};

const candidateReview = {
  candidate: { candidateId },
  review: {
    reviewId: "review_fixture",
    candidateId,
    mutationType: "agents-guidance",
    expectedEffect: "Run focused verification after the declared change.",
    exactDiffs: [{ logicalPath: "AGENTS.md", patchHash, unifiedDiff }],
    securityFlags: ["none_detected_not_a_safety_guarantee"],
    limitations: [
      "approval_enables_validation_only_not_activation",
      "generated_instructions_remain_untrusted_until_validated",
    ],
    decision: {
      state: "approved",
      reason: "Fixture review approved for validation.",
    },
  },
  validation: {
    candidate: {
      hardGates: {
        integrity: true,
        correctness: true,
        safety: true,
        protectedPaths: true,
      },
    },
  },
  selection: {
    decisions: [{ candidateId, decision: "promote-eligible" }],
  },
  promotion: {
    promotionId,
    targets: [{ logicalPath: "AGENTS.md", operation: "update" }],
  },
  claimBoundary: "Recorded validation fixture only.",
};

describe("complete Pi-native workflow", () => {
  it("keeps one session across race, coach, review, promote, and rollback", async () => {
    const commands = new Map<string, PiCommandDefinition>();
    const entries: PiSessionEntry[] = [];
    const calls: string[][] = [];
    const editors: string[] = [];
    const selections = [
      "Keep status",
      "Preview promotion",
      "Promote project-local candidate",
    ];
    const confirmations = [true, true, true];
    const api: PiExtensionApi = {
      registerCommand: (name, definition) => commands.set(name, definition),
      appendEntry: (customType, data) =>
        entries.push({ type: "custom", customType, data }),
      on: () => undefined,
    };
    const context: PiExtensionCommandContext = {
      cwd: "/trusted/project",
      sessionManager: { getEntries: () => entries },
      waitForIdle: () => Promise.resolve(),
      ui: {
        notify: () => undefined,
        confirm: () => Promise.resolve(confirmations.shift() ?? false),
        input: () => Promise.resolve(undefined),
        select: () => Promise.resolve(selections.shift()),
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
        const arguments_ = [...invocation.arguments];
        calls.push(arguments_);
        if (arguments_[0] === "race")
          return Promise.resolve(result("race", { runId, report: {} }));
        if (arguments_[0] === "diagnose")
          return Promise.resolve(result("diagnose", diagnosis));
        if (arguments_[0] === "candidate")
          return Promise.resolve(result("candidate review", candidateReview));
        if (arguments_[0] === "promote")
          return Promise.resolve(
            result(
              "promote",
              arguments_.includes("--preview")
                ? candidateReview.promotion
                : { promotionId, state: "promoted" },
              arguments_.includes("--preview") ? "dry-run" : "completed",
            ),
          );
        if (arguments_[0] === "rollback")
          return Promise.resolve(
            result(
              "rollback",
              arguments_.includes("--preview")
                ? {
                    promotionId,
                    targets: [
                      {
                        logicalPath: "AGENTS.md",
                        restoreHash: `sha256:${"d".repeat(64)}`,
                      },
                    ],
                  }
                : { promotionId, state: "rolled-back" },
              arguments_.includes("--preview") ? "dry-run" : "completed",
            ),
          );
        throw new Error(`Unexpected workflow command: ${arguments_.join(" ")}`);
      },
    };
    createPatchRaceExtension({ bridge })(api);

    await commands
      .get("race")
      ?.handler("--config .patchrace/suite.yaml --repeat 1", context);
    await commands.get("coach")?.handler(runId, context);
    await commands.get("review")?.handler(candidateId, context);
    await commands.get("rollback")?.handler(promotionId, context);

    expect(calls).toEqual([
      ["race", "--config", ".patchrace/suite.yaml", "--repeat", "1"],
      ["diagnose", runId, "--format", "json"],
      ["candidate", "review", candidateId],
      ["promote", candidateId, "--preview", "--target", "project"],
      ["promote", candidateId, "--confirm", "--target", "project"],
      ["rollback", promotionId, "--preview"],
      ["rollback", promotionId, "--confirm"],
    ]);
    expect(entries).toHaveLength(2);
    expect(editors.join("\n")).toContain("DETERMINISTIC FACTS");
    expect(editors.join("\n")).toContain("EXACT DIFFS (hash-verified)");
    expect(editors.join("\n")).toContain('"state": "promoted"');
    expect(editors.join("\n")).toContain('"state": "rolled-back"');
  });
});
