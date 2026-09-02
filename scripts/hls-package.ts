/**
 * HLS-csomagolás és feltöltés.
 *
 * A védett lejátszás egy HLS-csomagot vár a tárhelyen: egy `master.m3u8`-t, alatta
 * változatonként egy playlistet és a szegmenseket. Eddig ezt kézzel kellett
 * előállítani és feltölteni, ami két hibalehetőség — rossz ffmpeg-paraméterek
 * (nem egy vonalban lévő kulcskockák, ezért akadó minőségváltás), és félig
 * feltöltött csomag, ami a böngészőben 404-ként jelenik meg. Ez a szkript
 * mindkettőt elveszi.
 *
 * **Az enkódolás szándékosan itt fut, nem a szerveren.** Egy epizód átkódolása
 * percekig-órákig tartó, több magot lekötő munka; egy webszolgáltatás (Renderen
 * pláne) ettől használhatatlanná válik, és a futásidő-limitbe is beleszalad. Az
 * enkóder gépén viszont pont az a hardver van, ami ehhez kell. A szerver csak
 * kiszolgál, a csomagot mi hozzuk létre és tesszük a helyére.
 *
 * ## Használat
 *
 *     npm run hls -- --input ./yoru-01.mkv --key video/yoru-no-shizuku/01
 *
 * A kiírt kulcsot (`video/…/master.m3u8`) kell beírni az admin videóforrás
 * űrlapján a „Master playlist kulcsa” mezőbe.
 *
 * Fontosabb kapcsolók:
 *
 *   --ladder 1080,720,480   milyen felbontások készüljenek (a forrásnál nagyobb
 *                           fokokat kihagyja — felskálázni nincs értelme)
 *   --subs felirat.ass      ráégeti a feliratot (libass)
 *   --segment 6             szegmenshossz másodpercben
 *   --preset veryfast       x264 preset; lassabb = kisebb fájl, több idő
 *   --audio-lang hun        melyik hangsávot vigye (alapértelmezés: az első)
 *   --dry-run               csak kiírja, mit csinálna
 *   --keep                  a munkakönyvtárat nem törli
 *
 * ## Automatikus regisztráció
 *
 * A `--register` kapcsolóval a szkript a feltöltés után be is jegyzi a forrást,
 * tehát a kulcsot nem kell kézzel átmásolni az admin űrlapra — ez az a lépés,
 * amiből elgépelt kulcs, és néma lejátszási hiba szokott lenni:
 *
 *     npm run hls -- --input ./yoru-01.mkv --key video/yoru-no-shizuku/01 \
 *       --register --project yoru-no-shizuku --episode 1
 *
 *   --register              regisztrálja a forrást a csomagoláshoz tartozó epizódra
 *   --project <slug>        melyik projekt (a nyilvános oldal slugja)
 *   --episode <szám>        hányadik rész
 *   --publish               azonnal publikálja (alapból piszkozat)
 *   --site <url>            melyik példányra (alapból NEXT_PUBLIC_SITE_URL)
 *   --user <e-mail>         kinek a nevében (alapból YONAGI_EMAIL)
 *
 * A jelszót a szkript a terminálon kéri be, echo nélkül; a `YONAGI_PASSWORD`
 * környezeti változóval kihagyható a kérdés, de tárolni nem kell. A bejelentkező
 * fióknak `episode:write` jogosultsága kell legyen, és a művelet ugyanúgy
 * bekerül az audit naplóba, mint az admin felületről.
 *
 * A tárhelyet ugyanaz a környezet írja le, amit az alkalmazás használ
 * (`MEDIA_DRIVER`, `MEDIA_LOCAL_DIR`, `S3_*`) — a szkript a `.env.local`-t és a
 * `.env`-et is beolvassa, tehát ugyanabból a konfigurációból dolgozik, mint a
 * futó példány.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contentTypeFor } from '../src/features/media/content-type';
import { signRequest } from '../src/infrastructure/storage/s3-signature';
import { registerSource } from './lib/hls-register';

// ── Környezet ────────────────────────────────────────────────────────────────

/**
 * `.env.local`, majd `.env` beolvasása.
 *
 * A Next fejlesztéskor magától megteszi, egy sima Node-szkript viszont nem, és
 * dotenv-et behozni egyetlen fájl kiolvasásáért felesleges. A már beállított
 * változókat nem írja felül: a parancssorból adott érték erősebb, mint a fájl.
 */
