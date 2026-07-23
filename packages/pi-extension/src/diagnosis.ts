import { tokenizeArguments } from "./arguments.js";
import type { PatchRaceBridge } from "./bridge.js";
import type {
  PiExtensionApi,
  PiExtensionCommandContext,
  PiSessionEntry,
} from "./pi-api.js";
import {
  latestSessionState,
  PATCHRACE_SESSION_ENTRY,
  stateFromResult,
} from "./session-state.js";

const DIAGNOSIS_STATUS = "patchrace-diagnosis";

interface EvidenceView {
  readonly trialId: string;
  readonly logicalPath: string;
  readonly artifactHash: string;
  readonly eventIds: readonly string[];
  readonly gradeGateIds: readonly string[];
}

interface FindingView {
  readonly category: string;
  readonly confidence: string;
  readonly claim: string;
  readonly origin: "deterministic-rule" | "reflection";
  readonly ruleId: string | null;
  readonly evidence: readonly EvidenceView[];
  readonly alternatives: readonly string[];
  readonly limitations: readonly string[];
}

interface DiagnosisCaseView {
  readonly taskId: string;
  readonly trialId: string;
  readonly facts: {
    readonly integrity: string;
    readonly outcome: string;
    readonly hardGates: readonly {
      readonly id: string;
      readonly status: string;
    }[];
  };
  readonly findings: readonly FindingView[];
  readonly classification: string;
  readonly recommendation: string;
}

interface DiagnosisView {
  readonly runId: string;
  readonly focusVariantId: string;
  readonly claimBoundary: string;
  readonly cases: readonly DiagnosisCaseView[];
  readonly caveats: readonly string[];
}

interface DiagnosisArguments {
  readonly runId: string | null;
  readonly focus: string | null;
  readonly stateDir: string | null;
  readonly reflect: boolean;
}

function parseArguments(tokens: readonly string[]): DiagnosisArguments {
  let runId: string | null = null;
  let focus: string | null = null;
  let stateDir: string | null = null;
  let reflect = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === "--reflect") {
      if (reflect) throw new Error("--reflect was provided twice.");
      reflect = true;
      continue;
    }
    if (token === "--focus" || token === "--state-dir") {
      const value = tokens[index + 1];
      if (value === undefined || value.startsWith("--"))
        throw new Error(`${token} requires a value.`);
      if (token === "--focus") {
        if (focus !== null) throw new Error("--focus was provided twice.");
        focus = value;
      } else {
        if (stateDir !== null)
          throw new Error("--state-dir was provided twice.");
        stateDir = value;
      }
      index += 1;
      continue;
    }
    if (token.startsWith("--"))
      throw new Error(`Unsupported diagnosis option '${token}'.`);
    if (runId !== null)
      throw new Error("Diagnosis accepts exactly one run ID.");
    runId = token;
  }
  return { runId, focus, stateDir, reflect };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Diagnosis output has an incompatible object shape.");
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string")
    throw new Error(`Diagnosis output is missing ${path}.`);
  return value;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(`Diagnosis output has invalid ${path}.`);
  return value as readonly string[];
}

function evidenceFrom(
  value: unknown,
  inventory: ReadonlySet<string>,
): EvidenceView {
  const source = record(value);
  const evidence = {
    trialId: text(source["trialId"], "evidence.trialId"),
    logicalPath: text(source["logicalPath"], "evidence.logicalPath"),
    artifactHash: text(source["artifactHash"], "evidence.artifactHash"),
    eventIds:
      source["eventIds"] === undefined
        ? []
        : stringArray(source["eventIds"], "evidence.eventIds"),
    gradeGateIds:
      source["gradeGateIds"] === undefined
        ? []
        : stringArray(source["gradeGateIds"], "evidence.gradeGateIds"),
  };
  const key = `${evidence.trialId}\0${evidence.logicalPath}\0${evidence.artifactHash}`;
  if (!inventory.has(key))
    throw new Error(
      `Diagnosis evidence '${evidence.logicalPath}' does not resolve to the immutable artifact inventory.`,
    );
  return evidence;
}

