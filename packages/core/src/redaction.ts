import { Transform, type TransformCallback } from "node:stream";
import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalHash,
  canonicalJson,
  sha256,
} from "@patchrace/contracts";

import {
  assertSafeRoot,
  ensureOwnedDirectory,
  readRegularFileNoFollow,
  resolveOwnedPath,
} from "./safety.js";

export interface RedactionLiteral {
  readonly name: string;
  readonly value: string;
}
export interface RedactionProfile {
  readonly literals?: readonly RedactionLiteral[];
  readonly paths?: readonly string[];
  readonly sensitiveKeys?: readonly string[];
}

export interface RedactionFinding {
  readonly kind:
    "known-token" | "configured-value" | "path" | "sensitive-field";
  readonly name: string;
  readonly count: number;
}

export interface RedactionResult<T> {
  readonly value: T;
  readonly findings: readonly RedactionFinding[];
}

const DEFAULT_TRANSFORM_MAX_BYTES = 16 * 1024 * 1024;

const knownTokens: readonly [string, RegExp][] = [
  ["openai", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g],
  ["anthropic", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  [
    "github",
    /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  ],
  ["slack", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
];

function escaped(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
}

function htmlEncoded(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializedVariants(value: string): readonly string[] {
  const json = JSON.stringify(value);
  return [
    ...new Set([value, json.slice(1, json.length - 1), htmlEncoded(value)]),
  ].sort((left, right) => right.length - left.length);
}

export class Redactor {
  readonly #literals: readonly RedactionLiteral[];
  readonly #paths: readonly string[];
  readonly #sensitiveKeys: ReadonlySet<string>;
  readonly #counts = new Map<string, RedactionFinding>();

  constructor(profile: RedactionProfile = {}) {
    const names = new Set<string>();
    this.#literals = [...(profile.literals ?? [])]
      .filter(({ value }) => value.length >= 4)
      .map((literal) => {
        if (
          !/^[a-zA-Z0-9._-]{1,64}$/.test(literal.name) ||
          names.has(literal.name)
        )
          throw new PatchRaceError({
            code: "REDACTION_LITERAL_INVALID",
            category: "CONFIG",
            message:
              "Redaction literal names must be unique stable identifiers.",
            path: "literals",
          });
        names.add(literal.name);
        return literal;
      })
      .sort((left, right) => right.value.length - left.value.length);
    this.#paths = [...new Set(profile.paths ?? [])]
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);
    this.#sensitiveKeys = new Set(
      [
        "apiKey",
        "authorization",
        "credential",
        "password",
        "secret",
        "token",
        ...(profile.sensitiveKeys ?? []),
      ].map((key) => key.toLowerCase()),
    );
  }

  redactText(input: string): string {
    let output = input;
    for (const [name, pattern] of knownTokens) {
      output = output.replace(pattern, () => {
        this.record("known-token", name);
        return `[REDACTED:${name}]`;
      });
    }
    for (const literal of this.#literals) {
      for (const variant of serializedVariants(literal.value))
        output = output.replace(escaped(variant), () => {
          this.record("configured-value", literal.name);
          return `[REDACTED:${literal.name}]`;
        });
    }
    for (const [index, path] of this.#paths.entries()) {
      for (const variant of serializedVariants(path))
        output = output.replace(escaped(variant), () => {
          const name = `path-${index + 1}`;
          this.record("path", name);
          return `[REDACTED:${name}]`;
        });
    }
    return output;
  }

  redactValue(value: unknown): unknown {
    if (typeof value === "string") return this.redactText(value);
    if (Array.isArray(value))
      return value.map((entry) => this.redactValue(entry));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
          if (this.#sensitiveKeys.has(key.toLowerCase())) {
            this.record("sensitive-field", key.toLowerCase());
            return [key, `[REDACTED:field-${key.toLowerCase()}]`];
          }
          return [key, this.redactValue(entry)];
        }),
      );
    }
    return value;
  }

  findings(): readonly RedactionFinding[] {
    return [...this.#counts.values()].sort((left, right) =>
      `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`),
    );
  }

  private record(kind: RedactionFinding["kind"], name: string): void {
    const key = `${kind}:${name}`;
    const prior = this.#counts.get(key);
    this.#counts.set(key, { kind, name, count: (prior?.count ?? 0) + 1 });
  }
}

