import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  PatchRaceError,
  canonicalHash,
  canonicalJson,
  sha256,
  type CandidateReviewV1,
  type CandidateSnapshotV1,
  type ContentHash,
  type FrozenDecisionPolicyV1,
  type ParetoSelectionV1,
  type PromotionPlanV1,
  type PromotionRecordV1,
  type RollbackPlanV1,
  type TeachingProtocolLedgerV1,
} from "@patchrace/contracts";

import type { CandidateFileContent } from "./staging.js";

interface StoredPromotion {
  readonly owner: "patchrace-promotion";
  readonly record: PromotionRecordV1;
  readonly files: readonly {
    readonly logicalPath: string;
    readonly encoded: string;
    readonly beforeBase64: string | null;
    readonly afterBase64: string | null;
  }[];
}

function fail(
  code: string,
  category: "CONFLICT" | "SAFETY" | "CONFIG",
  message: string,
  path: string,
): never {
  throw new PatchRaceError({ code, category, message, path });
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

async function canonicalProjectRoot(path: string): Promise<string> {
  const absolute = resolve(path);
  const info = await lstat(absolute);
  if (!info.isDirectory() || info.isSymbolicLink())
    fail(
      "PROMOTION_PROJECT_ROOT_UNSAFE",
      "SAFETY",
      "Project root must be a real directory.",
      "projectRoot",
    );
  return realpath(absolute);
}

function targetPath(projectRoot: string, logicalPath: string): string {
  if (
    logicalPath.length === 0 ||
    logicalPath.includes("\0") ||
    logicalPath.includes("\\") ||
    isAbsolute(logicalPath) ||
    logicalPath.split("/").some((part) => part === "" || part === "..")
  )
    fail(
      "PROMOTION_TARGET_INVALID",
      "SAFETY",
      "Promotion target must be project-relative.",
      "logicalPath",
    );
  const target = resolve(projectRoot, logicalPath);
  if (!isDescendant(projectRoot, target))
    fail(
      "PROMOTION_TARGET_ESCAPE",
      "SAFETY",
      "Promotion target escapes the project.",
      "logicalPath",
    );
  return target;
}

async function readCurrent(
  projectRoot: string,
  logicalPath: string,
): Promise<Buffer | null> {
  const target = targetPath(projectRoot, logicalPath);
  await assertRealAncestors(projectRoot, target, false);
  const info = await lstat(target).catch((error: NodeJS.ErrnoException) =>
    error.code === "ENOENT" ? null : Promise.reject(error),
  );
  if (info === null) return null;
  if (!info.isFile() || info.isSymbolicLink())
    fail(
      "PROMOTION_TARGET_UNSAFE",
      "SAFETY",
      "Promotion target is not a regular file.",
      logicalPath,
    );
  const canonicalTarget = await realpath(target);
  if (!isDescendant(projectRoot, canonicalTarget))
    fail(
      "PROMOTION_TARGET_CANONICAL_ESCAPE",
      "SAFETY",
      "Promotion target resolves outside the project.",
      logicalPath,
    );
  return readFile(target);
}

async function assertRealAncestors(
  projectRoot: string,
  path: string,
  create: boolean,
): Promise<void> {
  let current = dirname(path);
  const missing: string[] = [];
  while (current !== projectRoot) {
    if (!isDescendant(projectRoot, current))
      fail(
        "PROMOTION_PARENT_ESCAPE",
        "SAFETY",
        "Promotion parent escapes the project.",
        "logicalPath",
      );
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) =>
      error.code === "ENOENT" ? null : Promise.reject(error),
    );
    if (info === null) missing.push(current);
    else {
      if (!info.isDirectory() || info.isSymbolicLink())
        fail(
          "PROMOTION_PARENT_UNSAFE",
          "SAFETY",
          "Promotion parent is not a real directory.",
          "logicalPath",
        );
      break;
    }
    current = dirname(current);
  }
  if (create)
    for (const directory of missing.reverse())
      await mkdir(directory, { mode: 0o700 });
}

