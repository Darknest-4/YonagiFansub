/**
 * Who made it: studios, production committee, licensors, country.
 *
 * These arrive from the metadata import as string arrays, and they stay arrays
 * here rather than being joined into a sentence — a show has three studios and a
 * committee of eleven, and prose turns that into an unreadable run-on. Each row
 * renders only when it has content, so a sparsely imported project shows a short
 * card instead of a list of empty labels.
 */

/** Only the origins that actually turn up in an anime catalogue. */
const COUNTRY_LABEL: Record<string, string> = {
  JP: 'Japán',
  KR: 'Dél-Korea',
  CN: 'Kína',
  TW: 'Tajvan',
  US: 'Egyesült Államok',
  FR: 'Franciaország',
};

export function ProductionCredits({
  studios,
  producers,
  licensors,
  countryOfOrigin,
}: {
  studios: string[];
  producers: string[];
  licensors: string[];
  countryOfOrigin: string | null;
}) {
  const rows = [
    { label: 'Stúdió', values: studios },
    { label: 'Producer', values: producers },
    { label: 'Licenc', values: licensors },
    {
      label: 'Származás',
      values: countryOfOrigin
        ? [COUNTRY_LABEL[countryOfOrigin.toUpperCase()] ?? countryOfOrigin.toUpperCase()]
        : [],
    },
  ].filter((row) => row.values.length > 0);

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="production">
      <h2
        id="production"
        className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
      >
        Produkció
      </h2>

      <dl className="space-y-3 rounded-xl border border-ink-800 bg-ink-900/40 px-4 py-3.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-2xs tracking-wide text-mist-600 uppercase">{row.label}</dt>
            <dd className="mt-0.5 text-sm text-mist-200">{row.values.join(' · ')}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
