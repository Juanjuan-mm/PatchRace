import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { lstat, opendir, readFile, realpath } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

import {
  PatchRaceError,
  sha256,
  type PiResourceInventoryV1,
  type PiResourceKind,
  type PiResourceLintFindingV1,
  type PiResourceOrigin,
  type PiResourceRecordV1,
} from "@patchrace/contracts";

const ignoredProjectDirectories = new Set([
  ".git",
  ".patchrace",
  "dist",
  "node_modules",
]);
const textKinds = new Set<PiResourceKind>([
  "agents-guidance",
  "skill",
  "prompt-template",
  "settings",
]);
const secretLike =
  /(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/iu;

export interface InventoryPiResourcesOptions {
  readonly projectRoot: string;
  readonly globalRoot?: string;
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
  readonly maxActiveContextTokens?: number;
}

interface DiscoveredResource {
  readonly kind: PiResourceKind;
  readonly origin: PiResourceOrigin;
  readonly root: string;
  readonly path: string;
  readonly logicalPath: string;
  readonly name: string;
}

function resourceId(resource: DiscoveredResource): string {
  const digest = createHash("sha256")
    .update(`${resource.origin}\0${resource.kind}\0${resource.logicalPath}`)
    .digest("hex")
    .slice(0, 16);
  return `resource_${digest}`;
}

function contextTokens(content: Buffer): number {
  return Math.ceil([...content.toString("utf8")].length / 4);
}

function normalizedPath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

async function assertReadableRoot(
  path: string,
  label: string,
): Promise<string> {
  const absolute = resolve(path);
  const info = await lstat(absolute).catch((error: NodeJS.ErrnoException) => {
    throw new PatchRaceError(
      {
        code: "PI_RESOURCE_ROOT_UNREADABLE",
        category: "PREFLIGHT",
        message: `Cannot read ${label}.`,
        path: label,
      },
      { cause: error },
    );
  });
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new PatchRaceError({
      code: "PI_RESOURCE_ROOT_INVALID",
      category: "SAFETY",
      message: `${label} must be a real directory.`,
      path: label,
    });
  return realpath(absolute);
}

async function entries(path: string): Promise<readonly Dirent[]> {
  const directory = await opendir(path);
  const result: Dirent[] = [];
  for await (const entry of directory) result.push(entry);
  return result.sort((left, right) => left.name.localeCompare(right.name));
}

async function discoverAgentsFiles(
  projectRoot: string,
  maxFiles: number,
  findings: PiResourceLintFindingV1[],
): Promise<DiscoveredResource[]> {
  const discovered: DiscoveredResource[] = [];
  const pending = [projectRoot];
  while (pending.length > 0 && discovered.length < maxFiles) {
    const directory = pending.shift()!;
    for (const entry of await entries(directory)) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        if (entry.name === "AGENTS.md")
          findings.push({
            schemaVersion: "1.0.0",
            code: "symlink-refused",
            severity: "warning",
            resourceIds: [],
            message: `Refused symlinked project resource '${normalizedPath(projectRoot, path)}'.`,
            mutationAllowed: false,
          });
        continue;
      }
      if (
        entry.isDirectory() &&
        !ignoredProjectDirectories.has(entry.name) &&
        !normalizedPath(projectRoot, path).startsWith(".pi/")
      )
        pending.push(path);
      if (entry.isFile() && entry.name === "AGENTS.md")
        discovered.push({
          kind: "agents-guidance",
          origin: "project",
          root: projectRoot,
          path,
          logicalPath: normalizedPath(projectRoot, path),
          name: normalizedPath(projectRoot, path),
        });
    }
  }
  if (pending.length > 0)
    findings.push({
      schemaVersion: "1.0.0",
      code: "inventory-limit",
      severity: "error",
      resourceIds: [],
      message: `Stopped project guidance discovery at the ${maxFiles}-file limit.`,
      mutationAllowed: false,
    });
  return discovered;
}