async function writeAtomic(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.patchrace-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function validatePromotionAuthority(options: {
  readonly candidate: CandidateSnapshotV1;
  readonly review: CandidateReviewV1;
  readonly selection: ParetoSelectionV1;
  readonly policy: FrozenDecisionPolicyV1;
  readonly protocol?: TeachingProtocolLedgerV1;
}): ContentHash | null {
  const decision = options.selection.decisions.find(
    (value) => value.candidateId === options.candidate.candidateId,
  );
  if (
    options.review.candidateId !== options.candidate.candidateId ||
    options.review.candidateHash !== options.candidate.candidateHash ||
    options.review.decision.state !== "approved" ||
    options.review.controls.validationEnabled !== true ||
    options.review.controls.activationEnabled !== false ||
    options.selection.policyHash !== options.policy.policyHash ||
    decision?.decision !== "promote-eligible" ||
    options.policy.evidenceTier === "exploratory"
  )
    fail(
      "PROMOTION_AUTHORITY_INVALID",
      "CONFLICT",
      "Promotion requires approved review and promote-eligible validation under the frozen policy.",
      "authority",
    );
  if (options.policy.evidenceTier !== "held-out") return null;
  const finalHoldout = options.protocol?.finalHoldout;
  if (
    finalHoldout?.outcome?.passed !== true ||
    finalHoldout.gate.frozenCandidateId !== options.candidate.candidateId ||
    finalHoldout.gate.frozenPolicyHash !== options.policy.policyHash ||
    finalHoldout.outcome.retuneAllowed !== false
  )
    fail(
      "PROMOTION_HOLDOUT_REQUIRED",
      "CONFLICT",
      "Held-out policy requires a matching passed one-time holdout gate.",
      "protocol.finalHoldout",
    );
  return finalHoldout.gate.gateHash;
}

export async function createPromotionPlan(options: {
  readonly projectRoot: string;
  readonly candidate: CandidateSnapshotV1;
  readonly files: readonly CandidateFileContent[];
  readonly review: CandidateReviewV1;
  readonly selection: ParetoSelectionV1;
  readonly policy: FrozenDecisionPolicyV1;
  readonly protocol?: TeachingProtocolLedgerV1;
}): Promise<PromotionPlanV1> {
  const projectRoot = await canonicalProjectRoot(options.projectRoot);
  const holdoutGateHash = validatePromotionAuthority(options);
  const supplied = new Map(
    options.files.map((file) => [file.logicalPath, file]),
  );
  if (
    supplied.size !== options.files.length ||
    supplied.size !== options.candidate.mutation.files.length
  )
    fail(
      "PROMOTION_FILE_SET_MISMATCH",
      "CONFLICT",
      "Promotion file bytes do not match the candidate file set.",
      "files",
    );
  for (const mutation of options.candidate.mutation.files) {
    const file = supplied.get(mutation.logicalPath);
    const current = await readCurrent(projectRoot, mutation.logicalPath);
    if (
      file === undefined ||
      (file.before === null ? null : sha256(file.before)) !==
        mutation.beforeHash ||
      (file.after === null ? null : sha256(file.after)) !==
        mutation.afterHash ||
      sha256(file.patch) !== mutation.patchHash ||
      (current === null ? null : sha256(current)) !== mutation.beforeHash
    )
      fail(
        "PROMOTION_PREIMAGE_MISMATCH",
        "CONFLICT",
        `Promotion preimage or staged bytes drifted for '${mutation.logicalPath}'.`,
        mutation.logicalPath,
      );
    await assertRealAncestors(
      projectRoot,
      targetPath(projectRoot, mutation.logicalPath),
      false,
    );
  }
  const fixed = {
    schemaVersion: "1.0.0" as const,
    promotionSchemaVersion: "1.0.0" as const,
    candidateId: options.candidate.candidateId,
    candidateHash: options.candidate.candidateHash,
    reviewId: options.review.reviewId,
    policyHash: options.policy.policyHash,
    holdoutGateHash,
    targets: options.candidate.mutation.files,
    dryRun: true as const,
    requiresConfirmation: true as const,
  };
  const planHash = canonicalHash(fixed);
  return {
    ...fixed,
    planHash,
    promotionId: `promotion_${planHash.slice("sha256:".length, "sha256:".length + 20)}`,
  };
}

function stateRoot(projectRoot: string): string {
  return resolve(projectRoot, ".patchrace", "promotions");
}

async function writePromotionState(
  projectRoot: string,
  stored: StoredPromotion,
): Promise<void> {
  const root = resolve(stateRoot(projectRoot), stored.record.promotionId);
  await assertRealAncestors(projectRoot, root, true);
  try {
    await mkdir(root, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      fail(
        "PROMOTION_RECORD_EXISTS",
        "CONFLICT",
        "Promotion record already exists.",
        "promotionId",
      );
    throw error;
  }
  try {
    await writeFile(
      resolve(root, "record.json"),
      `${canonicalJson(stored)}\n`,
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export async function executePromotion(options: {
  readonly projectRoot: string;
  readonly plan: PromotionPlanV1;
  readonly files: readonly CandidateFileContent[];
  readonly confirm: boolean;
  readonly now: () => Date;
}): Promise<PromotionRecordV1 | PromotionPlanV1> {
  if (!options.confirm) return options.plan;
  const projectRoot = await canonicalProjectRoot(options.projectRoot);
  const byPath = new Map(options.files.map((file) => [file.logicalPath, file]));
  const preimages = new Map<string, Buffer | null>();
  for (const target of options.plan.targets) {
    const file = byPath.get(target.logicalPath);
    const current = await readCurrent(projectRoot, target.logicalPath);
    if (
      file === undefined ||
      (current === null ? null : sha256(current)) !== target.beforeHash ||
      (file.after === null ? null : sha256(file.after)) !== target.afterHash ||
      sha256(file.patch) !== target.patchHash
    )
      fail(
        "PROMOTION_EXECUTION_DRIFT",
        "CONFLICT",
        "Promotion target or staged bytes changed after preview.",
        target.logicalPath,
      );
    preimages.set(target.logicalPath, current);
  }
  const promotedAt = options.now().toISOString();
  if (!Number.isFinite(Date.parse(promotedAt)))
    fail(
      "PROMOTION_TIME_INVALID",
      "CONFIG",
      "Promotion time is invalid.",
      "now",
    );
  const record: PromotionRecordV1 = {
    schemaVersion: "1.0.0",
    promotionId: options.plan.promotionId,
    planHash: options.plan.planHash,
    candidateId: options.plan.candidateId,
    promotedAt,
    targets: options.plan.targets,
    state: "promoted",
    rollbackRecordHash: null,
  };
  const stored: StoredPromotion = {
    owner: "patchrace-promotion",
    record,
    files: options.plan.targets.map((target) => {
      const file = byPath.get(target.logicalPath)!;
      return {
        logicalPath: target.logicalPath,
        encoded: Buffer.from(target.logicalPath).toString("base64url"),
        beforeBase64:
          file.before === null
            ? null
            : Buffer.from(file.before).toString("base64"),
        afterBase64:
          file.after === null
            ? null
            : Buffer.from(file.after).toString("base64"),
      };
    }),
  };
  await writePromotionState(projectRoot, stored);
  const applied: string[] = [];
  try {
    for (const target of options.plan.targets) {
      const path = targetPath(projectRoot, target.logicalPath);
      const file = byPath.get(target.logicalPath)!;
      await assertRealAncestors(projectRoot, path, true);
      if (file.after === null) await unlink(path);
      else await writeAtomic(path, file.after);
      applied.push(target.logicalPath);
    }
  } catch (error) {
    for (const logicalPath of applied.reverse()) {
      const path = targetPath(projectRoot, logicalPath);
      const before = preimages.get(logicalPath)!;
      if (before === null) await rm(path, { force: true });
      else await writeAtomic(path, before);
    }
    await rm(resolve(stateRoot(projectRoot), record.promotionId), {
      recursive: true,
      force: true,
    });
    throw error;
  }
  return record;
}

async function loadStoredPromotion(
  projectRoot: string,
  promotionId: string,
): Promise<StoredPromotion> {
  if (!/^promotion_[0-9a-f]{20}$/u.test(promotionId))
    fail(
      "PROMOTION_ID_INVALID",
      "CONFIG",
      "Promotion ID is invalid.",
      "promotionId",
    );
  const root = resolve(stateRoot(projectRoot), promotionId);
  await assertRealAncestors(projectRoot, resolve(root, "record.json"), false);
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink())
    fail(
      "PROMOTION_RECORD_UNSAFE",
      "SAFETY",
      "Promotion record root is unsafe.",
      "promotionId",
    );
  const canonicalRoot = await realpath(root);
  if (!isDescendant(projectRoot, canonicalRoot))
    fail(
      "PROMOTION_RECORD_ESCAPE",
      "SAFETY",
      "Promotion record resolves outside the project.",
      "promotionId",
    );
  const parsed: unknown = JSON.parse(
    await readFile(resolve(root, "record.json"), "utf8"),
  );
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    (parsed as { owner?: unknown }).owner !== "patchrace-promotion"
  )
    fail(
      "PROMOTION_RECORD_INVALID",
      "CONFLICT",
      "Promotion record is invalid.",
      "promotionId",
    );
  return parsed as StoredPromotion;
}

export async function createRollbackPlan(options: {
  readonly projectRoot: string;
  readonly promotionId: string;
}): Promise<RollbackPlanV1> {
  const projectRoot = await canonicalProjectRoot(options.projectRoot);
  const stored = await loadStoredPromotion(projectRoot, options.promotionId);
  const rolledBack = await lstat(
    resolve(stateRoot(projectRoot), options.promotionId, "rolled-back.json"),
  ).catch((error: NodeJS.ErrnoException) =>
    error.code === "ENOENT" ? null : Promise.reject(error),
  );
  if (rolledBack !== null)
    fail(
      "ROLLBACK_ALREADY_COMPLETED",
      "CONFLICT",
      "Promotion already has a rollback record.",
      "promotionId",
    );
  if (stored.record.state !== "promoted")
    fail(
      "ROLLBACK_ALREADY_COMPLETED",
      "CONFLICT",
      "Promotion is not in the promoted state.",
      "promotionId",
    );
  const files = new Map(stored.files.map((file) => [file.logicalPath, file]));
  const targets = [];
  for (const target of stored.record.targets) {
    const file = files.get(target.logicalPath);
    const current = await readCurrent(projectRoot, target.logicalPath);
    if (
      file === undefined ||
      (current === null ? null : sha256(current)) !== target.afterHash
    )
      fail(
        "ROLLBACK_POSTIMAGE_DIVERGED",
        "CONFLICT",
        `Current file '${target.logicalPath}' no longer matches the promoted postimage.`,
        target.logicalPath,
      );
    targets.push({
      logicalPath: target.logicalPath,
      currentHash: target.afterHash,
      restoreHash: target.beforeHash,
    });
  }
  return {
    schemaVersion: "1.0.0",
    rollbackSchemaVersion: "1.0.0",
    promotionId: stored.record.promotionId,
    promotionPlanHash: stored.record.planHash,
    targets,
    dryRun: true,
    requiresConfirmation: true,
  };
}

export async function executeRollback(options: {
  readonly projectRoot: string;
  readonly plan: RollbackPlanV1;
  readonly confirm: boolean;
  readonly now: () => Date;
}): Promise<RollbackPlanV1 | PromotionRecordV1> {
  if (!options.confirm) return options.plan;
  const projectRoot = await canonicalProjectRoot(options.projectRoot);
  const stored = await loadStoredPromotion(
    projectRoot,
    options.plan.promotionId,
  );
  const planned = await createRollbackPlan({
    projectRoot,
    promotionId: options.plan.promotionId,
  });
  if (canonicalHash(planned) !== canonicalHash(options.plan))
    fail(
      "ROLLBACK_PLAN_DRIFT",
      "CONFLICT",
      "Rollback preview changed before confirmation.",
      "plan",
    );
  const files = new Map(stored.files.map((file) => [file.logicalPath, file]));
  const restored: string[] = [];
  try {
    for (const target of options.plan.targets) {
      const path = targetPath(projectRoot, target.logicalPath);
      const beforeBase64 = files.get(target.logicalPath)!.beforeBase64;
      if (beforeBase64 === null) await unlink(path);
      else await writeAtomic(path, Buffer.from(beforeBase64, "base64"));
      restored.push(target.logicalPath);
    }
  } catch (error) {
    for (const logicalPath of restored.reverse()) {
      const path = targetPath(projectRoot, logicalPath);
      const afterBase64 = files.get(logicalPath)!.afterBase64;
      if (afterBase64 === null) await rm(path, { force: true });
      else await writeAtomic(path, Buffer.from(afterBase64, "base64"));
    }
    throw error;
  }
  const rollbackRecordHash = canonicalHash({
    promotionId: stored.record.promotionId,
    restoredAt: options.now().toISOString(),
    targets: options.plan.targets,
  });
  const record: PromotionRecordV1 = {
    ...stored.record,
    state: "rolled-back",
    rollbackRecordHash,
  };
  await writeFile(
    resolve(
      stateRoot(projectRoot),
      stored.record.promotionId,
      "rolled-back.json",
    ),
    `${canonicalJson(record)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  return record;
}
