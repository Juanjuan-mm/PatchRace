import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const taskLedgerPath = join(repositoryRoot, "docs", "TASKS.md");
const ledger = await readFile(taskLedgerPath, "utf8");

const allIds = [...ledger.matchAll(/^\| `([A-Z0-9]+-[A-Z0-9]+)` \|/gm)].map((match) => match[1]);
const duplicateIds = allIds.filter((id, index) => allIds.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`Duplicate task IDs: ${duplicateIds.join(", ")}`);

const m1Block = ledger.match(/## M1 — Architecture and technical feasibility\n([\s\S]*?)\n## M2 —/);
if (!m1Block) throw new Error("M1 ledger block not found");
const m1Rows = [...m1Block[1].matchAll(/^\| `([^`]+)` \|[^\n]*\| (TODO|NEXT|DOING|BLOCKED|DONE|DROPPED) \|$/gm)]
  .map((match) => ({ id: match[1], status: match[2] }));
if (m1Rows.length !== 15) throw new Error(`Expected 15 M1 rows, found ${m1Rows.length}`);
const invalidStatuses = m1Rows.filter(({ id, status }) => status !== "DONE" && !(id === "ARC-09" && status === "DOING"));
if (invalidStatuses.length) throw new Error(`M1 incomplete outside active review: ${JSON.stringify(invalidStatuses)}`);

const required = {
  "docs/architecture/SYSTEM_ARCHITECTURE.md": ["Component model", "End-to-end data flow", "Process and trust boundaries", "Local storage layout", "Extension points", "State and failure handling", "Deployment model"],
  "docs/architecture/CLI_AND_CONFIG.md": ["Commands", "Stable exit semantics", "Suite configuration schema"],
  "docs/architecture/RUN_ARTIFACTS.md": ["Identity", "Manifest", "Raw logs and vendor events", "Patch", "Grade and metrics", "Hashing and artifact index", "Schema evolution"],
  "docs/architecture/TRACE_SCHEMA.md": ["Event taxonomy", "Vendor mapping rules", "Completeness and quality"],
  "docs/architecture/AGENT_ADAPTER.md": ["Capability discovery", "Invocation", "Streaming and backpressure", "Cancellation", "Auth behavior", "Metrics", "Error normalization", "Shared contract suite"],
  "docs/architecture/TASK_AND_GRADER.md": ["Baseline", "Setup", "Instruction", "Hidden verifier and isolation", "Assertions", "Budgets", "Grader interface", "Result"],
  "docs/architecture/PI_OPTIMIZER.md": ["Diagnosis input", "Allowed mutation types", "Ablation design", "Objective vector", "Lineage and search budget", "Promotion decision"],
  "docs/architecture/STACK_AND_DEPENDENCIES.md": ["Runtime and language", "Workspace and package manager", "Testing", "Report/UI stack", "Optional Python bridge", "Dependency admission policy"],
  "docs/spikes/M1_SPIKE_EVIDENCE.md": ["SPIKE-01 — Pi headless and SDK", "SPIKE-02 — Claude Code headless", "SPIKE-03 — Codex headless", "SPIKE-04 — Safe Git worktree lifecycle", "SPIKE-05 — Historical task reconstruction", "SPIKE-06 — Trace differential and diagnosis"],
};
for (const [relativePath, headings] of Object.entries(required)) {
  const content = await readFile(join(repositoryRoot, relativePath), "utf8");
  for (const heading of headings) {
    if (!content.includes(`# ${heading}`)) throw new Error(`${relativePath} lacks heading: ${heading}`);
  }
}

async function markdownFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await markdownFiles(path));
    else if (entry.name.endsWith(".md")) output.push(path);
  }
  return output;
}

const brokenLinks = [];
for (const file of [join(repositoryRoot, "README.md"), ...await markdownFiles(join(repositoryRoot, "docs"))]) {
  const content = await readFile(file, "utf8");
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    const local = resolve(dirname(file), decodeURIComponent(target));
    try { await access(local); } catch { brokenLinks.push({ file: file.slice(repositoryRoot.length + 1), target }); }
  }
}
if (brokenLinks.length) throw new Error(`Broken local links: ${JSON.stringify(brokenLinks)}`);

console.log(JSON.stringify({
  status: "PASS",
  canonicalTaskIds: allIds.length,
  m1Tasks: m1Rows.length,
  m1Status: Object.fromEntries(m1Rows.map(({ id, status }) => [id, status])),
  deliverablesChecked: Object.keys(required).length,
  brokenLocalLinks: 0,
}, null, 2));
