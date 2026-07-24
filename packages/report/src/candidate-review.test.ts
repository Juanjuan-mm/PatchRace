import { describe, expect, it } from "vitest";

import { sha256, type CandidateReviewV1 } from "@patchrace/contracts";

import {
  renderCandidateReviewHtml,
  renderCandidateReviewJson,
} from "./candidate-review.js";

const review: CandidateReviewV1 = {
  schemaVersion: "1.0.0",
  reviewSchemaVersion: "1.0.0",
  reviewId: "review_fixture",
  candidateId: "cand_fixture",
  candidateHash: sha256("candidate"),
  mutationType: "agents-guidance",
  sourceDiagnoses: [
    {
      id: "diag_fixture",
      category: "context",
      confidence: "high",
      claim: "<script>alert(1)</script>",
      evidence: [
        {
          runId: "run_fixture",
          trialId: "trial_fixture",
          artifactHash: sha256("grade"),
          logicalPath: "grade.json",
        },
      ],
    },
  ],
  exactDiffs: [
    {
      logicalPath: "AGENTS.md",
      patchHash: sha256("patch"),
      unifiedDiff: "+<img src=x onerror=alert(1)>",
    },
  ],
  securityFlags: ["review-required"],
  expectedEffect: "Improve the recorded validation behavior.",
  cost: {
    addedLines: 1,
    removedLines: 0,
    contextTokenDelta: 4,
    estimatedContextTokensAfter: 4,
  },
  limitations: ["untrusted"],
  controls: {
    approve: true,
    reject: true,
    validationEnabled: false,
    activationEnabled: false,
  },
  decision: { state: "pending", reason: null, reviewedAt: null },
};

describe("candidate review rendering", () => {
  it("renders canonical JSON and inert escaped HTML", () => {
    expect(JSON.parse(renderCandidateReviewJson(review))).toEqual(review);
    const html = renderCandidateReviewHtml(review);
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Approve for validation");
    expect(html).toContain("activation remains disabled");
  });
});
