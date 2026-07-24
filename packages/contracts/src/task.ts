import { SCHEMA_VERSION } from "./version.js";

export type ContentHash = `sha256:${string}`;
export type TaskSplit = "training" | "validation" | "holdout";

export interface TaskAssetV1 {
  readonly source: string;
  readonly mount: string;
  readonly hash: ContentHash;
}

export interface TaskCommandV1 {
  readonly id: string;
  readonly kind?: "setup" | "build" | "test" | "lint" | "typecheck" | "command";
  readonly argv?: readonly [string, ...string[]];
  readonly shell?: string;
  readonly shellKind?: "posix" | "powershell";
  readonly cwd?: string;
  readonly environment?: {
    readonly inherit?: readonly string[];
    readonly pass?: Readonly<Record<string, string>>;
  };
  readonly timeoutSeconds: number;
  readonly expectedExitCodes?: readonly number[];
  readonly cache?: "none" | "read-only" | "read-write";
  readonly network?: "forbidden" | "allowed" | "required";
}

export type TaskAssertionV1 =
  | {
      readonly id: string;
      readonly kind: "required-paths" | "forbidden-paths" | "protected-paths";
      readonly paths: readonly string[];
      readonly optionalReason?: string;
    }
  | {
      readonly id: string;
      readonly kind: "file-content";
      readonly path: string;
      readonly encoding: "utf8";
      readonly exact?: string;
      readonly regex?: string;
      readonly hash?: ContentHash;
      readonly optionalReason?: string;
    }
  | {
      readonly id: string;
      readonly kind: "diff-limit";
      readonly maxChangedFiles?: number;
      readonly maxLines?: number;
      readonly maxBinaryFiles?: number;
      readonly allowDependencyChanges?: boolean;
      readonly allowLockfileChanges?: boolean;
      readonly optionalReason?: string;
    }
  | {
      readonly id: string;
      readonly kind: "repository-cleanliness";
      readonly allowedUntrackedPaths?: readonly string[];
      readonly optionalReason?: string;
    }
  | {
      readonly id: string;
      readonly kind: "command";
      readonly commandId: string;
      readonly expectedStatus?: "passed" | "failed";
      readonly optionalReason?: string;
    }
  | {
      readonly id: string;
      readonly kind:
        "patch-applies" | "baseline-invariant" | "hidden-asset-non-disclosure";
      readonly optionalReason?: string;
    };

export interface TaskV1 {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly baseline: {
    readonly repository: string;
    readonly commit: string;
    readonly parent?: number;
    readonly submodules: "locked" | "disabled";
    readonly lfs: "required" | "optional" | "disabled";
  };
  readonly instruction: {
    readonly file: string;
    readonly hash: ContentHash;
  };
  readonly setup: {
    readonly commands: readonly TaskCommandV1[];
    readonly assets: readonly TaskAssetV1[];
  };
  readonly verifier: {
    readonly visibility: "hidden" | "public";
    readonly assets: readonly TaskAssetV1[];
    readonly commands: readonly TaskCommandV1[];
  };
  readonly assertions: readonly TaskAssertionV1[];
  readonly budgets: {
    readonly trialSeconds: number;
    readonly setupSeconds?: number;
    readonly graderSeconds?: number;
    readonly maxTokens: number | null;
    readonly maxCostUsd: number | null;
    readonly maxOutputBytes?: number;
    readonly maxPatchLines: number;
    readonly maxChangedFiles?: number;
    readonly diskMiB?: number;
  };
  readonly provenance: {
    readonly source: "manual" | "git-history" | "github";
    readonly sourceCommit: string;
    readonly sourceParent?: string;
    readonly discoveryQuery?: string;
    readonly extractionToolVersion?: string;
    readonly referencePatchHash: ContentHash;
    readonly verifierOrigin?: string;
    readonly exclusions?: readonly string[];
    readonly createdAt: string;
    readonly reviewedBy: string;
  };
  readonly metadata: Readonly<
    Record<string, unknown> & {
      readonly ecosystem?: string;
      readonly category?: string;
      readonly split?: TaskSplit;
    }
  >;
}

const idPattern = "^[a-z][a-z0-9-]{0,63}$";
const hashPattern = "^sha256:[a-f0-9]{64}$";
const shaPattern = "^[a-f0-9]{40}$";
const logicalPath = {
  type: "string",
  minLength: 1,
  pattern: "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*\\u0000).+$",
} as const;
const environmentName = "^[A-Za-z_][A-Za-z0-9_]*$";
const nonNegative = { type: "number", minimum: 0 } as const;
const nonNegativeInteger = { type: "integer", minimum: 0 } as const;
const contentHash = { type: "string", pattern: hashPattern } as const;

const asset = {
  type: "object",
  additionalProperties: false,
  required: ["source", "mount", "hash"],
  properties: { source: logicalPath, mount: logicalPath, hash: contentHash },
} as const;

const command = {
  type: "object",
  additionalProperties: false,
  required: ["id", "timeoutSeconds"],
  oneOf: [
    { required: ["argv"], properties: { argv: true } },
    {
      required: ["shell", "shellKind"],
      properties: { shell: true, shellKind: true },
    },
  ],
  properties: {
    id: { type: "string", pattern: idPattern },
    kind: { enum: ["setup", "build", "test", "lint", "typecheck", "command"] },
    argv: { type: "array", minItems: 1, items: { type: "string" } },
    shell: { type: "string", minLength: 1 },
    shellKind: { enum: ["posix", "powershell"] },
    cwd: logicalPath,
    environment: {
      type: "object",
      additionalProperties: false,
      properties: {
        inherit: {
          type: "array",
          uniqueItems: true,
          items: { type: "string", pattern: environmentName },
        },
        pass: {
          type: "object",
          propertyNames: { pattern: environmentName },
          additionalProperties: { type: "string" },
        },
      },
    },
    timeoutSeconds: nonNegative,
    expectedExitCodes: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "integer", minimum: 0, maximum: 255 },
    },
    cache: { enum: ["none", "read-only", "read-write"] },
    network: { enum: ["forbidden", "allowed", "required"] },
  },
} as const;

