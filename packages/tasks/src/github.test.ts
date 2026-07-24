import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ProcessRequest, ProcessResult } from "@patchrace/core";

import { fetchGitHubMetadata } from "./github.js";

const roots: string[] = [];
const commit = "a".repeat(40);

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function result(status: ProcessResult["status"]): ProcessResult {
  return {
    status,
    exitCode: status === "completed" ? 0 : 1,
    signal: null,
    terminationReason: "exit",
    startedAt: "2026-07-22T00:00:00.000Z",
    endedAt: "2026-07-22T00:00:00.001Z",
    durationMs: 1,
    stdoutBytes: 0,
    stderrBytes: 0,
    processId: 1,
    processGroupId: 1,
    inheritedEnvironmentNames: [],
    passedEnvironmentNames: [],
  };
}

function runner(
  responses: Readonly<
    Record<string, { readonly ok: boolean; readonly stdout?: string }>
  >,
  calls: string[],
): (request: ProcessRequest) => Promise<ProcessResult> {
  return async (request) => {
    const key = (request.args ?? []).join(" ");
    calls.push(key);
    const response = responses[key] ?? { ok: false };
    if (response.stdout !== undefined)
      await request.onStdout?.(Buffer.from(response.stdout));
    return result(response.ok ? "completed" : "failed");
  };
}

describe("fetchGitHubMetadata", () => {
  it("uses normal gh auth, normalizes PR/issues, and reuses the provenance cache", async () => {
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "patchrace-github-repo-"),
    );
    const cacheRoot = await mkdtemp(join(tmpdir(), "patchrace-github-cache-"));
    roots.push(repositoryRoot, cacheRoot);
    const calls: string[] = [];
    const responses = {
      "--version": { ok: true, stdout: "gh version 2.80.0 (fixture)\n" },
      "auth status": { ok: true },
      "repo view --json nameWithOwner --jq .nameWithOwner": {
        ok: true,
        stdout: "acme/widget\n",
      },
      [`api repos/acme/widget/commits/${commit}/pulls -H Accept: application/vnd.github+json --jq .[].number`]:
        {
          ok: true,
          stdout: "12\n",
        },
      "pr view 12 --repo acme/widget --json number,title,url,mergedAt,closingIssuesReferences":
        {
          ok: true,
          stdout: JSON.stringify({
            number: 12,
            title: "Fix widget",
            url: "https://github.example/acme/widget/pull/12",
            mergedAt: "2026-07-21T00:00:00Z",
            closingIssuesReferences: [
              {
                number: 4,
                title: "Widget is broken",
                url: "https://github.example/acme/widget/issues/4",
                state: "CLOSED",
              },
            ],
          }),
        },
    } as const;
    const first = await fetchGitHubMetadata({
      repositoryRoot,
      cacheRoot,
      commit,
      runProcess: runner(responses, calls),
      now: () => new Date("2026-07-22T00:00:00.000Z"),
    });
    expect(first).toMatchObject({
      status: "available",
      source: "gh",
      repository: "acme/widget",
      ghVersion: "2.80.0",
      pullRequests: [
        {
          number: 12,
          closingIssues: [{ number: 4, state: "CLOSED" }],
        },
      ],
    });
    expect(calls).toHaveLength(5);

    const cacheCalls: string[] = [];
    const second = await fetchGitHubMetadata({
      repositoryRoot,
      cacheRoot,
      commit,
      runProcess: runner({}, cacheCalls),
    });
    expect(second).toMatchObject({ status: "available", source: "cache" });
    expect(second.responseHash).toBe(first.responseHash);
    expect(cacheCalls).toEqual([]);
    expect(
      await readFile(join(cacheRoot, `${commit}.json`), "utf8"),
    ).not.toContain("token");
  });

  it("reports unavailable auth and malformed responses without requiring GitHub", async () => {
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "patchrace-github-repo-"),
    );
    const cacheRoot = await mkdtemp(join(tmpdir(), "patchrace-github-cache-"));
    roots.push(repositoryRoot, cacheRoot);
    const auth = await fetchGitHubMetadata({
      repositoryRoot,
      cacheRoot,
      commit,
      runProcess: runner(
        {
          "--version": { ok: true, stdout: "gh version 2.80.0\n" },
          "auth status": { ok: false },
        },
        [],
      ),
    });
    expect(auth).toMatchObject({
      status: "unavailable",
      unavailableReason: "auth-unavailable",
      pullRequests: [],
    });

    const malformedRoot = await mkdtemp(
      join(tmpdir(), "patchrace-github-cache-"),
    );
    roots.push(malformedRoot);
    const malformed = await fetchGitHubMetadata({
      repositoryRoot,
      cacheRoot: malformedRoot,
      commit,
      runProcess: runner(
        {
          "--version": { ok: true, stdout: "gh version 2.80.0\n" },
          "auth status": { ok: true },
          "repo view --json nameWithOwner --jq .nameWithOwner": {
            ok: true,
            stdout: "acme/widget\n",
          },
          [`api repos/acme/widget/commits/${commit}/pulls -H Accept: application/vnd.github+json --jq .[].number`]:
            {
              ok: true,
              stdout: "not-a-number\n",
            },
        },
        [],
      ),
    });
    expect(malformed).toMatchObject({
      status: "unavailable",
      unavailableReason: "malformed-response",
    });
  });
});
