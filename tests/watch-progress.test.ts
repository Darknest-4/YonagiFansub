import { describe, expect, it } from 'vitest';
import { nextPosition } from '@/server/watch';

/**
 * Melyik pozíció kerüljön be.
 *
 * Egyetlen esetnek kell hibátlannak lennie: az **újratöltésnek**. A frissen
 * betöltött lejátszó nullát jelent, mielőtt bármit visszaállítana, és ha ezt
 * elmentenénk, pont azt törölnénk, amiért az egész funkció készült.
 *
 * A többi eset egyszerű: a néző tudja, hol tart, tehát elhisszük neki.
 */
describe('lejátszási pozíció frissítése', () => {
  it('előrehaladást mindig elfogad', () => {
    expect(nextPosition(120, 300)).toBe(300);
    expect(nextPosition(0, 42)).toBe(42);
  });

  /*
    Ez a teszt a hibáról szól, ami az első változatban benne volt: a nullás
    jelentés „szándékos visszalépésnek" minősült, és letörölte a haladást.
  */
  it('a nullás jelentés nem törli a meglévő haladást', () => {
    expect(nextPosition(400, 0)).toBe(400);
    expect(nextPosition(400, 3)).toBe(400);
  });

  it('a szándékos visszatekerést viszont elfogadja', () => {
    // A néző visszaugrott a felétől a negyedéig — ez az ő döntése.
    expect(nextPosition(800, 200)).toBe(200);
    // Egy kicsi visszalépés is valós: valaki visszanézett egy jelenetet.
    expect(nextPosition(800, 780)).toBe(780);
  });

  it('a legelső jelentés akkor is bekerül, ha kicsi', () => {
    // Nincs mit védeni: még nincs eltárolt haladás.
    expect(nextPosition(0, 2)).toBe(2);
  });
});