async function loadDotEnv(): Promise<void> {
  for (const file of ['.env.local', '.env']) {
    let content: string;
    try {
      content = await readFile(path.resolve(process.cwd(), file), 'utf8');
    } catch {
      continue;
    }

    for (const line of content.split('\n')) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (!key || key in process.env) continue;

      let value = (rawValue ?? '').trim();
      // Idézőjelek lehántása, ahogy a dotenv-formátum kívánja.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

// ── Paraméterek ──────────────────────────────────────────────────────────────

interface Options {
  input: string;
  key: string;
  ladder: number[];
  segment: number;
  preset: string;
  subs: string | null;
  audioLang: string | null;
  dryRun: boolean;
  keep: boolean;
  /** Registration: null when --register was not given. */
  register: {
    projectSlug: string;
    episodeNumber: number;
    publish: boolean;
    baseUrl: string;
    email: string;
    password: string | null;
  } | null;
}

/** Az alapértelmezett minőségi lépcső. A forrásnál magasabb fokok kiesnek. */
const DEFAULT_LADDER = [1080, 720, 480];

/**
 * Bitráták felbontásonként, kbps-ben.
 *
 * Anime-forráshoz hangolva: a rajzolt kép nagy egyszínű felületekkel jóval
 * kevesebb bitet igényel, mint egy élőszereplős felvétel, viszont a lassú
 * átúszásokat és a sávos égboltokat pont a túl alacsony bitráta rontja el
 * legláthatóbban. Ezek az értékek a kettő között állnak.
 */
const BITRATES: Record<number, { video: number; audio: number }> = {
  2160: { video: 14_000, audio: 192 },
  1440: { video: 8_000, audio: 192 },
  1080: { video: 5_000, audio: 160 },
  720: { video: 2_800, audio: 128 },
  480: { video: 1_400, audio: 128 },
  360: { video: 800, audio: 96 },
};

function bitratesFor(height: number): { video: number; audio: number } {
  const known = BITRATES[height];
  if (known) return known;

  // Nem szabványos magasság (pl. 576p): a legközelebbi ismert fok arányosítva.
  const heights = Object.keys(BITRATES).map(Number);
  const nearest = heights.reduce((best, candidate) =>
    Math.abs(candidate - height) < Math.abs(best - height) ? candidate : best,
  );
  const base = BITRATES[nearest]!;
  return {
    video: Math.round((base.video * height) / nearest),
    audio: base.audio,
  };
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith('--')) continue;

    const name = arg.slice(2);
    const next = argv[index + 1];

    if (next === undefined || next.startsWith('--')) {
      flags.add(name);
    } else {
      values.set(name, next);
      index += 1;
    }
  }

  const input = values.get('input');
  const key = values.get('key');

  if (!input || !key) {
    fail(
      'Kötelező: --input <videófájl> és --key <tárhely-előtag>\n' +
        '  Példa: npm run hls -- --input ./yoru-01.mkv --key video/yoru-no-shizuku/01',
    );
  }

  const ladder = (values.get('ladder') ?? DEFAULT_LADDER.join(','))
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry >= 144 && entry <= 4320);

  if (ladder.length === 0) fail('A --ladder értéke nem értelmezhető (pl. 1080,720,480).');

  const segment = Number(values.get('segment') ?? 6);
  if (!Number.isFinite(segment) || segment < 2 || segment > 30) {
    fail('A --segment 2 és 30 másodperc között lehet.');
  }

  return {
    input,
    // A vezető és záró perjel csak elgépelési lehetőség; a kulcs nem kezdődik vele.
    key: key.replace(/^\/+|\/+$/g, ''),
    ladder: [...new Set(ladder)].sort((a, b) => b - a),
    segment,
    preset: values.get('preset') ?? 'veryfast',
    subs: values.get('subs') ?? null,
    audioLang: values.get('audio-lang') ?? null,
    dryRun: flags.has('dry-run'),
    keep: flags.has('keep'),
    register: parseRegister(values, flags),
  };
}

