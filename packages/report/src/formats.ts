import {
  canonicalJson,
  type ComparisonReportV1,
  type JsonValue,
} from "@patchrace/contracts";

export function renderReportJson(report: ComparisonReportV1): string {
  return `${canonicalJson(report)}\n`;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderJUnitXml(report: ComparisonReportV1): string {
  const failures = report.trials.filter(
    (trial) =>
      trial.outcome === "failed" ||
      trial.integrity === "compromised" ||
      trial.hardGates.some(
        (gate) => gate.status === "failed" || gate.status === "error",
      ),
  ).length;
  const skipped = report.trials.filter(
    (trial) => trial.outcome === "unavailable" || trial.integrity === "unknown",
  ).length;
  const cases = report.trials
    .map((trial) => {
      const name = xml(
        `${trial.taskId} / ${trial.variantId} / ${trial.repetition}`,
      );
      const duration =
        trial.metrics.durationMs.value === null
          ? "0"
          : String(trial.metrics.durationMs.value / 1000);
      const failed =
        trial.outcome === "failed" ||
        trial.integrity === "compromised" ||
        trial.hardGates.some(
          (gate) => gate.status === "failed" || gate.status === "error",
        );
      const unavailable =
        trial.outcome === "unavailable" || trial.integrity === "unknown";
      const detail = xml(
        canonicalJson({
          integrity: trial.integrity,
          outcome: trial.outcome,
          hardGates: trial.hardGates,
          limitations: trial.limitations,
        }),
      );
      return `<testcase classname="patchrace.${xml(trial.variantId)}" name="${name}" time="${duration}">${failed ? `<failure message="deterministic gate failed">${detail}</failure>` : unavailable ? `<skipped message="evidence unavailable">${detail}</skipped>` : ""}</testcase>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${report.trials.length}" failures="${failures}" skipped="${skipped}"><testsuite name="PatchRace comparison" tests="${report.trials.length}" failures="${failures}" skipped="${skipped}">${cases}</testsuite></testsuites>\n`;
}

export function renderSarifJson(report: ComparisonReportV1): string {
  const results: JsonValue[] = report.trials.flatMap((trial) => {
    const gateResults = trial.hardGates
      .filter((gate) => gate.status === "failed" || gate.status === "error")
      .map((gate) => ({
        ruleId: `patchrace.gate.${gate.id}`,
        level: "error",
        message: {
          text: `Hard gate '${gate.id}' ${gate.status} for ${trial.taskId} / ${trial.variantId}.`,
        },
        properties: { trialId: trial.trialId, evidence: gate.evidence },
      }));
    return trial.integrity === "compromised"
      ? [
          ...gateResults,
          {
            ruleId: "patchrace.integrity.compromised",
            level: "error",
            message: {
              text: `Grader integrity was compromised for ${trial.taskId} / ${trial.variantId}.`,
            },
            properties: { trialId: trial.trialId },
          },
        ]
      : gateResults;
  });
  return `${canonicalJson({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "PatchRace",
            version: report.reportSchemaVersion,
            rules: [],
          },
        },
        results,
      },
    ],
  })}\n`;
}
