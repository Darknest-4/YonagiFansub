import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, MessageSquare } from 'lucide-react';
import { formatDate, formatEpisodeNumber, formatRelative, truncate } from '@/lib/utils';
import { getPublicProfile } from '@/server/profiles';
import { getSettings } from '@/server/settings';
import { ogImages } from '@/lib/seo';
import { Breadcrumbs } from '@/components/site/page-header';
import { Avatar } from '@/components/ui/avatar';
import { siteUrl } from '@/lib/site-url';

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const base = await siteUrl();
  const { username } = await params;
  const [settings, profile] = await Promise.all([getSettings(), getPublicProfile(username)]);

  // Same answer as a missing profile when the feature is off. Metadata is
  // generated before the page body runs, so the check has to happen in both
  // places — a title naming a real member on a page that then 404s would leak
  // exactly what the setting is meant to withhold.
  if (!settings.profilesPublic || !profile) {
    return { title: 'Felhasználó nem található', robots: { index: false } };
  }

  const description = profile.bio
    ? truncate(profile.bio, 155)
    : `${profile.displayName} profilja a Yonagi Fansubon.`;

  return {
    title: profile.displayName,
    description,
    alternates: { canonical: `/felhasznalo/${profile.username}` },
    /*
      Deliberately not indexed.

      The page is public — anyone with the link can read it — but a member
      profile is not something a search engine should surface for a person's
      name. Somebody commenting on a fansub site did not sign up to be a search
      result, and the site loses nothing by keeping these out of the index.
    */
    robots: { index: false, follow: true },
    openGraph: {
      type: 'profile',
      title: profile.displayName,
      description,
      url: `${base}/felhasznalo/${profile.username}`,
      ...ogImages(profile.avatarUrl, profile.displayName),
    },
  };
}

export default async function ProfilePage({ params }: { params: Params }) {
  const { username } = await params;
  const [settings, profile] = await Promise.all([getSettings(), getPublicProfile(username)]);

  if (!settings.profilesPublic) notFound();
  if (!profile) notFound();

  return (
    <div className="relative isolate">
      <div className="absolute inset-x-0 top-0 -z-10 h-56 overflow-hidden">
        {profile.bannerUrl && (
          <Image
            src={profile.bannerUrl}
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-25"
          />
        )}
        <div aria-hidden className="absolute inset-0 bg-linear-to-b from-bloom-500/10 to-canvas" />
      </div>

      <div className="container-content pt-8 pb-20">
        <Breadcrumbs crumbs={[{ label: profile.displayName }]} />

        <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
          <Avatar name={profile.displayName} src={profile.avatarUrl} size="2xl" ring />

          <div className="min-w-0 flex-1">
            <h1 className="text-3xl leading-tight sm:text-4xl">{profile.displayName}</h1>
            <p className="mt-1 text-sm text-mist-500">@{profile.username}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/*
                A szerepkör csak akkor jelenik meg, ha nem a sima tagé. Minden
                fiókra kiírni, hogy „Tag", zajt csinál abból, ami alapértelmezés.
              */}
              {profile.role.key !== 'member' && (
                <span
                  className="inline-flex items-center rounded-full border border-ink-700 bg-ink-900/60 px-3 py-1 text-2xs font-medium"
                  style={{ color: profile.role.color ?? 'var(--color-mist-300)' }}
                >
                  {profile.role.name}
                </span>
              )}

              {profile.teamMember?.isActive && (
                <Link
                  href={`/csapat/${profile.teamMember.slug}`}
                  className="inline-flex items-center rounded-full border border-bloom-500/40 bg-bloom-500/10 px-3 py-1 text-2xs font-medium text-bloom-300 transition-colors hover:border-bloom-400"
                >
                  Csapattag — profil megtekintése
                </Link>
              )}
            </div>
          </div>
        </header>

        {profile.bio && (
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-mist-300">{profile.bio}</p>
        )}

        <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-ink-800 pt-6">
          <div>
            <dt className="flex items-center gap-1.5 text-2xs tracking-wide text-mist-500 uppercase">
              <CalendarDays className="size-3.5" aria-hidden />
              Csatlakozott
            </dt>
            <dd className="mt-1 text-sm font-semibold text-mist-100">
              {formatDate(profile.createdAt)}
            </dd>
          </div>

          <div>
            <dt className="flex items-center gap-1.5 text-2xs tracking-wide text-mist-500 uppercase">
              <MessageSquare className="size-3.5" aria-hidden />
              Hozzászólás
            </dt>
            <dd className="nums mt-1 text-sm font-semibold text-mist-100">
              {profile._count.comments}
            </dd>
          </div>
        </dl>

        {profile.comments.length > 0 && (
          <section aria-labelledby="comments" className="mt-12">
            <h2 id="comments" className="mb-5 text-xl">
              Legutóbbi hozzászólások
            </h2>

            <ul className="space-y-3">
              {profile.comments.map((comment) => {
                /*
                  A hozzászólás három helyen születhetett; mindegyikhez más
                  útvonal és más cím tartozik. Ha egyik sincs meg — mert a cél
                  azóta törlődött —, a hozzászólás megmarad, csak link nélkül.
                */
                const target = comment.episode
                  ? {
                      href: `/projektek/${comment.episode.project.slug}/${formatEpisodeNumber(comment.episode.number.toString())}`,
                      label: `${comment.episode.project.title} — ${formatEpisodeNumber(comment.episode.number.toString())}. rész`,
                    }
                  : comment.project
                    ? {
                        href: `/projektek/${comment.project.slug}`,
                        label: comment.project.title,
                      }
                    : comment.newsPost
                      ? { href: `/hirek/${comment.newsPost.slug}`, label: comment.newsPost.title }
                      : null;

                return (
                  <li
                    key={comment.id}
                    className="rounded-xl border border-ink-800 bg-ink-900/40 px-4 py-3.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xs">
                      {target ? (
                        <Link
                          href={target.href}
                          className="min-w-0 truncate font-medium text-bloom-300 underline-offset-4 hover:underline"
                        >
                          {target.label}
                        </Link>
                      ) : (
                        <span className="text-mist-600">Törölt tartalom</span>
                      )}
                      <time
                        dateTime={new Date(comment.createdAt).toISOString()}
                        className="text-mist-600"
                      >
                        {formatRelative(comment.createdAt)}
                      </time>
                    </div>

                    <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-mist-300">
                      {truncate(comment.body, 300)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
