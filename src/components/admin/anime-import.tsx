'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Download, Loader2, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { InlineError } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

interface SearchHit {
  malId: number;
  title: string;
  year: number | null;
  imageUrl: string | null;
  type: string | null;
}

interface Preview {
  anilistId: number | null;
  malId: number | null;
  displayTitle: string;
  titleRomaji: string | null;
  titleEnglish: string | null;
  titleNative: string | null;
  synopsis: string | null;
  type: string | null;
  season: string | null;
  seasonYear: number | null;
  totalEpisodes: number | null;
  durationMin: number | null;
  studio: string | null;
  studios: string[];
  source: string | null;
  averageScore: number | null;
  malScore: number | null;
  coverImageUrl: string | null;
  bannerImageUrl: string | null;
  accentColor: string | null;
  genres: string[];
  tags: string[];
  sources: string[];
}

interface ImportResult {
  slug: string;
  title: string;
  episodesCreated: number;
  episodesTruncated: boolean;
  genresLinked: number;
  sources: string[];
}

/**
 * Anime import.
 *
 * Three steps, in the order somebody actually has them: find the show, look at
 * what would be written, then write it. The preview is not decoration — an
 * importer that only tells you what it did after it has done it is one people
 * run once and then stop trusting, and a wrong id looks exactly like a right one
 * until the page renders.
 *
 * Search hits MyAnimeList rather than AniList, because the MAL id is the one
 * that unlocks the episode list, and AniList's record carries the MAL id anyway
 * — so either id entered by hand reaches both sources.
 */