function parseDiagnosis(data: unknown): DiagnosisView {
  const report = record(record(data)["report"]);
  const source = record(report["source"]);
  const overview = record(report["overview"]);
  const artifactsValue = source["artifacts"];
  if (!Array.isArray(artifactsValue))
    throw new Error("Diagnosis output is missing its artifact inventory.");
  const inventory = new Set(
    artifactsValue.map((item) => {
      const artifact = record(item);
      return `${text(artifact["trialId"], "artifact.trialId")}\0${text(artifact["logicalPath"], "artifact.logicalPath")}\0${text(artifact["hash"], "artifact.hash")}`;
    }),
  );
  const casesValue = report["cases"];
  if (!Array.isArray(casesValue) || casesValue.length === 0)
    throw new Error("Diagnosis output contains no cases.");
  const cases = casesValue.map((item): DiagnosisCaseView => {
    const caseValue = record(item);
    const deterministic = record(caseValue["deterministic"]);
    const facts = record(deterministic["deterministicFacts"]);
    const hardGatesValue = facts["hardGates"];
    if (!Array.isArray(hardGatesValue))
      throw new Error("Diagnosis output is missing deterministic hard gates.");
    const findingsValue = caseValue["findings"];
    if (!Array.isArray(findingsValue))
      throw new Error("Diagnosis output is missing findings.");
    const findings = findingsValue.map((entry): FindingView => {
      const finding = record(entry);
      const origin = text(finding["origin"], "finding.origin");
      if (origin !== "deterministic-rule" && origin !== "reflection")
        throw new Error(`Diagnosis finding has unknown origin '${origin}'.`);
      const evidenceValue = finding["evidence"];
      if (!Array.isArray(evidenceValue) || evidenceValue.length === 0)
        throw new Error(
          "Every diagnosis finding must cite immutable evidence.",
        );
      const alternativesValue = finding["alternatives"];
      if (!Array.isArray(alternativesValue) || alternativesValue.length === 0)
        throw new Error("Every diagnosis finding must include alternatives.");
      return {
        category: text(finding["category"], "finding.category"),
        confidence: text(finding["confidence"], "finding.confidence"),
        claim: text(finding["claim"], "finding.claim"),
        origin,
        ruleId:
          finding["ruleId"] === null
            ? null
            : text(finding["ruleId"], "finding.ruleId"),
        evidence: evidenceValue.map((citation) =>
          evidenceFrom(citation, inventory),
        ),
        alternatives: alternativesValue.map((alternative) =>
          text(record(alternative)["claim"], "alternative.claim"),
        ),
        limitations: stringArray(finding["limitations"], "finding.limitations"),
      };
    });
    const classification = record(caseValue["classification"]);
    return {
      taskId: text(caseValue["taskId"], "case.taskId"),
      trialId: text(caseValue["trialId"], "case.trialId"),
      facts: {
        integrity: text(facts["integrity"], "facts.integrity"),
        outcome: text(facts["outcome"], "facts.outcome"),
        hardGates: hardGatesValue.map((gate) => {
          const value = record(gate);
          return {
            id: text(value["id"], "hardGate.id"),
            status: text(value["status"], "hardGate.status"),
          };
        }),
      },
      findings,
      classification: text(
        classification["classification"],
        "classification.classification",
      ),
      recommendation: text(
        classification["recommendation"],
        "classification.recommendation",
      ),
    };
  });
  return {
    runId: text(source["runId"], "source.runId"),
    focusVariantId: text(overview["focusVariantId"], "overview.focusVariantId"),
    claimBoundary: text(overview["claimBoundary"], "overview.claimBoundary"),
    cases,
    caveats: stringArray(report["caveats"], "caveats"),
  };
}

function findingLines(finding: FindingView): readonly string[] {
  return [
    `- [${finding.category}/${finding.confidence}] ${finding.claim}`,
    `  Authority: ${finding.origin}${finding.ruleId === null ? "" : ` (${finding.ruleId})`}`,
    ...finding.evidence.map(
      (item) =>
        `  Evidence: ${item.logicalPath} ${item.artifactHash}; events=${item.eventIds.join(",") || "none"}; gates=${item.gradeGateIds.join(",") || "none"}`,
    ),
    ...finding.alternatives.map((item) => `  Alternative: ${item}`),
    ...finding.limitations.map((item) => `  Limitation: ${item}`),
  ];
}

