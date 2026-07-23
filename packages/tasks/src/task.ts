import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import { parseDocument } from "yaml";

import {
  PatchRaceError,
  canonicalHash,
  canonicalJson,
  sha256,
  taskV1Schema,
  type ContentHash,
  type TaskV1,
} from "@patchrace/contracts";

export interface TaskValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface LoadedTask {
  readonly sourcePath: string;
  readonly directory: string;
  readonly task: TaskV1;
  readonly canonicalJson: string;
  readonly taskHash: ContentHash;
  readonly referencedFiles: readonly {
    readonly role: "instruction" | "setup" | "verifier";
    readonly logicalPath: string;
    readonly sourcePath: string;
    readonly contentHash: ContentHash;
  }[];
}

export interface LoadTaskOptions {
  readonly verifierRoot?: string;
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
  allowUnionTypes: true,
  formats: {
    "date-time": true,
  },
});
const validateSchema = ajv.compile(taskV1Schema) as ValidateFunction;

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

function taskError(
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

function parseTask(text: string, sourcePath: string): unknown {
  if (sourcePath.toLowerCase().endsWith(".json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw taskError(
        "TASK_PARSE_ERROR",
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
    throw taskError(
      "TASK_PARSE_ERROR",
      `Unsafe or overly complex YAML in ${sourcePath}.`,
      "$",
      error,
    );
  }
  if (document.errors.length > 0) {
    const first = document.errors[0];
    throw taskError(
      "TASK_PARSE_ERROR",
      first?.message ?? `Invalid YAML in ${sourcePath}.`,
      "$",
      first,
    );
  }
  try {
    return document.toJS({ maxAliasCount: 50 }) as unknown;
  } catch (error) {
    throw taskError(
      "TASK_PARSE_ERROR",
      `Unsafe or overly complex YAML in ${sourcePath}.`,
      "$",
      error,
    );
  }
}

function semanticIssues(task: TaskV1): TaskValidationIssue[] {
  const issues: TaskValidationIssue[] = [];
  const commandIds = new Set<string>();
  const allCommands = [...task.setup.commands, ...task.verifier.commands];
  for (const [index, command] of allCommands.entries()) {
    if (commandIds.has(command.id)) {
      issues.push({
        code: "TASK_COMMAND_ID_DUPLICATE",
        path: `commands[${index}].id`,
        message: `Command id '${command.id}' is duplicated.`,
      });
    }
    commandIds.add(command.id);
    if (
      (command.argv !== undefined &&
        (command.shell !== undefined || command.shellKind !== undefined)) ||
      (command.argv === undefined &&
        (command.shell === undefined || command.shellKind === undefined))
    ) {
      issues.push({
        code: "TASK_COMMAND_MODE_INVALID",
        path: `commands[${index}]`,
        message:
          "A command must use exactly one argv form or trusted shell/shellKind form.",
      });
    }
  }
  const assertionIds = new Set<string>();
  for (const [index, assertion] of task.assertions.entries()) {
    if (assertionIds.has(assertion.id)) {
      issues.push({
        code: "TASK_ASSERTION_ID_DUPLICATE",
        path: `assertions[${index}].id`,
        message: `Assertion id '${assertion.id}' is duplicated.`,
      });
    }
    assertionIds.add(assertion.id);
    if (assertion.kind === "command" && !commandIds.has(assertion.commandId)) {
      issues.push({
        code: "TASK_COMMAND_REFERENCE_MISSING",
        path: `assertions[${index}].commandId`,
        message: `Assertion references unknown command '${assertion.commandId}'.`,
      });
    }
    if (
      assertion.kind === "file-content" &&
      [assertion.exact, assertion.regex, assertion.hash].filter(
        (value) => value !== undefined,
      ).length !== 1
    ) {
      issues.push({
        code: "TASK_FILE_CONTENT_RULE_AMBIGUOUS",
        path: `assertions[${index}]`,
        message: "A file-content assertion must declare exactly one rule.",
      });
    }
  }
  const mounts = new Set<string>();
  for (const [index, asset] of [
    ...task.setup.assets,
    ...task.verifier.assets,
  ].entries()) {
    if (mounts.has(asset.mount)) {
      issues.push({
        code: "TASK_ASSET_MOUNT_COLLISION",
        path: `assets[${index}].mount`,
        message: `Asset mount '${asset.mount}' is duplicated.`,
      });
    }
    mounts.add(asset.mount);
  }
  if (
    task.budgets.maxPatchLines > 0 &&
    task.assertions.some(
      (assertion) =>
        assertion.kind === "diff-limit" &&
        assertion.maxLines !== undefined &&
        assertion.maxLines > task.budgets.maxPatchLines,
    )
  ) {
    issues.push({
      code: "TASK_ASSERTION_EXCEEDS_BUDGET",
      path: "assertions",
      message: "A diff-limit maxLines value exceeds budgets.maxPatchLines.",
    });
  }
  return issues;
}

export function validateTask(value: unknown): readonly TaskValidationIssue[] {
  if (!validateSchema(value)) {
    return (validateSchema.errors ?? []).map((issue) => {
      const path = issuePath(issue);
      return {
        code: "TASK_SCHEMA_INVALID",
        path,
        message: `Invalid task at ${path}: ${issue.message ?? "schema validation failed"}.`,
      };
    });
  }
  return semanticIssues(value as TaskV1);
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

async function readReferencedFile(
  directory: string,
  role: "instruction" | "setup" | "verifier",
  logicalPath: string,
  expectedHash: ContentHash,
): Promise<LoadedTask["referencedFiles"][number]> {
  const requested = resolve(directory, logicalPath);
  if (!isDescendant(directory, requested)) {
    throw taskError(
      "TASK_ASSET_PATH_UNSAFE",
      `Referenced ${role} file escapes the task directory.`,
      logicalPath,
    );
  }
  let sourcePath: string;
  try {
    sourcePath = await realpath(requested);
  } catch (error) {
    throw taskError(
      "TASK_ASSET_READ_FAILED",
      `Cannot read referenced ${role} file '${logicalPath}'.`,
      logicalPath,
      error,
    );
  }
  if (!isDescendant(directory, sourcePath)) {
    throw taskError(
      "TASK_ASSET_PATH_UNSAFE",
      `Referenced ${role} file resolves outside the task directory.`,
      logicalPath,
    );
  }
  const info = await stat(sourcePath);
  if (!info.isFile()) {
    throw taskError(
      "TASK_ASSET_NOT_FILE",
      `Referenced ${role} path '${logicalPath}' is not a regular file.`,
      logicalPath,
    );
  }
  const contentHash = sha256(await readFile(sourcePath));
  if (contentHash !== expectedHash) {
    throw taskError(
      "TASK_ASSET_HASH_MISMATCH",
      `Referenced ${role} file '${logicalPath}' does not match its declared hash.`,
      logicalPath,
    );
  }
  return { role, logicalPath, sourcePath, contentHash };
}

export async function loadTask(
  sourcePath: string,
  options: LoadTaskOptions = {},
): Promise<LoadedTask> {
  const requested = resolve(sourcePath);
  let absoluteSource: string;
  try {
    absoluteSource = await realpath(requested);
  } catch (error) {
    throw taskError(
      "TASK_READ_FAILED",
      `Cannot read task at ${requested}.`,
      "$",
      error,
    );
  }
  const directory = dirname(absoluteSource);
  const text = await readFile(absoluteSource, "utf8").catch(
    (error: unknown) => {
      throw taskError(
        "TASK_READ_FAILED",
        `Cannot read task at ${absoluteSource}.`,
        "$",
        error,
      );
    },
  );
  const parsed = parseTask(text, absoluteSource);
  const issues = validateTask(parsed);
  if (issues.length > 0) {
    const first = issues[0]!;
    throw taskError(first.code, first.message, first.path);
  }
  const task = parsed as TaskV1;
  let verifierRoot = directory;
  if (
    task.verifier.visibility === "hidden" &&
    task.verifier.assets.length > 0
  ) {
    if (options.verifierRoot === undefined) {
      throw taskError(
        "TASK_HIDDEN_VERIFIER_ROOT_REQUIRED",
        "Hidden verifier assets require an explicit external verifier root.",
        "verifier",
      );
    }
    verifierRoot = await realpath(resolve(options.verifierRoot)).catch(
      (error: unknown) => {
        throw taskError(
          "TASK_HIDDEN_VERIFIER_ROOT_INVALID",
          "Hidden verifier root does not exist.",
          "verifierRoot",
          error,
        );
      },
    );
    if (
      verifierRoot === directory ||
      isDescendant(directory, verifierRoot) ||
      isDescendant(verifierRoot, directory)
    ) {
      throw taskError(
        "TASK_HIDDEN_VERIFIER_ROOT_UNSAFE",
        "Hidden verifier root must be separate from the task directory.",
        "verifierRoot",
      );
    }
  }
  const references = [
    {
      role: "instruction" as const,
      root: directory,
      path: task.instruction.file,
      hash: task.instruction.hash,
    },
    ...task.setup.assets.map((asset) => ({
      role: "setup" as const,
      root: directory,
      path: asset.source,
      hash: asset.hash,
    })),
    ...task.verifier.assets.map((asset) => ({
      role: "verifier" as const,
      root: verifierRoot,
      path: asset.source,
      hash: asset.hash,
    })),
  ];
  const referencedFiles = await Promise.all(
    references.map((reference) =>
      readReferencedFile(
        reference.root,
        reference.role,
        reference.path,
        reference.hash,
      ),
    ),
  );
  const serialized = canonicalJson(task);
  const taskHash = canonicalHash({
    task,
    referencedContent: referencedFiles.map(
      ({ role, logicalPath, contentHash }) => ({
        role,
        logicalPath,
        contentHash,
      }),
    ),
  });
  return {
    sourcePath: absoluteSource,
    directory,
    task,
    canonicalJson: serialized,
    taskHash,
    referencedFiles,
  };
}

export function serializeTask(task: TaskV1): string {
  const issues = validateTask(task);
  if (issues.length > 0) {
    const first = issues[0]!;
    throw taskError(first.code, first.message, first.path);
  }
  return `${canonicalJson(task)}\n`;
}
