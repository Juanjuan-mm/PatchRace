/**
 * Resolve package-manager shims without asking Node to exec a Windows .cmd
 * file directly. This helper is only for fixed maintainer/release scripts;
 * product and repository commands continue to use explicit executable arrays
 * with shell execution disabled.
 */
export function packageManagerCommand(name, args) {
  if (name === "pnpm" && process.env.npm_execpath) {
    return {
      executable: process.execPath,
      args: [process.env.npm_execpath, ...args],
    };
  }
  if (process.platform === "win32" && (name === "npm" || name === "pnpm")) {
    return {
      executable: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", name, ...args],
    };
  }
  return { executable: name, args };
}
