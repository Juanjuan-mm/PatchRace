import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const outputPath = resolve(
  process.env.PATCHRACE_QA_AGENT_OUTPUT ??
    ".artifacts/qa-agent-compatibility.json",
);

const cases = [
  {
    adapter: "pi",
    profile: "minimum",
    environmentName: "PATCHRACE_QA_PI_MIN",
    expectedVersion: "0.81.0",
    checks: [
      {
        args: ["--help"],
        contains: [
          "--mode <mode>",
          "json",
          "--print",
          "--no-session",
          "--no-extensions",
          "--no-skills",
          "--no-context-files",
        ],
      },
    ],
  },
  {
    adapter: "pi",
    profile: "current",
    environmentName: "PATCHRACE_QA_PI_CURRENT",
    expectedVersion: "0.81.1",
    checks: [
      {
        args: ["--help"],
        contains: [
          "--mode <mode>",
          "json",
          "--print",
          "--no-session",
          "--no-extensions",
          "--no-skills",
          "--no-context-files",
        ],
      },
    ],
  },
  {
    adapter: "claude-code",
    profile: "minimum",
    environmentName: "PATCHRACE_QA_CLAUDE_MIN",
    expectedVersion: "2.1.104",
    checks: [
      {
        args: ["--help"],
        contains: [
          "--print",
          "--output-format <format>",
          "stream-json",
          "--permission-mode <mode>",
          "--no-session-persistence",
          "--setting-sources <sources>",
        ],
      },
      {
        args: ["auth", "status", "--help"],
        contains: ["Show authentication status", "--json"],
      },
    ],
  },
  {
    adapter: "claude-code",
    profile: "current",
    environmentName: "PATCHRACE_QA_CLAUDE_CURRENT",
    expectedVersion: "2.1.218",
    checks: [
      {
        args: ["--help"],
        contains: [
          "--print",
          "--output-format <format>",
          "stream-json",
          "--permission-mode <mode>",
          "--no-session-persistence",
          "--setting-sources <sources>",
        ],
      },
      {
        args: ["auth", "status", "--help"],
        contains: ["Show authentication status", "--json"],
      },
    ],
  },
  {
    adapter: "codex",
    profile: "minimum-current",
    environmentName: "PATCHRACE_QA_CODEX_CURRENT",
    expectedVersion: "0.145.0",
    checks: [
      {
        args: ["--help"],
        contains: ["--ask-for-approval <APPROVAL_POLICY>"],
      },
      {
        args: ["--ask-for-approval", "never", "exec", "--help"],
        contains: [
          "Run Codex non-interactively",
          "--json",
          "--sandbox <SANDBOX_MODE>",
          "--ephemeral",
          "--ignore-user-config",
          "--ignore-rules",
          "--cd <DIR>",
        ],
      },
      {
        args: ["login", "status", "--help"],
        contains: ["Show login status"],
      },
    ],
  },
];

function safeEnvironment() {
  const environment = {};
  for (const name of ["PATH", "LANG", "LC_ALL", "TERM"]) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  environment.NO_COLOR = "1";
  return environment;
}

async function capture(executable, args) {
  try {
    const result = await execute(executable, args, {
      env: safeEnvironment(),
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return `${result.stdout}\n${result.stderr}`.trim();
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    throw new Error(
      `Command failed (${args.join(" ")}): ${`${stdout}\n${stderr}`.trim().slice(0, 1000)}`,
      { cause: error },
    );
  }
}

const results = [];
for (const entry of cases) {
  const configured = process.env[entry.environmentName];
  if (configured === undefined || configured.length === 0)
    throw new Error(`Missing required ${entry.environmentName}.`);
  const executable = await realpath(configured);
  const versionOutput = await capture(executable, ["--version"]);
  if (!versionOutput.includes(entry.expectedVersion))
    throw new Error(
      `${entry.adapter}/${entry.profile} expected ${entry.expectedVersion}, received ${versionOutput.slice(0, 200)}.`,
    );
  const verifiedChecks = [];
  for (const check of entry.checks) {
    const help = await capture(executable, check.args);
    const missing = check.contains.filter((value) => !help.includes(value));
    if (missing.length > 0)
      throw new Error(
        `${entry.adapter}/${entry.profile} ${check.args.join(" ")} is missing: ${missing.join(", ")}.`,
      );
    verifiedChecks.push({
      args: check.args,
      requiredFragments: check.contains,
    });
  }
  results.push({
    adapter: entry.adapter,
    profile: entry.profile,
    version: entry.expectedVersion,
    executablePathHash: `sha256:${createHash("sha256").update(executable).digest("hex")}`,
    checks: verifiedChecks,
    status: "PASS",
  });
}

const summary = {
  schemaVersion: "1.0.0",
  status: "PASS",
  generatedAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  node: process.version,
  networkDuringProbe: false,
  agentInvocation: false,
  credentialReadRequested: false,
  cases: results,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, {
  mode: 0o600,
});
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
