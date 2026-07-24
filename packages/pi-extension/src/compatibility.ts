import { isAbsolute, resolve } from "node:path";

export type PiPackageSourceKind = "local" | "git" | "npm";
export type PiPackageAction = "install" | "update" | "remove";

export interface PiPackageSource {
  readonly kind: PiPackageSourceKind;
  readonly source: string;
  readonly identity: string;
}

export type PiPackageSetting =
  | string
  | {
      readonly source: string;
      readonly extensions?: readonly string[];
      readonly skills?: readonly string[];
      readonly prompts?: readonly string[];
      readonly themes?: readonly string[];
      readonly autoload?: boolean;
    };

export interface PiProjectSettings {
  readonly packages?: readonly PiPackageSetting[];
  readonly [key: string]: unknown;
}

function gitIdentity(source: string): string {
  const value = source.startsWith("git:") ? source.slice(4) : source;
  const lastSlash = value.lastIndexOf("/");
  const lastAt = value.lastIndexOf("@");
  return lastAt > lastSlash ? value.slice(0, lastAt) : value;
}

function npmIdentity(source: string): string {
  const value = source.slice("npm:".length);
  if (value.startsWith("@")) {
    const versionAt = value.indexOf("@", 1);
    return versionAt < 0 ? value : value.slice(0, versionAt);
  }
  const versionAt = value.indexOf("@");
  return versionAt < 0 ? value : value.slice(0, versionAt);
}

export function parsePiPackageSource(
  sourceInput: string,
  cwd: string,
): PiPackageSource {
  const source = sourceInput.trim();
  if (source.length === 0 || source.includes("\0"))
    throw new Error("Pi package source must be non-empty and contain no NUL.");
  if (source.startsWith("npm:")) {
    const identity = npmIdentity(source);
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(identity))
      throw new Error("Pi npm package source has an invalid package name.");
    return { kind: "npm", source, identity: `npm:${identity}` };
  }
  if (source.startsWith("git:") || /^(?:https?|ssh|git):\/\//u.test(source)) {
    const identity = gitIdentity(source);
    if (identity.length < 8)
      throw new Error("Pi git package source has an invalid repository.");
    return { kind: "git", source, identity: `git:${identity}` };
  }
  const absolute = isAbsolute(source) ? resolve(source) : resolve(cwd, source);
  return { kind: "local", source, identity: `local:${absolute}` };
}

export function createPiPackagePlan(options: {
  readonly action: PiPackageAction;
  readonly source: string;
  readonly cwd: string;
  readonly scope: "project";
}): {
  readonly source: PiPackageSource;
  readonly executable: "pi";
  readonly arguments: readonly string[];
  readonly network: "never" | "source-dependent";
  readonly mutates: ".pi/settings.json";
} {
  const source = parsePiPackageSource(options.source, options.cwd);
  const arguments_ =
    options.action === "install"
      ? ["install", source.source, "-l", "--approve"]
      : options.action === "remove"
        ? ["remove", source.source, "-l", "--approve"]
        : ["update", "--extension", source.source, "--approve"];
  return {
    source,
    executable: "pi",
    arguments: arguments_,
    network: source.kind === "local" ? "never" : "source-dependent",
    mutates: ".pi/settings.json",
  };
}

function entrySource(entry: PiPackageSetting): string {
  return typeof entry === "string" ? entry : entry.source;
}

function sameIdentity(left: string, right: string, cwd: string): boolean {
  return (
    parsePiPackageSource(left, cwd).identity ===
    parsePiPackageSource(right, cwd).identity
  );
}

export function installProjectPackage(
  settings: PiProjectSettings,
  entry: PiPackageSetting,
  cwd: string,
): PiProjectSettings {
  const source = entrySource(entry);
  const retained = (settings.packages ?? []).filter(
    (item) => !sameIdentity(entrySource(item), source, cwd),
  );
  return { ...settings, packages: [...retained, entry] };
}

export function removeProjectPackage(
  settings: PiProjectSettings,
  source: string,
  cwd: string,
): PiProjectSettings {
  return {
    ...settings,
    packages: (settings.packages ?? []).filter(
      (item) => !sameIdentity(entrySource(item), source, cwd),
    ),
  };
}

function glob(pattern: string, value: string): boolean {
  const expression = pattern
    .replaceAll(/[.+?^${}()|[\]\\]/gu, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${expression}$`, "u").test(value);
}

export function filterPiExtensions(
  manifestExtensions: readonly string[],
  filters: readonly string[] | undefined,
): readonly string[] {
  const manifest = manifestExtensions.map((path) => path.replace(/^\.\//u, ""));
  if (filters === undefined) return manifest;
  if (filters.length === 0) return [];
  const included = new Set<string>();
  for (const filter of filters) {
    const operation = filter[0];
    const pattern =
      operation === "+" || operation === "-" || operation === "!"
        ? filter.slice(1)
        : filter;
    if (pattern.length === 0) throw new Error("Pi resource filter is empty.");
    const matches = manifest.filter((path) =>
      operation === "+" || operation === "-"
        ? path === pattern.replace(/^\.\//u, "")
        : glob(pattern.replace(/^\.\//u, ""), path),
    );
    if (operation === "-" || operation === "!")
      for (const match of matches) included.delete(match);
    else for (const match of matches) included.add(match);
  }
  return manifest.filter((path) => included.has(path));
}
