import 'server-only';
import { db } from '@/infrastructure/db';
import { requirePublishedProject } from '@/features/projects/queries';
import {
  resolveWatchlistStatus,
  type WatchlistSignals,
  type WatchlistStatus,
} from '@/features/watch/watchlist-rules';

/**
 * A nézési lista adatbázis-oldala.
 *
 * A szabálykészlet — hogy mi számít „nézem"-nek, „befejezett"-nek és miért nem
 * automatikus a „tervezett" — a `lib/watchlist.ts`-ben lakik, tiszta
 * függvényként. Itt csak a jelek összegyűjtése van, és az, hogy a kézi jelölés
 * hova kerül.
 */

export interface WatchlistItem {
  status: WatchlistStatus;
  releasedEpisodes: number;
  completedEpisodes: number;
  /** Hol tart, százalékban. `null`, ha még nincs megjelent rész. */
  percent: number | null;
  markedAt: Date | null;
  project: {
    id: string;
    slug: string;
    title: string;
    titleNative: string | null;
    coverImageUrl: string | null;
    accentColor: string | null;
    status: string;
    type: string;
  };
}

/**
 * Egyetlen projekt állapota egy nézőnél — a projektoldal kapcsolójához.
 *
 * Három számláló egy lekérdezésben. Külön-külön kérdezni háromszor annyi
 * körbefordulás lenne ugyanazért a válaszért.
 */
export async function getProjectWatchState(
  userId: string,
  projectId: string,
): Promise<{ status: WatchlistStatus | null; mark: 'PLANNED' | 'DROPPED' | null }> {
  const [mark, releasedEpisodes, progress] = await Promise.all([
    db.watchlistMark.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { kind: true },
    }),
    db.episode.count({ where: { projectId, deletedAt: null, status: 'RELEASED' } }),
    db.watchProgress.findMany({
      where: { userId, episode: { projectId, deletedAt: null, status: 'RELEASED' } },
      select: { completed: true },
    }),
  ]);

  const signals: WatchlistSignals = {
    mark: mark?.kind ?? null,
    releasedEpisodes,
    startedEpisodes: progress.length,
    completedEpisodes: progress.filter((row) => row.completed).length,
  };

  return { status: resolveWatchlistStatus(signals), mark: signals.mark };
}

/**
 * A teljes lista egy nézőnek.
 *
 * A jelöléseket és az előrehaladást is be kell hozni, mert a lista tagjai a
 * kettő **uniójából** állnak: egy tervezett sorozathoz nincs előrehaladás, egy
 * végignézetthez pedig lehet, hogy sosem volt jelölés.
 */
export async function getWatchlist(userId: string): Promise<WatchlistItem[]> {
  const projectSelect = {
    id: true,
    slug: true,
    title: true,
    titleNative: true,
    coverImageUrl: true,
    accentColor: true,
    status: true,
    type: true,
    _count: { select: { episodes: { where: { deletedAt: null, status: 'RELEASED' as const } } } },
  };

  const [marks, progress] = await Promise.all([
    db.watchlistMark.findMany({
      where: { userId, project: { deletedAt: null, publishStatus: 'PUBLISHED' } },
      select: { kind: true, updatedAt: true, project: { select: projectSelect } },
    }),
    db.watchProgress.findMany({
      where: {
        userId,
        episode: {
          deletedAt: null,
          status: 'RELEASED',
          project: { deletedAt: null, publishStatus: 'PUBLISHED' },
        },
      },
      select: {
        completed: true,
        updatedAt: true,
        episode: { select: { project: { select: projectSelect } } },
      },
    }),
  ]);

  type Row = (typeof marks)[number]['project'];
  const projects = new Map<string, Row>();
  const counters = new Map<string, { started: number; completed: number; touched: Date | null }>();
  const markByProject = new Map<string, { kind: 'PLANNED' | 'DROPPED'; at: Date }>();

  for (const row of marks) {
    projects.set(row.project.id, row.project);
    markByProject.set(row.project.id, { kind: row.kind, at: row.updatedAt });
  }

  for (const row of progress) {
    const project = row.episode.project;
    projects.set(project.id, project);

    const current = counters.get(project.id) ?? { started: 0, completed: 0, touched: null };
    current.started += 1;
    if (row.completed) current.completed += 1;
    // A legutóbbi mozgás a projekten — ez rendezi a listát.
    if (!current.touched || row.updatedAt > current.touched) current.touched = row.updatedAt;
    counters.set(project.id, current);
  }

  const items: WatchlistItem[] = [];

  for (const [projectId, project] of projects) {
    const counter = counters.get(projectId) ?? { started: 0, completed: 0, touched: null };
    const mark = markByProject.get(projectId) ?? null;
    const releasedEpisodes = project._count.episodes;

    const status = resolveWatchlistStatus({
      mark: mark?.kind ?? null,
      releasedEpisodes,
      startedEpisodes: counter.started,
      completedEpisodes: counter.completed,
    });

    if (!status) continue;

    items.push({
      status,
      releasedEpisodes,
      completedEpisodes: counter.completed,
      percent:
        releasedEpisodes > 0
          ? Math.min(100, Math.round((counter.completed / releasedEpisodes) * 100))
          : null,
      // A későbbi a kettő közül: a jelölés vagy az utolsó nézés.
      markedAt:
        counter.touched && mark
          ? counter.touched > mark.at
            ? counter.touched
            : mark.at
          : (counter.touched ?? mark?.at ?? null),
      project: {
        id: project.id,
        slug: project.slug,
        title: project.title,
        titleNative: project.titleNative,
        coverImageUrl: project.coverImageUrl,
        accentColor: project.accentColor,
        status: project.status,
        type: project.type,
      },
    });
  }

  // Legutóbb mozgatott elöl. Aki tegnap nézett valamit, azt keresi elsőként.
  return items.sort((a, b) => (b.markedAt?.getTime() ?? 0) - (a.markedAt?.getTime() ?? 0));
}

/**
 * A kézi jelölés beállítása vagy törlése.
 *
 * `null` a törlés — a néző visszavonja a „tervezett"/„elhagyott" állítást. Ez
 * nem tünteti el a projektet a listáról, ha van rajta előrehaladás: a „nézem"
 * abból jön, nem innen.
 */
export async function setWatchlistMark(
  userId: string,
  projectId: string,
  kind: 'PLANNED' | 'DROPPED' | null,
): Promise<{ status: WatchlistStatus | null; mark: 'PLANNED' | 'DROPPED' | null }> {
  await requirePublishedProject(projectId);

  if (kind === null) {
    // `deleteMany`, nem `delete`: a nem létező sor törlése nem hiba, hanem a
    // kért végállapot.
    await db.watchlistMark.deleteMany({ where: { userId, projectId } });
  } else {
    await db.watchlistMark.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: { userId, projectId, kind },
      update: { kind },
    });
  }

  return getProjectWatchState(userId, projectId);
}
