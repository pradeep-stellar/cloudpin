export function normalizeTagName(input: string): string {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (trimmed === '') return '';
  return trimmed
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-#]+|[-]+$/g, '');
}

export function splitTags(input: string): string[] {
  if (typeof input !== 'string' || input.trim() === '') return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,\s]+/)) {
    const cleaned = raw.replace(/^#+/, '').trim();
    if (cleaned === '') continue;
    const norm = normalizeTagName(cleaned);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(cleaned);
  }
  return out;
}

export function parseTagString(value: string): string[] {
  return splitTags(value);
}

export function buildTagSearchFragment(tags: readonly string[]): string {
  if (tags.length === 0) return '';
  return tags.map((t) => '#' + normalizeTagName(t).replace(/-/g, '')).join(' ');
}

export function compareTagNames(a: string, b: string): boolean {
  return normalizeTagName(a) === normalizeTagName(b) && normalizeTagName(a) !== '';
}

export function tagSearchTokens(input: string): string[] {
  return splitTags(input).map((t) => normalizeTagName(t));
}

export function tagIsHashPrefixed(token: string): boolean {
  return token.startsWith('#');
}
