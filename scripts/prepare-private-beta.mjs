import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const betaRoot = join(root, ".artifacts", "private-beta");
await mkdir(join(betaRoot, "participants"), { recursive: true });
const protocol = await readFile(
  join(root, "docs", "PRIVATE_BETA_PROTOCOL.md"),
  "utf8",
);
if (
  !protocol
    .replaceAll(/\s+/g, " ")
    .includes("five people who did not author the implementation")
)
  throw new Error("Private beta independence requirement is missing.");
await writeFile(
  join(betaRoot, "README.md"),
  `# Local private beta collection

This directory is local-sensitive and Git-ignored.

1. Copy \`beta/participant-template.json\` to
   \`participants/beta-pNN.json\`.
2. Replace every placeholder only after consent.
3. Set \`sample: false\` and \`implementationAuthor: false\` only for a real,
   independent participant.
4. Run \`pnpm beta:verify\`.

Never store contact data, code, paths, credentials, raw traces, reports, or
hidden material here.
`,
);
process.stdout.write(
  `${JSON.stringify(
    {
      status: "READY",
      collection: ".artifacts/private-beta/participants",
      participantRecords: 0,
      syntheticRecordsCreated: false,
      next: "Recruit and observe at least five independent target users.",
    },
    null,
    2,
  )}\n`,
);
