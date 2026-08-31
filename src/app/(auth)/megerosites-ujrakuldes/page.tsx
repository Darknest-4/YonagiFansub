import type { Metadata } from 'next';
import { ResendVerificationForm } from '@/components/auth/resend-verification-form';

export const metadata: Metadata = {
  title: 'Megerősítő e-mail újraküldése',
  robots: { index: false, follow: false },
};

export default function ResendVerificationPage() {
  return <ResendVerificationForm />;
}
