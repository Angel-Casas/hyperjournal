/**
 * Normalize a single tag string for storage: trim, lowercase, collapse
 * any run of whitespace (spaces, tabs, newlines) into a single space.
 * Returns empty string if the input is all whitespace — callers filter
 * empties.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Normalize, truncate, and deduplicate a list of tags. First-seen order
 * preserved (useful so the UI shows chips in the order the user added
 * them). Tags that normalize to empty are dropped.
 */
export function normalizeTagList(
  raws: ReadonlyArray<string>,
  maxLen = 40,
): ReadonlyArray<string> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of raws) {
    const t = normalizeTag(raw).slice(0, maxLen);
    if (t === '' || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