export class RedactionTransform extends Transform {
  readonly #redactor: Redactor;
  readonly #maxBytes: number;
  readonly #chunks: Buffer[] = [];
  #size = 0;
  constructor(
    redactor: Redactor,
    options: { readonly maxBytes?: number } = {},
  ) {
    super();
    this.#redactor = redactor;
    this.#maxBytes = options.maxBytes ?? DEFAULT_TRANSFORM_MAX_BYTES;
    if (!Number.isSafeInteger(this.#maxBytes) || this.#maxBytes <= 0)
      throw new PatchRaceError({
        code: "REDACTION_STREAM_LIMIT_INVALID",
        category: "CONFIG",
        message: "Redaction stream limit must be a positive safe integer.",
        path: "maxBytes",
      });
  }
  override _transform(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const bytes = Buffer.isBuffer(chunk)
      ? Buffer.from(chunk)
      : Buffer.from(chunk, encoding);
    this.#size += bytes.byteLength;
    if (this.#size > this.#maxBytes) {
      callback(
        new PatchRaceError({
          code: "REDACTION_STREAM_TOO_LARGE",
          category: "BUDGET",
          message:
            "Redaction stream exceeds its hard limit; no partial output was emitted.",
          path: "stream",
        }),
      );
      return;
    }
    this.#chunks.push(bytes);
    callback();
  }
  override _flush(callback: TransformCallback): void {
    this.push(
      this.#redactor.redactText(Buffer.concat(this.#chunks).toString("utf8")),
    );
    this.#chunks.length = 0;
    this.#size = 0;
    callback();
  }
}

export interface RedactedExportResult {
  readonly destinationRoot: string;
  readonly manifestHash: `sha256:${string}`;
  readonly included: readonly string[];
  readonly findings: readonly RedactionFinding[];
}

export async function createRedactedExport(options: {
  readonly sourceRoot: string;
  readonly destinationRoot: string;
  readonly logicalPaths: readonly string[];
  readonly redactor: Redactor;
  readonly maxFileBytes?: number;
}): Promise<RedactedExportResult> {
  const sourceRoot = assertSafeRoot(options.sourceRoot, "sourceRoot");
  const destinationRoot = assertSafeRoot(
    options.destinationRoot,
    "destinationRoot",
  );
  if (resolve(sourceRoot) === resolve(destinationRoot))
    throw new PatchRaceError({
      code: "REDACTION_IN_PLACE_REFUSED",
      category: "SAFETY",
      message:
        "A redacted export must be a distinct tree; raw evidence is never overwritten.",
      path: "destinationRoot",
    });
  await mkdir(dirname(destinationRoot), { recursive: true, mode: 0o700 });
  try {
    await mkdir(destinationRoot, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new PatchRaceError({
        code: "EXPORT_DESTINATION_EXISTS",
        category: "CONFLICT",
        message: "Redacted export destination already exists.",
        path: "destinationRoot",
      });
    throw error;
  }
  const included: {
    logicalPath: string;
    sourceHash: string;
    exportHash: string;
    size: number;
  }[] = [];
  for (const logicalPath of [...new Set(options.logicalPaths)].sort()) {
    const source = resolveOwnedPath(sourceRoot, logicalPath);
    const bytes = await readRegularFileNoFollow(
      source,
      logicalPath,
      options.maxFileBytes ?? 16 * 1024 * 1024,
    );
    if (bytes.includes(0))
      throw new PatchRaceError({
        code: "EXPORT_BINARY_EXCLUDED",
        category: "SAFETY",
        message: `Binary artifact is excluded from text redaction: ${logicalPath}.`,
        path: logicalPath,
      });
    const output = Buffer.from(
      options.redactor.redactText(bytes.toString("utf8")),
    );
    const destination = resolveOwnedPath(destinationRoot, logicalPath);
    await ensureOwnedDirectory(
      destinationRoot,
      dirname(logicalPath) === "." ? "." : dirname(logicalPath),
    );
    const handle = await open(destination, "wx", 0o600);
    try {
      await handle.writeFile(output);
      await handle.sync();
    } finally {
      await handle.close();
    }
    included.push({
      logicalPath,
      sourceHash: sha256(bytes),
      exportHash: sha256(output),
      size: output.byteLength,
    });
  }
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    redactionProfileHash: canonicalHash({
      findings: options.redactor
        .findings()
        .map(({ kind, name }) => ({ kind, name })),
    }),
    included,
    excludedByDefault: ["raw code", "unselected prompts", "unselected logs"],
    findings: options.redactor.findings(),
    residualWarning:
      "Configured redaction was applied; absence of unknown secrets is not guaranteed.",
  };
  const manifestBytes = Buffer.from(`${canonicalJson(manifest)}\n`);
  const handle = await open(
    resolve(destinationRoot, "export-manifest.json"),
    "wx",
    0o600,
  );
  try {
    await handle.writeFile(manifestBytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return {
    destinationRoot,
    manifestHash: sha256(manifestBytes),
    included: included.map(({ logicalPath }) => logicalPath),
    findings: options.redactor.findings(),
  };
}
