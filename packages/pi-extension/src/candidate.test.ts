import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { PatchRaceBridge } from "./bridge.js";
import { registerCandidateCommands } from "./candidate.js";
import type {
  PiCommandDefinition,
  PiExtensionApi,
  PiExtensionCommandContext,
} from "./pi-api.js";

const candidateId = `cand_${"a".repeat(20)}`;
const promotionId = `promotion_${"b".repeat(20)}`;
const diff = "--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1 +1 @@\n-old\n+new\n";
const patchHash = `sha256:${createHash("sha256").update(diff).digest("hex")}`;

function reviewData(
  decision: "pending" | "approved" | "rejected" = "pending",
  promotion: unknown = null,
) {
  return {
    candidate: { candidateId },
    review: {
      reviewId: "review_123",
      candidateId,
      mutationType: "agents-guidance",
      expectedEffect: "Improve the recorded verification workflow.",
      exactDiffs: [{ logicalPath: "AGENTS.md", patchHash, unifiedDiff: diff }],
      securityFlags: ["none_detected_not_a_safety_guarantee"],
      limitations: ["approval_enables_validation_only_not_activation"],
      decision: {
        state: decision,
        reason: decision === "pending" ? null : "fixture decision",
      },
    },
    validation: { candidate: { hardGates: { correctness: true } } },
    selection: { decisions: [{ candidateId, decision: "promote-eligible" }] },
    promotion,
    claimBoundary: "Recorded validation only.",
  };
}

function candidateHarness(options: {
  readonly selections?: readonly (string | undefined)[];
  readonly confirmations?: readonly boolean[];
  readonly inputs?: readonly (string | undefined)[];
  readonly responder: (arguments_: readonly string[]) => unknown;
}) {
  const commands = new Map<string, PiCommandDefinition>();
  const calls: string[][] = [];
  const editors: string[] = [];
  const notifications: { message: string; level: string }[] = [];
  const selections = [...(options.selections ?? [])];
  const confirmations = [...(options.confirmations ?? [])];
  const inputs = [...(options.inputs ?? [])];
  const api: PiExtensionApi = {
    registerCommand: (name, definition) => commands.set(name, definition),
    appendEntry: () => undefined,
    on: () => undefined,
  };
  const context: PiExtensionCommandContext = {
    cwd: "/repo",
    sessionManager: { getEntries: () => [] },
    waitForIdle: () => Promise.resolve(),
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      select: () => Promise.resolve(selections.shift()),
      confirm: () => Promise.resolve(confirmations.shift() ?? false),
      input: () => Promise.resolve(inputs.shift()),
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
      calls.push([...invocation.arguments]);
      return Promise.resolve({
        schemaVersion: "1.0.0",
        ok: true,
        command:
          invocation.arguments[0] === "candidate"
            ? "candidate review"
            : "promote",
        status: "completed",
        sideEffects: [],
        data: options.responder(invocation.arguments),
      });
    },
  };
  return { api, bridge, calls, commands, context, editors, notifications };
}

describe("Pi candidate commands", () => {
  it("shows exact diff, validation, safety, and appends explicit approval", async () => {
    const value = candidateHarness({
      selections: ["Approve for validation"],
      confirmations: [true],
      inputs: ["Evidence supports validation"],
      responder: (arguments_) =>
        arguments_[1] === "review" ? reviewData() : { decided: true },
    });
    registerCandidateCommands(value.api, value.bridge);

    await value.commands.get("review")?.handler(candidateId, value.context);

    expect(value.editors[0]).toContain("EXACT DIFFS (hash-verified)");
    expect(value.editors[0]).toContain("none_detected_not_a_safety_guarantee");
    expect(value.editors[0]).toContain('"correctness": true');
    expect(value.calls).toEqual([
      ["candidate", "review", candidateId],
      [
        "candidate",
        "decide",
        candidateId,
        "--approve",
        "--reason",
        "Evidence supports validation",
      ],
    ]);
  });

  it("fails closed when the exact diff hash does not match", async () => {
    const value = candidateHarness({
      responder: () => {
        const broken = reviewData();
        broken.review.exactDiffs[0]!.patchHash = `sha256:${"0".repeat(64)}`;
        return broken;
      },
    });
    registerCandidateCommands(value.api, value.bridge);

    await value.commands.get("review")?.handler(candidateId, value.context);

    expect(value.editors).toEqual([]);
    expect(value.notifications.at(-1)).toEqual(
      expect.objectContaining({
        level: "error",
        message: expect.stringContaining("hash mismatch"),
      }),
    );
  });

  it("previews promotion and requires a second confirmation before writes", async () => {
    const value = candidateHarness({
      selections: ["Promote project-local candidate"],
      confirmations: [true],
      responder: (arguments_) =>
        arguments_.includes("--preview")
          ? { promotionId, targets: [{ logicalPath: "AGENTS.md" }] }
          : { promotionId, state: "promoted" },
    });
    registerCandidateCommands(value.api, value.bridge);

    await value.commands.get("promote")?.handler(candidateId, value.context);

    expect(value.calls).toEqual([
      ["promote", candidateId, "--preview", "--target", "project"],
      ["promote", candidateId, "--confirm", "--target", "project"],
    ]);
    expect(value.editors[0]).toContain(promotionId);
    expect(value.notifications.at(-1)?.message).toContain("promoted");
  });

  it("previews rollback and restores only after explicit confirmation", async () => {
    const value = candidateHarness({
      confirmations: [true],
      responder: (arguments_) =>
        arguments_.includes("--preview")
          ? { promotionId, targets: [{ logicalPath: "AGENTS.md" }] }
          : { promotionId, state: "rolled-back" },
    });
    registerCandidateCommands(value.api, value.bridge);

    await value.commands.get("rollback")?.handler(promotionId, value.context);

    expect(value.calls).toEqual([
      ["rollback", promotionId, "--preview"],
      ["rollback", promotionId, "--confirm"],
    ]);
    expect(value.notifications.at(-1)?.message).toContain("exact preimages");
  });
});
