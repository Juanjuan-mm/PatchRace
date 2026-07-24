import {
  canonicalJson,
  type CandidateReviewV1,
  type EvidenceCitationV1,
} from "@patchrace/contracts";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function citation(value: EvidenceCitationV1): string {
  return `<li><code>${escapeHtml(value.logicalPath)}</code> — ${escapeHtml(value.artifactHash)}</li>`;
}

export function renderCandidateReviewJson(review: CandidateReviewV1): string {
  return `${canonicalJson(review)}\n`;
}

export function renderCandidateReviewHtml(review: CandidateReviewV1): string {
  const diagnoses = review.sourceDiagnoses
    .map(
      (diagnosis) =>
        `<article><h3>${escapeHtml(diagnosis.category)} — ${escapeHtml(diagnosis.confidence)}</h3><p>${escapeHtml(diagnosis.claim)}</p><ul>${diagnosis.evidence.map(citation).join("")}</ul></article>`,
    )
    .join("");
  const diffs = review.exactDiffs
    .map(
      (diff) =>
        `<article><h3>${escapeHtml(diff.logicalPath)}</h3><p>${escapeHtml(diff.patchHash)}</p><pre>${escapeHtml(diff.unifiedDiff)}</pre></article>`,
    )
    .join("");
  const flags = review.securityFlags
    .map((flag) => `<li>${escapeHtml(flag)}</li>`)
    .join("");
  const limitations = review.limitations
    .map((limitation) => `<li>${escapeHtml(limitation)}</li>`)
    .join("");
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"><title>Candidate review</title></head><body><main><h1>Candidate review</h1><p>Candidate: ${escapeHtml(review.candidateId)}</p><p>Expected effect: ${escapeHtml(review.expectedEffect)}</p><p>Cost: +${review.cost.addedLines}/-${review.cost.removedLines} lines; context token estimate delta ${review.cost.contextTokenDelta}; after ${review.cost.estimatedContextTokensAfter}.</p><section><h2>Source diagnoses</h2>${diagnoses}</section><section><h2>Exact diffs</h2>${diffs}</section><section><h2>Security flags</h2><ul>${flags}</ul></section><section><h2>Limitations</h2><ul>${limitations}</ul></section><section><h2>Decision controls</h2><p>State: ${escapeHtml(review.decision.state)}. Approval enables validation only; activation remains disabled.</p><button type="button"${review.controls.approve ? "" : " disabled"}>Approve for validation</button><button type="button"${review.controls.reject ? "" : " disabled"}>Reject</button></section></main></body></html>\n`;
}
