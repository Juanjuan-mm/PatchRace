import {
  PatchRaceError,
  sha256,
  type CandidateSnapshotV1,
  type DiagnosisFindingV1,
  type DiagnosisMutationRouteV1,
  type EvidenceCitationV1,
} from "@patchrace/contracts";

import { createCandidateSnapshot } from "./candidate.js";
import type { CandidateFileContent } from "./staging.js";

export interface CandidateChangeEvidence {
  readonly description: string;
  readonly sourceFindingIds: readonly string[];
  readonly evidence: readonly EvidenceCitationV1[];
}

export interface CandidateComplexity {
  readonly addedLines: number;
  readonly removedLines: number;
  readonly beforeContextTokens: number;
  readonly afterContextTokens: number;
  readonly contextTokenDelta: number;
}

export interface GeneratedCandidate {
  readonly candidate: CandidateSnapshotV1;
  readonly files: readonly CandidateFileContent[];
  readonly changeEvidence: readonly CandidateChangeEvidence[];
  readonly complexity: CandidateComplexity;
  readonly securityFlags: readonly string[];
}

interface CommonGenerationOptions {
  readonly baselineId: string;
  readonly parentCandidateId?: string | null;
  readonly createdAt: string;
  readonly route: DiagnosisMutationRouteV1;
  readonly finding: DiagnosisFindingV1;
  readonly visibleSplitHash: `sha256:${string}`;
  readonly configHash: `sha256:${string}`;
  readonly generatorVersion?: string;
  readonly maxAddedLines?: number;
  readonly maxContextTokens?: number;
}

export interface GenerateAgentsGuidanceOptions extends CommonGenerationOptions {
  readonly targetPath?: string;
  readonly currentContent: string | null;
  readonly change:
    | {
        readonly kind: "add-stable-fact";
        readonly fact: string;
      }
    | {
        readonly kind: "remove-lines";
        readonly lineNumbers: readonly number[];
        readonly reason: "conflict" | "context-bloat";
      };
}

export interface GeneratePiSkillOptions extends CommonGenerationOptions {
  readonly name: string;
  readonly description: string;
  readonly trigger: string;
  readonly steps: readonly string[];
}

export interface GeneratePromptTemplateOptions extends CommonGenerationOptions {
  readonly name: string;
  readonly description: string;
  readonly arguments: readonly {
    readonly name: string;
    readonly type: "string" | "path" | "integer" | "boolean";
    readonly required: boolean;
    readonly description: string;
  }[];
  readonly steps: readonly string[];
}

const unsafeText =
  /(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]|hidden\s+(?:test|verifier)|reference\s+patch/iu;
