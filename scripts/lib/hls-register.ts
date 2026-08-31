import { ApiClient, ApiError, promptPassword } from './api-client';

/**
 * Registering a finished HLS package as a video source, without leaving the
 * terminal.
 *
 * Packaging already knows everything the admin form asks for — the storage key,
 * the top resolution, the duration — and the old workflow was to print those and
 * have somebody retype them into a browser. Retyping a key is exactly the step
 * that produces a source pointing at a package that does not exist, which fails
 * silently until a viewer presses play.
 *
 * ## Why the new source is a draft
 *
 * `videoWriteSchema` defaults `status` to DRAFT and this does not override it
 * unless asked. An encoder finishing a package at 3am has not necessarily
 * decided the episode is released, and a script that publishes on their behalf
 * turns "I packaged this" into "this is live" without anybody saying so.
 * `--publish` is one word for the times when it is.
 */

export interface RegisterOptions {
  baseUrl: string;
  email: string;
  password: string | null;
  projectSlug: string;
  episodeNumber: number;
  masterKey: string;
  height: number;
  durationSec: number;
  publish: boolean;
}

type Resolution = 'SD_480P' | 'HD_720P' | 'FHD_1080P' | 'QHD_1440P' | 'UHD_2160P';

const RESOLUTIONS: Array<[number, Resolution]> = [
  [480, 'SD_480P'],
  [720, 'HD_720P'],
  [1080, 'FHD_1080P'],
  [1440, 'QHD_1440P'],
  [2160, 'UHD_2160P'],
];

/**
 * The enum value for a pixel height.
 *
 * Nearest rather than a lookup, because a source is often not a standard
 * height — 1920×804 letterboxed, or 1440×1080 anamorphic — and the label on a
 * quality picker is an approximation anyway. Refusing to register a package
 * because its height is 816 would be pedantry with a real cost.
 */
export function resolutionFor(height: number): Resolution {
  let best = RESOLUTIONS[0]!;
  for (const candidate of RESOLUTIONS) {
    if (Math.abs(candidate[0] - height) < Math.abs(best[0] - height)) best = candidate;
  }
  return best[1];
}

interface EpisodeLookup {
  id: string;
  number: number;
  title: string | null;
  status: string;
  project: { slug: string; title: string };
  videos: Array<{ id: string; masterKey: string | null; label: string | null; status: string }>;
}

export async function registerSource(options: RegisterOptions): Promise<void> {
  const password =
    options.password ?? (await promptPassword(`  Jelszó (${options.email}): `));

  if (!password) throw new Error('Jelszó nélkül nem lehet bejelentkezni.');

  console.log(`\n  Bejelentkezés — ${options.baseUrl}`);

  let client: ApiClient;
  try {
    client = await ApiClient.login({ baseUrl: options.baseUrl, email: options.email, password });
  } catch (error) {
    throw new Error(
      error instanceof ApiError
        ? `Sikertelen bejelentkezés: ${error.message}`
        : `Nem sikerült elérni az oldalt (${options.baseUrl}): ${String(error)}`,
    );
  }

  const episode = await client
    .get<EpisodeLookup>('/api/v1/admin/episodes', {
      project: options.projectSlug,
      number: String(options.episodeNumber),
    })
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        throw new Error(
          `Nincs ${options.episodeNumber}. epizód a(z) "${options.projectSlug}" projektben.\n` +
            '  Ellenőrizd a --project slugot és a --episode számot az adminban.',
        );
      }
      throw error;
    });

  console.log(`  Epizód      ${episode.project.title} – ${episode.number}. rész`);

  /*
    A package registered twice is the one mistake this feature can newly cause:
    re-running the script after a failed upload would otherwise leave two sources
    pointing at the same key, and the player would silently fall back between
    identical streams. Same key, same episode — say so and stop.
  */
  const duplicate = episode.videos.find((video) => video.masterKey === options.masterKey);
  if (duplicate) {
    console.log(
      `\n  Ez a csomag már regisztrálva van (${duplicate.status.toLowerCase()}).` +
        '\n  A feltöltés frissült, új forrás nem kellett.\n',
    );
    return;
  }

  const created = await client.post<{ id: string; status: string }>('/api/v1/admin/videos', {
    episodeId: episode.id,
    kind: 'HLS_PROXY',
    masterKey: options.masterKey,
    label: `${options.height}p`,
    resolution: resolutionFor(options.height),
    durationSec: Math.round(options.durationSec),
    // Existing sources keep their order; a new package goes to the end rather
    // than displacing whatever the team already chose to play first.
    sortOrder: episode.videos.length,
    ...(options.publish ? { status: 'PUBLISHED' } : {}),
  });

  console.log(
    created.status === 'PUBLISHED'
      ? '\n  Forrás létrehozva és publikálva — az epizód nézhető.\n'
      : '\n  Forrás létrehozva piszkozatként. Az adminban egy kattintás publikálni.\n',
  );
}
