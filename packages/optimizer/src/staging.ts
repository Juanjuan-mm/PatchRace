import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  PatchRaceError,
  canonicalJson,
  sha256,
  type CandidateSnapshotV1,
  type ContentHash,
} from "@patchrace/contracts";

export interface CandidateFileContent {
  readonly logicalPath: string;
  readonly before: Uint8Array | null;
  readonly after: Uint8Array | null;
  readonly patch: Uint8Array;
}

export interface StageCandidateOptions {
  readonly projectRoot: string;
  readonly stateRoot?: string;
  readonly candidate: CandidateSnapshotV1;
  readonly files: readonly CandidateFileContent[];
  readonly lint: unknown;
}

export interface StagedCandidate {
  readonly candidateId: string;
  readonly candidateHash: ContentHash;
  readonly relativeRoot: string;
  readonly artifactPaths: readonly string[];
  readonly activated: false;
}

interface CandidateOwner {
  readonly schemaVersion: "1.0.0";
  readonly kind: "patchrace-candidate-root";
  readonly candidateId: string;
  readonly candidateHash: ContentHash;
}

export interface CandidateDisposalPlan {
  readonly schemaVersion: "1.0.0";
  readonly candidateId: string;
  readonly candidateHash: ContentHash;
  readonly target: string;
  readonly dryRun: true;
}

function isDescendant(root: string, target: string): boolean {
  const difference = relative(root, target);
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

async function canonicalDirectory(
  path: string,
  label: string,
): Promise<string> {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    throw new PatchRaceError(
      {
        code: "CANDIDATE_ROOT_UNREADABLE",
        category: "PREFLIGHT",
        message: `Cannot read ${label}.`,
        path: label,
      },
      { cause: error },
    );
  });
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new PatchRaceError({
      code: "CANDIDATE_ROOT_UNSAFE",
      category: "SAFETY",
      message: `${label} must be a real directory.`,
      path: label,
    });
  return realpath(path);
}

async function ensureRealDirectory(path: string): Promise<void> {
  const parent = dirname(path);
  if (parent !== path) {
    const parentInfo = await lstat(parent).catch(
      (error: NodeJS.ErrnoException) =>
        error.code === "ENOENT" ? null : Promise.reject(error),
    );
    if (parentInfo === null) await ensureRealDirectory(parent);
    else if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink())
      throw new PatchRaceError({
        code: "CANDIDATE_STAGE_COMPONENT_UNSAFE",
        category: "SAFETY",
        message: "Candidate staging parent is not a real directory.",
        path: "stateRoot",
      });
  }
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new PatchRaceError({
        code: "CANDIDATE_STAGE_COMPONENT_UNSAFE",
        category: "SAFETY",
        message: "Candidate staging component is not a real directory.",
        path: "stateRoot",
      });
  }
}

function safeArtifactPath(root: string, logicalPath: string): string {
  if (
    logicalPath.length === 0 ||
    logicalPath.includes("\0") ||
    logicalPath.includes("\\") ||
    isAbsolute(logicalPath) ||
    logicalPath.split("/").some((part) => part === "" || part === "..")
  )
    throw new PatchRaceError({
      code: "CANDIDATE_STAGE_PATH_INVALID",
      category: "SAFETY",
      message: "Candidate artifact path is unsafe.",
      path: "logicalPath",
    });
  const target = resolve(root, logicalPath);
  if (!isDescendant(root, target))
    throw new PatchRaceError({
      code: "CANDIDATE_STAGE_PATH_ESCAPE",
      category: "SAFETY",
      message: "Candidate artifact path escapes its owned root.",
      path: "logicalPath",
    });
  return target;
}

async function createArtifact(
  root: string,
  logicalPath: string,
  content: Uint8Array,
): Promise<void> {
  const target = safeArtifactPath(root, logicalPath);
  await ensureRealDirectory(dirname(target));
  await writeFile(target, content, { flag: "wx", mode: 0o600 });
}

