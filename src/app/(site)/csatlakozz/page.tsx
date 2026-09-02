import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock, GraduationCap, Heart, Languages, PauseCircle, Wrench } from 'lucide-react';
import { PageHeader } from '@/components/site/page-header';
import { ButtonLink } from '@/components/ui/button';
import { listPositions } from '@/server/team';
import { getSettings } from '@/server/settings';

export const metadata: Metadata = {
  title: 'Csatlakozz a csapathoz',
  description:
    'A Yonagi Fansub fordítót, időzítőt, formázót, lektort és enkódert keres. Kezdőket is szívesen látunk.',
  alternates: { canonical: '/csatlakozz' },
};

/*
  Dynamic rather than revalidated hourly.

  The page reads `recruitingOpen`, and a switch that takes up to an hour to take
  effect is a switch that does not work: the case for closing recruitment is
  usually "we are drowning in applications", which is exactly when another
  hour's worth is the wrong answer.
*/
export const dynamic = 'force-dynamic';

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
  const [positions, settings] = await Promise.all([listPositions(), getSettings()]);
  const open = settings.recruitingOpen;

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Csatlakozz"
        title={<>Gyere, csináljuk <span className="text-gradient">együtt</span></>}
        description="Önkéntes csapat vagyunk. Nincs fizetés, nincs határidőpresszó — van viszont közös munka, tanulás és egy csomó anime."
      />

      {/*
        The page stays up when recruitment is closed, with the notice at the top
        and the application steps replaced further down.

        Taking it down instead would be worse in both directions: somebody who
        wanted to join learns nothing about the group, and the address that
        every "we are looking for translators" post ever linked to starts
        404ing. Saying "not right now, here is what we do and where to ask
        later" costs one paragraph and answers the actual question.
      */}
      {!open && (
        <aside className="mt-6 flex gap-3 rounded-xl border border-warning-500/25 bg-warning-900/20 px-4 py-3.5">
          <PauseCircle className="mt-0.5 size-4 shrink-0 text-warning-400" aria-hidden />
          <p className="text-2xs leading-relaxed text-mist-300 sm:text-xs">
            <strong className="text-mist-100">Jelenleg nem keresünk új tagot.</strong> A csapat
            most tele van, így a jelentkezéseket szüneteltetjük. Az oldalt nem vesszük le: ha
            érdekel a munka, olvasd el nyugodtan, mit csinálunk — és nézz vissza később, mert ez
            változni szokott. Sürgős esetben a{' '}
            <Link href="/kapcsolat" className="text-warning-400 underline-offset-4 hover:underline">
              kapcsolati űrlapon
            </Link>{' '}
            így is elérsz minket.
          </p>
        </aside>
      )}

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
                  style={{ color: position.color ?? 'var(--color-bloom-400)' }}
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
              <Icon className="size-5 text-bloom-400" aria-hidden />
              <h3 className="mt-3 text-sm font-semibold text-mist-100">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-content-muted">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-gradient relative mt-14 overflow-hidden rounded-2xl bg-ink-900 p-8 sm:p-10">
        <div aria-hidden className="aurora opacity-35" />
        {open ? (
        <div className="relative max-w-2xl">
          <h2 className="text-2xl">Hogyan jelentkezz?</h2>
          <ol className="mt-5 space-y-3 text-sm leading-relaxed text-mist-300">
            <li className="flex gap-3">
              <span aria-hidden className="nums grid size-6 shrink-0 place-items-center rounded-md bg-bloom-400/15 text-2xs font-bold text-bloom-300">1</span>
              Írj nekünk a kapcsolati űrlapon, „Csatlakoznék a csapathoz” kategóriával.
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="nums grid size-6 shrink-0 place-items-center rounded-md bg-bloom-400/15 text-2xs font-bold text-bloom-300">2</span>
              Írd meg, melyik pozíció érdekel, és hogy van-e korábbi tapasztalatod. Ha nincs, az sem baj.
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="nums grid size-6 shrink-0 place-items-center rounded-md bg-bloom-400/15 text-2xs font-bold text-bloom-300">3</span>
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
        ) : (
          /*
            No "Jelentkezem" button while recruitment is closed. A call to
            action that leads to a form nobody is reading is worse than no
            button — it costs somebody the effort of writing an application and
            then the silence of never hearing back.
          */
          <div className="relative max-w-2xl">
            <h2 className="text-2xl">Most éppen szünetel a jelentkezés</h2>
            <p className="mt-4 text-sm leading-relaxed text-mist-300">
              Nem tudunk új tagot betanítani, így a jelentkezéseket ideiglenesen lezártuk. Amint
              újranyitunk, ez az oldal és a hírek között is jelezni fogjuk — addig is érdemes
              követni a munkánkat.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink
                href="/csapat"
                variant="secondary"
                size="lg"
                leadingIcon={<Wrench className="size-4" aria-hidden />}
              >
                Kik dolgoznak itt?
              </ButtonLink>
              <ButtonLink
                href="/hirek"
                variant="ghost"
                size="lg"
                trailingIcon={<ArrowRight className="size-4" aria-hidden />}
              >
                Hírek
              </ButtonLink>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
