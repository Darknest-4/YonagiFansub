'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

/**
 * Search page input.
 *
 * Submits as a real form so the page works without JavaScript, and additionally
 * pushes debounced updates once hydrated — you get instant results while typing,
 * and a working search box if the bundle never arrives.
 */
export function SearchInput({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (value === current) return;

    const timer = setTimeout(() => {
      const trimmed = value.trim();
      startTransition(() => {
        router.replace(trimmed ? `/kereses?q=${encodeURIComponent(trimmed)}` : '/kereses', {
          scroll: false,
        });
      });
    }, 320);

    return () => clearTimeout(timer);
  }, [value, searchParams, router]);

  return (
    <form
      action="/kereses"
      method="get"
      role="search"
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = value.trim();
        startTransition(() => {
          router.replace(trimmed ? `/kereses?q=${encodeURIComponent(trimmed)}` : '/kereses');
        });
      }}
    >
      <Input
        name="q"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoFocus={!initialQuery}
        inputSize="lg"
        aria-label="Keresőkifejezés"
        placeholder="Cím, epizód, hír…"
        leadingIcon={<Search className="size-4" aria-hidden />}
      />

      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Keresés
      </Button>
    </form>
  );
}
