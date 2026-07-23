import { describe, expect, it } from "vitest";

import {
  assertRunId,
  canonicalHash,
  canonicalJson,
  createSortableId,
  ExitCode,
  PatchRaceError,
  SCHEMA_VERSION,
  normalizeError,
  suiteConfigSchema,
  taskV1Schema,
} from "./index.js";

describe("PatchRaceError", () => {
  it("maps categories to stable exit codes and machine output", () => {
    const error = new PatchRaceError({
      code: "CONFIG_INVALID",
      category: "CONFIG",
      message: "Invalid config",
      path: "defaults.repeat",
    });

    expect(error.exitCode).toBe(ExitCode.Config);
    expect(error.toJSON()).toEqual({
      schemaVersion: SCHEMA_VERSION,
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        category: "CONFIG",
        message: "Invalid config",
        path: "defaults.repeat",
      },
    });
  });

  it("does not expose an unknown error message", () => {
    expect(normalizeError(new Error("secret value")).message).not.toContain(
      "secret value",
    );
  });
});

describe("canonical contracts", () => {
  it("sorts object keys and hashes equal values identically", () => {
    expect(canonicalJson({ z: 1, nested: { b: true, a: null } })).toBe(
      '{"nested":{"a":null,"b":true},"z":1}',
    );
    expect(canonicalHash({ b: 2, a: 1 })).toBe(canonicalHash({ a: 1, b: 2 }));
  });

  it("creates validated sortable run IDs with injected entropy", () => {
    const id = createSortableId("run", {
      now: () => 0,
      random: () => new Uint8Array(10),
    });
    expect(id).toBe("run_00000000000000000000000000");
    expect(() => assertRunId(id)).not.toThrow();
    expect(() => assertRunId("run_../../escape")).toThrowError(PatchRaceError);
  });
});

describe("suite configuration contract", () => {
  it("owns the public suite schema in the contracts package", () => {
    expect(suiteConfigSchema).toMatchObject({
      $id: "https://patchrace.dev/schemas/suite-v1.json",
      properties: { schemaVersion: { const: SCHEMA_VERSION } },
    });
  });
});

describe("task contract", () => {
  it("owns the public task schema in the contracts package", () => {
    expect(taskV1Schema).toMatchObject({
      $id: "https://patchrace.dev/schemas/task-v1.json",
      properties: { schemaVersion: { const: SCHEMA_VERSION } },
    });
  });
});