async function discoverTree(
  options: {
    readonly root: string;
    readonly origin: PiResourceOrigin;
    readonly directory: string;
    readonly kind: PiResourceKind;
    readonly accept: (entry: Dirent) => boolean;
  },
  findings: PiResourceLintFindingV1[],
): Promise<DiscoveredResource[]> {
  const directory = join(options.root, options.directory);
  const info = await lstat(directory).catch((error: NodeJS.ErrnoException) =>
    error.code === "ENOENT" ? null : Promise.reject(error),
  );
  if (info === null) return [];
  if (!info.isDirectory() || info.isSymbolicLink()) {
    findings.push({
      schemaVersion: "1.0.0",
      code: "symlink-refused",
      severity: "warning",
      resourceIds: [],
      message: `Refused non-directory resource root '${options.directory}'.`,
      mutationAllowed: false,
    });
    return [];
  }
  const result: DiscoveredResource[] = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.shift()!;
    for (const entry of await entries(current)) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        findings.push({
          schemaVersion: "1.0.0",
          code: "symlink-refused",
          severity: "warning",
          resourceIds: [],
          message: `Refused symlinked resource '${normalizedPath(options.root, path)}'.`,
          mutationAllowed: false,
        });
      } else if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && options.accept(entry)) {
        const logicalPath = normalizedPath(options.root, path);
        const parentName = basename(resolve(path, ".."));
        result.push({
          kind: options.kind,
          origin: options.origin,
          root: options.root,
          path,
          logicalPath,
          name:
            options.kind === "skill"
              ? parentName
              : entry.name.replace(/\.[^.]+$/u, ""),
        });
      }
    }
  }
  return result;
}

async function discoverFixed(
  root: string,
  origin: PiResourceOrigin,
  logicalPath: string,
  kind: PiResourceKind,
  findings: PiResourceLintFindingV1[],
): Promise<DiscoveredResource[]> {
  const path = join(root, logicalPath);
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) =>
    error.code === "ENOENT" ? null : Promise.reject(error),
  );
  if (info === null) return [];
  if (!info.isFile() || info.isSymbolicLink()) {
    findings.push({
      schemaVersion: "1.0.0",
      code: "symlink-refused",
      severity: "warning",
      resourceIds: [],
      message: `Refused non-file resource '${logicalPath}'.`,
      mutationAllowed: false,
    });
    return [];
  }
  return [
    {
      kind,
      origin,
      root,
      path,
      logicalPath,
      name: basename(logicalPath),
    },
  ];
}

async function discoverRoot(
  root: string,
  origin: PiResourceOrigin,
  prefix: string,
  findings: PiResourceLintFindingV1[],
): Promise<DiscoveredResource[]> {
  const paths = {
    skills: prefix === "" ? "skills" : `${prefix}/skills`,
    prompts: prefix === "" ? "prompts" : `${prefix}/prompts`,
    settings: prefix === "" ? "settings.json" : `${prefix}/settings.json`,
    extensions: prefix === "" ? "extensions" : `${prefix}/extensions`,
    packages: prefix === "" ? "packages" : `${prefix}/packages`,
  };
  const groups = await Promise.all([
    discoverTree(
      {
        root,
        origin,
        directory: paths.skills,
        kind: "skill",
        accept: (entry) => entry.name === "SKILL.md",
      },
      findings,
    ),
    discoverTree(
      {
        root,
        origin,
        directory: paths.prompts,
        kind: "prompt-template",
        accept: (entry) => entry.name.endsWith(".md"),
      },
      findings,
    ),
    discoverFixed(root, origin, paths.settings, "settings", findings),
    discoverTree(
      {
        root,
        origin,
        directory: paths.extensions,
        kind: "extension",
        accept: () => true,
      },
      findings,
    ),
    discoverTree(
      {
        root,
        origin,
        directory: paths.packages,
        kind: "package",
        accept: () => true,
      },
      findings,
    ),
  ]);
  return groups.flat();
}

function precedence(resource: DiscoveredResource): number {
  if (resource.kind === "agents-guidance")
    return 200 + resource.logicalPath.split("/").length;
  return resource.origin === "project" ? 200 : 100;
}

