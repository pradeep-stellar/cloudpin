import { marked } from 'marked';
import { FilterXSS, whiteList } from 'xss';

marked.setOptions({ gfm: true, breaks: true });

const xssFilter = new FilterXSS({
  whiteList: {
    ...whiteList,
    h1: [],
    h2: [],
    h3: [],
    h4: [],
    h5: [],
    h6: [],
    hr: [],
    pre: ['class'],
    code: ['class']
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style']
});

export function renderMarkdown(input: string): string {
  if (!input.trim()) return '';
  const raw = marked.parse(input, { async: false }) as string;
  return xssFilter.process(raw);
}