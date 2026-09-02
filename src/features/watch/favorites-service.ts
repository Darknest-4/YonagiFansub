import 'server-only';
import { db } from '@/infrastructure/db';
import { CACHE_TAGS, invalidate } from '@/infrastructure/cache';
import { requirePublishedProject } from '@/features/projects/queries';

/**
 * Projekt követése.
 *
 * A követés a nézőtől jövő egyetlen olyan jelzés, ami nem az előrehaladásból
 * következik: „szólj, ha jön új rész”. Ezért van külön az értékeléstől és a
 * nézési listától, pedig mindhárom ugyanahhoz a projekthez kapcsolódik.
 */

/**
 * Bekapcsolja a követést, vagy frissíti az értesítési beállítást.
 *
 * `upsert`, nem `create`: a „követem" gomb kétszeri megnyomása, vagy egy
 * megismételt kérés akadozó kapcsolat után, nem hozhat létre második sort és
 * nem billentheti vissza az állapotot.
 */
export async function followProject(
  userId: string,
  projectId: string,
  notify: boolean,
): Promise<{ following: true; notify: boolean }> {
  await requirePublishedProject(projectId);

  await db.favorite.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId, notify },
    update: { notify },
  });

  invalidate(CACHE_TAGS.project(projectId));
  return { following: true, notify };
}

/**
 * A követés visszavonása.
 *
 * `deleteMany`, mert a nem létező sor törlése nem hiba, hanem a kért végállapot
 * — és mert egy már nem publikált projektet is le kell tudni követni.
 */
export async function unfollowProject(
  userId: string,
  projectId: string,
): Promise<{ following: false }> {
  await db.favorite.deleteMany({ where: { userId, projectId } });
  return { following: false };
}