/**
 * A `--register` kapcsoló feldolgozása.
 *
 * A projektet slug + epizódszám azonosítja, nem cuid: ezt a kettőt az enkóder
 * fejből tudja, a cuid-ot a böngésző címsorából kellene kimásolnia — pont az a
 * kézi lépés, amit ez a funkció megszüntet.
 *
 * A jelszó szándékosan lehet hiányzó: ilyenkor a szkript bekéri a terminálon,
 * echo nélkül. Egy alkalmi parancshoz nem kell jelszót fájlba írni.
 */
function parseRegister(values: Map<string, string>, flags: Set<string>): Options['register'] {
  if (!flags.has('register') && !values.has('register')) return null;

  const projectSlug = values.get('project');
  const rawNumber = values.get('episode');

  if (!projectSlug || rawNumber === undefined) {
    fail(
      'A --register mellé kell --project <slug> és --episode <szám>.\n' +
        '  Példa: npm run hls -- --input ./yoru-01.mkv --key video/yoru/01 \\\n' +
        '           --register --project yoru-no-shizuku --episode 1',
    );
  }

  const episodeNumber = Number(rawNumber);
  if (!Number.isFinite(episodeNumber) || episodeNumber < 0) {
    fail(`A --episode nem szám: ${rawNumber}`);
  }

  const baseUrl =
    values.get('site') ?? process.env.YONAGI_API_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '';
  if (!baseUrl) {
    fail(
      'Nem tudom, melyik oldalra regisztráljak.\n' +
        '  Add meg a --site kapcsolóval, vagy állítsd be a NEXT_PUBLIC_SITE_URL-t.',
    );
  }

  const email = values.get('user') ?? process.env.YONAGI_EMAIL ?? '';
  if (!email) {
    fail(
      'Nem tudom, ki nevében regisztráljak.\n' +
        '  Add meg a --user <e-mail> kapcsolóval, vagy állítsd be a YONAGI_EMAIL-t.',
    );
  }

  return {
    projectSlug,
    episodeNumber,
    publish: flags.has('publish'),
    baseUrl,
    email,
    // Csak ha tényleg meg van adva — különben a terminálon kérjük be.
    password: process.env.YONAGI_PASSWORD || null,
  };
}

/**
 * A kulcs-előtag ellenőrzése.
 *
 * A csomag kulcsai ebből épülnek, és ugyanezeket a kulcsokat olvassa vissza a
 * lejátszó proxyja. Egy `..` vagy egy abszolút útvonal itt olyan kulcsot adna,
 * amit a helyi meghajtó a médiakönyvtáron kívülre írna — ezért a szkript nem
 * „megtisztítja”, hanem elutasítja: a csendben átírt kulcs rosszabb, mint a
 * hibaüzenet.
 */
function assertSafeKey(key: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) || key.includes('..') || key.includes('//')) {
    fail(
      `Érvénytelen kulcs: ${key}\n` +
        '  Betű, szám, pont, kötőjel, aláhúzás és perjel használható;\n' +
        '  „..” és üres útvonalelem nem.',
    );
  }
}

// ── Külső parancsok ──────────────────────────────────────────────────────────

