import { describe, expect, it } from "vitest";

import { parseNamedOptions, tokenizeArguments } from "./arguments.js";

describe("Pi command argument parsing", () => {
  it("preserves quoted values without invoking a shell", () => {
    expect(
      tokenizeArguments(
        '--config ".patchrace/suite file.yaml" --variants "pi,codex"',
      ),
    ).toEqual([
      "--config",
      ".patchrace/suite file.yaml",
      "--variants",
      "pi,codex",
    ]);
  });

  it("fails on incomplete quotes, missing values, and duplicate options", () => {
    expect(() => tokenizeArguments("--config 'open")).toThrow("unclosed quote");
    expect(() =>
      parseNamedOptions(["--config"], new Set(["--config"])),
    ).toThrow("requires a value");
    expect(() =>
      parseNamedOptions(
        ["--config", "a", "--config", "b"],
        new Set(["--config"]),
      ),
    ).toThrow("provided twice");
  });
});
