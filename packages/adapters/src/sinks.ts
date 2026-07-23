import type { ArtifactStore } from "@patchrace/core";

import type { AdapterSink, RawRecord } from "./types.js";

export class MemoryAdapterSink implements AdapterSink {
  readonly chunks: {
    readonly stream: "stdout" | "stderr";
    readonly bytes: Uint8Array;
  }[] = [];
  readonly records: RawRecord[] = [];

  async persistChunk(
    stream: "stdout" | "stderr",
    chunk: Uint8Array,
  ): Promise<void> {
    this.chunks.push({ stream, bytes: Uint8Array.from(chunk) });
  }

  async persistRecord(record: RawRecord): Promise<void> {
    this.records.push(record);
  }
}

export class ArtifactAdapterSink implements AdapterSink {
  readonly #store: ArtifactStore;
  readonly #root: string;

  constructor(store: ArtifactStore, logicalRoot: string) {
    this.#store = store;
    this.#root = logicalRoot.replace(/\/$/, "");
  }

  async persistChunk(
    stream: "stdout" | "stderr",
    chunk: Uint8Array,
  ): Promise<void> {
    await this.#store.appendBytes(`${this.#root}/raw/${stream}.log`, chunk);
  }

  async persistRecord(record: RawRecord): Promise<void> {
    await this.#store.appendJsonLine(`${this.#root}/raw/records.jsonl`, record);
  }
}
