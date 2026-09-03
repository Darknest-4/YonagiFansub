import { z } from 'zod';
import { cuid, hexColor, optionalText, slug, text } from '@/shared/validation/common';

/**
 * Videóforrások és szolgáltatók bemenetei.
 *
 * Ez a séma többet csinál, mint alakellenőrzést: a `storageKey` mintája
 * biztonsági határ, a `superRefine` pedig azt hozza előre a mentés pillanatába,
 * ami különben csak lejátszáskor derülne ki, egy értelmezhetetlen hibaüzenettel.
 */

/**
 * A storage key, not a URL.
 *
 * The pattern is deliberately strict: lowercase-ish path segments, no leading
 * slash, no `..`, no scheme. This value is handed to the media driver, so
 * anything that could resolve outside the storage root has to be impossible to
 * express, not merely unlikely.
 */
export const storageKey = z
  .string()
  .trim()
  .min(3, 'Add meg a tárolási kulcsot.')
  .max(512, 'Túl hosszú kulcs.')
  .regex(
    /^(?!\/)(?!.*\.\.)[A-Za-z0-9._\-]+(?:\/[A-Za-z0-9._\-]+)*\.m3u8$/,
    'Egy .m3u8 lejátszási lista kulcsa kell, pl. video/yoru-01/master.m3u8',
  );

export const videoProviderWriteSchema = z.object({
  slug,
  name: text(2, 60, 'A név'),
  kind: z.enum(['HLS_PROXY', 'DIRECT_FILE', 'EMBED']).default('EMBED'),
  /**
   * The `{id}` placeholder is required for embeds: a template without it would
   * point every source at the same video, which is a mistake worth catching at
   * save time rather than at playback.
   */
  embedTemplate: z
    .string()
    .trim()
    .url('Érvényes URL legyen.')
    .max(500)
    .refine((value) => value.includes('{id}'), 'Tartalmaznia kell az {id} helyőrzőt.')
    .nullish(),
  urlPatterns: z
    .array(
      z
        .string()
        .trim()
        .min(3)
        .max(300)
        .refine((value) => {
          try {
            new RegExp(value);
            return true;
          } catch {
            return false;
          }
        }, 'Érvénytelen reguláris kifejezés.'),
    )
    .max(10)
    .default([]),
  domains: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Domain legyen, séma nélkül (pl. pelda.hu).'),
    )
    .max(20)
    .default([]),
  allowPopups: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
  /** Alacsonyabb szám előbb; a feloldó elsődleges rendezése. */
  priority: z.coerce.number().int().min(0).max(9999).default(100),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  color: hexColor.nullish(),
  notes: optionalText(500),
});

export const videoWriteSchema = z
  .object({
    episodeId: cuid,
    kind: z.enum(['HLS_PROXY', 'DIRECT_FILE', 'EMBED']).default('HLS_PROXY'),
    providerId: cuid.nullish(),
    /** HLS_PROXY only. */
    masterKey: storageKey.nullish(),
    /** EMBED only — the provider's file id, or a pasted URL to extract it from. */
    externalId: optionalText(200),
    /** DIRECT_FILE only. */
    sourceUrl: z.string().trim().url('Érvényes URL legyen.').max(2000).nullish(),
    proxied: z.boolean().default(false),
    allowPopups: z.boolean().nullish(),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
    label: optionalText(60),
    resolution: z.enum(['SD_360P', 'SD_480P', 'HD_720P', 'FHD_1080P', 'QHD_1440P', 'UHD_2160P']),
    durationSec: z.coerce.number().int().min(0).max(86_400).nullish(),
    /** Névleges bitráta kbps-ben. Azonos minőségnél a feloldó ezzel dönt. */
    bitrateKbps: z.coerce.number().int().min(1).max(200_000).nullish(),
    /** Maga a stream vált-e minőséget (HLS master playlist). */
    isAdaptive: z.boolean().default(false),
    requiresAuth: z.boolean().default(false),
    status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  })
  /*
    Each kind needs a different field, and a source missing its own is one that
    fails at playback with a confusing message. Caught here, the error lands on
    the field the person was actually meant to fill in.
  */
  .superRefine((value, ctx) => {
    if (value.kind === 'HLS_PROXY' && !value.masterKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['masterKey'],
        message: 'Saját tárolós forráshoz kötelező a tárolási kulcs.',
      });
    }
    if (value.kind === 'EMBED') {
      if (!value.providerId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['providerId'],
          message: 'Beágyazott forráshoz válassz szolgáltatót.',
        });
      }
      if (!value.externalId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['externalId'],
          message: 'Illeszd be a videó linkjét vagy azonosítóját.',
        });
      }
    }
    if (value.kind === 'DIRECT_FILE' && !value.sourceUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceUrl'],
        message: 'Külső fájlhoz kötelező az URL.',
      });
    }
  });

export type VideoWriteInput = z.infer<typeof videoWriteSchema>;
export type VideoProviderWriteInput = z.infer<typeof videoProviderWriteSchema>;

/**
 * A lejátszási terv kérésének alakja.
 *
 * A `exclude` a lejátszó saját kudarcait hozza: egy forrás lehet globálisan
 * egészséges, miközben ennek az egy nézőnek nem megy. Korlátozott hosszú, hogy
 * a lista ne váljon nyitott bemenetté.
 */
export const playbackQuerySchema = z.object({
  quality: z.enum(['AUTO', '2160p', '1440p', '1080p', '720p', '480p', '360p']).default('AUTO'),
  exclude: z
    .string()
    .max(600)
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((part) => part.trim())
            .filter((part) => /^[a-z0-9]{20,32}$/i.test(part))
            .slice(0, 12)
        : [],
    ),
});
