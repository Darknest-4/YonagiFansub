import { describe, expect, it } from 'vitest';
import { toTsQuery } from '@/features/search/fts';

/**
 * `toTsQuery` builds a string that is interpolated into `to_tsquery()`, so its
 * sanitising is a security boundary, not a nicety. These tests pin that boundary
 * from both sides: what has to survive, and what must not.
 */
describe('toTsQuery', () => {
  it('a záró szót prefixként kezeli, a korábbiakat nem', () => {
    expect(toTsQuery('yoru no shizuku')).toBe('yoru & no & shizuku:*');
  });

  it('egyetlen szó is prefix', () => {
    expect(toTsQuery('shiok')).toBe('shiok:*');
  });

  it('az ékezetes betűket megtartja — az unaccent az adatbázis dolga', () => {
    expect(toTsQuery('időzítő')).toBe('időzítő:*');
  });

  it('a számokat megtartja', () => {
    expect(toTsQuery('gundam 00')).toBe('gundam & 00:*');
  });

  // Every tsquery operator, plus the characters that would end the literal.
  it.each([
    ['Re:Zero', 're & zero:*'],
    ['a & b', 'a & b:*'],
    ['a | b', 'a & b:*'],
    ['!nem', 'nem:*'],
    ["o'brien", 'o & brien:*'],
    ['a <-> b', 'a & b:*'],
    ['(csoport)', 'csoport:*'],
    ['csillag*', 'csillag:*'],
  ])('a(z) %j operátorait szóhatárrá alakítja', (input, expected) => {
    expect(toTsQuery(input)).toBe(expected);
  });

  it('null, ha nem marad használható szó', () => {
    expect(toTsQuery('!!! ???')).toBeNull();
    expect(toTsQuery('   ')).toBeNull();
    expect(toTsQuery('')).toBeNull();
  });

  it('a kimenetben soha nincs operátor a saját & és :* jelein kívül', () => {
    const output = toTsQuery('a|b !c (d) e:*f <-> g');
    expect(output).not.toBeNull();
    // Strip what we generate ourselves, and nothing dangerous may remain.
    const residue = (output as string).replaceAll(' & ', ' ').replaceAll(':*', '');
    expect(residue).toMatch(/^[\p{L}\p{N} ]+$/u);
  });
});