function verifyContents(
  candidate: CandidateSnapshotV1,
  supplied: readonly CandidateFileContent[],
): readonly CandidateFileContent[] {
  const byPath = new Map(supplied.map((file) => [file.logicalPath, file]));
  if (
    byPath.size !== supplied.length ||
    byPath.size !== candidate.mutation.files.length
  )
    throw new PatchRaceError({
      code: "CANDIDATE_STAGE_FILE_SET_MISMATCH",
      category: "CONFLICT",
      message: "Staged content does not match the declared candidate file set.",
      path: "files",
    });
  return candidate.mutation.files.map((mutation) => {
    const content = byPath.get(mutation.logicalPath);
    if (
      content === undefined ||
      (content.before === null ? null : sha256(content.before)) !==
        mutation.beforeHash ||
      (content.after === null ? null : sha256(content.after)) !==
        mutation.afterHash ||
      sha256(content.patch) !== mutation.patchHash
    )
      throw new PatchRaceError({
        code: "CANDIDATE_STAGE_HASH_MISMATCH",
        category: "CONFLICT",
        message: `Staged bytes do not match '${mutation.logicalPath}'.`,
        path: mutation.logicalPath,
      });
    return content;
  });
}

export async function stageCandidate(
  options: StageCandidateOptions,
): Promise<StagedCandidate> {
  const suppliedProjectRoot = resolve(options.projectRoot);
  const projectRoot = await canonicalDirectory(
    suppliedProjectRoot,
    "projectRoot",
  );
  const suppliedStateRoot = options.stateRoot;
  const stateInput =
    suppliedStateRoot === undefined
      ? resolve(projectRoot, ".patchrace")
      : await realpath(resolve(suppliedStateRoot)).catch(
          (error: NodeJS.ErrnoException) =>
            error.code === "ENOENT"
              ? resolve(
                  projectRoot,
                  relative(suppliedProjectRoot, resolve(suppliedStateRoot)),
                )
              : Promise.reject(error),
        );
  if (!isDescendant(projectRoot, stateInput))
    throw new PatchRaceError({
      code: "CANDIDATE_STATE_NOT_PROJECT_LOCAL",
      category: "SAFETY",
      message: "Candidate state root must be project-local.",
      path: "stateRoot",
    });
  await ensureRealDirectory(resolve(stateInput, "candidates"));
  const stateRoot = await realpath(stateInput);
  if (!isDescendant(projectRoot, stateRoot))
    throw new PatchRaceError({
      code: "CANDIDATE_STATE_CANONICAL_ESCAPE",
      category: "SAFETY",
      message: "Candidate state root resolves outside the project.",
      path: "stateRoot",
    });
  const contents = verifyContents(options.candidate, options.files);
  const root = resolve(stateRoot, "candidates", options.candidate.candidateId);
  try {
    await mkdir(root, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new PatchRaceError({
        code: "CANDIDATE_STAGE_EXISTS",
        category: "CONFLICT",
        message: `Candidate '${options.candidate.candidateId}' is already staged.`,
        path: "candidateId",
      });
    throw error;
  }
  const owner: CandidateOwner = {
    schemaVersion: "1.0.0",
    kind: "patchrace-candidate-root",
    candidateId: options.candidate.candidateId,
    candidateHash: options.candidate.candidateHash,
  };
  const artifactPaths: string[] = [];
  const add = async (path: string, content: Uint8Array): Promise<void> => {
    await createArtifact(root, path, content);
    artifactPaths.push(path);
  };
  try {
    await add("owner.json", Buffer.from(`${canonicalJson(owner)}\n`));
    await add(
      "candidate.json",
      Buffer.from(`${canonicalJson(options.candidate)}\n`),
    );
    await add("lint.json", Buffer.from(`${canonicalJson(options.lint)}\n`));
    for (const file of contents) {
      const encoded = Buffer.from(file.logicalPath).toString("base64url");
      if (file.before !== null)
        await add(`files/${encoded}/before`, file.before);
      if (file.after !== null) await add(`files/${encoded}/after`, file.after);
      await add(`files/${encoded}/mutation.diff`, file.patch);
      await add(
        `files/${encoded}/metadata.json`,
        Buffer.from(
          `${canonicalJson({
            schemaVersion: "1.0.0",
            logicalPath: file.logicalPath,
          })}\n`,
        ),
      );
    }
    await add(
      "mutation.diff",
      Buffer.concat(
        contents.flatMap((file, index) => [
          ...(index === 0 ? [] : [Buffer.from("\n")]),
          Buffer.from(file.patch),
        ]),
      ),
    );
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return {
    candidateId: options.candidate.candidateId,
    candidateHash: options.candidate.candidateHash,
    relativeRoot: relative(projectRoot, root).split(sep).join("/"),
    artifactPaths: artifactPaths.sort(),
    activated: false,
  };
}

async function readOwner(root: string): Promise<CandidateOwner> {
  const parsed: unknown = JSON.parse(
    await readFile(resolve(root, "owner.json"), "utf8"),
  );
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    (parsed as { kind?: unknown }).kind !== "patchrace-candidate-root" ||
    typeof (parsed as { candidateId?: unknown }).candidateId !== "string" ||
    typeof (parsed as { candidateHash?: unknown }).candidateHash !== "string"
  )
    throw new PatchRaceError({
      code: "CANDIDATE_OWNER_INVALID",
      category: "SAFETY",
      message: "Candidate ownership record is invalid.",
      path: "owner.json",
    });
  return parsed as CandidateOwner;
}

export async function planCandidateDisposal(options: {
  readonly projectRoot: string;
  readonly stateRoot?: string;
  readonly candidateId: string;
  readonly expectedCandidateHash: ContentHash;
}): Promise<CandidateDisposalPlan> {
  if (!/^cand_[0-9a-f]{20}$/u.test(options.candidateId))
    throw new PatchRaceError({
      code: "CANDIDATE_ID_INVALID",
      category: "USAGE",
      message: "Candidate ID is invalid.",
      path: "candidateId",
    });
  const projectRoot = await canonicalDirectory(
    resolve(options.projectRoot),
    "projectRoot",
  );
  const stateRoot = await canonicalDirectory(
    resolve(options.stateRoot ?? resolve(projectRoot, ".patchrace")),
    "stateRoot",
  );
  if (!isDescendant(projectRoot, stateRoot))
    throw new PatchRaceError({
      code: "CANDIDATE_STATE_NOT_PROJECT_LOCAL",
      category: "SAFETY",
      message: "Candidate state root must be project-local.",
      path: "stateRoot",
    });
  const target = resolve(stateRoot, "candidates", options.candidateId);
  const canonicalTarget = await canonicalDirectory(target, "candidateRoot");
  if (!isDescendant(resolve(stateRoot, "candidates"), canonicalTarget))
    throw new PatchRaceError({
      code: "CANDIDATE_DISPOSAL_ESCAPE",
      category: "SAFETY",
      message: "Candidate disposal target escapes the candidate root.",
      path: "candidateId",
    });
  const owner = await readOwner(canonicalTarget);
  if (
    owner.candidateId !== options.candidateId ||
    owner.candidateHash !== options.expectedCandidateHash
  )
    throw new PatchRaceError({
      code: "CANDIDATE_DISPOSAL_OWNERSHIP_MISMATCH",
      category: "CONFLICT",
      message: "Candidate ownership does not match the disposal request.",
      path: "candidateId",
    });
  return {
    schemaVersion: "1.0.0",
    candidateId: owner.candidateId,
    candidateHash: owner.candidateHash,
    target: canonicalTarget,
    dryRun: true,
  };
}

export async function disposeCandidate(
  plan: CandidateDisposalPlan,
  options: { readonly confirm: boolean },
): Promise<{ readonly removed: readonly string[] }> {
  if (!options.confirm) return { removed: [] };
  const owner = await readOwner(plan.target);
  if (
    owner.candidateId !== plan.candidateId ||
    owner.candidateHash !== plan.candidateHash
  )
    throw new PatchRaceError({
      code: "CANDIDATE_DISPOSAL_DRIFT",
      category: "CONFLICT",
      message: "Candidate ownership changed after disposal planning.",
      path: "candidateId",
    });
  await rm(plan.target, { recursive: true });
  return { removed: [plan.target] };
}
