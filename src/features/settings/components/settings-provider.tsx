'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { ToastProvider } from '@/shared/ui/toast';
import type { PublicSettings } from '@/features/settings/definitions';

/**
 * Client-side application context.
 *
 * Only *public* settings cross the server/client boundary — the type is
 * `PublicSettings`, and `getPublicSettings()` is the only thing that produces
 * it, so a private key cannot reach the browser by accident.
 */

const SettingsContext = createContext<PublicSettings>({});

export function useSettings(): PublicSettings {
  return useContext(SettingsContext);
}

export function AppProviders({
  settings,
  children,
}: {
  settings: PublicSettings;
  children: ReactNode;
}) {
  return (
    <SettingsContext.Provider value={settings}>
      <ToastProvider>{children}</ToastProvider>
    </SettingsContext.Provider>
  );
}
