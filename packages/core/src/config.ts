import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import { parseDocument } from "yaml";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalHash,
  canonicalJson,
  suiteConfigSchema,
  type AdapterConfig,
  type NormalizedSuiteConfig,
} from "@patchrace/contracts";

export { suiteConfigSchema } from "@patchrace/contracts";
export type {
  AdapterConfig,
  BudgetConfig,
  NormalizedSuiteConfig,
} from "@patchrace/contracts";

export interface LoadedSuiteConfig {
  readonly sourcePath: string;
  readonly config: NormalizedSuiteConfig;
  readonly canonicalJson: string;
  readonly configHash: `sha256:${string}`;
  readonly paths: { readonly projectRoot: string; readonly stateRoot: string };
  readonly warnings: readonly ConfigWarning[];
}

export interface ConfigWarning {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
const validateSuite = ajv.compile(suiteConfigSchema) as ValidateFunction;

function issuePath(issue: ErrorObject): string {
  const base = issue.instancePath
    .split("/")
    .filter(Boolean)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .join(".");
  if (issue.keyword === "required") {
    const missing = String(issue.params["missingProperty"] ?? "");
    return base ? `${base}.${missing}` : missing;
  }
  if (issue.keyword === "additionalProperties") {
    const extra = String(issue.params["additionalProperty"] ?? "");
    return base ? `${base}.${extra}` : extra;
  }
  return base || "$";
}

function configError(
  code: string,
  message: string,
  path: string,
  cause?: unknown,
): PatchRaceError {
  return new PatchRaceError(
    { code, category: "CONFIG", message, path, retryable: false },
    cause === undefined ? undefined : { cause },
  );
}

function parseConfig(text: string, sourcePath: string): unknown {
  if (sourcePath.toLowerCase().endsWith(".json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw configError(
        "CONFIG_PARSE_ERROR",
        `Invalid JSON in ${sourcePath}.`,
        "$",
        error,
      );
    }
  }
  let document;
  try {
    document = parseDocument(text, { strict: true, uniqueKeys: true });
  } catch (error) {
    throw configError(
      "CONFIG_PARSE_ERROR",
      `Unsafe or overly complex YAML in ${sourcePath}.`,
      "$",
      error,
    );
  }
  if (document.errors.length > 0) {
    const first = document.errors[0];
    throw configError(
      "CONFIG_PARSE_ERROR",
      first?.message ?? `Invalid YAML in ${sourcePath}.`,
      "$",
      first,
    );
  }
  try {
    return document.toJS({ maxAliasCount: 50 }) as unknown;
  } catch (error) {
    throw configError(
      "CONFIG_PARSE_ERROR",
      `Unsafe or overly complex YAML in ${sourcePath}.`,
      "$",
      error,
    );
  }
}

