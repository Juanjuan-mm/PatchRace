import { constants } from "node:fs";
import { access, realpath, statfs } from "node:fs/promises";
import { delimiter, isAbsolute, resolve } from "node:path";

import { SCHEMA_VERSION, canonicalHash } from "@patchrace/contracts";

import { loadSuiteConfig, type AdapterConfig } from "./config.js";
import { runProcess } from "./process.js";
import { Redactor } from "./redaction.js";

export type DoctorStatus = "pass" | "warn" | "fail";
export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorStatus;
  readonly summary: string;
  readonly version?: string;
  readonly remediation?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}
export interface DoctorReport {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly overall: DoctorStatus;
  readonly projectRoot: string;
  readonly checks: readonly DoctorCheck[];
}

function supportedNode(version: string): boolean {
  const match = /^v(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return (
    major === 24 ||
    major === 26 ||
    (major === 22 && (minor > 22 || (minor === 22 && patch >= 0)))
  );
}

async function findExecutable(executable: string): Promise<string | null> {
  const candidates =
    executable.includes("/") || isAbsolute(executable)
      ? [resolve(executable)]
      : (process.env["PATH"] ?? "")
          .split(delimiter)
          .filter(Boolean)
          .map((directory) => resolve(directory, executable));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "EACCES" && code !== "ENOTDIR")
        throw error;
    }
  }
  return null;
}

async function probe(
  executable: string,
  args: readonly string[],
  cwd: string,
  capture = true,
): Promise<{ ok: boolean; output: string }> {
  const output: Buffer[] = [];
  const result = await runProcess({
    executable,
    args,
    cwd,
    inheritEnvironment: ["PATH", "LANG", "LC_ALL", "TERM"],
    timeoutMs: 5000,
    maxOutputBytes: 256 * 1024,
    ...(capture
      ? {
          onStdout: (chunk: Uint8Array) => {
            output.push(Buffer.from(chunk));
          },
          onStderr: (chunk: Uint8Array) => {
            output.push(Buffer.from(chunk));
          },
        }
      : {}),
  });
  return {
    ok: result.status === "completed",
    output: new Redactor({ paths: [cwd] })
      .redactText(Buffer.concat(output).toString("utf8"))
      .trim(),
  };
}

function overall(checks: readonly DoctorCheck[]): DoctorStatus {
  return checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";
}

