import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { findMediaReferences } from '@/server/media';
import * as make from './factories';

const KEY = 'projects/abc123def456.webp';
const URL_FOR = (key: string) => `https://media.example.test/${key}`;

/**
 * "What still points at this file?"
 *
 * The delete dialog used to warn in prose while the database knew the answer.
 * These pin the answer — including the case that makes the whole check worth
 * having: a URL stored under a *different* base than the one configured today.
 */
describe('médiahivatkozások', () => {
  it('a nem hivatkozott fájlra üres a lista', async () => {
    await make.project({ coverImageUrl: URL_FOR('projects/valami-mas.webp') });

    expect(await findMediaReferences(KEY)).toEqual([]);
  });

  it('a borító és a fejléc két külön használat ugyanazon a projekten', async () => {
    await make.project({
      title: 'Kettős használat',
      coverImageUrl: URL_FOR(KEY),
      bannerImageUrl: URL_FOR(KEY),
    });

    const references = await findMediaReferences(KEY);

    expect(references).toHaveLength(2);
    expect(references.map((reference) => reference.field).sort()).toEqual([
      'borítókép',
      'fejléckép',
    ]);
  });

  it('epizódot, hírt és csapattagot is megtalál', async () => {
    const project = await make.project();
    await make.episode(project.id, { number: 3, thumbnailUrl: URL_FOR(KEY) });
    await make.newsPost({ title: 'Hír a képpel', coverImageUrl: URL_FOR(KEY) });
    await db.teamMember.create({
      data: { slug: 'teszt-tag', name: 'Teszt Tag', avatarUrl: URL_FOR(KEY) },
    });

    const references = await findMediaReferences(KEY);

    expect(references.map((reference) => reference.kind).sort()).toEqual([
      'episode',
      'news',
      'team',
    ]);
    expect(references.find((r) => r.kind === 'episode')?.href).toBe(`/projektek/${project.slug}/3`);
  });

  /**
   * The reason the match is on the key rather than the full URL.
   *
   * `MEDIA_PUBLIC_BASE_URL` changes when a site moves host or switches from the
   * local driver to S3. Matching the exact URL would report "used by nothing"
   * for everything uploaded before the move — the one wrong answer that leads
   * somebody to delete an image that is still on a page.
   */
  it('a régi alap-URL-lel mentett hivatkozást is megtalálja', async () => {
    await make.project({
      title: 'Költözés előtti',
      coverImageUrl: `http://localhost:3000/uploads/${KEY}`,
    });

    const references = await findMediaReferences(KEY);

    expect(references).toHaveLength(1);
    expect(references[0]?.label).toBe('Költözés előtti');
  });

  it('a törölt projekt hivatkozása nem számít', async () => {
    await make.project({ coverImageUrl: URL_FOR(KEY), deletedAt: new Date() });

    expect(await findMediaReferences(KEY)).toEqual([]);
  });

  it('a felhasználói profilkép nem kap linket', async () => {
    await make.user({ displayName: 'Avataros', avatarUrl: URL_FOR(KEY) });

    const references = await findMediaReferences(KEY);

    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({ kind: 'user', label: 'Avataros', href: null });
  });
});
