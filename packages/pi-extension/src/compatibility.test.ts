import { describe, expect, it } from "vitest";

import {
  createPiPackagePlan,
  filterPiExtensions,
  installProjectPackage,
  parsePiPackageSource,
  removeProjectPackage,
} from "./compatibility.js";

describe("Pi package compatibility plans", () => {
  it("plans local, git, and npm project installs without global scope", () => {
    const sources = [
      "./packages/pi-extension",
      "git:https://example.test/patchrace.git@v0.1.0",
      "npm:pi-patchrace@0.1.0",
    ];
    const plans = sources.map((source) =>
      createPiPackagePlan({
        action: "install",
        source,
        cwd: "/repo",
        scope: "project",
      }),
    );
    expect(plans.map((plan) => plan.source.kind)).toEqual([
      "local",
      "git",
      "npm",
    ]);
    for (const plan of plans) {
      expect(plan.arguments).toContain("-l");
      expect(plan.arguments).toContain("--approve");
      expect(plan.mutates).toBe(".pi/settings.json");
    }
    expect(plans[0]?.network).toBe("never");
    expect(plans.slice(1).map((plan) => plan.network)).toEqual([
      "source-dependent",
      "source-dependent",
    ]);
  });

  it("uses stable identities across git/npm versions and local spellings", () => {
    expect(
      parsePiPackageSource("npm:pi-patchrace@0.1.0", "/repo").identity,
    ).toBe(parsePiPackageSource("npm:pi-patchrace@0.2.0", "/repo").identity);
    expect(
      parsePiPackageSource("git:https://example.test/patchrace.git@v1", "/repo")
        .identity,
    ).toBe(
      parsePiPackageSource("git:https://example.test/patchrace.git@v2", "/repo")
        .identity,
    );
    expect(
      parsePiPackageSource("./packages/pi-extension", "/repo").identity,
    ).toBe(
      parsePiPackageSource("/repo/packages/pi-extension", "/other").identity,
    );
  });

  it("filters only manifest-declared resources and supports disable/re-enable", () => {
    const manifest = ["./dist/index.js"];
    expect(filterPiExtensions(manifest, undefined)).toEqual(["dist/index.js"]);
    expect(filterPiExtensions(manifest, [])).toEqual([]);
    expect(filterPiExtensions(manifest, ["+dist/index.js"])).toEqual([
      "dist/index.js",
    ]);
    expect(
      filterPiExtensions(manifest, ["dist/*.js", "!dist/index.js"]),
    ).toEqual([]);
    expect(filterPiExtensions(manifest, ["+outside.js"])).toEqual([]);
  });

  it("updates and uninstalls one project identity while preserving unrelated state", () => {
    const original = {
      theme: "dark",
      packages: ["npm:unrelated@1.0.0", "npm:pi-patchrace@0.1.0"],
    };
    const updated = installProjectPackage(
      original,
      {
        source: "npm:pi-patchrace@0.2.0",
        extensions: ["+dist/index.js"],
      },
      "/repo",
    );
    expect(updated).toEqual({
      theme: "dark",
      packages: [
        "npm:unrelated@1.0.0",
        {
          source: "npm:pi-patchrace@0.2.0",
          extensions: ["+dist/index.js"],
        },
      ],
    });
    expect(removeProjectPackage(updated, "npm:pi-patchrace", "/repo")).toEqual({
      theme: "dark",
      packages: ["npm:unrelated@1.0.0"],
    });
  });

  it("plans targeted update and project-local removal", () => {
    expect(
      createPiPackagePlan({
        action: "update",
        source: "npm:pi-patchrace",
        cwd: "/repo",
        scope: "project",
      }).arguments,
    ).toEqual(["update", "--extension", "npm:pi-patchrace", "--approve"]);
    expect(
      createPiPackagePlan({
        action: "remove",
        source: "./packages/pi-extension",
        cwd: "/repo",
        scope: "project",
      }).arguments,
    ).toEqual(["remove", "./packages/pi-extension", "-l", "--approve"]);
  });
});
