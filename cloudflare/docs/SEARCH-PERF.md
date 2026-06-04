# Bookmark search performance

Benchmarks compare the legacy four-column `LIKE` scan against the FTS5
`bookmarks_fts MATCH` path for the query term `guide` (owner filter +
`LIMIT 30`). Numbers are from `npm run bench:search` on Node 22 using
in-memory SQLite with migrations applied (2026-06-04, Apple Silicon).

| Rows    | LIKE p50 (ms) | LIKE p95 (ms) | FTS p50 (ms) | FTS p95 (ms) |
| ------- | ------------- | ------------- | ------------ | ------------ |
| 5,000   | 0.04          | 0.07          | 0.03         | 0.04         |
| 20,000  | 0.04          | 0.08          | 0.11         | 0.12         |
| 100,000 | 0.04          | 0.05          | 0.57         | 0.62         |

At small library sizes both paths are sub-millisecond in this harness.
FTS pays off when combined with richer boolean/tag structure at scale;
re-run `npm run bench:search` after schema changes.
