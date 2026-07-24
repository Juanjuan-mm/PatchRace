export function parseRetryAfter(
  value: string | null,
  nowMs: number,
): number | null {
  void nowMs;
  if (value === null || value.trim() === "") return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1_000);
}
