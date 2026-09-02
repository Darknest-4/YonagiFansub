import type { Metadata } from 'next';
import { LegalPage } from '@/shared/ui/legal-page';
import { LEGAL_UPDATED_AT, TERMS_OF_SERVICE } from '@/content/legal';

export const metadata: Metadata = {
  title: 'Felhasználási feltételek',
  description: 'A Yonagi Fansub oldalának és kiadásainak használati feltételei.',
  alternates: { canonical: '/felhasznalasi-feltetelek' },
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Jogi"
      title="Felhasználási feltételek"
      updatedAt={LEGAL_UPDATED_AT}
      markdown={TERMS_OF_SERVICE}
    />
  );
}
