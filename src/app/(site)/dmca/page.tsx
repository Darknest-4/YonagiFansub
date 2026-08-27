import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/legal-page';
import { DMCA_NOTICE, LEGAL_UPDATED_AT } from '@/content/legal';

export const metadata: Metadata = {
  title: 'Jogi nyilatkozat',
  description:
    'Jogtulajdonosi bejelentés menete és a Yonagi Fansub önkéntes vállalásai.',
  alternates: { canonical: '/dmca' },
};

export default function DmcaPage() {
  return (
    <LegalPage
      eyebrow="Jogi"
      title="Jogi nyilatkozat"
      updatedAt={LEGAL_UPDATED_AT}
      markdown={DMCA_NOTICE}
    />
  );
}
