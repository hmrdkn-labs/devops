import { Marked, Renderer } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { headingIdAllocator } from './headings';

export function renderMarkdown(markdown: string, options: { scrollContainers?: boolean } = {}): string {
  const allocateHeadingId = headingIdAllocator();
  let tableNumber = 0;
  const parser = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        return `<h${depth} id="${allocateHeadingId(text)}">${text}</h${depth}>\n`;
      },
      table(token) {
        const html = Renderer.prototype.table.call(this, token);
        if (!options.scrollContainers) return html;
        return `<p class="reference-table-hint">More columns → Swipe sideways, or focus the table and use arrow keys.</p><div class="reference-table-scroll" tabindex="0" role="region" aria-label="Reference table ${++tableNumber}. Scroll horizontally to see all columns.">${html}</div>`;
      },
      code(token) {
        const html = Renderer.prototype.code.call(this, token);
        return options.scrollContainers
          ? html.replace('<pre>', '<pre tabindex="0" role="region" aria-label="Reference code example. Scroll horizontally with arrow keys when needed.">')
          : html;
      },
    },
  });
  const rendered = parser.parse(markdown, { async: false }) as string;
  return sanitizeHtml(rendered, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'details', 'summary']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'title', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      code: ['class'],
      ...(options.scrollContainers ? {
        div: ['class', 'role', 'tabindex', 'aria-label'],
        p: ['class'],
        pre: ['role', 'tabindex', 'aria-label'],
      } : {}),
      h1: ['id'],
      h2: ['id'],
      h3: ['id'],
      h4: ['id'],
      h5: ['id'],
      h6: ['id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
    },
  });
}