function collisionKey(resource: DiscoveredResource): string {
  return `${resource.kind}\0${resource.name}`;
}

function lintContent(
  resource: DiscoveredResource,
  id: string,
  content: Buffer,
  maxFileBytes: number,
): PiResourceLintFindingV1[] {
  const result: PiResourceLintFindingV1[] = [];
  if (content.byteLength > maxFileBytes)
    result.push({
      schemaVersion: "1.0.0",
      code: "context-bloat",
      severity: "warning",
      resourceIds: [id],
      message: `Resource '${resource.logicalPath}' exceeds the configured byte budget.`,
      mutationAllowed: resource.origin === "project",
    });
  if (textKinds.has(resource.kind) && secretLike.test(content.toString("utf8")))
    result.push({
      schemaVersion: "1.0.0",
      code: "secret-like-content",
      severity: "error",
      resourceIds: [id],
      message: `Resource '${resource.logicalPath}' contains secret-like text; content was not included in inventory output.`,
      mutationAllowed: false,
    });
  if (resource.kind === "skill") {
    const text = content.toString("utf8");
    if (!/^---\n[\s\S]*?\n---(?:\n|$)/u.test(text))
      result.push({
        schemaVersion: "1.0.0",
        code: "invalid-skill-frontmatter",
        severity: "error",
        resourceIds: [id],
        message: `Skill '${resource.logicalPath}' has no bounded YAML frontmatter block.`,
        mutationAllowed: resource.origin === "project",
      });
  }
  if (resource.kind === "settings") {
    try {
      const parsed: unknown = JSON.parse(content.toString("utf8"));
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      )
        throw new Error("settings root must be an object");
    } catch {
      result.push({
        schemaVersion: "1.0.0",
        code: "invalid-settings",
        severity: "error",
        resourceIds: [id],
        message: `Settings '${resource.logicalPath}' is not a JSON object.`,
        mutationAllowed: resource.origin === "project",
      });
    }
  }
  if (resource.kind === "extension" || resource.kind === "package")
    result.push({
      schemaVersion: "1.0.0",
      code: "executable-resource",
      severity: "info",
      resourceIds: [id],
      message: `Executable resource '${resource.logicalPath}' is inventory-only and cannot be generated or promoted in v0.1.`,
      mutationAllowed: false,
    });
  return result;
}

