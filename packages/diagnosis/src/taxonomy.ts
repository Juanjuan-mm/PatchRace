export const FAILURE_CATEGORIES = [
  "discovery",
  "context",
  "workflow",
  "tool",
  "verification",
  "capability",
  "unknown",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export interface FailureCategoryDefinition {
  readonly category: FailureCategory;
  readonly definition: string;
  readonly positiveExamples: readonly string[];
  readonly excludeWhen: readonly string[];
}

export const FAILURE_TAXONOMY: Readonly<
  Record<FailureCategory, FailureCategoryDefinition>
> = {
  discovery: {
    category: "discovery",
    definition:
      "The observable trajectory did not locate or inspect task-relevant repository evidence early enough to act on it.",
    positiveExamples: [
      "Repeated broad searches returned no relevant paths before the first edit.",
      "A relevant implementation file was first read only after an avoidable failed broad test.",
    ],
    excludeWhen: [
      "Relevant evidence was available in the supplied context but was misunderstood; classify context.",
      "Relevant evidence was found and used, but action ordering or iteration was ineffective; classify workflow.",
      "The adapter does not expose reads or searches; classify unknown rather than absence of discovery.",
    ],
  },
  context: {
    category: "context",
    definition:
      "Task-relevant instructions or repository facts were observably supplied or read but were omitted, contradicted, or applied incorrectly.",
    positiveExamples: [
      "The task instruction required a compatibility boundary that the resulting patch violated.",
      "A read project instruction named the required test command, but another incompatible command was used.",
    ],
    excludeWhen: [
      "The relevant fact was never located despite exposed search/read evidence; classify discovery.",
      "The fact was applied correctly but the model could not produce a sufficient solution; classify capability only with comparative evidence.",
      "The evidence cannot prove the fact was supplied or read; classify unknown.",
    ],
  },
  workflow: {
    category: "workflow",
    definition:
      "Observable actions used an ineffective sequence, scope, or retry pattern despite sufficient evidence and usable tools.",
    positiveExamples: [
      "Edits repeatedly preceded any focused test even though a focused test command was available.",
      "The same failing command was retried without an intervening relevant read, edit, or changed invocation.",
    ],
    excludeWhen: [
      "The invoked tool itself failed or was unavailable; classify tool.",
      "The principal failure is missing or inadequate final validation; classify verification.",
      "Only one reasonable workflow was attempted and comparative evidence shows the same harness succeeds elsewhere; capability may be more appropriate.",
    ],
  },
  tool: {
    category: "tool",
    definition:
      "An observable required tool, command surface, or adapter capability was unavailable, failed operationally, or was used incompatibly.",
    positiveExamples: [
      "A required executable produced a spawn error before task work could proceed.",
      "The adapter reported that structured file-read events are unavailable for the selected version.",
    ],
    excludeWhen: [
      "The tool ran successfully but the chosen sequence was inefficient; classify workflow.",
      "A deterministic verifier failed because of the patch rather than verifier infrastructure; classify verification or the underlying category.",
      "A missing event type is not evidence that the agent skipped the action; classify unknown when no other evidence exists.",
    ],
  },
  verification: {
    category: "verification",
    definition:
      "The observable trajectory or final result omitted, delayed, mis-scoped, or failed to respond to deterministic validation relevant to the patch.",
    positiveExamples: [
      "The final edit was not followed by any exposed relevant test before a failed grader gate.",
      "A focused test passed, but an explicitly required broader gate was never run and later failed in grading.",
    ],
    excludeWhen: [
      "The verifier itself errored or integrity was not valid; classify unknown or tool and do not blame the Agent.",
      "Testing was adequate and the remaining failure reflects solution quality; classify capability only with sufficient comparative evidence.",
      "A test event is unavailable because the adapter cannot expose it; do not infer that testing was skipped.",
    ],
  },
  capability: {
    category: "capability",
    definition:
      "Valid comparable evidence suggests the selected model could not complete the task despite adequate discovery, context, workflow, tools, and verification opportunities.",
    positiveExamples: [
      "The same frozen task and harness succeeds for multiple peer trials while the focused trial repeatedly produces substantively incorrect patches after adequate evidence gathering and testing.",
      "No safe workflow/configuration mutation is supported after deterministic causes are excluded on valid repeated evidence.",
    ],
    excludeWhen: [
      "Any deterministic discovery, context, workflow, tool, or verification explanation remains well supported.",
      "Trials differ in model and harness or workflow dimensions, so capability is confounded.",
      "Evidence is sparse, integrity is not valid, or observable lanes are incomplete; classify unknown.",
    ],
  },
  unknown: {
    category: "unknown",
    definition:
      "Available evidence is insufficient, invalid, incomplete, conflicting, or too confounded for a narrower supported category.",
    positiveExamples: [
      "The trace is partial and the adapter cannot expose file, search, or test actions.",
      "Grader integrity is unknown or comparable trials change both model and workflow dimensions.",
    ],
    excludeWhen: [
      "A narrower category has direct, valid, non-confounded deterministic evidence.",
      "Unknown must not be used merely to avoid reporting a well-supported limitation.",
    ],
  },
};

export const FAILURE_CLASSIFICATION_PRECEDENCE: readonly FailureCategory[] = [
  "tool",
  "verification",
  "discovery",
  "context",
  "workflow",
  "capability",
  "unknown",
];

export function failureCategoryDefinition(
  category: FailureCategory,
): FailureCategoryDefinition {
  return FAILURE_TAXONOMY[category];
}
