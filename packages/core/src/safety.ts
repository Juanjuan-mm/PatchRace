import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  type FileHandle,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { PatchRaceError } from "@patchrace/contracts";

export function isStrictDescendant(root: string, candidate: string): boolean {
  const difference = relative(resolve(root), resolve(candidate));
  return (
    difference !== "" &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

export function assertSafeRoot(root: string, label = "root"): string {
  const absolute = resolve(root);
  const broad = new Set([resolve("/"), resolve(homedir())]);
  if (broad.has(absolute)) {
    throw new PatchRaceError({
      code: "PATH_BROAD_ROOT_REFUSED",
      category: "SAFETY",
      message: `Refusing broad ${label} path.`,
      path: label,
    });
  }
  return absolute;
}

export function resolveOwnedPath(root: string, logicalPath: string): string {
  if (
    logicalPath.length === 0 ||
    logicalPath.includes("\0") ||
    isAbsolute(logicalPath) ||
    logicalPath.split(/[\\/]/u).some((part) => part === ".." || part === "")
  ) {
    throw new PatchRaceError({
      code: "PATH_LOGICAL_INVALID",
      category: "SAFETY",
      message: `Unsafe logical path '${logicalPath}'.`,
      path: "logicalPath",
    });
  }
  const candidate = resolve(root, logicalPath);
  if (!isStrictDescendant(root, candidate)) {
    throw new PatchRaceError({
      code: "PATH_ESCAPE_REFUSED",
      category: "SAFETY",
      message: "Resolved path escapes its owned root.",
      path: "logicalPath",
    });
  }
  return candidate;
}

export async function ensureOwnedDirectory(
  root: string,
  logicalDirectory: string,
): Promise<string> {
  const absoluteRoot = assertSafeRoot(root);
  const target =
    logicalDirectory === "."
      ? absoluteRoot
      : resolveOwnedPath(absoluteRoot, logicalDirectory);
  const difference = relative(absoluteRoot, target);
  const components = difference === "" ? [] : difference.split(sep);
  let current = absoluteRoot;
  await mkdir(current, { recursive: true, mode: 0o700 });
  const rootInfo = await lstat(current);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new PatchRaceError({
      code: "PATH_ROOT_NOT_DIRECTORY",
      category: "SAFETY",
      message: "Owned root is not a real directory.",
      path: "root",
    });
  }
  for (const component of components) {
    current = resolve(current, component);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new PatchRaceError({
          code: "PATH_COMPONENT_UNSAFE",
          category: "SAFETY",
          message: `Owned path component is not a real directory: ${component}.`,
          path: logicalDirectory,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current, { mode: 0o700 });
    }
  }
  return target;
}

export async function assertCanonicalDescendant(
  root: string,
  target: string,
): Promise<void> {
  const canonicalRoot = await realpath(root);
  let existing = resolve(target);
  for (;;) {
    try {
      existing = await realpath(existing);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      existing = parent;
    }
  }
  if (
    existing !== canonicalRoot &&
    !isStrictDescendant(canonicalRoot, existing)
  ) {
    throw new PatchRaceError({
      code: "PATH_CANONICAL_ESCAPE_REFUSED",
      category: "SAFETY",
      message: "Canonical target escapes its owned root.",
      path: "target",
    });
  }
}

export async function openRegularFileNoFollow(
  path: string,
  flags: number,
  options: { readonly label?: string; readonly mode?: number } = {},
): Promise<FileHandle> {
  const label = options.label ?? path;
  let before = await lstat(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (
    before !== null &&
    (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1)
  ) {
    throw new PatchRaceError({
      code: "PATH_FILE_UNSAFE",
      category: "SAFETY",
      message:
        "Owned file must be a non-symlink regular file with exactly one hard link.",
      path: label,
    });
  }
  let handle: FileHandle;
  try {
    if (before === null && (flags & constants.O_CREAT) !== 0) {
      try {
        handle = await open(
          path,
          flags | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
          options.mode ?? 0o600,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        before = await lstat(path);
        if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1)
          throw new PatchRaceError({
            code: "PATH_FILE_UNSAFE",
            category: "SAFETY",
            message:
              "Owned file must be a non-symlink regular file with exactly one hard link.",
            path: label,
          });
        handle = await open(
          path,
          flags | (constants.O_NOFOLLOW ?? 0),
          options.mode ?? 0o600,
        );
      }
    } else {
      handle = await open(
        path,
        flags | (constants.O_NOFOLLOW ?? 0),
        options.mode ?? 0o600,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ELOOP") throw error;
    throw new PatchRaceError(
      {
        code: "PATH_FILE_UNSAFE",
        category: "SAFETY",
        message: "Refusing to follow a symbolic-link file.",
        path: label,
      },
      { cause: error },
    );
  }
  try {
    const info = await handle.stat();
    const after = await lstat(path);
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      after.isSymbolicLink() ||
      !after.isFile() ||
      after.nlink !== 1 ||
      (before !== null &&
        (before.dev !== info.dev || before.ino !== info.ino)) ||
      after.dev !== info.dev ||
      after.ino !== info.ino
    )
      throw new PatchRaceError({
        code: "PATH_FILE_UNSAFE",
        category: "SAFETY",
        message:
          "Owned file must be a regular file with exactly one hard link.",
        path: label,
      });
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function readRegularFileNoFollow(
  path: string,
  label = path,
  maxBytes?: number,
): Promise<Buffer> {
  const handle = await openRegularFileNoFollow(path, constants.O_RDONLY, {
    label,
  });
  try {
    if (maxBytes !== undefined) {
      const info = await handle.stat();
      if (info.size > maxBytes)
        throw new PatchRaceError({
          code: "FILE_READ_TOO_LARGE",
          category: "BUDGET",
          message: `Owned file exceeds its configured read limit: ${label}.`,
          path: label,
        });
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
