import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { format } from "prettier";

import {
  suiteConfigSchema,
  taskV1Schema,
  traceEventV1Schema,
} from "../packages/contracts/dist/index.js";

const root = resolve(import.meta.dirname, "..");
const directory = join(root, "packages", "contracts", "schemas");
await mkdir(directory, { recursive: true });
const schema = await format(JSON.stringify(suiteConfigSchema), {
  parser: "json",
});
await writeFile(join(directory, "suite-v1.json"), schema);
const taskSchema = await format(JSON.stringify(taskV1Schema), {
  parser: "json",
});
await writeFile(join(directory, "task-v1.json"), taskSchema);
await rm(join(root, "packages", "core", "schemas", "suite-v1.json"), {
  force: true,
});

const contractsDirectory = directory;
await mkdir(contractsDirectory, { recursive: true });
const traceSchema = await format(JSON.stringify(traceEventV1Schema), {
  parser: "json",
});
await writeFile(join(contractsDirectory, "trace-event-v1.json"), traceSchema);
