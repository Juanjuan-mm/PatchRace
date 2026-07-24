import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PatchRaceError } from "@patchrace/contracts";

import { loadSuiteConfig } from "./config.js";

const temporaryDirectories: string[] = [];

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-config-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, ".patchrace", "tasks"), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

const yaml = `
schemaVersion: 1.0.0
project:
  root: ..
adapters:
  local:
    kind: fixture
    executable: node
variants:
  baseline:
    adapter: local
suites:
  smoke:
    tasks: [add-regression]
    split: validation
tasks:
  add-regression:
    file: tasks/add-regression.yaml
`;

describe("loadSuiteConfig", () => {
  it("normalizes YAML deterministically and applies explicit defaults", async () => {
    const root = await project();
    const path = join(root, ".patchrace", "suite.yaml");
    await writeFile(path, yaml);

    const loaded = await loadSuiteConfig(path);

    expect(loaded.config.defaults).toMatchObject({
      concurrency: 2,
      repeat: 1,
      budgets: { maxTrials: 30 },
    });
    const canonicalRoot = await realpath(root);
    expect(loaded.paths).toEqual({
      projectRoot: canonicalRoot,
      stateRoot: join(canonicalRoot, ".patchrace"),
    });
    expect(loaded.configHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(loaded.canonicalJson).not.toContain(root);
  });

  it("reports an actionable reference path", async () => {
    const root = await project();
    const path = join(root, ".patchrace", "suite.yaml");
    await writeFile(path, yaml.replace("adapter: local", "adapter: missing"));

    await expect(loadSuiteConfig(path)).rejects.toMatchObject({
      details: {
        code: "CONFIG_REFERENCE_MISSING",
        path: "variants.baseline.adapter",
      },
    });
  });

  it("rejects unknown keys and unsafe state paths", async () => {
    const root = await project();
    const unknown = join(root, ".patchrace", "unknown.yaml");
    await writeFile(unknown, `${yaml}\nsurprise: true\n`);
    await expect(loadSuiteConfig(unknown)).rejects.toBeInstanceOf(
      PatchRaceError,
    );

    const unsafe = join(root, ".patchrace", "unsafe.yaml");
    await writeFile(
      unsafe,
      yaml.replace(
        "project:\n  root: ..",
        "project:\n  root: ..\nstate:\n  directory: ..",
      ),
    );
    await expect(loadSuiteConfig(unsafe)).rejects.toMatchObject({
      details: { code: "CONFIG_STATE_PATH_UNSAFE" },
    });
  });

  it("normalizes deeply nested YAML parser failures as config errors", async () => {
    const root = await project();
    const path = join(root, ".patchrace", "nested.yaml");
    await writeFile(path, `${"[".repeat(5000)}1${"]".repeat(5000)}`);
    await expect(loadSuiteConfig(path)).rejects.toMatchObject({
      details: { code: "CONFIG_PARSE_ERROR", category: "CONFIG" },
    });
  });
});