const optionalReason = { type: "string", minLength: 1 } as const;
const assertionBase = {
  id: { type: "string", pattern: idPattern },
  optionalReason,
} as const;

export const taskV1Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://patchrace.dev/schemas/task-v1.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "revision",
    "baseline",
    "instruction",
    "setup",
    "verifier",
    "assertions",
    "budgets",
    "provenance",
    "metadata",
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSION },
    id: { type: "string", pattern: idPattern },
    revision: { type: "integer", minimum: 1 },
    baseline: {
      type: "object",
      additionalProperties: false,
      required: ["repository", "commit", "submodules", "lfs"],
      properties: {
        repository: { type: "string", minLength: 1 },
        commit: { type: "string", pattern: shaPattern },
        parent: { type: "integer", minimum: 1 },
        submodules: { enum: ["locked", "disabled"] },
        lfs: { enum: ["required", "optional", "disabled"] },
      },
    },
    instruction: {
      type: "object",
      additionalProperties: false,
      required: ["file", "hash"],
      properties: { file: logicalPath, hash: contentHash },
    },
    setup: {
      type: "object",
      additionalProperties: false,
      required: ["commands", "assets"],
      properties: {
        commands: { type: "array", items: command },
        assets: { type: "array", items: asset },
      },
    },
    verifier: {
      type: "object",
      additionalProperties: false,
      required: ["visibility", "assets", "commands"],
      properties: {
        visibility: { enum: ["hidden", "public"] },
        assets: { type: "array", items: asset },
        commands: { type: "array", minItems: 1, items: command },
      },
    },
    assertions: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "kind", "paths"],
            properties: {
              ...assertionBase,
              kind: {
                enum: ["required-paths", "forbidden-paths", "protected-paths"],
              },
              paths: {
                type: "array",
                minItems: 1,
                uniqueItems: true,
                items: logicalPath,
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "kind", "path", "encoding"],
            anyOf: [
              { required: ["exact"] },
              { required: ["regex"] },
              { required: ["hash"] },
            ],
            properties: {
              ...assertionBase,
              kind: { const: "file-content" },
              path: logicalPath,
              encoding: { const: "utf8" },
              exact: { type: "string" },
              regex: { type: "string" },
              hash: contentHash,
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "kind"],
            properties: {
              ...assertionBase,
              kind: { const: "diff-limit" },
              maxChangedFiles: nonNegativeInteger,
              maxLines: nonNegativeInteger,
              maxBinaryFiles: nonNegativeInteger,
              allowDependencyChanges: { type: "boolean" },
              allowLockfileChanges: { type: "boolean" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "kind"],
            properties: {
              ...assertionBase,
              kind: { const: "repository-cleanliness" },
              allowedUntrackedPaths: {
                type: "array",
                uniqueItems: true,
                items: logicalPath,
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "kind", "commandId"],
            properties: {
              ...assertionBase,
              kind: { const: "command" },
              commandId: { type: "string", pattern: idPattern },
              expectedStatus: { enum: ["passed", "failed"] },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "kind"],
            properties: {
              ...assertionBase,
              kind: {
                enum: [
                  "patch-applies",
                  "baseline-invariant",
                  "hidden-asset-non-disclosure",
                ],
              },
            },
          },
        ],
      },
    },
    budgets: {
      type: "object",
      additionalProperties: false,
      required: ["trialSeconds", "maxTokens", "maxCostUsd", "maxPatchLines"],
      properties: {
        trialSeconds: nonNegative,
        setupSeconds: nonNegative,
        graderSeconds: nonNegative,
        maxTokens: { anyOf: [nonNegative, { type: "null" }] },
        maxCostUsd: { anyOf: [nonNegative, { type: "null" }] },
        maxOutputBytes: nonNegativeInteger,
        maxPatchLines: nonNegativeInteger,
        maxChangedFiles: nonNegativeInteger,
        diskMiB: nonNegativeInteger,
      },
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: [
        "source",
        "sourceCommit",
        "referencePatchHash",
        "createdAt",
        "reviewedBy",
      ],
      properties: {
        source: { enum: ["manual", "git-history", "github"] },
        sourceCommit: { type: "string", pattern: shaPattern },
        sourceParent: { type: "string", pattern: shaPattern },
        discoveryQuery: { type: "string" },
        extractionToolVersion: { type: "string", minLength: 1 },
        referencePatchHash: contentHash,
        verifierOrigin: { type: "string", minLength: 1 },
        exclusions: {
          type: "array",
          uniqueItems: true,
          items: { type: "string" },
        },
        createdAt: { type: "string", format: "date-time" },
        reviewedBy: { type: "string", minLength: 1 },
      },
    },
    metadata: {
      type: "object",
      additionalProperties: true,
      properties: {
        ecosystem: { type: "string", minLength: 1 },
        category: { type: "string", minLength: 1 },
        split: { enum: ["training", "validation", "holdout"] },
      },
    },
  },
} as const;
