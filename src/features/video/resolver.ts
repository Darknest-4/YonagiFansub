/**
 * A forrásfeloldó.
 *
 * Ez a rendszer szíve, és szándékosan **tiszta függvény**: nincs benne
 * adatbázis, nincs hálózat, nincs idő. Amit kap, az egy forráslista és egy
 * kérés; amit ad, az egy sorrend. Így minden kombináció leellenőrizhető
 * adatbázis nélkül, másodpercek alatt — és pont ez az a réteg, ahol a hibák
 * lakni szoktak, mert itt négy szempont verseng egyszerre.
 *
 * ## A sorrend, és miért ez a sorrend
 *
 * A néző azt kérte, hogy „1080p". Ha az első 1080p forrás nem megy, két dolgot
 * lehet tenni: másik szolgáltatót keresni ugyanazon a minőségen, vagy ugyanazt
 * a szolgáltatót alacsonyabb minőségen. **A minőség a fontosabb.** Aki 1080p-t
 * kért, annak a második szolgáltató 1080p-je közelebb van a kéréséhez, mint az
 * elsőnek a 720p-je. Ezért a minőség a külső rendezés, a szolgáltatói prioritás
 * a belső:
 *
 *     A 1080p → B 1080p → C 1080p → A 720p → B 720p → …
 *
 * Ha a kért minőség egyáltalán nincs meg, előbb **lefelé** lépünk (a kisebb
 * mindig lejátszható), és csak utána felfelé. Aki 480p-t kért gyenge neten, azt
 * nem szolgálja ki, ha 1080p-t kap — de ha az az egyetlen, ami van, akkor
 * mégiscsak jobb, mint a semmi.
 *
 * ## Az állapot nem tiltás
 *
 * A hibás forrás nem tűnik el, hanem hátrébb kerül. Kivéve kettőt: ami
 * kimondottan karbantartás alatt van, és ami tartósan halott — azokat kihagyjuk,
 * mert rájuk várni csak időveszteség. Egy „még nem ellenőrzött" forrás viszont
 * teljes értékű: az ismeretlen nem ugyanaz, mint a rossz, és egy frissen
 * felvett forrás nem érdemli meg, hogy az utolsó helyre soroljuk.
 */

/** A felajánlható minőségi fokok, a legjobbtól a leggyengébbig. */
export const QUALITY_STEPS = ['2160p', '1440p', '1080p', '720p', '480p', '360p'] as const;

export type QualityStep = (typeof QUALITY_STEPS)[number];

/** Amit a néző kérhet: egy konkrét fok, vagy „döntsd el te". */
export type QualityRequest = QualityStep | 'AUTO';

/** A Prisma `Resolution` enum és a megjelenített fok megfeleltetése. */
export const RESOLUTION_TO_QUALITY: Record<string, QualityStep> = {
  UHD_2160P: '2160p',
  QHD_1440P: '1440p',
  FHD_1080P: '1080p',
  HD_720P: '720p',
  SD_480P: '480p',
  SD_360P: '360p',
};

export type HealthStatus = 'UNKNOWN' | 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE';

export interface HealthSnapshot {
  status: HealthStatus;
  failureCount: number;
  averageLatencyMs: number | null;
}

/** Amit a feloldó egy forrásról tudni akar — és semmi többet. */
export interface ResolvableSource {
  id: string;
  quality: QualityStep;
  /** Adaptív stream: maga a forrás vált minőséget (HLS master playlist). */
  isAdaptive: boolean;
  bitrateKbps: number | null;
  requiresAuth: boolean;
  /** A forráson belüli kézi sorrend; azonos mindenben ez dönt. */
  sortOrder: number;

  providerId: string | null;
  /** Alacsonyabb előbb. Szolgáltató nélküli (saját) forrás a legelőrébb. */
  providerPriority: number;
  providerEnabled: boolean;

  health: HealthSnapshot;
  providerHealth: HealthSnapshot | null;
}