function sortRecord<T>(value: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeLogicalPath(value: string, path: string): string {
  if (value.includes("\0") || /\$\{|%[^%]+%/.test(value)) {
    throw configError(
      "CONFIG_PATH_UNRESOLVED",
      `Path at ${path} contains an unresolved variable or NUL byte.`,
      path,
    );
  }
  return value.replaceAll("\\", "/").replace(/\/+/g, "/");
}

function normalize(source: Record<string, unknown>): NormalizedSuiteConfig {
  const project = (source["project"] ?? {}) as Record<string, unknown>;
  const state = (source["state"] ?? {}) as Record<string, unknown>;
  const retention = (state["retention"] ?? {}) as Record<string, unknown>;
  const defaults = (source["defaults"] ?? {}) as Record<string, unknown>;
  const budgets = (defaults["budgets"] ?? {}) as Record<string, unknown>;
  const environment = (defaults["environment"] ?? {}) as Record<
    string,
    unknown
  >;
  const objectives = (source["objectives"] ?? {}) as Record<string, unknown>;
  const report = (source["report"] ?? {}) as Record<string, unknown>;
  const tasks = sortRecord(
    source["tasks"] as Record<
      string,
      { file: string; metadata?: Record<string, unknown> }
    >,
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      root: normalizeLogicalPath(
        (project["root"] as string | undefined) ?? ".",
        "project.root",
      ),
      trustRepositoryCommands:
        (project["trustRepositoryCommands"] as boolean | undefined) ?? false,
    },
    state: {
      directory: normalizeLogicalPath(
        (state["directory"] as string | undefined) ?? ".patchrace",
        "state.directory",
      ),
      retention: {
        rawRuns: "manual",
        cacheDays: (retention["cacheDays"] as number | undefined) ?? 30,
      },
    },
    defaults: {
      concurrency: (defaults["concurrency"] as number | undefined) ?? 2,
      repeat: (defaults["repeat"] as number | undefined) ?? 1,
      budgets: {
        wallSeconds: (budgets["wallSeconds"] as number | undefined) ?? 1200,
        trialSeconds: (budgets["trialSeconds"] as number | undefined) ?? 600,
        maxTrials: (budgets["maxTrials"] as number | undefined) ?? 30,
        maxTokens: (budgets["maxTokens"] as number | null | undefined) ?? null,
        maxCostUsd:
          (budgets["maxCostUsd"] as number | null | undefined) ?? null,
        diskMiB: (budgets["diskMiB"] as number | undefined) ?? 2048,
      },
      environment: {
        inherit: [
          ...((environment["inherit"] as string[] | undefined) ?? [
            "PATH",
            "LANG",
            "LC_ALL",
            "TERM",
          ]),
        ].sort(),
        pass: [...((environment["pass"] as string[] | undefined) ?? [])].sort(),
        redact: [
          ...((environment["redact"] as string[] | undefined) ?? []),
        ].sort(),
      },
    },
    adapters: sortRecord(source["adapters"] as Record<string, AdapterConfig>),
    variants: sortRecord(
      source["variants"] as Record<string, Record<string, unknown>>,
    ),
    suites: sortRecord(source["suites"] as NormalizedSuiteConfig["suites"]),
    tasks: Object.fromEntries(
      Object.entries(tasks).map(([id, task]) => [
        id,
        { ...task, file: normalizeLogicalPath(task.file, `tasks.${id}.file`) },
      ]),
    ),
    objectives: {
      policy:
        (objectives["policy"] as string | undefined) ?? "correctness-first-v1",
      afterHardGates: [
        ...((objectives["afterHardGates"] as string[] | undefined) ?? [
          "stability",
          "cost",
          "latency",
          "footprint",
        ]),
      ],
    },
    report: {
      formats: [
        ...((report["formats"] as string[] | undefined) ?? ["json", "html"]),
      ],
      includeRawCode:
        (report["includeRawCode"] as string | undefined) ?? "local-only",
      redactionProfile:
        (report["redactionProfile"] as string | undefined) ?? "default",
    },
    metadata: (source["metadata"] as Record<string, unknown> | undefined) ?? {},
  };
}

function assertReferences(config: NormalizedSuiteConfig): void {
  for (const [variantId, variant] of Object.entries(config.variants)) {
    const adapter = variant["adapter"];
    if (typeof adapter !== "string" || config.adapters[adapter] === undefined) {
      throw configError(
        "CONFIG_REFERENCE_MISSING",
        `Variant '${variantId}' references unknown adapter '${String(adapter)}'.`,
        `variants.${variantId}.adapter`,
      );
    }
  }
  for (const [suiteId, suite] of Object.entries(config.suites)) {
    for (let index = 0; index < suite.tasks.length; index += 1) {
      const task = suite.tasks[index];
      if (task === undefined || config.tasks[task] === undefined) {
        throw configError(
          "CONFIG_REFERENCE_MISSING",
          `Suite '${suiteId}' references unknown task '${String(task)}'.`,
          `suites.${suiteId}.tasks[${index}]`,
        );
      }
    }
    const trialCount =
      suite.tasks.length *
      Object.keys(config.variants).length *
      config.defaults.repeat;
    if (trialCount > config.defaults.budgets.maxTrials) {
      throw configError(
        "CONFIG_MAX_TRIALS_EXCEEDED",
        `Suite '${suiteId}' plans ${trialCount} trials, above maxTrials ${config.defaults.budgets.maxTrials}.`,
        `suites.${suiteId}.tasks`,
      );
    }
  }
}

function isDescendant(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return (
    path !== "" &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}

export async function loadSuiteConfig(
  sourcePath: string,
): Promise<LoadedSuiteConfig> {
  const requestedSource = resolve(sourcePath);
  let absoluteSource: string;
  try {
    absoluteSource = await realpath(requestedSource);
  } catch (error) {
    throw configError(
      "CONFIG_READ_FAILED",
      `Cannot read suite config at ${requestedSource}.`,
      "$",
      error,
    );
  }
  let text: string;
  try {
    text = await readFile(absoluteSource, "utf8");
  } catch (error) {
    throw configError(
      "CONFIG_READ_FAILED",
      `Cannot read suite config at ${absoluteSource}.`,
      "$",
      error,
    );
  }
  const parsed = parseConfig(text, absoluteSource);
  if (!validateSuite(parsed)) {
    const first = validateSuite.errors?.[0];
    const path = first === undefined ? "$" : issuePath(first);
    throw configError(
      "CONFIG_SCHEMA_INVALID",
      `Invalid suite configuration at ${path}: ${first?.message ?? "schema validation failed"}.`,
      path,
    );
  }
  const config = normalize(parsed as Record<string, unknown>);
  assertReferences(config);
  const sourceDirectory = dirname(absoluteSource);
  const projectCandidate = resolve(sourceDirectory, config.project.root);
  let projectRoot: string;
  try {
    projectRoot = await realpath(projectCandidate);
  } catch (error) {
    throw configError(
      "CONFIG_PROJECT_ROOT_INVALID",
      `Project root does not exist: ${projectCandidate}.`,
      "project.root",
      error,
    );
  }
  const stateRoot = resolve(projectRoot, config.state.directory);
  if (
    !isDescendant(projectRoot, stateRoot) ||
    stateRoot === resolve(homedir()) ||
    stateRoot === resolve("/")
  ) {
    throw configError(
      "CONFIG_STATE_PATH_UNSAFE",
      "State directory must be a non-broad descendant of the project root.",
      "state.directory",
    );
  }
  for (const [taskId, task] of Object.entries(config.tasks)) {
    const taskPath = resolve(sourceDirectory, task.file);
    if (!isDescendant(projectRoot, taskPath)) {
      throw configError(
        "CONFIG_TASK_PATH_UNSAFE",
        `Task '${taskId}' escapes the project root.`,
        `tasks.${taskId}.file`,
      );
    }
  }
  const warnings: ConfigWarning[] = config.defaults.environment.pass.map(
    (name) => ({
      code: "ENVIRONMENT_EXPORT_ENABLED",
      path: "defaults.environment.pass",
      message: `Environment variable '${name}' is explicitly passed; exports must warn before including derived values.`,
    }),
  );
  return {
    sourcePath: absoluteSource,
    config,
    canonicalJson: canonicalJson(config),
    configHash: canonicalHash(config),
    paths: { projectRoot, stateRoot },
    warnings,
  };
}
