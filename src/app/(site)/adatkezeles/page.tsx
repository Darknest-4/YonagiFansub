import type { Metadata } from 'next';
import { LegalPage } from '@/shared/layout/legal-page';
import { LEGAL_UPDATED_AT, PRIVACY_POLICY } from '@/content/legal';

export const metadata: Metadata = {
  title: 'Adatkezelési tájékoztató',
  description:
    'Milyen adatot kezel a Yonagi Fansub, miért, meddig, és hogyan élhetsz a jogaiddal.',
  alternates: { canonical: '/adatkezeles' },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Jogi"
      title="Adatkezelési tájékoztató"
      updatedAt={LEGAL_UPDATED_AT}
      markdown={PRIVACY_POLICY}
    />
  );
}