export interface ResolveRequest {
  quality: QualityRequest;
  isAuthenticated: boolean;
  /**
   * Amit a lejátszó már megpróbált és elbukott ebben a munkamenetben.
   *
   * Nem az adatbázisból jön: egy forrás lehet tökéletesen egészséges globálisan,
   * miközben ennek az egy nézőnek épp nem megy (hálózat, régió, hirdetésblokkoló).
   * A visszaesés ezért a *kliens* tapasztalatát is figyelembe veszi.
   */
  excludeSourceIds?: readonly string[];
}

export interface ResolvedCandidate {
  source: ResolvableSource;
  /** Amit ez a jelölt ténylegesen ad. Eltérhet a kérttől. */
  quality: QualityStep;
  /** Pontosan a kért minőség-e. A felület ebből tudja, kell-e szólnia. */
  isRequestedQuality: boolean;
  /** Miért ide került. Naplóba és az admin felületre. */
  reason: string;
}

/** Kizárás oka — a hívó ezt naplózza, hogy egy üres lánc megmagyarázható legyen. */
export interface ExcludedSource {
  sourceId: string;
  reason: 'maintenance' | 'offline' | 'requires-auth' | 'provider-disabled' | 'client-failed';
}

export interface ResolveOutcome {
  /** A teljes visszaesési lánc, a legjobbtól lefelé. Üres, ha semmi nem játszható. */
  chain: ResolvedCandidate[];
  /** Ami kiesett, és miért. */
  excluded: ExcludedSource[];
  /** Milyen fokok érhetők el egyáltalán — ebből épül a minőségválasztó. */
  availableQualities: QualityStep[];
}

/**
 * Az állapot rangja rendezéshez. Alacsonyabb előbb.
 *
 * Az ismeretlen és az online között **nincs** különbség: egy frissen felvett
 * forrást büntetni azért, mert még nem ért oda az ellenőrző, azt jelentené,
 * hogy minden új forrás rosszabbul indul, mint a régiek.
 */
function healthRank(health: HealthSnapshot): number {
  switch (health.status) {
    case 'ONLINE':
    case 'UNKNOWN':
      return 0;
    case 'DEGRADED':
      return 1;
    default:
      return 2;
  }
}

/** A forrás és a szolgáltatója közül a rosszabbik számít. */
function effectiveHealth(source: ResolvableSource): HealthSnapshot {
  if (!source.providerHealth) return source.health;
  return healthRank(source.providerHealth) > healthRank(source.health)
    ? source.providerHealth
    : source.health;
}

/**
 * Használhatatlan-e egyáltalán.
 *
 * Csak két eset van: kézzel kivett, vagy tartósan halott. Egyik sem azonnali —
 * egyetlen elrontott ellenőrzés nem tünteti el a forrást. Ez a különbség a
 * „hátrébb sorolás" és a „letiltás" között, és a különbség szándékos.
 */
function isUnusable(health: HealthSnapshot): 'maintenance' | 'offline' | null {
  if (health.status === 'MAINTENANCE') return 'maintenance';
  if (health.status === 'OFFLINE') return 'offline';
  return null;
}

/**
 * A minőségi fokok távolsága a kérttől.
 *
 * Előbb lefelé, aztán felfelé: a kisebb felbontás mindig lejátszható, a nagyobb
 * viszont pont annak nem jó, aki azért kért kisebbet, mert szűk a sávszélessége.
 * A `+ QUALITY_STEPS.length` a felfelé lépéseket egységesen a lefelé lépések mögé
 * teszi, akármilyen közel is vannak.
 */
export function qualityDistance(requested: QualityStep, candidate: QualityStep): number {
  const from = QUALITY_STEPS.indexOf(requested);
  const to = QUALITY_STEPS.indexOf(candidate);
  if (from === -1 || to === -1) return Number.MAX_SAFE_INTEGER;

  // A tömb a legjobbtól a leggyengébbig halad, tehát a nagyobb index gyengébb.
  const steps = to - from;
  return steps >= 0 ? steps : QUALITY_STEPS.length + Math.abs(steps);
}

