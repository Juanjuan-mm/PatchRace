import { describe, expect, it } from "vitest";
import type {
  ReflectionEvidenceBundleV1,
  RuleDiagnosisV1,
  TrialId,
} from "@patchrace/contracts";

import {
  reflectDiagnosis,
  type ReflectionProvider,
  type ReflectionProviderInput,
} from "./reflection.js";

const hash = `sha256:${"a".repeat(64)}` as const;
const trialId = "trial_01J000000000000000000000001" as TrialId;
const deterministic: RuleDiagnosisV1 = {
  schemaVersion: "1.0.0",
  diagnosisSchemaVersion: "1.0.0",
  trialId,
  deterministicFacts: {
    integrity: "valid",
    outcome: "failed",
    hardGates: [{ id: "test", status: "failed" }],
  },
  findings: [],
  limitations: [],
};
const evidence: ReflectionEvidenceBundleV1 = {
  schemaVersion: "1.0.0",
  redaction: "redacted",
  sourceHash: hash,
  items: [
    {
      id: "ev-1",
      summary: "A redacted test failed after the final edit.",
      citation: {
        runId: "run_01J000000000000000000000001",
        trialId,
        artifactHash: hash,
        logicalPath: "redacted/trace.jsonl",
        eventIds: ["e1", "e2"],
      },
    },
  ],
  limitations: ["paths_redacted"],
};

class StubProvider implements ReflectionProvider {
  readonly id = "stub";
  readonly version = "1";
  readonly model = "fixture";
  seen: ReflectionProviderInput | null = null;

  constructor(private readonly output: unknown) {}

  reflect(input: ReflectionProviderInput): Promise<unknown> {
    this.seen = input;
    return Promise.resolve(this.output);
  }
}

describe("optional reflective diagnosis", () => {
  it("passes only the bounded redacted bundle and returns low-confidence hypotheses", async () => {
    const provider = new StubProvider({
      hypotheses: [
        {
          category: "workflow",
          claim: "The final iteration may have stopped before revalidation.",
          evidenceIds: ["ev-1"],
          alternatives: ["The edit may be unrelated to the failure."],
          limitations: ["No intent is observable."],
        },
      ],
    });
    const reflected = await reflectDiagnosis({
      deterministic,
      evidence,
      provider,
      signal: new AbortController().signal,
    });
    expect(provider.seen?.evidence).toEqual(evidence);
    expect(provider.seen?.deterministicFacts).toEqual(
      deterministic.deterministicFacts,
    );
    expect(reflected.deterministic).toBe(deterministic);
    expect(reflected.hypotheses[0]).toMatchObject({
      category: "workflow",
      confidence: "low",
      origin: "reflection",
      eligibleMutationTargets: [],
      evidence: [evidence.items[0]?.citation],
    });
    expect(reflected.limitations).toContain(
      "reflection_cannot_override_deterministic_facts_or_findings",
    );
  });

  it("rejects output that tries to add deterministic facts", async () => {
    const provider = new StubProvider({
      hypotheses: [],
      deterministicFacts: { outcome: "passed" },
    });
    await expect(
      reflectDiagnosis({
        deterministic,
        evidence,
        provider,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/unsupported fields/);
  });

  it("rejects forged evidence references and invalid categories", async () => {
    const forged = new StubProvider({
      hypotheses: [
        {
          category: "capability",
          claim: "Unsupported capability hypothesis.",
          evidenceIds: ["not-allowlisted"],
          alternatives: [],
          limitations: [],
        },
      ],
    });
    await expect(
      reflectDiagnosis({
        deterministic,
        evidence,
        provider: forged,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/only evidence IDs/);

    const invalid = new StubProvider({
      hypotheses: [
        {
          category: "reasoning",
          claim: "Invalid private-reasoning category.",
          evidenceIds: ["ev-1"],
          alternatives: [],
          limitations: [],
        },
      ],
    });
    await expect(
      reflectDiagnosis({
        deterministic,
        evidence,
        provider: invalid,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/invalid category/);
  });
});