const executableText =
  /```|`[^`]+`|\$\s|(?:npm|pnpm|yarn|pip|brew)\s+(?:install|add)\b|curl\s|wget\s|hooks?\b|extensions?\b|\/Users\/|\/home\/|[A-Za-z]:\\/iu;
const projectVersionLeakage =
  /\bpatchrace\b|\bv?\d+\.\d+(?:\.\d+)?(?:[-+][A-Za-z0-9.-]+)?\b/iu;
const automaticAction =
  /\b(?:automatically|silently)\s+(?:run|execute|install|apply|activate|write|delete)\b/iu;

function fail(code: string, message: string, path: string): never {
  throw new PatchRaceError({ code, category: "CONFIG", message, path });
}

function estimatedTokens(value: string): number {
  return Math.ceil([...value].length / 4);
}

function lines(value: string): string[] {
  const result = value.split("\n");
  if (result.at(-1) === "") result.pop();
  return result;
}

function unifiedDiff(
  path: string,
  before: string | null,
  after: string | null,
): Buffer {
  const beforeLines = before === null ? [] : lines(before);
  const afterLines = after === null ? [] : lines(after);
  const oldPath = before === null ? "/dev/null" : `a/${path}`;
  const newPath = after === null ? "/dev/null" : `b/${path}`;
  const header = `--- ${oldPath}\n+++ ${newPath}\n@@ -${beforeLines.length === 0 ? "0,0" : `1,${beforeLines.length}`} +${afterLines.length === 0 ? "0,0" : `1,${afterLines.length}`} @@\n`;
  return Buffer.from(
    `${header}${beforeLines.map((line) => `-${line}\n`).join("")}${afterLines.map((line) => `+${line}\n`).join("")}`,
  );
}

function assertCommon(
  options: CommonGenerationOptions,
  mutationType: DiagnosisMutationRouteV1["mutationType"],
): void {
  if (
    options.route.disposition !== "candidate" ||
    options.route.mutationType !== mutationType ||
    !options.route.sourceFindingIds.includes(options.finding.id) ||
    options.route.evidence.length === 0 ||
    options.finding.origin !== "deterministic-rule" ||
    options.finding.confidence !== "high"
  )
    fail(
      "GENERATOR_ROUTE_INELIGIBLE",
      "Generator requires a matching cited high-confidence deterministic route.",
      "route",
    );
}

function complexity(before: string | null, after: string): CandidateComplexity {
  const beforeLines = before === null ? [] : lines(before);
  const afterLines = lines(after);
  let sharedPrefix = 0;
  while (
    sharedPrefix < beforeLines.length &&
    sharedPrefix < afterLines.length &&
    beforeLines[sharedPrefix] === afterLines[sharedPrefix]
  )
    sharedPrefix += 1;
  let sharedSuffix = 0;
  while (
    sharedSuffix < beforeLines.length - sharedPrefix &&
    sharedSuffix < afterLines.length - sharedPrefix &&
    beforeLines[beforeLines.length - 1 - sharedSuffix] ===
      afterLines[afterLines.length - 1 - sharedSuffix]
  )
    sharedSuffix += 1;
  const beforeContextTokens = estimatedTokens(before ?? "");
  const afterContextTokens = estimatedTokens(after);
  return {
    addedLines: afterLines.length - sharedPrefix - sharedSuffix,
    removedLines: beforeLines.length - sharedPrefix - sharedSuffix,
    beforeContextTokens,
    afterContextTokens,
    contextTokenDelta: afterContextTokens - beforeContextTokens,
  };
}

export function generateAgentsGuidanceCandidate(
  options: GenerateAgentsGuidanceOptions,
): GeneratedCandidate {
  assertCommon(options, "agents-guidance");
  const targetPath = options.targetPath ?? "AGENTS.md";
  const current = options.currentContent;
  let after: string;
  let description: string;
  if (options.change.kind === "add-stable-fact") {
    const fact = options.change.fact.trim();
    if (
      fact.length < 8 ||
      fact.length > 240 ||
      fact.includes("\n") ||
      unsafeText.test(fact)
    )
      fail(
        "AGENTS_FACT_UNSAFE",
        "Stable fact must be one bounded non-sensitive line.",
        "change.fact",
      );
    const prefix =
      current === null || current.trim().length === 0
        ? "# Project guidance\n"
        : current.endsWith("\n")
          ? current
          : `${current}\n`;
    if (lines(prefix).some((line) => line.trim() === `- ${fact}`))
      fail(
        "AGENTS_FACT_DUPLICATE",
        "Stable fact already exists in guidance.",
        "change.fact",
      );
    after = `${prefix}\n## Evidence-backed project facts\n\n- ${fact}\n`;
    description = `Add cited stable project fact: ${fact}`;
  } else {
    if (current === null)
      fail(
        "AGENTS_REMOVE_WITHOUT_SOURCE",
        "Cannot remove lines from a missing guidance file.",
        "currentContent",
      );
    const currentLines = lines(current);
    const selected = [...new Set(options.change.lineNumbers)].sort(
      (left, right) => left - right,
    );
    if (
      selected.length === 0 ||
      selected.some(
        (lineNumber) =>
          !Number.isInteger(lineNumber) ||
          lineNumber < 1 ||
          lineNumber > currentLines.length,
      )
    )
      fail(
        "AGENTS_REMOVE_LINES_INVALID",
        "Removal requires valid one-based source line numbers.",
        "change.lineNumbers",
      );
    const removed = new Set(selected);
    after = `${currentLines
      .filter((_, index) => !removed.has(index + 1))
      .join("\n")}\n`;
    description = `Remove ${selected.length} cited ${options.change.reason} line${selected.length === 1 ? "" : "s"}.`;
  }
  if (unsafeText.test(after))
    fail(
      "AGENTS_OUTPUT_UNSAFE",
      "Generated guidance contains prohibited sensitive content.",
      "currentContent",
    );
  const measured = complexity(current, after);
  const maxAddedLines = options.maxAddedLines ?? 20;
  const maxContextTokens = options.maxContextTokens ?? 250;
  if (
    measured.addedLines > maxAddedLines ||
    Math.max(0, measured.contextTokenDelta) > maxContextTokens
  )
    fail(
      "AGENTS_COMPLEXITY_BUDGET_EXCEEDED",
      "Generated guidance exceeds its declared complexity budget.",
      "objective.constraints",
    );
  const beforeBytes = current === null ? null : Buffer.from(current);
  const afterBytes = Buffer.from(after);
  const patch = unifiedDiff(targetPath, current, after);
  const candidate = createCandidateSnapshot({
    baselineId: options.baselineId,
    ...(options.parentCandidateId === undefined
      ? {}
      : { parentCandidateId: options.parentCandidateId }),
    createdAt: options.createdAt,
    generator: {
      kind: "builtin-bounded-v1",
      id: "agents-guidance-v1",
      version: options.generatorVersion ?? "1.0.0",
      model: null,
      promptHash: null,
      deterministic: true,
    },
    routes: [options.route],
    visibleSplitHash: options.visibleSplitHash,
    configHash: options.configHash,
    declaredVariable:
      options.change.kind === "add-stable-fact"
        ? "add-stable-project-fact"
        : `remove-${options.change.reason}-guidance`,
    files: [
      {
        logicalPath: targetPath,
        operation: current === null ? "create" : "update",
        beforeHash: beforeBytes === null ? null : sha256(beforeBytes),
        afterHash: sha256(afterBytes),
        patchHash: sha256(patch),
      },
    ],
    objective: {
      policy: "correctness-first-v1",
      primary: "task-success-rate",
      constraints: { maxAddedLines, maxContextTokens },
    },
  });
  return {
    candidate,
    files: [
      {
        logicalPath: targetPath,
        before: beforeBytes,
        after: afterBytes,
        patch,
      },
    ],
    changeEvidence: [
      {
        description,
        sourceFindingIds: [options.finding.id],
        evidence: options.route.evidence,
      },
    ],
    complexity: measured,
    securityFlags: [],
  };
}

export function generatePiSkillCandidate(
  options: GeneratePiSkillOptions,
): GeneratedCandidate {
  assertCommon(options, "skill");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/u.test(options.name))
    fail(
      "SKILL_NAME_INVALID",
      "Skill name must be a bounded lowercase slug.",
      "name",
    );
  const description = options.description.trim();
  const trigger = options.trigger.trim();
  if (
    description.length < 12 ||
    description.length > 160 ||
    description.includes("\n") ||
    description.includes(":") ||
    trigger.length < 12 ||
    trigger.length > 180 ||
    trigger.includes("\n") ||
    !/^Use when\b/u.test(trigger)
  )
    fail(
      "SKILL_TRIGGER_INVALID",
      "Skill description and trigger must be bounded; trigger must start with 'Use when'.",
      "trigger",
    );
  if (options.steps.length < 2 || options.steps.length > 8)
    fail(
      "SKILL_STEPS_INVALID",
      "Skill requires two to eight bounded procedural steps.",
      "steps",
    );
  const steps = options.steps.map((step) => step.trim());
  if (
    steps.some(
      (step) =>
        step.length < 8 ||
        step.length > 200 ||
        step.includes("\n") ||
        unsafeText.test(step) ||
        executableText.test(step) ||
        projectVersionLeakage.test(step),
    ) ||
    unsafeText.test(`${description}\n${trigger}`) ||
    executableText.test(`${description}\n${trigger}`) ||
    projectVersionLeakage.test(`${description}\n${trigger}`)
  )
    fail(
      "SKILL_CONTENT_UNSAFE",
      "Skill content contains executable, sensitive, absolute-path, project, or version-specific text.",
      "steps",
    );
  const content = `---\nname: ${options.name}\ndescription: ${description}\n---\n\n# ${options.name}\n\n${trigger}\n\n## Workflow\n\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n`;
  const measured = complexity(null, content);
  const maxAddedLines = options.maxAddedLines ?? 40;
  const maxContextTokens = options.maxContextTokens ?? 400;
  if (
    measured.addedLines > maxAddedLines ||
    measured.afterContextTokens > maxContextTokens
  )
    fail(
      "SKILL_COMPLEXITY_BUDGET_EXCEEDED",
      "Generated Skill exceeds its declared complexity budget.",
      "objective.constraints",
    );
  const targetPath = `.pi/skills/${options.name}/SKILL.md`;
  const after = Buffer.from(content);
  const patch = unifiedDiff(targetPath, null, content);
  const candidate = createCandidateSnapshot({
    baselineId: options.baselineId,
    ...(options.parentCandidateId === undefined
      ? {}
      : { parentCandidateId: options.parentCandidateId }),
    createdAt: options.createdAt,
    generator: {
      kind: "builtin-bounded-v1",
      id: "pi-skill-v1",
      version: options.generatorVersion ?? "1.0.0",
      model: null,
      promptHash: null,
      deterministic: true,
    },
    routes: [options.route],
    visibleSplitHash: options.visibleSplitHash,
    configHash: options.configHash,
    declaredVariable: `add-${options.name}-skill`,
    files: [
      {
        logicalPath: targetPath,
        operation: "create",
        beforeHash: null,
        afterHash: sha256(after),
        patchHash: sha256(patch),
      },
    ],
    objective: {
      policy: "correctness-first-v1",
      primary: "task-success-rate",
      constraints: { maxAddedLines, maxContextTokens },
    },
  });
  return {
    candidate,
    files: [{ logicalPath: targetPath, before: null, after, patch }],
    changeEvidence: [
      {
        description: `Add narrowly triggered '${options.name}' repeatable workflow.`,
        sourceFindingIds: [options.finding.id],
        evidence: options.route.evidence,
      },
    ],
    complexity: measured,
    securityFlags: [],
  };
}

