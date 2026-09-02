import { z } from 'zod';

/**
 * A lejátszó jelentése arról, hol tart a néző.
 *
 * A felső korlát nem formalitás: enélkül egy elgépelt vagy szándékosan hamis
 * érték a „hol tartok" listát egy soha véget nem érő epizóddal töltené meg.
 * Egy nap másodpercben bőven elég minden valós hosszhoz.
 */
export const watchProgressSchema = z.object({
  positionSec: z.coerce.number().int().min(0).max(86_400),
  durationSec: z.coerce.number().int().min(0).max(86_400).nullish(),
  completed: z.boolean().optional(),
});

/** Pontozás: egész szám egytől tízig, ahogy az adatbázis-megszorítás is mondja. */
export const ratingSchema = z.object({
  score: z.coerce
    .number()
    .int()
    .min(1, 'A pontszám 1 és 10 között lehet.')
    .max(10, 'A pontszám 1 és 10 között lehet.'),
});
