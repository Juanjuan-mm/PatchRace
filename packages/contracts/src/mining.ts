import type { ContentHash } from "./task.js";

export type MinedFileCategory =
  "implementation" | "test" | "documentation" | "configuration" | "other";

export interface MinedTaskCandidateV1 {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly commit: string;
  readonly parents: readonly string[];
  readonly parent: string | null;
  readonly subject: string;
  readonly bodyHash: ContentHash;
  readonly authoredAt: string;
  readonly authorIdentityHash: ContentHash;
  readonly files: readonly {
    readonly path: string;
    readonly status: string;
    readonly category: MinedFileCategory;
    readonly binary: boolean;
  }[];
  readonly referencePatchHash: ContentHash;
  readonly implementationPatchHash: ContentHash | null;
  readonly testPatchHash: ContentHash | null;
  readonly patchBytes: number;
  readonly eligibility: "eligible" | "filtered";
  readonly exclusionReasons: readonly string[];
  readonly review: { readonly required: true; readonly status: "pending" };
  readonly provenance: {
    readonly source: "git-history";
    readonly discoveryQuery: string;
    readonly extractionToolVersion: string;
  };
}

export interface GitHubMetadataV1 {
  readonly schemaVersion: "1.0.0";
  readonly status: "available" | "unavailable";
  readonly commit: string;
  readonly repository: string | null;
  readonly pullRequests: readonly {
    readonly number: number;
    readonly title: string;
    readonly url: string;
    readonly mergedAt: string | null;
    readonly closingIssues: readonly {
      readonly number: number;
      readonly title: string;
      readonly url: string;
      readonly state: string;
    }[];
  }[];
  readonly queriedAt: string;
  readonly source: "gh" | "cache";
  readonly queryHash: ContentHash;
  readonly responseHash: ContentHash;
  readonly ghVersion: string | null;
  readonly unavailableReason: string | null;
}
