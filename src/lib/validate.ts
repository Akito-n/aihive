// Helpers for normalizing data written by agents (LLM output, not trusted).

/** An id that is safe to use as a file name (no path separators or dot-files) */
export function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) &&
    value.length <= 128
  );
}

/** Return the value if it is a string, otherwise the fallback */
export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Coerce a string or array into a list of strings */
export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v));
  }
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}
