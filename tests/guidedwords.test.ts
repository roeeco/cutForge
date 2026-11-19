// Guided's words (milestone 105, GUIDED_MODE.md §3.6): the interface under src/guided/ speaks in its own
// words (g.*) or a short list of shared ones, and never names the workshop's machinery. Guided stays apart:
// nothing outside src/guided/ imports it except App.tsx, lazily.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../src/i18n/en';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

/** Prefixes Guided may share with the other levels. */
// conn.: the corner lists folded under *More about this box* (GUIDED_MODE.md §4, owner call 4a)
const SHARED = ['g.', 'conn.', 'obj.', 'mission.', 'goal.', 'mat.', 'sticker.', 'lid.kind.', 'mode.', 'unit.', 'lang.', 'lib.copySuffix', 'err.', 'dlg.openFailed'];
/** Words a beginner never meets in Guided. */
const BANNED = /\b(joint|kerf|clearance|extrude|footprint|tray|panel|edge|grow|offset|nominal|compensat|DXF|SVG|LightBurn|snap|template)/i;
/** Guided strings allowed to use one of those words (none yet). */
const ALLOWED = new Set<string>([]);

describe("Guided's words", () => {
  const guided = files('src/guided');
  it('every key Guided asks for is its own or a shared one', () => {
    expect(guided.length).toBeGreaterThan(3);
    const bad: string[] = [];
    for (const f of guided) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*[`'"]([a-zA-Z0-9.]+)/g)) if (!SHARED.some((p) => m[1].startsWith(p))) bad.push(`${f}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });

  it('no English g.* string names the machinery', () => {
    const bad = Object.entries(en).filter(([k, v]) => k.startsWith('g.') && !ALLOWED.has(k) && BANNED.test(v));
    expect(bad).toEqual([]);
  });
});

describe('Guided stays apart', () => {
  it('only App.tsx imports src/guided/, and lazily', () => {
    const outside = files('src').filter((f) => !f.startsWith(join('src', 'guided')));
    const hits = outside.filter((f) => /from '\.{1,2}\/(\.\.\/)*guided\//.test(readFileSync(f, 'utf8')) || /import\('\.\/guided\//.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual(['src/App.tsx']);
    expect(readFileSync('src/App.tsx', 'utf8')).not.toMatch(/from '\.\/guided\//);
  });

  it("Guided never mounts the other levels' cards and bars", () => {
    for (const f of files('src/guided')) expect(readFileSync(f, 'utf8'), f).not.toMatch(/from '\.\.\/ui\/(Inspector|Toolbar|TopBar|StartScreen|DesignSettings|Selection|MultiPanel)'|from '\.\.\/easy\/QuickRail'/);
  });
});