function renderDiagnosis(
  view: DiagnosisView,
  mode: "coach" | "diagnose",
): string {
  const deterministic = view.cases.flatMap((item) =>
    item.findings.filter((finding) => finding.origin === "deterministic-rule"),
  );
  const hypotheses = view.cases.flatMap((item) =>
    item.findings.filter((finding) => finding.origin === "reflection"),
  );
  return [
    `PATCHRACE ${mode.toUpperCase()} — RUN ${view.runId}`,
    `Focus: ${view.focusVariantId}`,
    "",
    "DETERMINISTIC FACTS (authoritative)",
    ...view.cases.flatMap((item) => [
      `${item.taskId} / ${item.trialId}: outcome=${item.facts.outcome}; integrity=${item.facts.integrity}`,
      ...item.facts.hardGates.map(
        (gate) => `  Hard gate ${gate.id}: ${gate.status}`,
      ),
      `  Classification: ${item.classification}`,
      `  Coach recommendation: ${item.recommendation}`,
    ]),
    "",
    "DETERMINISTIC FINDINGS (evidence-linked)",
    ...(deterministic.length === 0
      ? ["None."]
      : deterministic.flatMap(findingLines)),
    "",
    "INFERRED HYPOTHESES (optional, low authority, cannot override facts)",
    ...(hypotheses.length === 0
      ? ["None requested or available."]
      : hypotheses.flatMap(findingLines)),
    "",
    `Claim boundary: ${view.claimBoundary}`,
    ...view.caveats.map((item) => `Caveat: ${item}`),
  ].join("\n");
}

async function resolveRunId(
  requested: string | null,
  context: PiExtensionCommandContext,
): Promise<string | null> {
  if (requested !== null) return requested;
  const restored =
    latestSessionState(
      context.sessionManager.getEntries() as readonly PiSessionEntry[],
    )?.runId ?? null;
  if (restored !== null) return restored;
  const input = await context.ui.input("PatchRace run ID");
  return input?.trim() || null;
}

function register(
  mode: "coach" | "diagnose",
  pi: PiExtensionApi,
  bridge: PatchRaceBridge,
): void {
  pi.registerCommand(mode, {
    description:
      mode === "coach"
        ? "Explain evidence-linked PatchRace findings and next action"
        : "Inspect deterministic facts and optional hypotheses for a race",
    handler: async (rawArguments, context) => {
      try {
        const parsed = parseArguments(tokenizeArguments(rawArguments));
        const runId = await resolveRunId(parsed.runId, context);
        if (runId === null) {
          context.ui.notify("PatchRace diagnosis cancelled.", "warning");
          return;
        }
        if (parsed.reflect) {
          const confirmed = await context.ui.confirm(
            "Enable optional reflection?",
            "Reflection may call an explicitly configured LLM with redacted evidence. Its output is inferred, low-authority, and cannot override deterministic facts or hard gates. Continue?",
          );
          if (!confirmed) {
            context.ui.notify(
              "PatchRace reflection cancelled before provider use.",
              "warning",
            );
            return;
          }
        }
        const arguments_ = [
          "diagnose",
          runId,
          "--format",
          "json",
          ...(parsed.focus === null ? [] : ["--focus", parsed.focus]),
          ...(parsed.stateDir === null ? [] : ["--state-dir", parsed.stateDir]),
          ...(parsed.reflect ? ["--reflect"] : []),
        ];
        await context.waitForIdle();
        context.ui.setStatus(DIAGNOSIS_STATUS, `diagnosing ${runId}`);
        const result = await bridge.execute({
          cwd: context.cwd,
          arguments: arguments_,
          onProgress: (value) => {
            const summary = value.trim();
            if (summary.length > 0)
              context.ui.setStatus(DIAGNOSIS_STATUS, summary);
          },
        });
        const view = parseDiagnosis(result.data);
        pi.appendEntry(PATCHRACE_SESSION_ENTRY, stateFromResult(result));
        await context.ui.editor(
          `PatchRace ${mode}: ${runId}`,
          renderDiagnosis(view, mode),
        );
        context.ui.notify(
          `PatchRace ${mode} showed ${String(view.cases.length)} evidence-linked case(s).`,
          "info",
        );
      } catch (error) {
        context.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      } finally {
        context.ui.setStatus(DIAGNOSIS_STATUS, undefined);
      }
    },
  });
}

export function registerDiagnosisCommands(
  pi: PiExtensionApi,
  bridge: PatchRaceBridge,
): void {
  register("diagnose", pi, bridge);
  register("coach", pi, bridge);
}
