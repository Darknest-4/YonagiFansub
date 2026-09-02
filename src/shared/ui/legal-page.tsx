import { renderMarkdown } from '@/shared/lib/markdown';
import { PageHeader } from '@/shared/ui/page-header';
import { formatDate } from '@/shared/lib/utils';

/**
 * Shared shell for the three legal documents.
 *
 * The bodies are markdown constants rather than database rows: they change once
 * a year, they must be reviewable in a pull request, and they should never be
 * editable from a compromised admin session.
 */
export function LegalPage({
  eyebrow,
  title,
  updatedAt,
  markdown,
}: {
  eyebrow: string;
  title: string;
  updatedAt: string;
  markdown: string;
}) {
  const { html, headings } = renderMarkdown(markdown);

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader eyebrow={eyebrow} title={title} />

      <p className="mt-4 text-2xs text-mist-600">
        Utoljára frissítve: <time dateTime={updatedAt}>{formatDate(updatedAt)}</time>
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_14rem]">
        <div className="prose-yonagi max-w-prose" dangerouslySetInnerHTML={{ __html: html }} />

        {headings.length >= 3 && (
          <aside className="hidden lg:block">
            <nav aria-label="Tartalomjegyzék" className="sticky top-24">
              <h2 className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
                Tartalom
              </h2>
              <ul className="space-y-2 border-l border-ink-800 pl-4">
                {headings
                  .filter((heading) => heading.level === 2)
                  .map((heading) => (
                    <li key={heading.id}>
                      <a
                        href={`#${heading.id}`}
                        className="text-xs leading-relaxed text-mist-400 transition-colors hover:text-bloom-300"
                      >
                        {heading.text}
                      </a>
                    </li>
                  ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </div>
  );
}
