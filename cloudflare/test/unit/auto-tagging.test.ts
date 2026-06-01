import { describe, it, expect } from 'vitest';
import {
  parseAutoTaggingRules,
  applyAutoTagging,
  applyAutoTaggingFromString
} from '../../src/domain/auto-tagging';

describe('parseAutoTaggingRules', () => {
  it('returns empty rules for empty input', () => {
    expect(parseAutoTaggingRules('')).toEqual({ rules: [] });
    expect(parseAutoTaggingRules(null)).toEqual({ rules: [] });
    expect(parseAutoTaggingRules(undefined)).toEqual({ rules: [] });
  });

  it('parses valid JSON', () => {
    const raw = JSON.stringify({
      rules: [{ match: { field: 'url', pattern: 'github.com' }, tags: ['code', 'open-source'] }]
    });
    const cfg = parseAutoTaggingRules(raw);
    expect(cfg.rules).toHaveLength(1);
    expect(cfg.rules[0]?.tags).toEqual(['code', 'open-source']);
  });

  it('returns empty rules for invalid JSON', () => {
    expect(parseAutoTaggingRules('not json').rules).toEqual([]);
  });

  it('returns empty rules for schema-invalid JSON', () => {
    expect(parseAutoTaggingRules(JSON.stringify({ rules: [{ bad: true }] })).rules).toEqual([]);
  });
});

describe('applyAutoTagging', () => {
  const cfg = parseAutoTaggingRules(
    JSON.stringify({
      rules: [
        { match: { field: 'url', pattern: 'github.com' }, tags: ['code', 'Open Source'] },
        { match: { field: 'domain', pattern: 'youtube.com' }, tags: ['video'] },
        { match: { field: 'title', pattern: 'tutorial' }, tags: ['learning'] },
        { match: { field: 'url', pattern: '/^https:\\/\\/news\\./i' }, tags: ['news'] }
      ]
    })
  );

  it('matches a substring on url', () => {
    const tags = applyAutoTagging(cfg, {
      url: 'https://github.com/foo/bar',
      title: 'Anything'
    });
    expect(tags).toContain('code');
    expect(tags).toContain('Open Source');
  });

  it('matches a substring on domain', () => {
    const tags = applyAutoTagging(cfg, {
      url: 'https://www.youtube.com/watch?v=1',
      title: 'A video'
    });
    expect(tags).toContain('video');
  });

  it('matches on title', () => {
    const tags = applyAutoTagging(cfg, {
      url: 'https://example.com/post',
      title: 'Rust tutorial for beginners'
    });
    expect(tags).toContain('learning');
  });

  it('matches a regex with slashes', () => {
    const tags = applyAutoTagging(cfg, {
      url: 'https://news.example.com/article',
      title: 'foo'
    });
    expect(tags).toContain('news');
  });

  it('returns empty array when no rule matches', () => {
    const tags = applyAutoTagging(cfg, {
      url: 'https://example.com',
      title: 'something'
    });
    expect(tags).toEqual([]);
  });

  it('deduplicates tags across rules', () => {
    const cfg2 = parseAutoTaggingRules(
      JSON.stringify({
        rules: [
          { match: { field: 'url', pattern: 'x' }, tags: ['foo'] },
          { match: { field: 'url', pattern: 'y' }, tags: ['foo', 'bar'] }
        ]
      })
    );
    const tags = applyAutoTagging(cfg2, { url: 'https://xy.com', title: '' });
    expect(tags.filter((t) => t === 'foo')).toHaveLength(1);
    expect(tags).toContain('bar');
  });

  it('skips invalid regex patterns', () => {
    const cfgBad = parseAutoTaggingRules(
      JSON.stringify({
        rules: [{ match: { field: 'url', pattern: '/[/' }, tags: ['x'] }]
      })
    );
    expect(applyAutoTagging(cfgBad, { url: 'https://x.com', title: '' })).toEqual([]);
  });
});

describe('applyAutoTaggingFromString', () => {
  it('parses and applies in one call', () => {
    const raw = JSON.stringify({
      rules: [{ match: { field: 'url', pattern: 'ycombinator' }, tags: ['news'] }]
    });
    expect(
      applyAutoTaggingFromString(raw, { url: 'https://news.ycombinator.com', title: '' })
    ).toEqual(['news']);
  });

  it('returns empty for invalid JSON', () => {
    expect(applyAutoTaggingFromString('garbage', { url: 'https://x', title: '' })).toEqual([]);
  });
});