export async function inventoryPiResources(
  options: InventoryPiResourcesOptions,
): Promise<PiResourceInventoryV1> {
  const maxFiles = options.maxFiles ?? 2_000;
  const maxFileBytes = options.maxFileBytes ?? 64 * 1024;
  const maxActiveContextTokens = options.maxActiveContextTokens ?? 8_000;
  if (maxFiles < 1 || maxFileBytes < 1 || maxActiveContextTokens < 1)
    throw new PatchRaceError({
      code: "PI_RESOURCE_LIMIT_INVALID",
      category: "CONFIG",
      message: "Pi resource inventory limits must be positive integers.",
      path: "inventory",
    });
  const projectRoot = await assertReadableRoot(
    options.projectRoot,
    "projectRoot",
  );
  const globalRoot =
    options.globalRoot === undefined
      ? null
      : await assertReadableRoot(options.globalRoot, "globalRoot");
  const findings: PiResourceLintFindingV1[] = [];
  const discovered = [
    ...(await discoverAgentsFiles(projectRoot, maxFiles, findings)),
    ...(await discoverRoot(projectRoot, "project", ".pi", findings)),
    ...(globalRoot === null
      ? []
      : [
          ...(await discoverFixed(
            globalRoot,
            "global",
            "AGENTS.md",
            "agents-guidance",
            findings,
          )),
          ...(await discoverRoot(globalRoot, "global", "", findings)),
        ]),
  ];
  if (discovered.length > maxFiles)
    throw new PatchRaceError({
      code: "PI_RESOURCE_FILE_LIMIT_EXCEEDED",
      category: "SAFETY",
      message: `Pi resource inventory exceeds the ${maxFiles}-file limit.`,
      path: "inventory.maxFiles",
    });

  const loaded = await Promise.all(
    discovered.map(async (resource) => {
      const content = await readFile(resource.path);
      const id = resourceId(resource);
      findings.push(...lintContent(resource, id, content, maxFileBytes));
      return { resource, content, id };
    }),
  );
  const winners = new Map<string, (typeof loaded)[number]>();
  for (const item of loaded) {
    const key = collisionKey(item.resource);
    const current = winners.get(key);
    if (
      current === undefined ||
      precedence(item.resource) > precedence(current.resource)
    )
      winners.set(key, item);
  }
  const resources: PiResourceRecordV1[] = loaded.map((item) => {
    const winner = winners.get(collisionKey(item.resource))!;
    const executable =
      item.resource.kind === "extension" || item.resource.kind === "package";
    return {
      schemaVersion: "1.0.0",
      id: item.id,
      kind: item.resource.kind,
      origin: item.resource.origin,
      logicalPath: item.resource.logicalPath,
      name: item.resource.name,
      hash: sha256(item.content),
      byteCount: item.content.byteLength,
      estimatedContextTokens: textKinds.has(item.resource.kind)
        ? contextTokens(item.content)
        : 0,
      precedence: precedence(item.resource),
      status: executable
        ? "informational"
        : winner.id === item.id
          ? "active"
          : "shadowed",
      shadowedBy: !executable && winner.id !== item.id ? winner.id : null,
    };
  });
  const collisionGroups = new Map<string, typeof loaded>();
  for (const item of loaded) {
    const key = collisionKey(item.resource);
    collisionGroups.set(key, [...(collisionGroups.get(key) ?? []), item]);
  }
  for (const [key, group] of collisionGroups)
    if (group.length > 1) {
      const ids = group.map((item) => item.id).sort();
      findings.push({
        schemaVersion: "1.0.0",
        code: key.startsWith("settings\0")
          ? "settings-conflict"
          : "duplicate-resource",
        severity: "warning",
        resourceIds: ids,
        message: `Multiple '${key.split("\0")[0]}' resources named '${key.split("\0")[1]}' have explicit precedence.`,
        mutationAllowed: group.some(
          (item) => item.resource.origin === "project",
        ),
      });
    }
  const activeContextTokens = resources
    .filter((resource) => resource.status === "active")
    .reduce((sum, resource) => sum + resource.estimatedContextTokens, 0);
  if (activeContextTokens > maxActiveContextTokens)
    findings.push({
      schemaVersion: "1.0.0",
      code: "context-bloat",
      severity: "warning",
      resourceIds: resources
        .filter(
          (resource) =>
            resource.status === "active" && resource.estimatedContextTokens > 0,
        )
        .map((resource) => resource.id),
      message: `Active Pi context estimate ${activeContextTokens} exceeds the ${maxActiveContextTokens}-token budget.`,
      mutationAllowed: true,
    });
  return {
    schemaVersion: "1.0.0",
    inventorySchemaVersion: "1.0.0",
    roots: [
      { origin: "project", label: "project-root", supplied: true },
      {
        origin: "global",
        label: "explicit-global-root",
        supplied: globalRoot !== null,
      },
    ],
    resources: resources.sort(
      (left, right) =>
        right.precedence - left.precedence ||
        left.logicalPath.localeCompare(right.logicalPath),
    ),
    findings: findings.sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        left.message.localeCompare(right.message),
    ),
    totals: {
      resourceCount: resources.length,
      activeContextTokens,
      projectContextTokens: resources
        .filter((resource) => resource.origin === "project")
        .reduce((sum, resource) => sum + resource.estimatedContextTokens, 0),
      globalContextTokens: resources
        .filter((resource) => resource.origin === "global")
        .reduce((sum, resource) => sum + resource.estimatedContextTokens, 0),
    },
    limitations: [
      "Token counts are deterministic four-Unicode-code-point estimates, not vendor billing tokens.",
      "The global root is read only when explicitly supplied; authentication stores are never discovered.",
      "Executable extensions and packages are inventory-only in v0.1.",
    ],
  };
}
