import type { Metadata } from 'next';
import { ShieldX } from 'lucide-react';
import { EmptyState } from '@/components/ui/feedback';

export const metadata: Metadata = {
  title: 'Nincs jogosultságod',
  robots: { index: false, follow: false },
};

/**
 * 403.
 *
 * Reached when an authenticated user lacks the permission a page requires. The
 * copy deliberately does not say what the page contains — that would leak the
 * existence and shape of an admin surface to someone who cannot see it.
 */
export default function ForbiddenPage() {
  return (
    <div className="container-content py-24">
      <EmptyState
        icon={<ShieldX className="size-6" aria-hidden />}
        title="Ehhez nincs jogosultságod"
        description="A fiókod nem fér hozzá ehhez a felülethez. Ha szerinted ez tévedés, szólj egy adminisztrátornak."
        action={{ label: 'Vissza a kezdőlapra', href: '/' }}
        secondaryAction={{ label: 'Kapcsolat', href: '/kapcsolat' }}
      />
    </div>
  );
}
