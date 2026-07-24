import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { isDirectExecution } from "./main.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("CLI direct execution", () => {
  it("recognizes an npm-style bin symlink to the module", () => {
    const root = mkdtempSync(join(tmpdir(), "patchrace-cli-main-"));
    temporaryRoots.push(root);
    const modulePath = join(root, "main.js");
    const binPath = join(root, "patchrace");
    writeFileSync(modulePath, "#!/usr/bin/env node\n");
    symlinkSync(modulePath, binPath);

    expect(realpathSync(binPath)).toBe(realpathSync(modulePath));
    expect(isDirectExecution(pathToFileURL(modulePath).href, binPath)).toBe(
      true,
    );
  });

  it("does not execute when imported or when the entry path is unavailable", () => {
    expect(isDirectExecution(import.meta.url, undefined)).toBe(false);
    expect(
      isDirectExecution(import.meta.url, "/missing/patchrace-entry.js"),
    ).toBe(false);
  });
});
