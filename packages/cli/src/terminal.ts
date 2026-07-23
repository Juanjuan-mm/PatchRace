import { PatchRaceError, type RaceProgressEventV1 } from "@patchrace/contracts";

export interface TerminalProgressOptions {
  readonly stderr: (text: string) => void;
  readonly machineMode?: boolean;
}

const terminalPhases = new Set<RaceProgressEventV1["phase"]>([
  "completed",
  "failed",
  "cancelled",
  "budget_exhausted",
  "interrupted",
]);

function plain(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || (code >= 127 && code <= 159) ? " " : character;
    })
    .join("")
    .trim();
}

export function formatRaceProgress(event: RaceProgressEventV1): string {
  if (
    !Number.isInteger(event.sequence) ||
    event.sequence < 1 ||
    !Number.isInteger(event.completedTrials) ||
    event.completedTrials < 0 ||
    !Number.isInteger(event.totalTrials) ||
    event.totalTrials < 0 ||
    event.completedTrials > event.totalTrials
  )
    throw new PatchRaceError({
      code: "PROGRESS_EVENT_INVALID",
      category: "INTERNAL",
      message: "Race progress counts or sequence are invalid.",
      path: "progress",
    });
  const scope = [event.taskId, event.variantId]
    .filter((value): value is string => value !== null)
    .map(plain)
    .join(" / ");
  const identity = event.trialId === null ? "race" : event.trialId;
  const message = event.message === null ? "" : ` — ${plain(event.message)}`;
  return `[${event.completedTrials}/${event.totalTrials}] ${identity} ${event.phase}${scope === "" ? "" : ` (${scope})`}${message}\n`;
}

export class TerminalProgressView {
  readonly #stderr: (text: string) => void;
  readonly #machineMode: boolean;
  readonly #terminalTrials = new Set<string>();
  #lastSequence = 0;

  constructor(options: TerminalProgressOptions) {
    this.#stderr = options.stderr;
    this.#machineMode = options.machineMode ?? false;
  }

  update(event: RaceProgressEventV1): void {
    if (event.sequence <= this.#lastSequence)
      throw new PatchRaceError({
        code: "PROGRESS_SEQUENCE_INVALID",
        category: "INTERNAL",
        message: "Race progress events must be strictly ordered.",
        path: "progress.sequence",
      });
    if (event.trialId !== null && terminalPhases.has(event.phase)) {
      if (this.#terminalTrials.has(event.trialId))
        throw new PatchRaceError({
          code: "PROGRESS_TERMINAL_DUPLICATE",
          category: "INTERNAL",
          message: "A terminal trial progress event cannot be emitted twice.",
          path: "progress.trialId",
        });
      this.#terminalTrials.add(event.trialId);
    }
    this.#lastSequence = event.sequence;
    if (!this.#machineMode) this.#stderr(formatRaceProgress(event));
  }
}
