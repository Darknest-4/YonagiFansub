import { Skeleton, TableSkeleton } from '@/shared/ui/feedback';

/**
 * Shared by every admin screen that has not declared its own.
 *
 * A table is the right guess: most of the panel is one. Screens whose shape is
 * very different — the media grid, the dashboard — are worth their own file if
 * the mismatch ever becomes noticeable.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}
