import { RowListSkeleton } from '@/shared/ui/page-skeletons';

export default function Loading() {
  // Grouped, because the calendar renders day headings with rows underneath.
  return <RowListSkeleton grouped rows={9} />;
}
