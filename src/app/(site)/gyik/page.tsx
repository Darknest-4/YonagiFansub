import type { Metadata } from 'next';
import { HelpCircle } from 'lucide-react';
import { renderMarkdown } from '@/lib/markdown';
import { FAQ_CATEGORY_LABELS, listFaq } from '@/server/team';
import { PageHeader } from '@/components/site/page-header';
import { EmptyState } from '@/components/ui/feedback';
import { ButtonLink } from '@/components/ui/button';
import { siteUrl } from '@/lib/site-url';

export const metadata: Metadata = {
  title: 'Gyakori kérdések',
  description:
    'Válaszok a leggyakoribb kérdésekre a Yonagi Fansub részeiről, projektjeiről és a csatlakozásról.',
  alternates: { canonical: '/gyik' },
};

export const revalidate = 3600;

/**
 * FAQ.
 *
 * Native `<details>` elements rather than a JavaScript accordion: they are
 * keyboard-accessible and screen-reader-correct for free, they work before
 * hydration, and browser find-in-page can open a collapsed answer — which a
 * div-based accordion cannot do.
 */
export default async function FaqPage() {
  const base = await siteUrl();
  const entries = await listFaq();

  const grouped = entries.reduce<Map<string, typeof entries>>((map, entry) => {
    const bucket = map.get(entry.category);
    if (bucket) bucket.push(entry);
    else map.set(entry.category, [entry]);
    return map;
  }, new Map());

  return (
    <div className="container-content py-10 lg:py-14">
      {entries.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              url: `${base}/gyik`,
              mainEntity: entries.map((entry) => ({
                '@type': 'Question',
                name: entry.question,
                acceptedAnswer: { '@type': 'Answer', text: entry.answer },
              })),
            }),
          }}
        />
      )}

      <PageHeader
        eyebrow="Segítség"
        title="Gyakori kérdések"
        description="Ha nem találod itt a választ, írj nekünk — igyekszünk gyorsan reagálni."
        action={
          <ButtonLink href="/kapcsolat" variant="secondary" size="md">
            Kérdésem van
          </ButtonLink>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={<HelpCircle className="size-6" aria-hidden />}
          title="Még nincs feltöltve kérdés"
          description="Dolgozunk rajta. Addig is bátran írj nekünk közvetlenül."
          action={{ label: 'Kapcsolat', href: '/kapcsolat' }}
          className="mt-10"
        />
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[13rem_1fr] lg:gap-12">
          <nav aria-label="GYIK kategóriák" className="hidden lg:block">
            <ul className="sticky top-24 space-y-1">
              {[...grouped.keys()].map((category) => (
                <li key={category}>
                  <a
                    href={`#faq-${category}`}
                    className="block rounded-lg px-3 py-2 text-sm text-mist-400 transition-colors hover:bg-ink-850 hover:text-mist-100"
                  >
                    {FAQ_CATEGORY_LABELS[category] ?? category}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="max-w-3xl space-y-12">
            {[...grouped.entries()].map(([category, items]) => (
              <section key={category} id={`faq-${category}`} aria-labelledby={`faq-h-${category}`}>
                <h2
                  id={`faq-h-${category}`}
                  className="mb-4 text-xl"
                >
                  {FAQ_CATEGORY_LABELS[category] ?? category}
                </h2>

                <div className="divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40">
                  {items.map((entry) => (
                    <details key={entry.id} className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-mist-100 transition-colors hover:bg-ink-850 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bloom-400">
                        {entry.question}
                        <span
                          aria-hidden
                          className="grid size-6 shrink-0 place-items-center rounded-md border border-ink-700 text-mist-400 transition-transform duration-base group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>

                      <div
                        className="prose-yonagi px-5 pb-5 text-sm"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.answer).html }}
                      />
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
