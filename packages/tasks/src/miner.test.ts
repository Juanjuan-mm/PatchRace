import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { sha256 } from "@patchrace/contracts";

import { mineGitHistory } from "./miner.js";

const execute = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function repository(): Promise<{
  readonly root: string;
  readonly rootCommit: string;
  readonly implementationOnly: string;
  readonly valid: string;
  readonly binary: string;
  readonly sensitive: string;
  readonly merge: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-miner-"));
  roots.push(root);
  await execute("git", ["init", "-q", "-b", "main"], { cwd: root });
  await execute("git", ["config", "user.name", "Fixture Author"], {
    cwd: root,
  });
  await execute("git", ["config", "user.email", "author@example.invalid"], {
    cwd: root,
  });
  await Promise.all([mkdir(join(root, "src")), mkdir(join(root, "test"))]);
  await writeFile(
    join(root, "src", "add.js"),
    "export const add = (a, b) => a - b;\n",
  );
  await writeFile(join(root, "README.md"), "fixture\n");
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "-qm", "root baseline"], { cwd: root });
  const rootCommit = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();

  await writeFile(
    join(root, "src", "add.js"),
    "export const add = (a, b) => a + b + 1;\n",
  );
  await execute("git", ["commit", "-qam", "implementation only"], {
    cwd: root,
  });
  const implementationOnly = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();

  await writeFile(
    join(root, "src", "add.js"),
    "export const add = (a, b) => a + b;\n",
  );
  await writeFile(
    join(root, "test", "add.test.js"),
    "import { add } from '../src/add.js'; if (add(1, 2) !== 3) throw new Error('bad');\n",
  );
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "-qm", "fix add with regression test"], {
    cwd: root,
  });
  const valid = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();

  await writeFile(join(root, "asset.bin"), Buffer.from([0, 1, 2, 3]));
  await writeFile(
    join(root, "src", "add.js"),
    "export const add = (a, b) => Number(a) + Number(b);\n",
  );
  await writeFile(
    join(root, "test", "add.test.js"),
    "import { add } from '../src/add.js'; if (add('1', 2) !== 3) throw new Error('bad');\n",
  );
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "-qm", "binary unsuitable change"], {
    cwd: root,
  });
  const binary = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();

  await writeFile(join(root, ".env"), "TOKEN=not-a-real-secret\n");
  await writeFile(
    join(root, "src", "add.js"),
    "export const add = (a, b) => +a + +b;\n",
  );
  await writeFile(
    join(root, "test", "add.test.js"),
    "import { add } from '../src/add.js'; if (add('1', 2) !== 3) throw new Error('bad');\n",
  );
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "-qm", "sensitive unsuitable change"], {
    cwd: root,
  });
  const sensitive = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();

  await execute("git", ["switch", "-qc", "feature"], { cwd: root });
  await writeFile(join(root, "feature.txt"), "feature\n");
  await execute("git", ["add", "feature.txt"], { cwd: root });
  await execute("git", ["commit", "-qm", "feature side"], { cwd: root });
  await execute("git", ["switch", "-q", "main"], { cwd: root });
  await writeFile(join(root, "README.md"), "fixture main\n");
  await execute("git", ["commit", "-qam", "main side"], { cwd: root });
  await execute(
    "git",
    ["merge", "--no-ff", "-qm", "merge feature", "feature"],
    {
      cwd: root,
    },
  );
  const merge = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  return {
    root,
    rootCommit,
    implementationOnly,
    valid,
    binary,
    sensitive,
    merge,
  };
}

describe("mineGitHistory", () => {
  it("extracts and reconstructs an eligible implementation plus test commit", async () => {
    const fixture = await repository();
    await writeFile(join(fixture.root, "unrelated.tmp"), "preserve\n");
    const before = (
      await execute("git", ["worktree", "list", "--porcelain"], {
        cwd: fixture.root,
      })
    ).stdout;

    const [candidate] = await mineGitHistory({
      repositoryRoot: fixture.root,
      commit: fixture.valid,
    });

    expect(candidate).toMatchObject({
      commit: fixture.valid,
      eligibility: "eligible",
      exclusionReasons: [],
      review: { required: true, status: "pending" },
      provenance: { source: "git-history", extractionToolVersion: "1.0.0" },
    });
    expect(candidate?.files.map((file) => [file.path, file.category])).toEqual([
      ["src/add.js", "implementation"],
      ["test/add.test.js", "test"],
    ]);
    expect(candidate?.referencePatchHash).toBe(
      sha256(candidate!.referencePatch),
    );
    expect(candidate?.implementationPatchHash).toBe(
      sha256(candidate!.implementationPatch!),
    );
    expect(candidate?.testPatchHash).toBe(sha256(candidate!.testPatch!));
    expect(JSON.stringify(candidate)).not.toContain("author@example.invalid");
    expect(
      (
        await execute("git", ["worktree", "list", "--porcelain"], {
          cwd: fixture.root,
        })
      ).stdout,
    ).toBe(before);
    expect(await readFile(join(fixture.root, "unrelated.tmp"), "utf8")).toBe(
      "preserve\n",
    );
  });

  it("records deterministic exclusion reasons for unsuitable history", async () => {
    const fixture = await repository();
    const cases = [
      [fixture.rootCommit, ["root-commit"]],
      [fixture.implementationOnly, ["no-test-change"]],
      [fixture.binary, ["binary-change"]],
      [fixture.sensitive, ["sensitive-path"]],
      [fixture.merge, ["merge-commit"]],
    ] as const;
    for (const [commit, reasons] of cases) {
      const [candidate] = await mineGitHistory({
        repositoryRoot: fixture.root,
        commit,
      });
      expect(candidate?.eligibility).toBe("filtered");
      expect(candidate?.exclusionReasons).toEqual(
        expect.arrayContaining([...reasons]),
      );
    }
  });

  it("selects a bounded history range and validates limits", async () => {
    const fixture = await repository();
    const candidates = await mineGitHistory({
      repositoryRoot: fixture.root,
      max: 3,
    });
    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => candidate.review.required)).toBe(
      true,
    );
    await expect(
      mineGitHistory({ repositoryRoot: fixture.root, max: 0 }),
    ).rejects.toMatchObject({ details: { code: "TASK_MINER_LIMIT_INVALID" } });
  });
});
