import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/password-reset-forms';

export const metadata: Metadata = {
  title: 'Elfelejtett jelszó',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
