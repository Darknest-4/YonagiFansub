import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchX } from 'lucide-react';
import { PageHeader } from '@/components/site/page-header';
import { EmptyState, TextSkeleton } from '@/components/ui/feedback';
import { SearchInput } from '@/components/site/search-input';
import { search, type SearchResult } from '@/server/search';
import { getSearchSuggestions } from '@/server/search';

export const metadata: Metadata = {
  title: 'Keresés',
  description: 'Keress a Yonagi Fansub projektjei, epizódjai, kiadásai és hírei között.',
  // A search results page has no business in an index.
  robots: { index: false, follow: true },
};

type SearchParams = Promise<{ q?: string }>;

/**
 * Full search page.
 *
 * The command palette (⌘K) covers the fast path; this page is the shareable,
 * bookmarkable, no-JavaScript-required version of the same query, and it shows
 * more results per group.
 */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? '';

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Keresés"
        title={query ? `Találatok: „${query}”` : 'Keresés'}
        description="Projektek, epizódok, hírek és csapattagok között keresünk egyszerre."
      />

      <div className="mt-8 max-w-xl">
        <Suspense fallback={<div className="h-11" />}>
          <SearchInput initialQuery={query} />
        </Suspense>
      </div>

      <div className="mt-10">
        {query.length < 2 ? (
          <Suspense fallback={<TextSkeleton lines={4} />}>
            <Suggestions />
          </Suspense>
        ) : (
          <Suspense key={query} fallback={<TextSkeleton lines={6} />}>
            <Results query={query} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

async function Results({ query }: { query: string }) {
  const response = await search(query, { limit: 12 });

  if (response.total === 0) {
    return (
      <EmptyState
        icon={<SearchX className="size-6" aria-hidden />}
        title={`Nincs találat erre: „${query}”`}
        description="Próbálj rövidebb vagy általánosabb kifejezést. A japán és angol címekre is keresünk."
        action={{ label: 'Teljes katalógus', href: '/projektek' }}
        secondaryAction={{ label: 'Legújabb kiadások', href: '/kiadasok' }}
      />
    );
  }

  return (
    <div className="space-y-10">
      <p className="nums text-sm text-content-muted" role="status">
        {response.total} találat
      </p>

      {response.groups.map((group) => (
        <section key={group.type} aria-labelledby={`group-${group.type}`}>
          <div className="mb-4 flex items-center gap-3">
            <h2 id={`group-${group.type}`} className="text-lg font-semibold text-mist-100">
              {group.label}
            </h2>
            <span aria-hidden className="h-px flex-1 bg-linear-to-r from-ink-700 to-transparent" />
            <span className="nums text-2xs text-mist-600">{group.results.length}</span>
          </div>

          <ul className="grid gap-2.5 sm:grid-cols-2">
            {group.results.map((result) => (
              <li key={`${result.type}-${result.id}`} className="min-w-0">
                <ResultRow result={result} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ResultRow({ result }: { result: SearchResult }) {
  return (
    <Link
      href={result.href}
      className="group flex items-center gap-3.5 rounded-xl border border-ink-800 bg-ink-900/50 p-3 transition-colors duration-fast hover:border-bloom-400/30 hover:bg-ink-850"
    >
      <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-ink-800">
        {result.imageUrl && (
          <Image src={result.imageUrl} alt="" fill sizes="48px" className="object-cover" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-mist-100 group-hover:text-bloom-200">
          {result.title}
        </span>
        {result.subtitle && (
          <span className="mt-0.5 block truncate text-2xs text-mist-500">{result.subtitle}</span>
        )}
      </span>
    </Link>
  );
}

async function Suggestions() {
  const { ongoing, latest } = await getSearchSuggestions();

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      {ongoing.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
            Éppen fut
          </h2>
          <ul className="space-y-2">
            {ongoing.map((project) => (
              <li key={project.slug}>
                <Link
                  href={`/projektek/${project.slug}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-mist-300 transition-colors hover:bg-ink-850 hover:text-bloom-200"
                >
                  <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-ink-800">
                    {project.coverImageUrl && (
                      <Image
                        src={project.coverImageUrl}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    )}
                  </span>
                  {project.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
            Friss hírek
          </h2>
          <ul className="space-y-2">
            {latest.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/hirek/${post.slug}`}
                  className="block rounded-lg px-2 py-2 text-sm text-mist-300 transition-colors hover:bg-ink-850 hover:text-bloom-200"
                >
                  {post.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
