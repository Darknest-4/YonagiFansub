import type { Metadata } from 'next';
import { Clock, Mail, MessageSquare, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/shared/layout/page-header';
import { ContactForm } from '@/features/contact/components/contact-form';
import { getPublicSettings } from '@/features/settings/service';
import { EmptyState } from '@/shared/ui/feedback';

export const metadata: Metadata = {
  title: 'Kapcsolat',
  description:
    'Írj a Yonagi Fansub csapatának: kérdés, projektjavaslat, hibabejelentés vagy jogi megkeresés.',
  alternates: { canonical: '/kapcsolat' },
};

type SearchParams = Promise<{ tema?: string }>;

export default async function ContactPage({ searchParams }: { searchParams: SearchParams }) {
  const [settings, { tema }] = await Promise.all([getPublicSettings(), searchParams]);

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Kapcsolat"
        title="Írj nekünk"
        description="Kérdés, javaslat, hibajelzés vagy együttműködés — minden üzenetet elolvasunk."
      />

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_18rem] lg:gap-14">
        <div className="max-w-2xl">
          {settings.contactFormEnabled ? (
            <ContactForm defaultCategory={tema?.toUpperCase()} />
          ) : (
            <EmptyState
              icon={<Mail className="size-6" aria-hidden />}
              title="Az űrlap átmenetileg szünetel"
              description={
                settings.contactEmail
                  ? `Addig is elérsz minket e-mailben: ${settings.contactEmail}`
                  : 'Hamarosan újra elérhető lesz.'
              }
            />
          )}
        </div>

        <aside className="space-y-4">
          <InfoCard
            icon={<Clock className="size-4" aria-hidden />}
            title="Válaszidő"
            body="Általában 2–5 nap. Hétvégén és vizsgaidőszakban lassabbak vagyunk — mindannyian önkéntesek vagyunk."
          />

          {settings.discordUrl && (
            <InfoCard
              icon={<MessageSquare className="size-4" aria-hidden />}
              title="Gyorsabb út"
              body="A Discord szerverünkön általában órákon belül válaszolunk."
              href={settings.discordUrl}
              hrefLabel="Csatlakozás a Discordhoz"
            />
          )}

          <InfoCard
            icon={<ShieldAlert className="size-4" aria-hidden />}
            title="Jogi megkeresés"
            body={`Jogtulajdonosi bejelentést a „Jogi megkeresés” kategóriával küldj, vagy közvetlenül a ${settings.takedownEmail ?? 'legal@yonagifansub.hu'} címre.`}
            href="/dmca"
            hrefLabel="Jogi nyilatkozat"
          />
        </aside>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  body,
  href,
  hrefLabel,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
}) {
  const external = href ? /^https?:\/\//i.test(href) : false;

  return (
    <section className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-mist-100">
        <span className="text-bloom-400">{icon}</span>
        {title}
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-content-muted">{body}</p>
      {href && hrefLabel && (
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="mt-3 inline-block text-xs font-medium text-bloom-300 underline-offset-4 hover:underline"
        >
          {hrefLabel} →
        </a>
      )}
    </section>
  );
}
