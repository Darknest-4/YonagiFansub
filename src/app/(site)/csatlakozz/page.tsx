import type { Metadata } from 'next';
import { ArrowRight, Clock, GraduationCap, Heart, Languages, Wrench } from 'lucide-react';
import { PageHeader } from '@/components/site/page-header';
import { ButtonLink } from '@/components/ui/button';
import { listPositions } from '@/server/team';

export const metadata: Metadata = {
  title: 'Csatlakozz a csapathoz',
  description:
    'A Yonagi Fansub fordítót, időzítőt, formázót, lektort és enkódert keres. Kezdőket is szívesen látunk.',
  alternates: { canonical: '/csatlakozz' },
};

export const revalidate = 3600;

const EXPECTATIONS = [
  {
    icon: Clock,
    title: 'Kiszámíthatóság',
    body: 'Nem a sebesség számít, hanem hogy szólj, ha csúszol. Egy epizód nem áll meg attól, ha valaki jelez — attól áll meg, ha eltűnik.',
  },
  {
    icon: Heart,
    title: 'Igényesség',
    body: 'A „jó lesz az” hozzáállás nem fér bele. Ha valami nem elég jó, inkább csússzon egy napot.',
  },
  {
    icon: GraduationCap,
    title: 'Tanulási hajlandóság',
    body: 'Nem kell profinak lenned. Betanítunk mindenre — de a visszajelzéseket be kell építened.',
  },
];

export default async function JoinPage() {
  const positions = await listPositions();

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Csatlakozz"
        title={<>Gyere, csináljuk <span className="text-gradient">együtt</span></>}
        description="Önkéntes csapat vagyunk. Nincs fizetés, nincs határidőpresszó — van viszont közös munka, tanulás és egy csomó anime."
      />

      <section className="mt-12" aria-labelledby="positions">
        <h2 id="positions" className="text-xl">Milyen pozíciókba keresünk embert?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-content-muted">
          Szinte mindenhova. Ha nem tudod, melyik illik hozzád, írj — segítünk kitalálni.
        </p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {positions.map((position) => (
            <li
              key={position.key}
              className="rounded-xl border border-ink-800 bg-ink-900/40 p-4 transition-colors hover:border-ink-600"
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-lg bg-ink-850"
                  style={{ color: position.color ?? 'var(--color-tide-400)' }}
                >
                  <Languages className="size-4" />
                </span>
                <h3 className="text-sm font-semibold text-mist-100">{position.name}</h3>
              </div>
              {position.nameEn && (
                <p className="mt-2 text-2xs text-mist-600">{position.nameEn}</p>
              )}
              <p className="nums mt-1 text-2xs text-mist-500">
                {position._count.members} aktív tag
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14" aria-labelledby="expectations">
        <h2 id="expectations" className="text-xl">Mit várunk?</h2>

        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {EXPECTATIONS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-xl border border-ink-800 bg-ink-900/40 p-5">
              <Icon className="size-5 text-tide-400" aria-hidden />
              <h3 className="mt-3 text-sm font-semibold text-mist-100">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-content-muted">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-gradient relative mt-14 overflow-hidden rounded-2xl bg-ink-900 p-8 sm:p-10">
        <div aria-hidden className="aurora opacity-35" />
        <div className="relative max-w-2xl">
          <h2 className="text-2xl">Hogyan jelentkezz?</h2>
          <ol className="mt-5 space-y-3 text-sm leading-relaxed text-mist-300">
            <li className="flex gap-3">
              <span aria-hidden className="nums grid size-6 shrink-0 place-items-center rounded-md bg-tide-400/15 text-2xs font-bold text-tide-300">1</span>
              Írj nekünk a kapcsolati űrlapon, „Csatlakoznék a csapathoz” kategóriával.
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="nums grid size-6 shrink-0 place-items-center rounded-md bg-tide-400/15 text-2xs font-bold text-tide-300">2</span>
              Írd meg, melyik pozíció érdekel, és hogy van-e korábbi tapasztalatod. Ha nincs, az sem baj.
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="nums grid size-6 shrink-0 place-items-center rounded-md bg-tide-400/15 text-2xs font-bold text-tide-300">3</span>
              Kapsz egy rövid próbafeladatot. Nem vizsga — csak látni szeretnénk, hogyan dolgozol.
            </li>
          </ol>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink
              href="/kapcsolat?tema=join_team"
              variant="primary"
              size="lg"
              trailingIcon={<ArrowRight className="size-4" aria-hidden />}
            >
              Jelentkezem
            </ButtonLink>
            <ButtonLink
              href="/csapat"
              variant="ghost"
              size="lg"
              leadingIcon={<Wrench className="size-4" aria-hidden />}
            >
              Kik dolgoznak itt?
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