function run(
  command: string,
  args: string[],
  { capture = false }: { capture?: boolean } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error(`Nincs telepítve: ${command}`)
          : error,
      );
    });

    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} hibakóddal állt le (${code})\n${stderr.slice(-2000)}`));
    });
  });
}

interface Probe {
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  hasAudio: boolean;
}

async function probe(input: string): Promise<Probe> {
  const raw = await run(
    'ffprobe',
    [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      input,
    ],
    { capture: true },
  );

  const parsed = JSON.parse(raw) as {
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
    }>;
    format?: { duration?: string };
  };

  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  if (!video?.width || !video.height) fail('A bemenetben nincs videósáv.');

  // Az `avg_frame_rate` tört alakban jön ("24000/1001").
  const [num, den] = (video.avg_frame_rate ?? '24/1').split('/').map(Number);
  const fps = den && num ? num / den : 24;

  return {
    width: video.width,
    height: video.height,
    durationSec: Number(parsed.format?.duration ?? 0),
    fps: Number.isFinite(fps) && fps > 0 ? fps : 24,
    hasAudio: Boolean(parsed.streams?.some((stream) => stream.codec_type === 'audio')),
  };
}

// ── Csomagolás ───────────────────────────────────────────────────────────────

/**
 * Az ffmpeg-hívás összeállítása.
 *
 * Két dolog nem opcionális, és mindkettő azért, mert a hiányuk csak lejátszáskor
 * derülne ki:
 *
 * 1. **Egy vonalban lévő kulcskockák.** Minden változatban ugyanoda kell esniük,
 *    különben a lejátszó minőségváltáskor nem tud szegmenshatáron váltani, és a
 *    kép megakad. Ezt a `-force_key_frames` kifejezés és a fix `-g` adja.
 * 2. **`independent_segments`.** Enélkül a lejátszó nem indulhat tetszőleges
 *    szegmensről, ami a tekerést teszi lassúvá.
 *
 * A `-var_stream_map` mondja meg, melyik videó- és hangsáv tartozik egy
 * változathoz; a `%v` helyére a változat sorszáma kerül a fájlneveken belül.
 */
function buildFfmpegArgs(
  options: Options,
  source: Probe,
  rungs: number[],
  outDir: string,
): string[] {
  const gop = Math.round(source.fps * options.segment);

  const filters: string[] = [];
  const split = rungs.map((_, index) => `[v${index}]`).join('');

  // A feliratégetés a szétosztás *előtt* fut le, hogy egyszer kelljen
  // renderelni, ne minden változathoz külön.
  const preface = options.subs
    ? `[0:v]ass=${escapeFilterPath(options.subs)}[subbed];[subbed]split=${rungs.length}${split}`
    : `[0:v]split=${rungs.length}${split}`;
  filters.push(preface);

  rungs.forEach((height, index) => {
    // `-2`: a szélesség az arányból jön, párosra kerekítve — a H.264 páratlan
    // méretet nem fogad el.
    filters.push(`[v${index}]scale=-2:${height}[v${index}out]`);
  });

  const args: string[] = ['-hide_banner', '-y', '-i', options.input];

  args.push('-filter_complex', filters.join(';'));

  rungs.forEach((height, index) => {
    const { video } = bitratesFor(height);
    args.push(
      '-map', `[v${index}out]`,
      `-c:v:${index}`, 'libx264',
      `-b:v:${index}`, `${video}k`,
      `-maxrate:v:${index}`, `${Math.round(video * 1.07)}k`,
      `-bufsize:v:${index}`, `${Math.round(video * 1.5)}k`,
    );
  });

  if (source.hasAudio) {
    const stream = options.audioLang ? `0:a:m:language:${options.audioLang}` : '0:a:0';
    rungs.forEach((height, index) => {
      args.push('-map', stream, `-c:a:${index}`, 'aac', `-b:a:${index}`, `${bitratesFor(height).audio}k`, `-ac:a:${index}`, '2');
    });
  }

  args.push(
    '-preset', options.preset,
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-g', String(gop),
    '-keyint_min', String(gop),
    '-sc_threshold', '0',
    '-force_key_frames', `expr:gte(t,n_forced*${options.segment})`,
  );

  const varStreamMap = rungs
    .map((height, index) =>
      source.hasAudio
        ? `v:${index},a:${index},name:${height}p`
        : `v:${index},name:${height}p`,
    )
    .join(' ');

  args.push(
    '-f', 'hls',
    '-hls_time', String(options.segment),
    '-hls_playlist_type', 'vod',
    '-hls_list_size', '0',
    '-hls_flags', 'independent_segments',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', path.join(outDir, 'v%v', 'seg_%04d.ts'),
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', varStreamMap,
    path.join(outDir, 'v%v', 'index.m3u8'),
  );

  return args;
}

/** Az `ass` szűrő útvonala kettőspontot és vesszőt nem visel el nyersen. */
function escapeFilterPath(input: string): string {
  return `'${path.resolve(input).replace(/\\/g, '/').replace(/'/g, "'\\''").replace(/:/g, '\\:')}'`;
}

