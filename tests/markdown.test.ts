import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMarkdown } from '@/shared/lib/markdown';

/**
 * Markdown renderer.
 *
 * The security half of this file is the point. The renderer is the only thing
 * standing between an author's text and every visitor's browser, and it is safe
 * by construction — these tests exist to keep it that way under future edits.
 */

describe('escapeHtml', () => {
  it('escapes every character that can break out of a text context', () => {
    expect(escapeHtml(`<script>alert("x")&'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;',
    );
  });
});

describe('renderMarkdown – XSS resistance', () => {
  it('escapes raw HTML instead of rendering it', () => {
    const { html } = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('neutralises an inline event handler by escaping the whole tag', () => {
    const { html } = renderMarkdown('<img src=x onerror="alert(1)">');

    // The literal string `onerror=` survives — as *text*, inside an escaped tag.
    // What must not survive is a real element for the browser to attach it to.
    expect(html).not.toMatch(/<img[\s>]/i);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&quot;alert(1)&quot;');
  });

  it('escapes an attribute-injection attempt inside a link label', () => {
    const { html } = renderMarkdown('[x" onmouseover="alert(1)](https://example.com)');

    // The quote is escaped, so it cannot terminate the href attribute.
    expect(html).not.toMatch(/<a[^>]*onmouseover/i);
    expect(html).toContain('&quot;');
  });

  it('drops javascript: links, keeping the label as plain text', () => {
    const { html } = renderMarkdown('[kattints](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('kattints');
    expect(html).not.toContain('<a ');
  });

  it('drops data: URLs', () => {
    const { html } = renderMarkdown('[x](data:text/html;base64,PHNjcmlwdD4=)');
    expect(html).not.toContain('data:text/html');
  });

  it('allows http(s), mailto, anchors and site-relative paths', () => {
    const { html } = renderMarkdown(
      '[a](https://example.com) [b](/projektek) [c](mailto:hi@example.com) [d](#szakasz)',
    );

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="/projektek"');
    expect(html).toContain('href="mailto:hi@example.com"');
    expect(html).toContain('href="#szakasz"');
  });

  it('marks external links noopener, keeping internal ones clean', () => {
    const external = renderMarkdown('[x](https://example.com)').html;
    expect(external).toContain('rel="noopener noreferrer nofollow"');
    expect(external).toContain('target="_blank"');

    const internal = renderMarkdown('[x](/hirek)').html;
    expect(internal).not.toContain('target="_blank"');
  });

  it('does not re-process markdown inside inline code', () => {
    const { html } = renderMarkdown('Ez `**nem** félkövér` marad.');
    expect(html).toContain('<code>**nem** félkövér</code>');
    expect(html).not.toContain('<code><strong>');
  });
});

describe('renderMarkdown – formatting', () => {
  it('renders headings and collects them for the table of contents', () => {
    const { html, headings } = renderMarkdown('## Első rész\n\nszöveg\n\n### Alszakasz');

    expect(html).toContain('<h2 id="elso-resz">Első rész</h2>');
    expect(headings).toEqual([
      { id: 'elso-resz', text: 'Első rész', level: 2 },
      { id: 'alszakasz', text: 'Alszakasz', level: 3 },
    ]);
  });

  it('renders emphasis, lists, quotes and rules', () => {
    const { html } = renderMarkdown(
      '**erős** és *dőlt* és ~~áthúzott~~\n\n- egy\n- kettő\n\n> idézet\n\n---',
    );

    expect(html).toContain('<strong>erős</strong>');
    expect(html).toContain('<em>dőlt</em>');
    expect(html).toContain('<del>áthúzott</del>');
    expect(html).toContain('<ul><li>egy</li><li>kettő</li></ul>');
    expect(html).toContain('<blockquote><p>idézet</p></blockquote>');
    expect(html).toContain('<hr />');
  });

  it('renders fenced code with its language, unprocessed', () => {
    const { html } = renderMarkdown('```ts\nconst a = 1 < 2;\n```');
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain('const a = 1 &lt; 2;');
  });

  it('wraps tables in a horizontally scrollable container', () => {
    const { html } = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('class="table-scroll"');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('handles empty input without throwing', () => {
    expect(renderMarkdown('').html).toBe('');
    expect(renderMarkdown('\n\n\n').html).toBe('');
  });
});