export async function inspectEnvironment(options: {
  readonly projectRoot: string;
  readonly configPath?: string;
  readonly adapterId?: string;
  readonly minimumFreeMiB?: number;
}): Promise<DoctorReport> {
  const projectRoot = await realpath(options.projectRoot);
  const checks: DoctorCheck[] = [];
  checks.push({
    id: "runtime.node",
    status: supportedNode(process.version) ? "pass" : "fail",
    summary: supportedNode(process.version)
      ? "Node runtime is supported."
      : "Node runtime is outside the supported 22.22+/24.x/26.x lines.",
    version: process.version,
    ...(supportedNode(process.version)
      ? {}
      : {
          remediation:
            "Install the latest patched Node 22/24 LTS or Node 26 Current release.",
        }),
  });

  const gitPath = await findExecutable("git");
  if (gitPath === null)
    checks.push({
      id: "tool.git",
      status: "fail",
      summary: "Git is not executable on PATH.",
      remediation: "Install Git and ensure it is available on PATH.",
    });
  else {
    const version = await probe(gitPath, ["--version"], projectRoot);
    const worktree = await probe(
      gitPath,
      ["worktree", "list", "--porcelain"],
      projectRoot,
      false,
    );
    checks.push({
      id: "tool.git",
      status: version.ok && worktree.ok ? "pass" : "fail",
      summary:
        version.ok && worktree.ok
          ? "Git and worktree support are ready."
          : "Git worktree probing failed.",
      ...(version.output.split("\n")[0] === undefined
        ? {}
        : { version: version.output.split("\n")[0] }),
      ...(version.ok && worktree.ok
        ? {}
        : {
            remediation:
              "Run `git worktree list` in the project and resolve the reported Git error.",
          }),
      details: {
        executableHash: canonicalHash(gitPath),
        worktree: worktree.ok,
      },
    });
  }

  const filesystem = await statfs(projectRoot);
  const freeMiB = Math.floor(
    Number(filesystem.bavail * filesystem.bsize) / (1024 * 1024),
  );
  const minimum = options.minimumFreeMiB ?? 512;
  checks.push({
    id: "filesystem.capacity",
    status: freeMiB >= minimum ? "pass" : "fail",
    summary:
      freeMiB >= minimum
        ? "Filesystem capacity is sufficient."
        : "Filesystem capacity is below the configured minimum.",
    ...(freeMiB >= minimum
      ? {}
      : { remediation: `Free at least ${minimum} MiB before running trials.` }),
    details: { freeMiB, minimumFreeMiB: minimum },
  });

  let adapters: Readonly<Record<string, AdapterConfig>> = {};
  if (options.configPath !== undefined) {
    try {
      const loaded = await loadSuiteConfig(options.configPath);
      adapters = loaded.config.adapters;
      checks.push({
        id: "config.suite",
        status: "pass",
        summary: "Suite configuration is valid.",
        details: {
          configHash: loaded.configHash,
          warnings: loaded.warnings.length,
        },
      });
    } catch (error) {
      checks.push({
        id: "config.suite",
        status: "fail",
        summary: "Suite configuration is invalid or unreadable.",
        remediation:
          "Fix the path-level configuration error reported by `patchrace doctor --json`.",
        details: {
          errorCode:
            (error as { details?: { code?: string } }).details?.code ??
            "CONFIG_UNKNOWN",
        },
      });
    }
  }
  const selected =
    options.adapterId === undefined
      ? Object.entries(adapters)
      : Object.entries(adapters).filter(([id]) => id === options.adapterId);
  if (options.adapterId !== undefined && selected.length === 0)
    checks.push({
      id: `adapter.${options.adapterId}`,
      status: "fail",
      summary: `Adapter '${options.adapterId}' is not configured.`,
      remediation:
        "Add the adapter to the suite config or select a configured adapter ID.",
    });
  for (const [id, adapter] of selected) {
    const executable = await findExecutable(adapter.executable);
    if (executable === null) {
      checks.push({
        id: `adapter.${id}`,
        status: "fail",
        summary: `Adapter executable '${adapter.executable}' is missing.`,
        remediation: `Install ${adapter.kind} using its official instructions, then retry doctor.`,
        details: { auth: "missing" },
      });
      continue;
    }
    const prefix = adapter.args ?? [];
    const version = await probe(
      executable,
      [...prefix, "--version"],
      projectRoot,
    );
    let auth: "ready" | "missing" | "expired" | "unknown" = "unknown";
    if (adapter.kind === "codex")
      auth = (
        await probe(
          executable,
          [...prefix, "login", "status"],
          projectRoot,
          false,
        )
      ).ok
        ? "ready"
        : "missing";
    else if (adapter.kind === "claude-code")
      auth = (
        await probe(
          executable,
          [...prefix, "auth", "status"],
          projectRoot,
          false,
        )
      ).ok
        ? "ready"
        : "missing";
    const status: DoctorStatus = !version.ok
      ? "fail"
      : auth === "missing"
        ? "fail"
        : auth === "unknown"
          ? "warn"
          : "pass";
    checks.push({
      id: `adapter.${id}`,
      status,
      summary:
        status === "pass"
          ? "Adapter executable and auth probe are ready."
          : auth === "unknown" && version.ok
            ? "Adapter is executable; no non-secret auth readiness probe is defined yet."
            : "Adapter version or auth readiness probe failed.",
      ...(version.output.split("\n")[0] === undefined
        ? {}
        : { version: version.output.split("\n")[0] }),
      ...(status === "pass"
        ? {}
        : {
            remediation:
              auth === "missing"
                ? `Authenticate with the official ${adapter.executable} CLI and retry.`
                : "Confirm authentication with the official CLI before running trials.",
          }),
      details: { executableHash: canonicalHash(executable), auth },
    });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    overall: overall(checks),
    projectRoot: ".",
    checks,
  };
}
