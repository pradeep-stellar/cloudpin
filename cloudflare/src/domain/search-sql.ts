import type { SearchNode } from './search-parser';

export type CompileOptions = {
  tableAlias?: string;
  termColumns?: readonly string[];
  tagColumn?: string;
  tagsTableAlias?: string;
  bookmarkTagsTableAlias?: string;
};

const DEFAULT_TERM_COLUMNS = ['title', 'description', 'notes', 'url'] as const;
// Drizzle renders table references as `"bookmarks"` when no alias is
// applied, so the compiled search SQL has to reference the same
// unaliased table name. Callers that alias the table (e.g. joins) must
// pass `tableAlias` explicitly.
const DEFAULT_TABLE_ALIAS = 'bookmarks';

export type CompiledSearch = {
  sql: string;
  params: unknown[];
};

function escapeIdent(s: string): string {
  return s.replace(/"/g, '""');
}

function col(tableAlias: string, name: string): string {
  return `"${escapeIdent(tableAlias)}"."${escapeIdent(name)}"`;
}

export function compileSearch(
  node: SearchNode | undefined,
  options: CompileOptions = {}
): CompiledSearch {
  if (!node) return { sql: '', params: [] };
  const tableAlias = options.tableAlias ?? DEFAULT_TABLE_ALIAS;
  const termColumns = options.termColumns ?? DEFAULT_TERM_COLUMNS;
  const tagColumn = options.tagColumn ?? 'name_normalized';
  const tagsAlias = options.tagsTableAlias ?? 't';
  const btAlias = options.bookmarkTagsTableAlias ?? 'bt';
  return compile(node, { tableAlias, termColumns, tagColumn, tagsAlias, btAlias });
}

type CompileCtx = {
  tableAlias: string;
  termColumns: readonly string[];
  tagColumn: string;
  tagsAlias: string;
  btAlias: string;
};

function compile(node: SearchNode, ctx: CompileCtx): CompiledSearch {
  switch (node.type) {
    case 'term':
      return compileTerm(node.value, ctx);
    case 'tag':
      return compileTag(node.value, ctx);
    case 'keyword':
      return compileKeyword(node.value, ctx);
    case 'unary':
      return compileUnary(node.child, ctx);
    case 'binary':
      return compileBinary(node.op, node.left, node.right, ctx);
    case 'group':
      return compileGroup(node.child, ctx);
  }
}

function compileTerm(value: string, ctx: CompileCtx): CompiledSearch {
  if (value === '') {
    return { sql: '1=1', params: [] };
  }
  const ftsQuery = buildFtsTermQuery(value, ctx.termColumns);
  const sql = `${col(ctx.tableAlias, 'id')} IN (SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?)`;
  return { sql: `(${sql})`, params: [ftsQuery] };
}

function compileTag(tagName: string, ctx: CompileCtx): CompiledSearch {
  if (tagName === '') {
    return { sql: '1=0', params: [] };
  }
  const tagCol = col(ctx.tagsAlias, ctx.tagColumn);
  const bookmarkIdCol = col(ctx.btAlias, 'bookmark_id');
  const tagIdCol = col(ctx.btAlias, 'tag_id');
  const sql = `EXISTS (
    SELECT 1 FROM "bookmark_tags" "${ctx.btAlias}"
    JOIN "tags" "${ctx.tagsAlias}" ON "${ctx.tagsAlias}"."id" = ${tagIdCol}
    WHERE ${bookmarkIdCol} = ${col(ctx.tableAlias, 'id')}
      AND ${tagCol} = ?
  )`;
  return { sql, params: [tagName.toLowerCase()] };
}

function compileKeyword(value: 'unread' | 'untagged', ctx: CompileCtx): CompiledSearch {
  if (value === 'unread') {
    return { sql: `${col(ctx.tableAlias, 'unread')} = 1`, params: [] };
  }
  const bookmarkIdCol = col(ctx.btAlias, 'bookmark_id');
  const sql = `NOT EXISTS (
    SELECT 1 FROM "bookmark_tags" "${ctx.btAlias}"
    WHERE ${bookmarkIdCol} = ${col(ctx.tableAlias, 'id')}
  )`;
  return { sql, params: [] };
}

function compileUnary(child: SearchNode, ctx: CompileCtx): CompiledSearch {
  const inner = compile(child, ctx);
  if (inner.sql === '') {
    return { sql: '1=1', params: [] };
  }
  return { sql: `NOT (${inner.sql})`, params: inner.params };
}

function compileBinary(
  op: 'AND' | 'OR',
  left: SearchNode,
  right: SearchNode,
  ctx: CompileCtx
): CompiledSearch {
  const l = compile(left, ctx);
  const r = compile(right, ctx);
  const leftSql = l.sql === '' ? '1=1' : `(${l.sql})`;
  const rightSql = r.sql === '' ? '1=1' : `(${r.sql})`;
  return { sql: `${leftSql} ${op} ${rightSql}`, params: [...l.params, ...r.params] };
}

function compileGroup(child: SearchNode, ctx: CompileCtx): CompiledSearch {
  const inner = compile(child, ctx);
  if (inner.sql === '') {
    return { sql: '1=1', params: [] };
  }
  return { sql: `(${inner.sql})`, params: inner.params };
}

function buildFtsTermQuery(value: string, columns: readonly string[]): string {
  const token = escapeFtsToken(value);
  const usesAllDefaultColumns =
    columns.length === DEFAULT_TERM_COLUMNS.length &&
    columns.every((c, i) => c === DEFAULT_TERM_COLUMNS[i]);
  if (usesAllDefaultColumns) return token;
  return columns.map((name) => `${name}:${token}`).join(' OR ');
}

function escapeFtsToken(input: string): string {
  return `"${input.replace(/"/g, '""')}"`;
}