export function generatePromptTemplateCandidate(
  options: GeneratePromptTemplateOptions,
): GeneratedCandidate {
  assertCommon(options, "prompt-template");
  if (
    !/^[a-z0-9][a-z0-9-]{1,62}$/u.test(options.name) ||
    options.route.invokedWorkflow !== options.name
  )
    fail(
      "PROMPT_INVOCATION_INVALID",
      "Prompt name must match the explicitly evidenced invoked workflow.",
      "name",
    );
  const description = options.description.trim();
  if (
    description.length < 12 ||
    description.length > 160 ||
    description.includes("\n") ||
    description.includes(":") ||
    unsafeText.test(description) ||
    executableText.test(description) ||
    automaticAction.test(description)
  )
    fail(
      "PROMPT_DESCRIPTION_INVALID",
      "Prompt description is invalid or unsafe.",
      "description",
    );
  if (
    options.arguments.length > 8 ||
    options.steps.length < 2 ||
    options.steps.length > 10
  )
    fail(
      "PROMPT_SHAPE_INVALID",
      "Prompt arguments or workflow steps exceed bounded limits.",
      "arguments",
    );
  const argumentNames = new Set<string>();
  for (const [index, argument] of options.arguments.entries()) {
    if (
      !/^[a-z][a-z0-9-]{0,31}$/u.test(argument.name) ||
      argumentNames.has(argument.name) ||
      argument.description.trim().length < 8 ||
      argument.description.length > 120 ||
      argument.description.includes("\n") ||
      argument.description.includes(":") ||
      unsafeText.test(argument.description)
    )
      fail(
        "PROMPT_ARGUMENT_INVALID",
        "Prompt argument names and descriptions must be unique and bounded.",
        `arguments.${index}`,
      );
    argumentNames.add(argument.name);
  }
  const steps = options.steps.map((step) => step.trim());
  const referencedArguments = new Set<string>();
  for (const [index, step] of steps.entries()) {
    if (
      step.length < 8 ||
      step.length > 220 ||
      step.includes("\n") ||
      unsafeText.test(step) ||
      executableText.test(step) ||
      automaticAction.test(step)
    )
      fail(
        "PROMPT_STEP_UNSAFE",
        "Prompt step is invalid or requests unsafe automatic action.",
        `steps.${index}`,
      );
    for (const match of step.matchAll(/\{\{([a-z][a-z0-9-]*)\}\}/gu)) {
      const name = match[1]!;
      if (!argumentNames.has(name))
        fail(
          "PROMPT_PLACEHOLDER_UNDECLARED",
          `Prompt placeholder '${name}' is not declared.`,
          `steps.${index}`,
        );
      referencedArguments.add(name);
    }
  }
  if (
    options.arguments.some(
      (argument) =>
        argument.required && !referencedArguments.has(argument.name),
    )
  )
    fail(
      "PROMPT_REQUIRED_ARGUMENT_UNUSED",
      "Every required prompt argument must be used by the workflow.",
      "arguments",
    );
  const argumentYaml =
    options.arguments.length === 0
      ? "arguments: []\n"
      : `arguments:\n${options.arguments
          .map(
            (argument) =>
              `  - name: ${argument.name}\n    type: ${argument.type}\n    required: ${argument.required}\n    description: ${argument.description.trim()}`,
          )
          .join("\n")}\n`;
  const argumentDocs =
    options.arguments.length === 0
      ? "This workflow takes no arguments."
      : options.arguments
          .map(
            (argument) =>
              `- \`{{${argument.name}}}\` (${argument.type}, ${argument.required ? "required" : "optional"}): ${argument.description.trim()}`,
          )
          .join("\n");
  const content = `---\ndescription: ${description}\n${argumentYaml}---\n\n# ${options.name}\n\nInvocation: user invokes \`/${options.name}\`.\n\n## Arguments\n\n${argumentDocs}\n\n## Workflow\n\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n`;
  const measured = complexity(null, content);
  const maxAddedLines = options.maxAddedLines ?? 60;
  const maxContextTokens = options.maxContextTokens ?? 500;
  if (
    measured.addedLines > maxAddedLines ||
    measured.afterContextTokens > maxContextTokens
  )
    fail(
      "PROMPT_COMPLEXITY_BUDGET_EXCEEDED",
      "Generated prompt exceeds its declared complexity budget.",
      "objective.constraints",
    );
  const targetPath = `.pi/prompts/${options.name}.md`;
  const after = Buffer.from(content);
  const patch = unifiedDiff(targetPath, null, content);
  const candidate = createCandidateSnapshot({
    baselineId: options.baselineId,
    ...(options.parentCandidateId === undefined
      ? {}
      : { parentCandidateId: options.parentCandidateId }),
    createdAt: options.createdAt,
    generator: {
      kind: "builtin-bounded-v1",
      id: "pi-prompt-template-v1",
      version: options.generatorVersion ?? "1.0.0",
      model: null,
      promptHash: null,
      deterministic: true,
    },
    routes: [options.route],
    visibleSplitHash: options.visibleSplitHash,
    configHash: options.configHash,
    declaredVariable: `add-${options.name}-prompt`,
    files: [
      {
        logicalPath: targetPath,
        operation: "create",
        beforeHash: null,
        afterHash: sha256(after),
        patchHash: sha256(patch),
      },
    ],
    objective: {
      policy: "correctness-first-v1",
      primary: "task-success-rate",
      constraints: { maxAddedLines, maxContextTokens },
    },
  });
  return {
    candidate,
    files: [{ logicalPath: targetPath, before: null, after, patch }],
    changeEvidence: [
      {
        description: `Add explicitly invoked '/${options.name}' workflow prompt.`,
        sourceFindingIds: [options.finding.id],
        evidence: options.route.evidence,
      },
    ],
    complexity: measured,
    securityFlags: [],
  };
}
