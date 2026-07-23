import { createHash } from "node:crypto";

import { tokenizeArguments } from "./arguments.js";
import type { PatchRaceBridge } from "./bridge.js";
import type { PiExtensionApi, PiExtensionCommandContext } from "./pi-api.js";

const CANDIDATE_STATUS = "patchrace-candidate";

interface ExactDiff {
  readonly logicalPath: string;
  readonly patchHash: string;
  readonly unifiedDiff: string;
}

interface ReviewView {
  readonly candidateId: string;
  readonly reviewId: string;
  readonly mutationType: string;
  readonly expectedEffect: string;
  readonly exactDiffs: readonly ExactDiff[];
  readonly securityFlags: readonly string[];
  readonly limitations: readonly string[];
  readonly decision: "pending" | "approved" | "rejected";
  readonly decisionReason: string | null;
  readonly validation: unknown;
  readonly selection: unknown;
  readonly promotion: unknown;
  readonly claimBoundary: string | null;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`Candidate ${label} has an incompatible object shape.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string")
    throw new Error(`Candidate review is missing ${label}.`);
  return value;
}

function strings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(`Candidate review has invalid ${label}.`);
  return value as readonly string[];
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function parseReview(data: unknown): ReviewView {
  const payload = record(data, "payload");
  const review = record(payload["review"], "review");
  const exactDiffsValue = review["exactDiffs"];
  if (!Array.isArray(exactDiffsValue) || exactDiffsValue.length === 0)
    throw new Error("Candidate review contains no exact diff.");
  const exactDiffs = exactDiffsValue.map((item): ExactDiff => {
    const diff = record(item, "diff");
    const value = {
      logicalPath: text(diff["logicalPath"], "diff.logicalPath"),
      patchHash: text(diff["patchHash"], "diff.patchHash"),
      unifiedDiff: text(diff["unifiedDiff"], "diff.unifiedDiff"),
    };
    if (sha256(value.unifiedDiff) !== value.patchHash)
      throw new Error(
        `Candidate diff hash mismatch for '${value.logicalPath}'.`,
      );
    return value;
  });
  const decisionValue = record(review["decision"], "decision");
  const decision = text(decisionValue["state"], "decision.state");
  if (
    decision !== "pending" &&
    decision !== "approved" &&
    decision !== "rejected"
  )
    throw new Error(`Candidate review has unknown decision '${decision}'.`);
  const flags = strings(review["securityFlags"], "securityFlags");
  if (flags.length === 0)
    throw new Error("Candidate review must disclose safety flags.");
  return {
    candidateId: text(review["candidateId"], "candidateId"),
    reviewId: text(review["reviewId"], "reviewId"),
    mutationType: text(review["mutationType"], "mutationType"),
    expectedEffect: text(review["expectedEffect"], "expectedEffect"),
    exactDiffs,
    securityFlags: flags,
    limitations: strings(review["limitations"], "limitations"),
    decision,
    decisionReason:
      decisionValue["reason"] === null
        ? null
        : text(decisionValue["reason"], "decision.reason"),
    validation: payload["validation"] ?? null,
    selection: payload["selection"] ?? null,
    promotion: payload["promotion"] ?? null,
    claimBoundary:
      payload["claimBoundary"] === null
        ? null
        : text(payload["claimBoundary"], "claimBoundary"),
  };
}

function reviewText(value: ReviewView): string {
  return [
    `PATCHRACE CANDIDATE ${value.candidateId}`,
    `Review: ${value.reviewId}`,
    `Mutation: ${value.mutationType}`,
    `Decision: ${value.decision}${value.decisionReason === null ? "" : ` — ${value.decisionReason}`}`,
    `Expected effect: ${value.expectedEffect}`,
    "",
    "EXACT DIFFS (hash-verified)",
    ...value.exactDiffs.flatMap((diff) => [
      `--- ${diff.logicalPath}`,
      `Patch hash: ${diff.patchHash}`,
      diff.unifiedDiff,
    ]),
    "",
    "SAFETY FLAGS",
    ...value.securityFlags.map((flag) => `- ${flag}`),
    "",
    "VALIDATION EVIDENCE",
    JSON.stringify(value.validation, null, 2),
    "",
    "SELECTION EVIDENCE",
    JSON.stringify(value.selection, null, 2),
    "",
    "LIMITATIONS / AUTHORITY",
    ...value.limitations.map((item) => `- ${item}`),
    ...(value.claimBoundary === null
      ? []
      : [`Claim boundary: ${value.claimBoundary}`]),
  ].join("\n");
}

async function promotionFlow(
  candidateId: string,
  bridge: PatchRaceBridge,
  context: PiExtensionCommandContext,
): Promise<void> {
  const preview = await bridge.execute({
    cwd: context.cwd,
    arguments: ["promote", candidateId, "--preview", "--target", "project"],
  });
  await context.ui.editor(
    `Promotion preview: ${candidateId}`,
    JSON.stringify(preview.data ?? null, null, 2),
  );
  const selected = await context.ui.select("Promotion preview complete", [
    "Promote project-local candidate",
    "Cancel",
  ]);
  if (selected !== "Promote project-local candidate") {
    context.ui.notify(
      "Candidate promotion cancelled after preview.",
      "warning",
    );
    return;
  }
  const confirmed = await context.ui.confirm(
    "Promote candidate?",
    `Apply only the previewed project-local targets for ${candidateId}? PatchRace will record exact preimages for rollback. This does not commit, push, publish, or modify global Pi state.`,
  );
  if (!confirmed) {
    context.ui.notify(
      "Candidate promotion cancelled before writes.",
      "warning",
    );
    return;
  }
  const result = await bridge.execute({
    cwd: context.cwd,
    arguments: ["promote", candidateId, "--confirm", "--target", "project"],
  });
  await context.ui.editor(
    `Promotion completed: ${candidateId}`,
    JSON.stringify(result.data ?? null, null, 2),
  );
  context.ui.notify("Project-local candidate promoted.", "info");
}

async function rollbackFlow(
  promotionId: string,
  bridge: PatchRaceBridge,
  context: PiExtensionCommandContext,
): Promise<void> {
  const preview = await bridge.execute({
    cwd: context.cwd,
    arguments: ["rollback", promotionId, "--preview"],
  });
  await context.ui.editor(
    `Rollback preview: ${promotionId}`,
    JSON.stringify(preview.data ?? null, null, 2),
  );
  const confirmed = await context.ui.confirm(
    "Rollback promotion?",
    `Restore the exact recorded preimages for ${promotionId}? PatchRace will refuse if any promoted file diverged.`,
  );
  if (!confirmed) {
    context.ui.notify("Rollback cancelled before writes.", "warning");
    return;
  }
  const result = await bridge.execute({
    cwd: context.cwd,
    arguments: ["rollback", promotionId, "--confirm"],
  });
  await context.ui.editor(
    `Rollback completed: ${promotionId}`,
    JSON.stringify(result.data ?? null, null, 2),
  );
  context.ui.notify("Promotion rolled back to exact preimages.", "info");
}

async function decide(
  candidateId: string,
  decision: "approve" | "reject",
  bridge: PatchRaceBridge,
  context: PiExtensionCommandContext,
): Promise<void> {
  const reason = await context.ui.input(
    decision === "approve" ? "Approval reason" : "Rejection reason",
  );
  if (reason === undefined || reason.trim().length < 8) {
    context.ui.notify(
      "Candidate decision requires a reason of at least 8 characters.",
      "warning",
    );
    return;
  }
  const confirmed = await context.ui.confirm(
    decision === "approve" ? "Approve for validation?" : "Reject candidate?",
    decision === "approve"
      ? "Approval enables validation only. It does not activate or promote the candidate."
      : "Rejection is terminal for this review; evidence remains retained.",
  );
  if (!confirmed) {
    context.ui.notify("Candidate decision cancelled.", "warning");
    return;
  }
  await bridge.execute({
    cwd: context.cwd,
    arguments: [
      "candidate",
      "decide",
      candidateId,
      decision === "approve" ? "--approve" : "--reject",
      "--reason",
      reason.trim(),
    ],
  });
  context.ui.notify(
    decision === "approve"
      ? "Candidate approved for validation only."
      : "Candidate rejected; evidence retained.",
    "info",
  );
}

async function reviewFlow(
  candidateId: string,
  bridge: PatchRaceBridge,
  context: PiExtensionCommandContext,
): Promise<void> {
  const result = await bridge.execute({
    cwd: context.cwd,
    arguments: ["candidate", "review", candidateId],
  });
  const view = parseReview(result.data);
  if (view.candidateId !== candidateId)
    throw new Error("Candidate review does not match the requested ID.");
  await context.ui.editor(`Candidate review: ${candidateId}`, reviewText(view));
  const actions =
    view.decision === "pending"
      ? ["Approve for validation", "Reject candidate", "Keep pending"]
      : view.promotion !== null && view.decision === "approved"
        ? ["Preview promotion", "Close"]
        : ["Close"];
  const selected = await context.ui.select("Candidate action", actions);
  if (selected === "Approve for validation")
    await decide(candidateId, "approve", bridge, context);
  else if (selected === "Reject candidate")
    await decide(candidateId, "reject", bridge, context);
  else if (selected === "Preview promotion")
    await promotionFlow(candidateId, bridge, context);
}

function oneIdentifier(rawArguments: string, usage: string): string {
  const tokens = tokenizeArguments(rawArguments);
  if (tokens.length !== 1) throw new Error(usage);
  return tokens[0]!;
}

export function registerCandidateCommands(
  pi: PiExtensionApi,
  bridge: PatchRaceBridge,
): void {
  pi.registerCommand("review", {
    description: "Review exact candidate diff, evidence, flags, and decision",
    handler: async (rawArguments, context) => {
      try {
        const candidateId = oneIdentifier(
          rawArguments,
          "Usage: /review <candidate-id>",
        );
        await context.waitForIdle();
        context.ui.setStatus(CANDIDATE_STATUS, `reviewing ${candidateId}`);
        await reviewFlow(candidateId, bridge, context);
      } catch (error) {
        context.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      } finally {
        context.ui.setStatus(CANDIDATE_STATUS, undefined);
      }
    },
  });
  pi.registerCommand("promote", {
    description: "Preview then promote an eligible project-local candidate",
    handler: async (rawArguments, context) => {
      try {
        const candidateId = oneIdentifier(
          rawArguments,
          "Usage: /promote <candidate-id>",
        );
        await context.waitForIdle();
        context.ui.setStatus(CANDIDATE_STATUS, `previewing ${candidateId}`);
        await promotionFlow(candidateId, bridge, context);
      } catch (error) {
        context.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      } finally {
        context.ui.setStatus(CANDIDATE_STATUS, undefined);
      }
    },
  });
  pi.registerCommand("rollback", {
    description: "Preview then restore an exact PatchRace promotion preimage",
    handler: async (rawArguments, context) => {
      try {
        const promotionId = oneIdentifier(
          rawArguments,
          "Usage: /rollback <promotion-id>",
        );
        await context.waitForIdle();
        context.ui.setStatus(CANDIDATE_STATUS, `previewing ${promotionId}`);
        await rollbackFlow(promotionId, bridge, context);
      } catch (error) {
        context.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      } finally {
        context.ui.setStatus(CANDIDATE_STATUS, undefined);
      }
    },
  });
}
