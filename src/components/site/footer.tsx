import Link from 'next/link';
import { Logo } from '@/components/site/logo';
import { FOOTER_SECTIONS } from '@/components/site/nav-config';
import { getPublicSettings } from '@/server/settings';
import { getPublicStats } from '@/server/stats';
import { formatCount } from '@/lib/utils';

/**
 * Site footer.
 *
 * Doubles as the site's secondary navigation and as its legal surface. The live
 * counters are a deliberate choice: they are cheap (one cached aggregate) and
 * they tell a visitor at a glance that the group is active — the single most
 * important signal for a fansub.
 */
export async function SiteFooter() {
  const [settings, stats] = await Promise.all([getPublicSettings(), getPublicStats()]);
  const year = new Date().getFullYear();

  const socials = [
    { label: 'Discord', href: settings.discordUrl },
    { label: 'X', href: settings.xUrl },
    { label: 'YouTube', href: settings.youtubeUrl },
  ].filter((item): item is { label: string; href: string } => Boolean(item.href));

  return (
    <footer className="relative mt-24 border-t border-ink-800 bg-ink-925">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-linear-to-r from-transparent via-tide-400/40 to-transparent"
      />

      <div className="container-content py-14 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Logo size="lg" />

            <p className="mt-5 max-w-sm text-sm leading-relaxed text-content-muted">
              {settings.siteTagline}
            </p>

            <dl className="mt-7 grid max-w-sm grid-cols-3 gap-4">
              <Stat label="Projekt" value={stats.projects} />
              <Stat label="Epizód" value={stats.episodes} />
              <Stat label="Letöltés" value={stats.downloads} />
            </dl>

            {socials.length > 0 && (
              <ul className="mt-7 flex flex-wrap gap-2">
                {socials.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-lg border border-ink-700 bg-ink-900 px-3.5 py-2 text-xs font-medium text-mist-300 transition-colors duration-fast hover:border-tide-400/40 hover:text-tide-200"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <nav aria-label="Lábléc navigáció">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {FOOTER_SECTIONS.map((section) => (
                <div key={section.title}>
                  <h2 className="mb-3.5 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
                    {section.title}
                  </h2>
                  <ul className="space-y-2.5">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="text-sm text-mist-400 transition-colors duration-fast hover:text-tide-200"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-ink-800 pt-7 text-xs text-mist-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {settings.siteName}. Rajongói fordítás, nem hivatalos kiadás.
          </p>

          <p className="max-w-xl leading-relaxed sm:text-right">
            A feliratok szabadon, díjmentesen érhetők el. A jogtulajdonosok
            megkeresését a{' '}
            <Link href="/dmca" className="text-mist-300 underline-offset-4 hover:underline">
              jogi nyilatkozatban
            </Link>{' '}
            leírt módon várjuk.
          </p>
        </div>
      </div>
    </footer>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-2xs tracking-wide text-mist-500 uppercase">{label}</dt>
      <dd className="nums mt-1 font-display text-xl font-bold text-mist-50">
        {formatCount(value)}
      </dd>
    </div>
  );
}
