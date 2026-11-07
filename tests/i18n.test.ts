import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../src/i18n/en';
import { he } from '../src/i18n/he';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('i18n catalog', () => {
  it('Hebrew covers every English key with a non-empty string', () => {
    for (const k of Object.keys(en)) expect((he as Record<string, string>)[k], k).toBeTruthy();
  });
  it('every t("…") key used in the UI exists', () => {
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([a-z0-9.]+)'/gi)) expect(en, `${f}: ${m[1]}`).toHaveProperty([m[1]]);
    }
  });
  it('no UI text is hard-coded in components', () => {
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8');
      // JSX text nodes containing letters (Latin or Hebrew)
      const hits = [...src.matchAll(/>\s*([^<>{}\n]*[A-Za-z֐-׿][^<>{}\n]*)\s*</g)]
        .map((m) => m[1].trim())
        .filter((s) => s && !/^(mm|Ø)$/.test(s) && !/[=;()]/.test(s));
      expect(hits, f).toEqual([]);
      // literal user-facing attributes
      const attrs = [...src.matchAll(/\b(title|placeholder|aria-label|alt)="([^"]*[A-Za-z֐-׿][^"]*)"/g)].map((m) => m[0]).filter((a) => !/^title="(O|Ctrl\+Z|Ctrl\+Shift\+Z)"$/.test(a));
      expect(attrs, f).toEqual([]);
    }
  });
});
