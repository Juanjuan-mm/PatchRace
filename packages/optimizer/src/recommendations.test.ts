import { describe, expect, it } from "vitest";

import {
  PatchRaceError,
  sha256,
  type DiagnosisMutationRouteV1,
  type EvidenceCitationV1,
} from "@patchrace/contracts";

import {
  generateModelRecommendation,
  generateSettingsRecommendation,
  generateToolRecommendation,
} from "./recommendations.js";

const evidence: EvidenceCitationV1 = {
  runId: "run_01K0FAKE000000000000000000",
  trialId: "trial_01K0FAKE000000000000000000",
  artifactHash: sha256("evidence"),
  logicalPath: "trials/focus/result.json",
};
const modelRoute: DiagnosisMutationRouteV1 = {
  schemaVersion: "1.0.0",
  routeSchemaVersion: "1.0.0",
  id: "route_model",
  disposition: "recommendation",
  mutationType: null,
  recommendationKind: "model-advice",
  sourceFindingIds: ["diag_unknown"],
  evidence: [evidence],
  rationale: [],
  invokedWorkflow: null,
  limitations: ["capability_is_likely_not_proven"],
};
const toolRoute: DiagnosisMutationRouteV1 = {
  ...modelRoute,
  id: "route_tool",
  recommendationKind: "manual-tool",
};

describe("settings, model, and tool recommendations", () => {
  it("keeps controlled capability advice manual and diffable", () => {
    const result = generateModelRecommendation({
      route: modelRoute,
      currentModel: "model-small",
      proposedModel: "model-large",
    });

    expect(result).toMatchObject({
      kind: "model",
      capabilityAware: true,
      manualOnly: true,
      autoActions: [],
    });
    expect(result.canonicalDiff).toContain('-{"model":"model-small"}');
    expect(result.canonicalDiff).toContain('+{"model":"model-large"}');
    expect(result.evidence).toEqual([evidence]);
  });

  it("produces inert tool advice without installing or authenticating", () => {
    const result = generateToolRecommendation({
      route: toolRoute,
      tool: "Pi CLI",
      readiness: "missing",
      manualAction:
        "Review the official readiness instructions outside this run.",
    });

    expect(result).toMatchObject({
      kind: "tool",
      manualOnly: true,
      proposed: { readiness: "review-required" },
    });
    expect(result.warnings).toContain(
      "no_installation_or_authentication_was_performed",
    );
  });

  it("allowlists settings and rejects secrets, packages, and command payloads", () => {
    const settingsRoute: DiagnosisMutationRouteV1 = {
      ...modelRoute,
      id: "route_settings",
      disposition: "candidate",
      mutationType: "settings",
      recommendationKind: null,
    };
    expect(
      generateSettingsRecommendation({
        route: settingsRoute,
        before: { thinkingLevel: "low" },
        proposed: { thinkingLevel: "medium" },
      }),
    ).toMatchObject({ kind: "settings", manualOnly: true });
    expect(() =>
      generateSettingsRecommendation({
        route: settingsRoute,
        before: {},
        proposed: { apiKey: "secret-value" },
      }),
    ).toThrowError(PatchRaceError);
    expect(() =>
      generateToolRecommendation({
        route: toolRoute,
        tool: "Pi CLI",
        readiness: "missing",
        manualAction: "Run npm install pi immediately.",
      }),
    ).toThrowError(PatchRaceError);
  });
});
