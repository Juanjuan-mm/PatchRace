import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  SCHEMA_VERSION,
  canonicalHash,
  canonicalJson,
  type GitHubMetadataV1,
} from "@patchrace/contracts";
import {
  runProcess,
  type ProcessRequest,
  type ProcessResult,
} from "@patchrace/core";

export interface FetchGitHubMetadataOptions {
  readonly repositoryRoot: string;
  readonly cacheRoot: string;
  readonly commit: string;
  readonly ghExecutable?: string;
  readonly runProcess?: (request: ProcessRequest) => Promise<ProcessResult>;
  readonly now?: () => Date;
}

interface CommandOutput {
  readonly ok: boolean;
  readonly stdout: string;
}

async function command(
  options: FetchGitHubMetadataOptions,
  args: readonly string[],
): Promise<CommandOutput> {
  const stdout: Buffer[] = [];
  try {
    const result = await (options.runProcess ?? runProcess)({
      executable: options.ghExecutable ?? "gh",
      args,
      cwd: resolve(options.repositoryRoot),
      inheritEnvironment: [
        "PATH",
        "LANG",
        "LC_ALL",
        "GH_HOST",
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "GH_ENTERPRISE_TOKEN",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "NO_PROXY",
      ],
      timeoutMs: 30_000,
      maxOutputBytes: 2 * 1024 * 1024,
      onStdout: (chunk) => {
        stdout.push(Buffer.from(chunk));
      },
    });
    return {
      ok: result.status === "completed",
      stdout: Buffer.concat(stdout).toString("utf8"),
    };
  } catch {
    return { ok: false, stdout: "" };
  }
}

