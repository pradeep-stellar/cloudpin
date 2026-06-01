export type SearchMode = 'strict' | 'lax' | 'legacy';

export type SearchNode =
  | { type: 'term'; value: string; field?: 'title' | 'description' | 'notes' | 'url' }
  | { type: 'tag'; value: string }
  | { type: 'keyword'; value: 'unread' | 'untagged' }
  | { type: 'unary'; op: 'NOT'; child: SearchNode }
  | { type: 'binary'; op: 'AND' | 'OR'; left: SearchNode; right: SearchNode }
  | { type: 'group'; child: SearchNode };

export type SearchOptions = {
  mode?: SearchMode;
  defaultField?: 'title' | 'description' | 'notes' | 'url';
};

type Token =
  | { type: 'word'; value: string }
  | { type: 'tag'; value: string }
  | { type: 'kw'; value: 'unread' | 'untagged' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'op'; value: 'AND' | 'OR' | 'NOT' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input;
  while (i < s.length) {
    const c = s[i];
    if (c === undefined) break;
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let buf = '';
      while (j < s.length && s[j] !== '"') {
        buf += s[j];
        j++;
      }
      if (j < s.length) j++;
      tokens.push({ type: 'word', value: buf });
      i = j;
      continue;
    }
    if (c === '#') {
      let j = i + 1;
      let buf = '';
      while (j < s.length && /[A-Za-z0-9_-]/i.test(s[j] ?? '')) {
        buf += s[j];
        j++;
      }
      tokens.push({ type: 'tag', value: buf });
      i = j;
      continue;
    }
    if (c === '!') {
      const rest = s.slice(i + 1);
      if (rest.startsWith('unread')) {
        tokens.push({ type: 'kw', value: 'unread' });
        i += 1 + 'unread'.length;
        continue;
      }
      if (rest.startsWith('untagged')) {
        tokens.push({ type: 'kw', value: 'untagged' });
        i += 1 + 'untagged'.length;
        continue;
      }
      tokens.push({ type: 'op', value: 'NOT' });
      i++;
      continue;
    }
    if (c === '&' && s[i + 1] === '&') {
      tokens.push({ type: 'op', value: 'AND' });
      i += 2;
      continue;
    }
    if (c === '|' && s[i + 1] === '|') {
      tokens.push({ type: 'op', value: 'OR' });
      i += 2;
      continue;
    }
    let j = i;
    let buf = '';
    while (j < s.length) {
      const cc = s[j];
      if (cc === undefined) break;
      if (/[\s()#&|!"]/.test(cc)) break;
      buf += cc;
      j++;
    }
    const upper = buf.toUpperCase();
    if (upper === 'AND') {
      tokens.push({ type: 'op', value: 'AND' });
    } else if (upper === 'OR') {
      tokens.push({ type: 'op', value: 'OR' });
    } else if (upper === 'NOT') {
      tokens.push({ type: 'op', value: 'NOT' });
    } else {
      tokens.push({ type: 'word', value: buf });
    }
    i = j;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private mode: SearchMode
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private consume(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parse(): SearchNode | undefined {
    if (this.tokens.length === 0) return undefined;
    const node = this.parseOr();
    return node;
  }

  hasMore(): boolean {
    return this.pos < this.tokens.length;
  }

  private parseOr(): SearchNode {
    let left = this.parseAnd();
    while (true) {
      const t = this.peek();
      if (t && t.type === 'op' && t.value === 'OR') {
        this.consume();
        const right = this.parseAnd();
        left = { type: 'binary', op: 'OR', left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseAnd(): SearchNode {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (!t) break;
      if (t.type === 'op' && t.value === 'AND') {
        this.consume();
        const right = this.parseUnary();
        left = { type: 'binary', op: 'AND', left, right };
        continue;
      }
      if (t.type === 'lparen' || t.type === 'word' || t.type === 'tag' || t.type === 'kw') {
        const right = this.parseUnary();
        left = { type: 'binary', op: 'AND', left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private parseUnary(): SearchNode {
    const t = this.peek();
    if (t && t.type === 'op' && t.value === 'NOT') {
      this.consume();
      const child = this.parseUnary();
      return { type: 'unary', op: 'NOT', child };
    }
    if (t && t.type === 'lparen') {
      this.consume();
      const inner = this.parseOr();
      const close = this.consume();
      if (!close || close.type !== 'rparen') {
        throw new SearchParseError('Expected )');
      }
      return { type: 'group', child: inner ?? { type: 'term', value: '' } };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): SearchNode {
    const t = this.consume();
    if (!t) throw new SearchParseError('Unexpected end of input');
    if (t.type === 'word') return { type: 'term', value: t.value };
    if (t.type === 'tag') return { type: 'tag', value: t.value };
    if (t.type === 'kw') return { type: 'keyword', value: t.value };
    throw new SearchParseError('Unexpected token');
  }
}

export class SearchParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchParseError';
  }
}

export function parseSearch(input: string, options: SearchOptions = {}): SearchNode | undefined {
  const mode = options.mode ?? 'strict';
  const tokens = tokenize(input);
  const parser = new Parser(tokens, mode);
  const node = parser.parse();
  if (parser.hasMore()) {
    throw new SearchParseError('Unexpected trailing tokens');
  }
  if (!node) return undefined;
  if (mode === 'legacy') return node;
  return node;
}

export function termsOf(node: SearchNode | undefined): string[] {
  if (!node) return [];
  switch (node.type) {
    case 'term':
      return [node.value];
    case 'tag':
      return [];
    case 'keyword':
      return [];
    case 'unary':
      return termsOf(node.child);
    case 'binary':
      return [...termsOf(node.left), ...termsOf(node.right)];
    case 'group':
      return termsOf(node.child);
  }
}

export function tagsOf(node: SearchNode | undefined): string[] {
  if (!node) return [];
  switch (node.type) {
    case 'tag':
      return [node.value];
    case 'term':
    case 'keyword':
      return [];
    case 'unary':
      return tagsOf(node.child);
    case 'binary':
      return [...tagsOf(node.left), ...tagsOf(node.right)];
    case 'group':
      return tagsOf(node.child);
  }
}

export function hasKeyword(node: SearchNode | undefined, kw: 'unread' | 'untagged'): boolean {
  if (!node) return false;
  switch (node.type) {
    case 'keyword':
      return node.value === kw;
    case 'unary':
      return false;
    case 'binary':
      return hasKeyword(node.left, kw) || hasKeyword(node.right, kw);
    case 'group':
      return hasKeyword(node.child, kw);
    default:
      return false;
  }
}
