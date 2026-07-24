import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalJson,
  type GitHubMetadataV1,
} from "@patchrace/contracts";
import {
  CoreCommandService,
  type CommandRequest,
  type CommandResult,
  type CommandService,
} from "@patchrace/core";

import { initializeManualSuite } from "./init.js";
import { fetchGitHubMetadata } from "./github.js";
import {
  mineGitHistory,
  serializeMinedCandidate,
  type MinedTaskCandidate,
} from "./miner.js";

export class TaskCommandService implements CommandService {
  constructor(
    private readonly fallback: CommandService = new CoreCommandService(),
  ) {}

  async execute(request: CommandRequest): Promise<CommandResult> {
    if (request.command === "mine") return this.mine(request);
    if (request.command !== "init") return this.fallback.execute(request);
    if (request.options["fromHistory"] === true) {
      throw new PatchRaceError({
        code: "INIT_HISTORY_NOT_AVAILABLE",
        category: "USAGE",
        message:
          "History-backed initialization is provided by the task miner; omit --from-history for a manual suite.",
        path: "fromHistory",
      });
    }
    const projectRoot = resolve(
      String(request.options["project"] ?? process.cwd()),
    );
    const initialized = await initializeManualSuite({
      projectRoot,
      ...(typeof request.options["output"] === "string"
        ? { outputPath: request.options["output"] }
        : {}),
      force: request.options["force"] === true,
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: "init",
      status: "completed",
      sideEffects: [
        initialized.suitePath,
        initialized.taskPath,
        initialized.instructionPath,
      ],
      data: initialized,
    };
  }

  private async mine(request: CommandRequest): Promise<CommandResult> {
    const projectRoot = resolve(
      String(request.options["project"] ?? process.cwd()),
    );
    const numericMax =
      request.options["max"] === undefined
        ? undefined
        : Number(request.options["max"]);
    const candidates = await mineGitHistory({
      repositoryRoot: projectRoot,
      ...(typeof request.options["commit"] === "string"
        ? { commit: request.options["commit"] }
        : {}),
      ...(typeof request.options["since"] === "string"
        ? { since: request.options["since"] }
        : {}),
      ...(numericMax === undefined ? {} : { max: numericMax }),
    });
    const outputRoot = join(projectRoot, ".patchrace", "mined");
    await mkdir(outputRoot, { recursive: true });
    const sideEffects: string[] = [];
    const githubMetadata: GitHubMetadataV1[] = [];
    for (const candidate of candidates) {
      const paths = await writeCandidate(outputRoot, candidate);
      sideEffects.push(...paths);
      if (request.options["githubMetadata"] === true) {
        const metadata = await fetchGitHubMetadata({
          repositoryRoot: projectRoot,
          cacheRoot: join(projectRoot, ".patchrace", "cache", "github"),
          commit: candidate.commit,
        });
        const path = join(outputRoot, candidate.id, "github.json");
        await writeFile(path, `${canonicalJson(metadata)}\n`, { flag: "wx" });
        sideEffects.push(path);
        githubMetadata.push(metadata);
      }
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: "mine",
      status: "completed",
      sideEffects,
      data: {
        candidates: candidates.map(
          (candidate) =>
            JSON.parse(serializeMinedCandidate(candidate)) as unknown,
        ),
        githubMetadata,
      },
    };
  }
}

async function writeCandidate(
  outputRoot: string,
  candidate: MinedTaskCandidate,
): Promise<readonly string[]> {
  const directory = join(outputRoot, candidate.id);
  try {
    await mkdir(directory, { recursive: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PatchRaceError(
        {
          code: "MINE_CANDIDATE_EXISTS",
          category: "CONFLICT",
          message: `Mined candidate '${candidate.id}' already exists; preserve or review it before mining again.`,
          path: candidate.id,
        },
        { cause: error },
      );
    }
    throw error;
  }
  const manifest = join(directory, "candidate.json");
  const reference = join(directory, "reference.patch");
  await Promise.all([
    writeFile(manifest, serializeMinedCandidate(candidate), { flag: "wx" }),
    writeFile(reference, candidate.referencePatch, { flag: "wx" }),
  ]);
  const paths = [manifest, reference];
  if (candidate.implementationPatch !== null) {
    const path = join(directory, "implementation.patch");
    await writeFile(path, candidate.implementationPatch, { flag: "wx" });
    paths.push(path);
  }
  if (candidate.testPatch !== null) {
    const path = join(directory, "test.patch");
    await writeFile(path, candidate.testPatch, { flag: "wx" });
    paths.push(path);
  }
  return paths;
}