function unavailable(
  options: FetchGitHubMetadataOptions,
  reason: string,
  details: { readonly repository?: string; readonly version?: string } = {},
): GitHubMetadataV1 {
  const query = {
    commit: options.commit,
    repository: details.repository ?? null,
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    status: "unavailable",
    commit: options.commit,
    repository: details.repository ?? null,
    pullRequests: [],
    queriedAt: (options.now ?? (() => new Date()))().toISOString(),
    source: "gh",
    queryHash: canonicalHash(query),
    responseHash: canonicalHash([]),
    ghVersion: details.version ?? null,
    unavailableReason: reason,
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsePull(
  value: unknown,
): GitHubMetadataV1["pullRequests"][number] | null {
  const source = object(value);
  const rawIssues = Array.isArray(source?.["closingIssuesReferences"])
    ? source["closingIssuesReferences"]
    : source?.["closingIssues"];
  if (
    source === null ||
    !Number.isSafeInteger(source["number"]) ||
    typeof source["title"] !== "string" ||
    typeof source["url"] !== "string" ||
    !Array.isArray(rawIssues)
  )
    return null;
  const closingIssues: GitHubMetadataV1["pullRequests"][number]["closingIssues"][number][] =
    [];
  for (const raw of rawIssues) {
    const issue = object(raw);
    if (
      issue === null ||
      !Number.isSafeInteger(issue["number"]) ||
      typeof issue["title"] !== "string" ||
      typeof issue["url"] !== "string" ||
      typeof issue["state"] !== "string"
    )
      return null;
    closingIssues.push({
      number: issue["number"] as number,
      title: issue["title"],
      url: issue["url"],
      state: issue["state"],
    });
  }
  return {
    number: source["number"] as number,
    title: source["title"],
    url: source["url"],
    mergedAt:
      source["mergedAt"] === null || typeof source["mergedAt"] === "string"
        ? source["mergedAt"]
        : null,
    closingIssues: closingIssues.sort(
      (left, right) => left.number - right.number,
    ),
  };
}

function parseCached(text: string, commit: string): GitHubMetadataV1 | null {
  try {
    const value = object(JSON.parse(text) as unknown);
    if (
      value?.["schemaVersion"] !== SCHEMA_VERSION ||
      value["status"] !== "available" ||
      value["commit"] !== commit ||
      typeof value["repository"] !== "string" ||
      !Array.isArray(value["pullRequests"]) ||
      typeof value["queriedAt"] !== "string" ||
      typeof value["queryHash"] !== "string" ||
      typeof value["responseHash"] !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(value["queryHash"]) ||
      !/^sha256:[a-f0-9]{64}$/.test(value["responseHash"]) ||
      !(typeof value["ghVersion"] === "string" || value["ghVersion"] === null)
    )
      return null;
    const pulls = value["pullRequests"].map(parsePull);
    if (pulls.some((pull) => pull === null)) return null;
    return {
      schemaVersion: SCHEMA_VERSION,
      status: "available",
      commit,
      repository: value["repository"],
      pullRequests: pulls.filter(
        (pull): pull is NonNullable<typeof pull> => pull !== null,
      ),
      queriedAt: value["queriedAt"],
      source: "cache",
      queryHash: value["queryHash"] as `sha256:${string}`,
      responseHash: value["responseHash"] as `sha256:${string}`,
      ghVersion: value["ghVersion"],
      unavailableReason: null,
    };
  } catch {
    return null;
  }
}

export async function fetchGitHubMetadata(
  options: FetchGitHubMetadataOptions,
): Promise<GitHubMetadataV1> {
  if (!/^[a-f0-9]{40}$/.test(options.commit))
    return unavailable(options, "invalid-commit");
  const cacheRoot = resolve(options.cacheRoot);
  await mkdir(cacheRoot, { recursive: true });
  const cachePath = join(cacheRoot, `${options.commit}.json`);
  const cached = await readFile(cachePath, "utf8").catch(() => null);
  if (cached !== null) {
    const parsed = parseCached(cached, options.commit);
    if (parsed !== null) return parsed;
  }
  const versionResult = await command(options, ["--version"]);
  if (!versionResult.ok) return unavailable(options, "gh-unavailable");
  const ghVersion =
    /^gh version ([^\s]+)/m.exec(versionResult.stdout)?.[1] ?? "unknown";
  if (!(await command(options, ["auth", "status"])).ok)
    return unavailable(options, "auth-unavailable", { version: ghVersion });
  const repositoryResult = await command(options, [
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);
  const repository = repositoryResult.stdout.trim();
  if (!repositoryResult.ok || !/^[^/\s]+\/[^/\s]+$/.test(repository))
    return unavailable(options, "repository-unavailable", {
      version: ghVersion,
    });
  const pullsResult = await command(options, [
    "api",
    `repos/${repository}/commits/${options.commit}/pulls`,
    "-H",
    "Accept: application/vnd.github+json",
    "--jq",
    ".[].number",
  ]);
  if (!pullsResult.ok)
    return unavailable(options, "metadata-unavailable", {
      repository,
      version: ghVersion,
    });
  const numbers = pullsResult.stdout.split(/\s+/u).filter(Boolean).map(Number);
  if (numbers.some((number) => !Number.isSafeInteger(number) || number < 1))
    return unavailable(options, "malformed-response", {
      repository,
      version: ghVersion,
    });
  const pulls: GitHubMetadataV1["pullRequests"][number][] = [];
  for (const number of [...new Set(numbers)].sort(
    (left, right) => left - right,
  )) {
    const detail = await command(options, [
      "pr",
      "view",
      String(number),
      "--repo",
      repository,
      "--json",
      "number,title,url,mergedAt,closingIssuesReferences",
    ]);
    if (!detail.ok)
      return unavailable(options, "metadata-unavailable", {
        repository,
        version: ghVersion,
      });
    try {
      const parsed = parsePull(JSON.parse(detail.stdout) as unknown);
      if (parsed === null) throw new Error("malformed");
      pulls.push(parsed);
    } catch {
      return unavailable(options, "malformed-response", {
        repository,
        version: ghVersion,
      });
    }
  }
  const query = { repository, commit: options.commit };
  const normalized: GitHubMetadataV1 = {
    schemaVersion: SCHEMA_VERSION,
    status: "available",
    commit: options.commit,
    repository,
    pullRequests: pulls,
    queriedAt: (options.now ?? (() => new Date()))().toISOString(),
    source: "gh",
    queryHash: canonicalHash(query),
    responseHash: canonicalHash(pulls),
    ghVersion,
    unavailableReason: null,
  };
  const temporary = `${cachePath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${canonicalJson(normalized)}\n`, { flag: "wx" });
  try {
    await rename(temporary, cachePath);
  } catch (error) {
    const winner = await readFile(cachePath).catch(() => null);
    await rm(temporary, { force: true });
    if (winner === null) throw error;
  }
  return normalized;
}
