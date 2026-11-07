// Bundled fonts (SIL Open Font License, see public/fonts/*-LICENSE.txt).
// Each family is split into a Hebrew and a Latin subset; glyphs are taken
// from whichever subset has them.
import { parse, type Font } from 'opentype.js';

export const FONTS = [
  { id: 'rubik', name: 'Rubik', file: 'rubik' },
  { id: 'frank', name: 'Frank Ruhl Libre', file: 'frank-ruhl-libre' },
  { id: 'amatic', name: 'Amatic SC', file: 'amatic-sc' },
] as const;
export type FontId = (typeof FONTS)[number]['id'];
export const DEFAULT_FONT: FontId = 'rubik';

export type FontPair = { hebrew: Font; latin: Font };
const loaded = new Map<FontId, FontPair>();
const listeners = new Set<() => void>();
let version = 0;

export function getFont(id: FontId): FontPair | undefined {
  return loaded.get(id);
}
export function fontsVersion() {
  return version;
}
export function onFontsChange(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function registerFont(id: FontId, hebrew: ArrayBuffer, latin: ArrayBuffer) {
  loaded.set(id, { hebrew: parse(hebrew), latin: parse(latin) });
  version++;
  listeners.forEach((l) => l());
}

/** Load all bundled fonts in the browser (served from /fonts). Failures leave text un-outlined (and flagged). */
export async function loadBundledFonts(base = import.meta.env?.BASE_URL ?? '/') {
  await Promise.all(
    FONTS.map(async (f) => {
      try {
        const [h, l] = await Promise.all(
          ['hebrew', 'latin'].map((s) => fetch(`${base}fonts/${f.file}-${s}-400-normal.woff`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))),
        );
        registerFont(f.id, h, l);
      } catch {
        /* reported per text shape by validation */
      }
    }),
  );
}
