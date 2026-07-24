import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  createPiPackagePlan,
  filterPiExtensions,
} from "../packages/pi-extension/dist/compatibility.js";

const root = resolve(import.meta.dirname, "..");
const packageRoot = join(root, "packages", "pi-extension");
const configuredPi = process.env["PATCHRACE_PI_BIN"];
const piCandidates = [
  configuredPi,
  "/private/tmp/patchrace-m1-pi/node_modules/.bin/pi",
].filter((value) => typeof value === "string" && value.length > 0);
const piBin = piCandidates.find((value) => existsSync(value));
if (piBin === undefined)
  throw new Error(
    "Pi compatibility verification requires PATCHRACE_PI_BIN pointing to a trusted local Pi executable.",
  );

const temporary = mkdtempSync(join(tmpdir(), "patchrace-pi-package-"));
const project = join(temporary, "project");
const globalConfig = join(temporary, "global");
mkdirSync(project);
mkdirSync(globalConfig);

const childEnv = Object.fromEntries(
  ["PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL"]
    .map((key) => [key, process.env[key]])
    .filter((entry) => entry[1] !== undefined),
);
Object.assign(childEnv, {
  PI_CODING_AGENT_DIR: globalConfig,
  PI_OFFLINE: "1",
  PI_SKIP_VERSION_CHECK: "1",
});

function runPi(arguments_, input) {
  const result = spawnSync(piBin, arguments_, {
    cwd: project,
    env: childEnv,
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
  });
  if (result.status !== 0)
    throw new Error(
      `Pi ${arguments_.join(" ")} failed (${String(result.status)}): ${result.stderr || result.stdout}`,
    );
  return result.stdout;
}

function settings() {
  return JSON.parse(
    readFileSync(join(project, ".pi", "settings.json"), "utf8"),
  );
}

function writeSettings(value) {
  writeFileSync(
    join(project, ".pi", "settings.json"),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function rpc(commands) {
  const stdout = runPi(
    ["--mode", "rpc", "--no-session", "--approve", "--offline"],
    `${commands.map((command) => JSON.stringify(command)).join("\n")}\n`,
  );
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function commandNames(responses, id) {
  const response = responses.find((item) => item.id === id);
  if (response?.success !== true || !Array.isArray(response.data?.commands))
    throw new Error(`Pi RPC response '${id}' did not return commands.`);
  return response.data.commands;
}

const expectedCommands = [
  "race",
  "diagnose",
  "coach",
  "review",
  "promote",
  "rollback",
  "status",
  "patchrace",
];

try {
  const version = runPi(["--version"]).trim();
  runPi(["install", packageRoot, "-l", "--approve"]);
  const installed = settings();
  const source = installed.packages?.[0];
  if (typeof source !== "string")
    throw new Error(
      "Pi local install did not write one project package source.",
    );
  if (existsSync(join(globalConfig, "settings.json")))
    throw new Error(
      "Project-local install unexpectedly changed global settings.",
    );

  const loaded = commandNames(
    rpc([{ id: "loaded", type: "get_commands" }]),
    "loaded",
  );
  for (const name of expectedCommands) {
    const command = loaded.find((item) => item.name === name);
    if (
      command?.source !== "extension" ||
      command.sourceInfo?.scope !== "project" ||
      !command.sourceInfo?.path?.endsWith("/dist/index.js")
    )
      throw new Error(
        `Project-local extension command '${name}' did not load.`,
      );
  }

  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  if (JSON.stringify(filterPiExtensions(manifest.pi.extensions, [])) !== "[]")
    throw new Error("Empty resource filter did not disable the extension.");
  writeSettings({
    theme: "dark",
    packages: [{ source, extensions: [] }],
  });
  const disabled = commandNames(
    rpc([{ id: "disabled", type: "get_commands" }]),
    "disabled",
  );
  if (disabled.some((item) => expectedCommands.includes(item.name)))
    throw new Error(
      "Pi resource filtering did not disable PatchRace commands.",
    );

  writeSettings({
    theme: "dark",
    packages: [{ source, extensions: ["+dist/index.js"] }],
  });
  const reenabled = commandNames(
    rpc([{ id: "reenabled", type: "get_commands" }]),
    "reenabled",
  );
  if (
    !expectedCommands.every((name) =>
      reenabled.some((item) => item.name === name),
    )
  )
    throw new Error("Exact resource filter did not re-enable PatchRace.");

  const reloadResponses = rpc([
    { id: "reload", type: "prompt", message: "/patchrace reload" },
    { id: "after-reload", type: "get_commands" },
  ]);
  const reload = reloadResponses.find((item) => item.id === "reload");
  if (reload?.success !== true)
    throw new Error(
      `PatchRace reload command failed: ${reload?.error ?? "unknown"}`,
    );
  if (
    !expectedCommands.every((name) =>
      commandNames(reloadResponses, "after-reload").some(
        (item) => item.name === name,
      ),
    )
  )
    throw new Error("PatchRace commands were not retained after reload.");

  runPi(["update", "--extension", source, "--approve"]);
  if (settings().theme !== "dark")
    throw new Error("Targeted update did not preserve unrelated settings.");

  const dryRunPlans = [
    createPiPackagePlan({
      action: "install",
      source: packageRoot,
      cwd: project,
      scope: "project",
    }),
    createPiPackagePlan({
      action: "install",
      source: "git:https://example.invalid/patchrace.git@v0.1.0",
      cwd: project,
      scope: "project",
    }),
    createPiPackagePlan({
      action: "install",
      source: "npm:pi-patchrace@0.1.0",
      cwd: project,
      scope: "project",
    }),
  ];
  if (
    dryRunPlans.some(
      (plan) =>
        !plan.arguments.includes("-l") || plan.mutates !== ".pi/settings.json",
    )
  )
    throw new Error("Local/git/npm dry-run plan escaped project scope.");

  const unrelated = join(project, ".pi", "unrelated.txt");
  writeFileSync(unrelated, "preserve\n");
  runPi(["remove", source, "-l", "--approve"]);
  const removed = settings();
  if (
    removed.theme !== "dark" ||
    removed.packages?.some((entry) =>
      typeof entry === "string" ? entry === source : entry.source === source,
    ) ||
    readFileSync(unrelated, "utf8") !== "preserve\n"
  )
    throw new Error("Pi uninstall did not preserve unrelated project state.");
  const afterRemove = commandNames(
    rpc([{ id: "removed", type: "get_commands" }]),
    "removed",
  );
  if (afterRemove.some((item) => expectedCommands.includes(item.name)))
    throw new Error("PatchRace commands remained loaded after uninstall.");

  process.stdout.write(
    `Pi package compatibility passed on Pi ${version}: local install, project scope/trust, filters, reload, targeted update, uninstall, and local/git/npm dry-run plans.\n`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
