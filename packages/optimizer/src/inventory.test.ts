import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inventoryPiResources } from "./inventory.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function root(prefix: string): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}

describe("Pi resource inventory", () => {
  it("maps explicit origin and precedence without mutating either root", async () => {
    const project = await root("patchrace-inventory-project-");
    const global = await root("patchrace-inventory-global-");
    await mkdir(join(project, ".pi", "skills", "test-first"), {
      recursive: true,
    });
    await mkdir(join(global, "skills", "test-first"), { recursive: true });
    await writeFile(join(project, "AGENTS.md"), "Project facts.\n");
    await writeFile(
      join(project, ".pi", "skills", "test-first", "SKILL.md"),
      "---\nname: test-first\n---\nRun focused tests.\n",
    );
    await writeFile(
      join(global, "skills", "test-first", "SKILL.md"),
      "---\nname: test-first\n---\nRun every test.\n",
    );
    const before = await readFile(
      join(project, ".pi", "skills", "test-first", "SKILL.md"),
      "utf8",
    );

    const result = await inventoryPiResources({
      projectRoot: project,
      globalRoot: global,
    });

    const skills = result.resources.filter(
      (resource) => resource.kind === "skill",
    );
    expect(skills).toHaveLength(2);
    expect(
      skills.find((resource) => resource.origin === "project"),
    ).toMatchObject({ status: "active", precedence: 200 });
    expect(
      skills.find((resource) => resource.origin === "global"),
    ).toMatchObject({ status: "shadowed", precedence: 100 });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-resource" }),
      ]),
    );
    expect(
      await readFile(
        join(project, ".pi", "skills", "test-first", "SKILL.md"),
        "utf8",
      ),
    ).toBe(before);
  });

  it("reports bounded smells without returning secret content or following symlinks", async () => {
    const project = await root("patchrace-inventory-smells-");
    const outside = await root("patchrace-inventory-outside-");
    await mkdir(join(project, ".pi", "skills", "unsafe"), {
      recursive: true,
    });
    await writeFile(
      join(project, ".pi", "skills", "unsafe", "SKILL.md"),
      "api_key = 'this-is-a-secret-value'\n",
    );
    await writeFile(join(outside, "AGENTS.md"), "outside\n");
    await symlink(join(outside, "AGENTS.md"), join(project, "AGENTS.md"));

    const result = await inventoryPiResources({ projectRoot: project });
    const serialized = JSON.stringify(result);

    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "invalid-skill-frontmatter",
        "secret-like-content",
        "symlink-refused",
      ]),
    );
    expect(serialized).not.toContain("this-is-a-secret-value");
    expect(
      result.resources.every(
        (resource) => !resource.logicalPath.includes("outside"),
      ),
    ).toBe(true);
  });

  it("keeps executable resources informational and out of context cost", async () => {
    const project = await root("patchrace-inventory-executable-");
    await mkdir(join(project, ".pi", "extensions"), { recursive: true });
    await writeFile(
      join(project, ".pi", "extensions", "unsafe.ts"),
      "run();\n",
    );

    const result = await inventoryPiResources({ projectRoot: project });

    expect(result.resources[0]).toMatchObject({
      kind: "extension",
      status: "informational",
      estimatedContextTokens: 0,
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "executable-resource",
          mutationAllowed: false,
        }),
      ]),
    );
  });
});
