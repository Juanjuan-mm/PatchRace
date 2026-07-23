import {
  canonicalJson,
  type DiagnosisReportV1,
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

function list(values: readonly string[]): string {
  return values.length === 0
    ? "<p>None recorded.</p>"
    : `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

function citation(value: EvidenceCitationV1): string {
  const eventIds = value.eventIds?.join(", ") ?? "none";
  const gateIds = value.gradeGateIds?.join(", ") ?? "none";
  return `<li><code>${escapeHtml(value.logicalPath)}</code> — ${escapeHtml(value.artifactHash)}; events: ${escapeHtml(eventIds)}; gates: ${escapeHtml(gateIds)}</li>`;
}

export function renderDiagnosisReportJson(report: DiagnosisReportV1): string {
  return `${canonicalJson(report)}\n`;
}

export function renderDiagnosisStaticHtml(report: DiagnosisReportV1): string {
  const cases = report.cases
    .map((item) => {
      const findings = item.findings
        .map(
          (finding) =>
            `<article><h4>${escapeHtml(finding.category)} — ${escapeHtml(finding.confidence)}</h4><p>${escapeHtml(finding.claim)}</p><dl><dt>Origin</dt><dd>${escapeHtml(finding.origin)}</dd><dt>Rule</dt><dd>${escapeHtml(finding.ruleId ?? "none")}</dd><dt>Eligible mutation targets</dt><dd>${escapeHtml(finding.eligibleMutationTargets.join(", ") || "none")}</dd></dl><h5>Evidence</h5><ul>${finding.evidence.map(citation).join("")}</ul><h5>Alternative explanations</h5>${list(finding.alternatives.map((alternative) => alternative.claim))}<h5>Limitations</h5>${list(finding.limitations)}</article>`,
        )
        .join("");
      const facts = item.deterministic.deterministicFacts;
      return `<section><h2>${escapeHtml(item.taskId)} / ${escapeHtml(item.variantId)}</h2><p>Trial: ${escapeHtml(item.trialId)}</p><p>Deterministic outcome: ${escapeHtml(facts.outcome)}; integrity: ${escapeHtml(facts.integrity)}.</p><h3>Gap classification</h3><p>${escapeHtml(item.classification.classification)} (${escapeHtml(item.classification.confidence)}): ${escapeHtml(item.classification.recommendation)}</p><h3>Findings</h3>${findings}</section>`;
    })
    .join("");
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"><title>${escapeHtml(report.overview.title)}</title></head><body><main><h1>${escapeHtml(report.overview.title)}</h1><p>${escapeHtml(report.overview.claimBoundary)}</p><dl><dt>Run</dt><dd>${escapeHtml(report.source.runId)}</dd><dt>Plan</dt><dd>${escapeHtml(report.source.planHash)}</dd><dt>Focus variant</dt><dd>${escapeHtml(report.overview.focusVariantId)}</dd><dt>Cases</dt><dd>${report.overview.caseCount}</dd><dt>Findings</dt><dd>${report.overview.findingCount}</dd></dl>${cases}<section><h2>Caveats</h2>${list(report.caveats)}</section></main></body></html>\n`;
}
