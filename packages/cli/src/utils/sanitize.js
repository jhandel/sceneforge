const DEFAULT_MAX_LENGTH = 80;

export function sanitizeFileSegment(value, fallback = "segment", maxLength = DEFAULT_MAX_LENGTH) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }

  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const collapsed = cleaned.replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  const safe = collapsed || fallback;
  const trimmed = safe.length > maxLength ? safe.slice(0, maxLength) : safe;

  if (trimmed === "." || trimmed === "..") {
    return fallback;
  }

  return trimmed;
}
