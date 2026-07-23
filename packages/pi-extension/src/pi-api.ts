export type PiNotificationLevel = "info" | "warning" | "error";

export interface PiUi {
  notify(message: string, level: PiNotificationLevel): void;
  confirm(title: string, message: string): Promise<boolean>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  select(
    title: string,
    options: readonly string[],
  ): Promise<string | undefined>;
  editor(title: string, text?: string): Promise<string | undefined>;
  setStatus(id: string, text: string | undefined): void;
  setWidget(id: string, lines: readonly string[] | undefined): void;
}

export interface PiSessionEntry {
  readonly type: string;
  readonly customType?: string;
  readonly data?: unknown;
}

export interface PiSessionManager {
  getEntries(): readonly PiSessionEntry[];
}

export interface PiExtensionCommandContext {
  readonly cwd: string;
  readonly ui: PiUi;
  readonly sessionManager: PiSessionManager;
  waitForIdle(): Promise<void>;
  reload?(): Promise<void>;
}

export interface PiCommandDefinition {
  readonly description: string;
  readonly handler: (
    args: string,
    context: PiExtensionCommandContext,
  ) => Promise<void>;
}

export interface PiExtensionApi {
  registerCommand(name: string, definition: PiCommandDefinition): void;
  appendEntry(customType: string, data?: unknown): void;
  on(
    event: "session_start",
    handler: (
      event: unknown,
      context: PiExtensionCommandContext,
    ) => void | Promise<void>,
  ): void;
}
