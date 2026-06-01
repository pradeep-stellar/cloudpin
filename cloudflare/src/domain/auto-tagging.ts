import { z } from 'zod';
import { normalizeTagName } from './tags';

const RuleMatch = z.object({
  field: z.enum(['url', 'title', 'domain']),
  pattern: z.string().min(1)
});

const Rule = z.object({
  match: RuleMatch,
  tags: z.array(z.string().min(1)).min(1)
});

export const AutoTaggingRules = z.object({
  rules: z.array(Rule)
});

export type AutoTaggingRule = z.infer<typeof Rule>;
export type AutoTaggingConfig = z.infer<typeof AutoTaggingRules>;

export function parseAutoTaggingRules(raw: string | null | undefined): AutoTaggingConfig {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { rules: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { rules: [] };
  }
  const result = AutoTaggingRules.safeParse(parsed);
  if (!result.success) {
    return { rules: [] };
  }
  return result.data;
}

export type AutoTagInput = {
  url: string;
  title: string;
};

function getDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return '';
  }
}

function fieldValue(input: AutoTagInput, field: 'url' | 'title' | 'domain'): string {
  if (field === 'url') return input.url;
  if (field === 'title') return input.title;
  return getDomain(input.url);
}

function matchRule(rule: AutoTaggingRule, input: AutoTagInput): boolean {
  const value = fieldValue(input, rule.match.field);
  if (value === '') return false;
  const pattern = rule.match.pattern;
  if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
    const last = pattern.lastIndexOf('/');
    const body = pattern.slice(1, last);
    const flags = pattern.slice(last + 1);
    try {
      const re = new RegExp(body, flags.includes('i') ? flags : flags + 'i');
      return re.test(value);
    } catch {
      return false;
    }
  }
  return value.toLowerCase().includes(pattern.toLowerCase());
}

export function applyAutoTagging(config: AutoTaggingConfig, input: AutoTagInput): string[] {
  const out = new Set<string>();
  for (const rule of config.rules) {
    if (matchRule(rule, input)) {
      for (const t of rule.tags) {
        const norm = normalizeTagName(t);
        if (norm) out.add(t);
      }
    }
  }
  return [...out];
}

export function applyAutoTaggingFromString(
  raw: string | null | undefined,
  input: AutoTagInput
): string[] {
  return applyAutoTagging(parseAutoTaggingRules(raw), input);
}
