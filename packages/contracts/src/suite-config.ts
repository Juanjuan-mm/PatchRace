import { SCHEMA_VERSION } from "./version.js";

export interface BudgetConfig {
  readonly wallSeconds: number;
  readonly trialSeconds: number;
  readonly maxTrials: number;
  readonly maxTokens: number | null;
  readonly maxCostUsd: number | null;
  readonly diskMiB: number;
}

export interface AdapterConfig {
  readonly kind: string;
  readonly executable: string;
  readonly args?: readonly string[];
  readonly execution?: string;
  readonly version?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface NormalizedSuiteConfig {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly project: {
    readonly root: string;
    readonly trustRepositoryCommands: boolean;
  };
  readonly state: {
    readonly directory: string;
    readonly retention: {
      readonly rawRuns: "manual";
      readonly cacheDays: number;
    };
  };
  readonly defaults: {
    readonly concurrency: number;
    readonly repeat: number;
    readonly budgets: BudgetConfig;
    readonly environment: {
      readonly inherit: readonly string[];
      readonly pass: readonly string[];
      readonly redact: readonly string[];
    };
  };
  readonly adapters: Readonly<Record<string, AdapterConfig>>;
  readonly variants: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
  readonly suites: Readonly<
    Record<
      string,
      {
        readonly tasks: readonly string[];
        readonly split: string;
        readonly metadata?: Readonly<Record<string, unknown>>;
      }
    >
  >;
  readonly tasks: Readonly<
    Record<
      string,
      {
        readonly file: string;
        readonly metadata?: Readonly<Record<string, unknown>>;
      }
    >
  >;
  readonly objectives: {
    readonly policy: string;
    readonly afterHardGates: readonly string[];
  };
  readonly report: {
    readonly formats: readonly string[];
    readonly includeRawCode: string;
    readonly redactionProfile: string;
  };
  readonly metadata: Readonly<Record<string, unknown>>;
}

const idPattern = "^[a-z][a-z0-9-]{0,63}$";
const environmentNamePattern = "^[A-Za-z_][A-Za-z0-9_]*$";
const nonNegativeNumber = { type: "number", minimum: 0 } as const;
const metadata = { type: "object", additionalProperties: true } as const;

export const suiteConfigSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://patchrace.dev/schemas/suite-v1.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "adapters", "variants", "suites", "tasks"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSION },
    project: {
      type: "object",
      additionalProperties: false,
      properties: {
        root: { type: "string", minLength: 1 },
        trustRepositoryCommands: { type: "boolean" },
      },
    },
    state: {
      type: "object",
      additionalProperties: false,
      properties: {
        directory: { type: "string", minLength: 1 },
        retention: {
          type: "object",
          additionalProperties: false,
          properties: {
            rawRuns: { const: "manual" },
            cacheDays: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    defaults: {
      type: "object",
      additionalProperties: false,
      properties: {
        concurrency: { type: "integer", minimum: 1 },
        repeat: { type: "integer", minimum: 1 },
        budgets: {
          type: "object",
          additionalProperties: false,
          properties: {
            wallSeconds: nonNegativeNumber,
            trialSeconds: nonNegativeNumber,
            maxTrials: { type: "integer", minimum: 1 },
            maxTokens: { anyOf: [nonNegativeNumber, { type: "null" }] },
            maxCostUsd: { anyOf: [nonNegativeNumber, { type: "null" }] },
            diskMiB: nonNegativeNumber,
          },
        },
        environment: {
          type: "object",
          additionalProperties: false,
          properties: {
            inherit: {
              type: "array",
              uniqueItems: true,
              items: { type: "string", pattern: environmentNamePattern },
            },
            pass: {
              type: "array",
              uniqueItems: true,
              items: { type: "string", pattern: environmentNamePattern },
            },
            redact: {
              type: "array",
              uniqueItems: true,
              items: { type: "string", pattern: environmentNamePattern },
            },
          },
        },
      },
    },
    adapters: {
      type: "object",
      minProperties: 1,
      propertyNames: { pattern: idPattern },
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "executable"],
        properties: {
          kind: { type: "string", minLength: 1 },
          executable: { type: "string", minLength: 1 },
          args: {
            type: "array",
            items: { type: "string" },
          },
          execution: { type: "string", minLength: 1 },
          version: { type: "string", minLength: 1 },
          metadata,
        },
      },
    },
    variants: {
      type: "object",
      minProperties: 1,
      propertyNames: { pattern: idPattern },
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["adapter"],
        properties: {
          adapter: { type: "string", pattern: idPattern },
          model: { type: ["string", "null"] },
          harness: { type: "object", additionalProperties: true },
          workflow: { type: "object", additionalProperties: true },
          metadata,
        },
      },
    },
    suites: {
      type: "object",
      minProperties: 1,
      propertyNames: { pattern: idPattern },
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["tasks", "split"],
        properties: {
          tasks: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: { type: "string", pattern: idPattern },
          },
          split: { enum: ["training", "validation", "holdout"] },
          metadata,
        },
      },
    },
    tasks: {
      type: "object",
      minProperties: 1,
      propertyNames: { pattern: idPattern },
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["file"],
        properties: {
          file: { type: "string", minLength: 1 },
          metadata,
        },
      },
    },
    objectives: {
      type: "object",
      additionalProperties: false,
      properties: {
        policy: { type: "string", minLength: 1 },
        afterHardGates: {
          type: "array",
          uniqueItems: true,
          items: { type: "string" },
        },
      },
    },
    report: {
      type: "object",
      additionalProperties: false,
      properties: {
        formats: {
          type: "array",
          uniqueItems: true,
          items: { enum: ["json", "html"] },
        },
        includeRawCode: { enum: ["never", "local-only"] },
        redactionProfile: { type: "string", minLength: 1 },
      },
    },
    metadata,
  },
} as const;