export function AnimeImport() {
  const router = useRouter();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [anilistId, setAnilistId] = useState('');
  const [malId, setMalId] = useState('');

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setHits(await apiFetch<SearchHit[]>(`/api/v1/admin/metadata/search?q=${encodeURIComponent(query.trim())}`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'A keresés nem sikerült.');
      setHits(null);
    } finally {
      setSearching(false);
    }
  };

  const loadPreview = async (ids: { anilistId?: string; malId?: string }) => {
    const params = new URLSearchParams();
    if (ids.anilistId) params.set('anilistId', ids.anilistId);
    if (ids.malId) params.set('malId', ids.malId);
    if (![...params.keys()].length) {
      setError('Adj meg AniList- vagy MyAnimeList-azonosítót.');
      return;
    }

    setLoadingPreview(true);
    setError(null);
    setDone(null);
    try {
      setPreview(await apiFetch<Preview>(`/api/v1/admin/metadata/lookup?${params}`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'A lekérdezés nem sikerült.');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const runImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const result = await apiFetch<ImportResult>('/api/v1/admin/metadata/import', {
        method: 'POST',
        body: { anilistId: preview.anilistId, malId: preview.malId },
      });
      setDone(result);
      toast.success(`${result.title} importálva`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Az importálás nem sikerült.');
    } finally {
      setImporting(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-success-500/30 bg-success-500/[0.06] p-6">
        <div className="flex items-center gap-2 text-success-400">
          <Check className="size-5 shrink-0" aria-hidden />
          <h2 className="text-base font-semibold">{done.title} importálva</h2>
        </div>

        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <Stat label="Epizód" value={String(done.episodesCreated)} />
          <Stat label="Műfaj" value={String(done.genresLinked)} />
          <Stat label="Forrás" value={done.sources.join(' + ')} />
        </dl>

        {done.episodesTruncated && (
          <p className="mt-3 text-2xs text-ember-400">
            A sorozat hosszabb, mint amennyit egy futásban beolvasunk — a további epizódok a
            következő szinkronizáláskor jönnek meg.
          </p>
        )}

        <p className="mt-4 text-sm text-mist-300">
          Piszkozatként jött létre. Add meg a magyar címet és a szinopszist, majd publikáld.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => router.push('/admin/projektek')}>
            Projektek
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDone(null);
              setPreview(null);
              setAnilistId('');
              setMalId('');
              setQuery('');
              setHits(null);
            }}
          >
            Újabb importálás
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <InlineError message={error} />}

      {/* ── 1. Keresés ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-ink-800 bg-ink-900/40 p-5">
        <h2 className="text-sm font-semibold text-mist-100">1. Keresés cím alapján</h2>
        <p className="mt-1 text-2xs text-mist-500">
          Vagy ugord át, és írd be közvetlenül az azonosítót alább.
        </p>

        <div className="mt-4 flex gap-2">
          <Input
            value={query}
            placeholder="pl. Steins;Gate"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void runSearch();
              }
            }}
            aria-label="Anime keresése"
          />
          <Button
            variant="secondary"
            size="md"
            onClick={runSearch}
            loading={searching}
            disabled={query.trim().length < 2}
            leadingIcon={<Search className="size-4" aria-hidden />}
          >
            Keresés
          </Button>
        </div>

        {hits && hits.length === 0 && (
          <p className="mt-3 text-2xs text-mist-500">Nincs találat.</p>
        )}

        {hits && hits.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {hits.map((hit) => (
              <li key={hit.malId}>
                <button
                  type="button"
                  onClick={() => {
                    setMalId(String(hit.malId));
                    setAnilistId('');
                    void loadPreview({ malId: String(hit.malId) });
                  }}
                  className="flex w-full items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/60 p-2 text-left transition-colors hover:border-bloom-500/40 hover:bg-ink-850"
                >
                  <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-ink-800">
                    {hit.imageUrl && (
                      <Image src={hit.imageUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-mist-100">{hit.title}</span>
                    <span className="nums block text-2xs text-mist-600">
                      {[hit.type, hit.year].filter(Boolean).join(' · ')} · MAL #{hit.malId}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 2. Azonosító ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-ink-800 bg-ink-900/40 p-5">
        <h2 className="text-sm font-semibold text-mist-100">2. Azonosító</h2>
        <p className="mt-1 text-2xs text-mist-500">
          Elég az egyik — a másik forrást magától megtalálja hozzá.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="AniList ID">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                value={anilistId}
                placeholder="9253"
                onChange={(event) => setAnilistId(event.target.value)}
              />
            )}
          </Field>
          <Field label="MyAnimeList ID">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                value={malId}
                placeholder="9253"
                onChange={(event) => setMalId(event.target.value)}
              />
            )}
          </Field>
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          loading={loadingPreview}
          onClick={() => loadPreview({ anilistId, malId })}
          leadingIcon={<Sparkles className="size-4" aria-hidden />}
        >
          Adatok lekérése
        </Button>
      </section>

      {/* ── 3. Előnézet ──────────────────────────────────────────────────── */}
      {loadingPreview && !preview && (
        <p className="flex items-center gap-2 text-sm text-mist-500">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Lekérdezés az AniList és a MyAnimeList felől…
        </p>
      )}

      {preview && (
        <section className="overflow-hidden rounded-xl border border-bloom-500/25 bg-bloom-500/[0.04]">
          <div className="flex flex-col gap-4 p-5 sm:flex-row">
            {preview.coverImageUrl && (
              <div className="relative h-44 w-32 shrink-0 self-center overflow-hidden rounded-lg bg-ink-800 sm:self-start">
                <Image
                  src={preview.coverImageUrl}
                  alt=""
                  fill
                  sizes="128px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-mist-50">{preview.displayTitle}</h2>
              <p className="mt-0.5 text-2xs text-mist-500">
                {[preview.titleNative, preview.titleEnglish].filter(Boolean).join(' · ')}
              </p>

              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <Stat label="Típus" value={[preview.type, preview.season, preview.seasonYear].filter(Boolean).join(' · ') || '—'} />
                <Stat
                  label="Epizód"
                  value={preview.totalEpisodes ? `${preview.totalEpisodes} rész${preview.durationMin ? ` · ${preview.durationMin} perc` : ''}` : '—'}
                />
                <Stat label="Stúdió" value={preview.studios.join(', ') || '—'} />
                <Stat label="Forrásmű" value={preview.source ?? '—'} />
                <Stat
                  label="Pontszám"
                  value={[
                    preview.averageScore ? `AniList ${preview.averageScore}%` : null,
                    preview.malScore ? `MAL ${preview.malScore}` : null,
                  ].filter(Boolean).join(' · ') || '—'}
                />
                <Stat label="Forrás" value={preview.sources.join(' + ')} />
              </dl>

              {preview.genres.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {preview.genres.map((genre) => (
                    <li
                      key={genre}
                      className="rounded-full border border-ink-700 bg-ink-900/60 px-2.5 py-1 text-2xs text-mist-300"
                    >
                      {genre}
                    </li>
                  ))}
                </ul>
              )}

              {preview.synopsis && (
                <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-mist-400">
                  {preview.synopsis}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-bloom-500/20 bg-ink-950/40 px-5 py-4">
            <Button
              variant="primary"
              size="md"
              onClick={runImport}
              loading={importing}
              leadingIcon={<Download className="size-4" aria-hidden />}
            >
              Importálás az epizódokkal
            </Button>
            <p className="text-2xs text-mist-500">
              Piszkozatként jön létre. Az epizódlista a MyAnimeList felől érkezik.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('min-w-0')}>
      <dt className="text-2xs tracking-wide text-mist-500 uppercase">{label}</dt>
      <dd className="truncate text-sm text-mist-200">{value}</dd>
    </div>
  );
}