// ── Feltöltés ────────────────────────────────────────────────────────────────

/** Rekurzív fájllista, a gyökérhez képesti relatív útvonalakkal. */
async function walk(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await walk(root, relative)));
    else files.push(relative);
  }

  return files.sort();
}

interface Uploader {
  describe(): string;
  upload(relative: string, absolute: string, key: string): Promise<void>;
}

function localUploader(): Uploader {
  const root = path.resolve(process.cwd(), process.env.MEDIA_LOCAL_DIR ?? './storage/uploads');

  return {
    describe: () => `helyi lemez (${root})`,
    async upload(_relative, absolute, key) {
      const target = path.join(root, key);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(absolute, target);
    },
  };
}

/**
 * S3-kompatibilis feltöltő.
 *
 * Ugyanazt az aláírót használja, mint az alkalmazás (`lib/media/s3-signature`),
 * tehát ha a feltöltés itt működik, a szerver konfigurációja is jó — és
 * fordítva. A szegmensek fájlonként mennek ki, `PUT`-tal: egy epizód néhány száz
 * fájl, ami nem indokol többrészes feltöltést.
 */
function s3Uploader(): Uploader {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    fail(
      'MEDIA_DRIVER=s3 mellett kötelező: S3_ENDPOINT, S3_REGION, S3_BUCKET,\n' +
        '  S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.',
    );
  }

  const base = `${endpoint.replace(/\/$/, '')}/${bucket}`;

  return {
    describe: () => `S3 (${base})`,
    async upload(_relative, absolute, key) {
      const body = await readFile(absolute);
      const url = `${base}/${key}`;
      const contentType = contentTypeFor(key) ?? 'application/octet-stream';

      const signed = signRequest({
        method: 'PUT',
        url,
        region,
        accessKeyId,
        secretAccessKey,
        headers: { 'content-type': contentType },
        body,
      });

      const response = await fetch(url, {
        method: 'PUT',
        headers: signed.headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`S3 PUT ${key} → HTTP ${response.status} ${await response.text()}`);
      }
    },
  };
}

