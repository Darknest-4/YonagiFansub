/**
 * Markdown renderer.
 *
 * Deliberately hand-written rather than `marked` + a sanitiser. News posts are
 * authored by staff, but "trusted author" is not a security model — a
 * compromised editor account must not be able to inject script into every
 * visitor's page.
 *
 * The renderer is safe *by construction*: the input is HTML-escaped first, and
 * only the tags this file emits can ever appear in the output. There is no code
 * path that passes author-supplied HTML through, so there is nothing to sanitise
 * and nothing to get wrong in a sanitiser configuration.
 *
 * Supported: headings, paragraphs, bold/italic/strikethrough, inline code, fenced
 * code, links, images, blockquotes, ordered/unordered lists, horizontal rules,
 * and simple tables.
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char);
}

/**
 * URL allow-list. Anything that is not http(s), mailto or a site-relative path
 * is dropped — this is what stops `javascript:` and `data:text/html` links.
 */
function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:[^\s<>]+@[^\s<>]+$/i.test(url)) return url;
  if (url.startsWith('#')) return url;
  return null;
}

/** Inline formatting. Operates on already-escaped text. */
function renderInline(escaped: string): string {
  let out = escaped;

  // Inline code first: its contents must not be re-processed.
  const codeSpans: string[] = [];
  out = out.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    codeSpans.push(code);
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });

  // Images: ![alt](src)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (match, alt, src, title) => {
    const href = safeUrl(String(src).replace(/&amp;/g, '&'));
    if (!href) return match;
    const titleAttr = title ? ` title="${title}"` : '';
    return `<img src="${escapeHtml(href)}" alt="${alt}"${titleAttr} loading="lazy" decoding="async" />`;
  });

  // Links: [label](href)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, target: string) => {
    const href = safeUrl(target.replace(/&amp;/g, '&'));
    if (!href) return label;
    const external = /^https?:\/\//i.test(href);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer nofollow"' : '';
    return `<a href="${escapeHtml(href)}"${attrs}>${label}</a>`;
  });

  out = out
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_match, index: string) => {
    const code = codeSpans[Number(index)] ?? '';
    return `<code>${code}</code>`;
  });

  return out;
}

function slugifyHeading(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export interface RenderedMarkdown {
  html: string;
  /** Extracted headings, used to build the table of contents on long posts. */
  headings: Array<{ id: string; text: string; level: number }>;
}

export function renderMarkdown(source: string): RenderedMarkdown {
  const headings: RenderedMarkdown['headings'] = [];
  const lines = escapeHtml(source.replace(/\r\n/g, '\n')).split('\n');
  const out: string[] = [];

  let index = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(`<p>${renderInline(paragraph.join(' ').trim())}</p>`);
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index] ?? '';

    // Fenced code block
    const fence = line.match(/^```([a-zA-Z0-9+#-]*)\s*$/);
    if (fence) {
      flushParagraph();
      const language = fence[1] ?? '';
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) {
        buffer.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;
      const languageAttr = language ? ` class="language-${escapeHtml(language)}"` : '';
      out.push(`<pre><code${languageAttr}>${buffer.join('\n')}</code></pre>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      out.push('<hr />');
      index += 1;
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1]!.length;
      const text = renderInline(heading[2]!.trim());
      const id = slugifyHeading(text);
      headings.push({ id, text: text.replace(/<[^>]+>/g, ''), level });
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      index += 1;
      continue;
    }

    // Blockquote
    if (/^&gt;\s?/.test(line)) {
      flushParagraph();
      const buffer: string[] = [];
      while (index < lines.length && /^&gt;\s?/.test(lines[index] ?? '')) {
        buffer.push((lines[index] ?? '').replace(/^&gt;\s?/, ''));
        index += 1;
      }
      out.push(`<blockquote><p>${renderInline(buffer.join(' ').trim())}</p></blockquote>`);
      continue;
    }

    // Table (| a | b | / |---|---| / rows)
    if (/^\|.*\|\s*$/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[index + 1] ?? '')) {
      flushParagraph();
      const splitRow = (row: string) =>
        row
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => renderInline(cell.trim()));

      const header = splitRow(line);
      index += 2;
      const bodyRows: string[][] = [];
      while (index < lines.length && /^\|.*\|\s*$/.test(lines[index] ?? '')) {
        bodyRows.push(splitRow(lines[index] ?? ''));
        index += 1;
      }

      const head = header.map((cell) => `<th>${cell}</th>`).join('');
      const body = bodyRows
        .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }

    // Lists
    const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (unordered || ordered) {
      flushParagraph();
      const tag = unordered ? 'ul' : 'ol';
      const pattern = unordered ? /^\s*[-*+]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/;
      const items: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? '').match(pattern);
        if (!match) break;
        items.push(`<li>${renderInline(match[1]!.trim())}</li>`);
        index += 1;
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    // Blank line ends a paragraph
    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }

  flushParagraph();

  return { html: out.join('\n'), headings };
}
