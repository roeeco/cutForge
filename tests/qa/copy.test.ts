// Copy checks (milestone 134, QA_FIX_PLAN.md O3), as a ratchet: `copy-ratchet.json` lists today's offenders, and
// the test fails when a new one appears or when a listed one is fixed (then remove it from the list).
// The fixes: a plural helper and app dialogs (milestones 137 and 143); see REPORT.md H11 and §8.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../../src/i18n/en';
import ratchet from './copy-ratchet.json';

const keys = Object.keys(en) as (keyof typeof en)[];

/** Strings that hedge a plural with "(s)": "1 sheet(s), 5 piece(s)". */
export function hedgedPlurals(): string[] {
  return keys.filter((k) => en[k].includes('(s)')).sort();
}

/**
 * Strings that count something with `{n}` and have no singular to go with them ("1 pieces"): a key counts when `{n}`
 * is followed by a word (not a unit or "of"), and it is fine when a sibling key ends in `one` / `.one` / `1`.
 */
export function countsWithoutSingular(): string[] {
  const counts = keys.filter((k) => /\{n\} (?!mm\b|%|of\b|M3\b)[a-z]/i.test(en[k]));
  const stem = (k: string) => k.replace(/\.(many|other|n|plural)$|(Many|Other)$/, '');
  const hasOne = (k: string) => keys.some((x) => x !== k && x.startsWith(stem(k)) && /(\.one|One|1)$/.test(x));
  return counts.filter((k) => !hasOne(k)).sort();
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

/** The browser's own dialogs (`confirm`, `alert`, `prompt`), as `file: dialog`, instead of the app's. */
export function nativeDialogs(): string[] {
  const out = new Set<string>();
  for (const f of files('src')) {
    const lines = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l));
    for (const l of lines) for (const m of l.matchAll(/(?<![\w.])(?:window\.)?(confirm|alert|prompt)\(/g)) out.add(`${f}: ${m[1]}`);
  }
  return [...out].sort();
}

describe('copy ratchet: the list of offenders only shrinks', () => {
  it('"(s)" in strings', () => expect(hedgedPlurals()).toEqual(ratchet.hedgedPlurals));
  it('counts with no singular', () => expect(countsWithoutSingular()).toEqual(ratchet.countsWithoutSingular));
  it("the browser's own dialogs", () => expect(nativeDialogs()).toEqual(ratchet.nativeDialogs));
});
