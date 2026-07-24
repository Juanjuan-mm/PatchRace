# Task

Fix `src/retry-after.ts`.

`parseRetryAfter(value, nowMs)` must return a non-negative delay in
milliseconds. Accept non-negative numeric seconds (round fractional
milliseconds up) and valid HTTP-date values. Clamp a date in the past to zero.
Return `null` for absent, blank, negative, or invalid input.