// ── Fő folyamat ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await loadDotEnv();

  const options = parseArgs(process.argv.slice(2));
  assertSafeKey(options.key);

  try {
    await stat(options.input);
  } catch {
    fail(`Nincs ilyen fájl: ${options.input}`);
  }

  if (options.subs) {
    try {
      await stat(options.subs);
    } catch {
      fail(`Nincs ilyen feliratfájl: ${options.subs}`);
    }
  }

  const source = await probe(options.input);

  /*
    Felskálázni értelmetlen: egy 720p forrásból készült „1080p” változat
    nagyobb fájl ugyanazzal a képpel. Ha a forrás minden foknál kisebb, marad
    egyetlen változat a saját magasságában.
  */
  const rungs = options.ladder.filter((height) => height <= source.height);
  if (rungs.length === 0) rungs.push(source.height - (source.height % 2));

  const uploader =
    (process.env.MEDIA_DRIVER ?? 'local') === 's3' ? s3Uploader() : localUploader();

  console.log(`\n  Forrás      ${options.input}`);
  console.log(`              ${source.width}×${source.height}, ${source.fps.toFixed(3)} fps, ${Math.round(source.durationSec)} mp${source.hasAudio ? '' : ', hangsáv nélkül'}`);
  if (options.subs) console.log(`  Felirat     ${options.subs} (ráégetve)`);
  console.log(`  Változatok  ${rungs.map((height) => `${height}p`).join(', ')}`);
  console.log(`  Szegmens    ${options.segment} mp`);
  console.log(`  Cél         ${uploader.describe()}`);
  console.log(`  Kulcs       ${options.key}/master.m3u8\n`);

  if (options.dryRun) {
    const workDir = path.join(tmpdir(), 'hls-dry-run');
    console.log('  ffmpeg', buildFfmpegArgs(options, source, rungs, workDir).join(' '), '\n');
    console.log('  (--dry-run: nem futott le semmi)\n');
    return;
  }

  const workDir = await mkdtemp(path.join(tmpdir(), 'yonagi-hls-'));

  try {
    /*
      A `%v` helyére a `-var_stream_map` `name:` értéke kerül, nem a sorszám —
      tehát `v720p`, nem `v0`. A könyvtárakat előre létrehozzuk: az ffmpeg
      egyes építéseiben a HLS muxer nem hozza létre a hiányzó útvonalat, és a
      hiba csak az első szegmens írásakor derülne ki, a kódolás végén.
    */
    for (const height of rungs) {
      await mkdir(path.join(workDir, `v${height}p`), { recursive: true });
    }

    console.log('  Kódolás…\n');
    await run('ffmpeg', buildFfmpegArgs(options, source, rungs, workDir));

    const files = await walk(workDir);
    if (!files.includes('master.m3u8')) {
      throw new Error('Az ffmpeg nem írt master playlistet — a csomag hiányos.');
    }

    console.log(`\n  Feltöltés (${files.length} fájl)…`);

    /*
      A master megy utoljára.

      A lejátszó a masterből indul; ha az már ott van, miközben a szegmensek egy
      része még nem, a néző egy 404-ekkel teli lejátszást kap. Fordított
      sorrendben a legrosszabb eset egy még nem látható epizód.
    */
    const ordered = [...files.filter((file) => file !== 'master.m3u8'), 'master.m3u8'];
    let uploaded = 0;

    for (const relative of ordered) {
      await uploader.upload(relative, path.join(workDir, relative), `${options.key}/${relative}`);
      uploaded += 1;
      if (uploaded % 25 === 0 || uploaded === ordered.length) {
        process.stdout.write(`\r  ${uploaded}/${ordered.length}`);
      }
    }

    console.log('\n');

    const masterKey = `${options.key}/master.m3u8`;

    if (options.register) {
      /*
        A regisztráció a feltöltés *után* fut. Fordítva a forrás egy ideig egy
        még nem létező csomagra mutatna, és egy megszakadt feltöltés otthagyna
        egy lejátszhatatlan bejegyzést — ami rosszabb, mint a semmi.
      */
      await registerSource({
        ...options.register,
        masterKey,
        height: rungs[0] ?? source.height,
        durationSec: source.durationSec,
      });
    } else {
      console.log('  Kész. Az adminban a videóforrás „Master playlist kulcsa” mezőjébe:\n');
      console.log(`      ${masterKey}\n`);
      console.log('  (A --register kapcsolóval ezt a lépést is elvégzi a szkript.)\n');
    }
  } finally {
    if (options.keep) console.log(`  Munkakönyvtár megtartva: ${workDir}\n`);
    else await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