function describe(candidate: ResolvableSource, distance: number): string {
  const health = effectiveHealth(candidate);
  const parts: string[] = [];

  if (distance === 0) parts.push('a kért minőség');
  else if (distance < QUALITY_STEPS.length) parts.push('alacsonyabb minőség');
  else parts.push('magasabb minőség');

  if (candidate.isAdaptive) parts.push('adaptív');
  if (health.status === 'DEGRADED') parts.push('akadozó');
  if (health.status === 'UNKNOWN') parts.push('még nem ellenőrzött');

  return parts.join(', ');
}

/**
 * A visszaesési lánc összeállítása.
 *
 * A kimenet mindig teljes lánc, nem egyetlen győztes: a lejátszó hiba esetén a
 * következőre lép anélkül, hogy újra kérdezne a szervertől. Egy második
 * körbefordulás azt jelentené, hogy a néző kétszer néz egy pörgő ikont.
 */
export function resolvePlaybackChain(
  sources: readonly ResolvableSource[],
  request: ResolveRequest,
): ResolveOutcome {
  const excluded: ExcludedSource[] = [];
  const clientFailed = new Set(request.excludeSourceIds ?? []);

  const usable = sources.filter((source) => {
    if (!source.providerEnabled) {
      excluded.push({ sourceId: source.id, reason: 'provider-disabled' });
      return false;
    }
    if (source.requiresAuth && !request.isAuthenticated) {
      excluded.push({ sourceId: source.id, reason: 'requires-auth' });
      return false;
    }
    const unusable = isUnusable(effectiveHealth(source));
    if (unusable) {
      excluded.push({ sourceId: source.id, reason: unusable });
      return false;
    }
    if (clientFailed.has(source.id)) {
      excluded.push({ sourceId: source.id, reason: 'client-failed' });
      return false;
    }
    return true;
  });

  /*
    Az elérhető fokok listája a **kizárások után** áll össze.

    Fölajánlani egy minőséget, ami mögött nincs játszható forrás, rosszabb, mint
    nem fölajánlani: a néző átkapcsol rá, és fekete képet kap.
  */
  const availableQualities = QUALITY_STEPS.filter((step) =>
    usable.some((source) => source.quality === step),
  );

  if (usable.length === 0) return { chain: [], excluded, availableQualities };

  /*
    „Auto" esetén nincs kért fok, tehát nincs mihez képest távolságot mérni.
    Ilyenkor az adaptív forrás nyer: az tud a hálózathoz igazodni, ami pontosan
    az, amit az „Auto" ígér. Ha nincs adaptív, a legjobb elérhető fok a
    kiindulópont, és onnan esik vissza a lánc.
  */
  const anchor: QualityStep =
    request.quality === 'AUTO'
      ? (usable.find((source) => source.isAdaptive)?.quality ??
        availableQualities[0] ??
        '1080p')
      : request.quality;

  const ranked = [...usable].sort((a, b) => {
    if (request.quality === 'AUTO') {
      // Adaptív előre: egy master playlist önmagában megoldja a minőségválasztást.
      const adaptive = Number(b.isAdaptive) - Number(a.isAdaptive);
      if (adaptive !== 0) return adaptive;
    }

    const distance = qualityDistance(anchor, a.quality) - qualityDistance(anchor, b.quality);
    if (distance !== 0) return distance;

    const priority = a.providerPriority - b.providerPriority;
    if (priority !== 0) return priority;

    const health = healthRank(effectiveHealth(a)) - healthRank(effectiveHealth(b));
    if (health !== 0) return health;

    /*
      Azonos minőség, azonos szolgáltató, azonos állapot: az alacsonyabb bitráta
      hamarabb indul és ritkábban akad meg. Ismeretlen bitráta nem előny és nem
      hátrány — az ilyen sorok a kézi sorrendre esnek vissza.
    */
    if (a.bitrateKbps !== null && b.bitrateKbps !== null && a.bitrateKbps !== b.bitrateKbps) {
      return a.bitrateKbps - b.bitrateKbps;
    }

    return a.sortOrder - b.sortOrder;
  });

  const chain = ranked.map((source) => {
    const distance = qualityDistance(anchor, source.quality);
    return {
      source,
      quality: source.quality,
      isRequestedQuality: request.quality === 'AUTO' || distance === 0,
      reason: describe(source, distance),
    };
  });

  return { chain, excluded, availableQualities };
}
