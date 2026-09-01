import { Skeleton, ProjectGridSkeleton, ReleaseListSkeleton } from '@/components/ui/feedback';

/**
 * Loading states for the public routes.
 *
 * Every page in this app is `force-dynamic` — `generateMetadata` reads the site
 * name from the database, so nothing can be prerendered (see the root layout for
 * why). That is fine for time-to-response, which measures in tens of
 * milliseconds, and terrible for *perceived* speed without these: a navigation
 * with no `loading.tsx` renders nothing at all until the server answers, so the
 * old page sits there frozen and then the new one appears. On a phone over
 * mobile data that reads as a broken tap.
 *
 * ## Why these mirror the real layout so closely
 *
 * A skeleton exists to hold the space the content will occupy. A generic
 * spinner in the middle of the viewport is worse than nothing here, because the
 * arriving page then shoves everything into place — the layout shift is the
 * jarring part, and matching the real grid is what removes it.
 *
 * So each one copies the page's container, its header block and its first
 * screenful of rows. Below the fold is not worth simulating: it scrolls into
 * view long after the real content has replaced this.
 */

/** The `PageHeader` block: eyebrow, title, description. */
export function HeaderSkeleton({ description = true }: { description?: boolean }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-9 w-64 max-w-full" />
      {description && <Skeleton className="h-4 w-full max-w-lg" />}
    </div>
  );
}

/** Wraps a skeleton in the same container and vertical rhythm as the real page. */
export function PageShellSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-content py-10 lg:py-14">
      {/* Breadcrumb line, so the header does not jump down when it arrives. */}
      <Skeleton className="mb-5 h-3 w-40" />
      {children}
    </div>
  );
}

export function CatalogueSkeleton() {
  return (
    <PageShellSkeleton>
      <HeaderSkeleton />
      {/* Filter bar. */}
      <div className="mt-8 flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-28" />
        ))}
      </div>
      <div className="mt-8">
        <ProjectGridSkeleton count={12} />
      </div>
    </PageShellSkeleton>
  );
}

export function ReleaseFeedSkeleton() {
  return (
    <PageShellSkeleton>
      <HeaderSkeleton />
      <div className="mt-8 flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-32" />
        ))}
      </div>
      <div className="mt-8">
        <ReleaseListSkeleton count={8} />
      </div>
    </PageShellSkeleton>
  );
}

/** A list of rows: the calendar, notifications, anything one-line-per-item. */
export function RowListSkeleton({
  rows = 8,
  grouped = false,
}: {
  rows?: number;
  grouped?: boolean;
}) {
  return (
    <PageShellSkeleton>
      <HeaderSkeleton />
      {/* The calendar's explanatory note occupies real height; skipping it here
          would make the first rows jump up when the page lands. */}
      <Skeleton className="mt-6 h-16 w-full rounded-xl" />

      <div className="mt-10 space-y-8">
        {Array.from({ length: grouped ? 3 : 1 }, (_, group) => (
          <div key={group}>
            {grouped && <Skeleton className="mb-3 h-4 w-40" />}
            <div className="space-y-2">
              {Array.from({ length: grouped ? Math.ceil(rows / 3) : rows }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShellSkeleton>
  );
}

/** Article-shaped pages: news posts, legal text, the FAQ. */
export function ArticleSkeleton({ lines = 12 }: { lines?: number }) {
  return (
    <PageShellSkeleton>
      <HeaderSkeleton />
      <div className="mt-10 max-w-2xl space-y-3">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton
            key={index}
            className={index % 4 === 3 ? 'h-4 w-2/3' : 'h-4 w-full'}
          />
        ))}
      </div>
    </PageShellSkeleton>
  );
}

/** Card grids: the team page, news index. */
export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <PageShellSkeleton>
      <HeaderSkeleton />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="space-y-3">
            <Skeleton className="aspect-[16/10] w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </PageShellSkeleton>
  );
}

/**
 * The project detail page: a two-column layout with a cover.
 *
 * The widest of these, and the one where getting it wrong is most visible —
 * the real page has a tall cover image on the left that everything else is
 * measured against.
 */
export function ProjectDetailSkeleton() {
  return (
    <div className="container-content py-10 lg:py-14">
      <Skeleton className="mb-5 h-3 w-56" />

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <Skeleton className="aspect-[2/3] w-full max-w-64 rounded-xl" />

        <div className="space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <div className="flex flex-wrap gap-2 pt-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-6 w-20 rounded-full" />
            ))}
          </div>
          <div className="space-y-2 pt-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className={index === 4 ? 'h-4 w-2/3' : 'h-4 w-full'} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-12 space-y-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
