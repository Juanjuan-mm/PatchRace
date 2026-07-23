export function parseRetryAfter(
  value: string | null,
  nowMs: number,
): number | null {
  if (value === null || value.trim() === "") return null;
  const trimmed = value.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    if (seconds < 0) return null;
    return Math.ceil(seconds * 1_000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, dateMs - nowMs);
}
