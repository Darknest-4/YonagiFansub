import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LibraryBig } from 'lucide-react';
import { EmptyState, ProjectGridSkeleton } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { ProjectCard } from '@/components/site/project-card';
import { ProjectFilters } from '@/components/site/project-filters';
import { listGenres, listPublicProjects, listSeasons } from '@/server/projects';
import { paginationSchema, parseList } from '@/lib/api/pagination';
import { projectQuerySchema } from '@/lib/validation/schemas';
import { PageHeader } from '@/components/site/page-header';
import { getSettings } from '@/server/settings';

export const metadata: Metadata = {
  title: 'Projektek',
  description:
    'A Yonagi Fansub teljes katalógusa: futó, befejezett és tervezett anime projektek magyar felirattal. Szűrj állapot, típus, műfaj és évad szerint.',
  alternates: { canonical: '/projektek' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Project catalogue.
 *
 * Filters come from the URL and are validated with the same schema the API
 * uses, so a hand-edited query string cannot reach the database in a shape the
 * endpoint would have rejected. Invalid values fall back to the defaults rather
 * than erroring — a bad link should still show the catalogue.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const query = projectQuerySchema.safeParse(flat);
  const filters = query.success ? query.data : projectQuerySchema.parse({});
  /*
    Page size comes from the settings, not a literal.

    It still goes through `paginationSchema` rather than straight into the
    query: the setting is clamped on the way in, but the schema is the one place
    that knows what this API considers a legal page size, and routing every
    source through it is what stops the two from drifting apart.
  */
  const settings = await getSettings();
  const pagination = paginationSchema.parse({
    page: filters.page,
    perPage: settings.projectsPerPage,
  });

  const [genres, seasons] = await Promise.all([listGenres(), listSeasons()]);

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Katalógus"
        title="Projektek"
        description="Minden sorozat és film, amin dolgozunk vagy dolgoztunk. A folyamatban lévő projekteknél a munkafolyamat állapota is látszik."
      />

      <div className="mt-9">
        <Suspense fallback={<div className="h-32" />}>
          <ProjectFilters
            genres={genres.map((genre) => ({
              value: genre.slug,
              label: genre.name,
              count: genre._count.projects,
            }))}
            seasons={seasons}
          />
        </Suspense>
      </div>

      <div className="mt-8">
        <Suspense key={JSON.stringify(flat)} fallback={<ProjectGridSkeleton count={12} />}>
          <ProjectResults filters={filters} page={pagination.page} perPage={pagination.perPage} />
        </Suspense>
      </div>
    </div>
  );
}

async function ProjectResults({
  filters,
  page,
  perPage,
}: {
  filters: ReturnType<typeof projectQuerySchema.parse>;
  page: number;
  perPage: number;
}) {
  // The cached variant takes its arguments as strings: `unstable_cache` keys on
  // them, and a filter object that is not part of the key would produce
  // cross-contaminated cache entries.
  const { items, meta } = await listPublicProjects(
    JSON.stringify({
      q: filters.q,
      status: filters.status,
      type: filters.type,
      season: filters.season,
      year: filters.year,
      genres: parseList(filters.genre),
      sort: filters.sort,
    }),
    JSON.stringify({ page, perPage }),
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<LibraryBig className="size-6" aria-hidden />}
        title="Nincs a szűrőknek megfelelő projekt"
        description="Próbálj tágabb feltételekkel: vedd ki valamelyik szűrőt, vagy keress rövidebb kifejezésre."
        action={{ label: 'Szűrők törlése', href: '/projektek' }}
      />
    );
  }

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.type) params.set('type', filters.type);
    if (filters.genre) params.set('genre', filters.genre);
    if (filters.season) params.set('season', filters.season);
    if (filters.year) params.set('year', String(filters.year));
    if (filters.sort) params.set('sort', filters.sort);
    if (targetPage > 1) params.set('page', String(targetPage));
    return `/projektek${params.toString() ? `?${params}` : ''}`;
  };

  return (
    <>
      {/*
        A találatszám itt van, és nem a szűrősávban: a két szekció külön
        Suspense-határon belül streamel, tehát a szűrősáv nem látja a
        lekérdezés eredményét. Korábban egy bekötetlen `totalCount={0}`
        állt ott, ami „0 projekt"-et írt ki öt látható projekt fölé.
      */}
      <p className="nums mb-4 text-sm text-content-muted" aria-live="polite">
        {meta.total} projekt
        {meta.totalPages && meta.totalPages > 1
          ? ` · ${meta.page}. oldal a(z) ${meta.totalPages}-ből`
          : ''}
      </p>

      {/*
        Rejtett <h2> a rács fölött.

        A kártyák <h3>-mal írják ki a projekt címét, az oldalon viszont a
        <h1> után semmi nem állt köztük — egy felolvasóban ez kihagyott szint,
        és a címsor-navigáció (az oldal átfutásának leggyorsabb módja vakon)
        elveszíti a fogódzót. A kártya szintje nem változhat: a kezdőlapon egy
        <h2>-es szekciócím alatt ül, ott a <h3> a helyes.
      */}
      <h2 className="sr-only">Találatok</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-5">
        {items.map((project, index) => (
          <ProjectCard key={project.id} project={project} priority={index < 10} />
        ))}
      </div>

      <Pagination
        page={meta.page ?? 1}
        totalPages={meta.totalPages ?? 1}
        total={meta.total}
        perPage={meta.perPage}
        buildHref={buildHref}
        className="mt-12"
      />
    </>
  );
}
