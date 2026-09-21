import { Parser, marked, type Tokens } from 'marked';

export function headingId(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function headingIdAllocator() {
  const allocated = new Set<string>();
  const nextSuffix = new Map<string, number>();
  return (renderedInline: string) => {
    const base = headingId(renderedInline.replace(/<[^>]+>/g, '')) || 'section';
    if (!allocated.has(base)) {
      allocated.add(base);
      return base;
    }
    let suffix = nextSuffix.get(base) ?? 2;
    while (allocated.has(`${base}-${suffix}`)) suffix += 1;
    const candidate = `${base}-${suffix}`;
    allocated.add(candidate);
    nextSuffix.set(base, suffix + 1);
    return candidate;
  };
}

export function markdownHeadingIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  const allocate = headingIdAllocator();
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      ids.add(allocate(Parser.parseInline(heading.tokens)));
    }
  });
  return ids;
}
