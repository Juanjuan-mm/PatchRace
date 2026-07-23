import { spawnSync } from "node:child_process";

const head = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
  encoding: "utf8",
  stdio: "ignore",
});

if (head.status !== 0) {
  process.stdout.write(
    "Changesets is configured; status comparison starts after the repository's first commit.\n",
  );
  process.exit(0);
}

const status = spawnSync("changeset", ["status"], { stdio: "inherit" });
process.exit(status.status ?? 1);
