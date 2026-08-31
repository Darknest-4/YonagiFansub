import { getPublicStats } from '@/server/stats';
import { formatCount } from '@/lib/utils';

/**
 * Decorative panel beside the auth forms.
 *
 * Hidden below `lg` and marked `aria-hidden`: it carries no information a user
 * needs in order to sign in, and reading it out before the form would be noise.
 * The live counters are the one substantive thing here — they say "this project
 * is alive", which is the only argument a registration screen really needs.
 */
export async function AuthShowcase() {
  const stats = await getPublicStats();

  return (
    <div
      aria-hidden
      className="relative hidden overflow-hidden border-l border-ink-800 bg-ink-925 lg:block"
    >
      <div className="aurora opacity-70" />
      <div className="noise absolute inset-0" />

      <div className="relative flex h-full flex-col justify-between p-12">
        <p lang="ja" className="font-jp text-sm tracking-[0.4em] text-bloom-300/70">
          夜凪
        </p>

        <div>
          <p className="max-w-md font-display text-3xl leading-tight font-bold text-mist-50">
            Az éjszaka <span className="text-gradient">csendjében</span> készülnek a
            legjobb feliratok.
          </p>

          <p className="mt-5 max-w-sm text-sm leading-relaxed text-mist-400">
            Fiókkal követheted a projektjeidet, értesítést kapsz az új kiadásokról, és
            ott folytathatod, ahol abbahagytad — bármelyik eszközön.
          </p>

          <dl className="mt-10 grid max-w-sm grid-cols-3 gap-6 border-t border-ink-800 pt-7">
            <Stat label="Projekt" value={stats.projects} />
            <Stat label="Rész" value={stats.episodes} />
            <Stat label="Letöltés" value={stats.downloads} />
          </dl>
        </div>

        <p className="text-2xs text-mist-700">
          Nincs hirdetés. Nincs követés. Nincs fizetős tartalom.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-2xs tracking-wider text-mist-600 uppercase">{label}</dt>
      <dd className="nums mt-1 font-display text-2xl font-bold text-mist-100">
        {formatCount(value)}
      </dd>
    </div>
  );
}
