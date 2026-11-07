// Text to outlines: bidirectional layout (Hebrew right-to-left, mixed with
// English and numbers) and glyph outlines flattened to polygons with a
// declared tolerance, so exported files never need the font.
import bidiFactory from 'bidi-js';
import type { P2 } from '../model/types';
import { getFont, type FontId } from './fonts';

export const TEXT_TOL = 0.02; // mm, curve flattening tolerance for glyphs

const bidi = bidiFactory();
const isHebrew = (ch: string) => /[֐-׿יִ-ﭏ]/.test(ch);

/** Characters in visual (left-to-right display) order. */
export function visualOrder(text: string): string {
  const levels = bidi.getEmbeddingLevels(text);
  const chars = text.split(''); // bidi-js indexes UTF-16 code units
  // Mirror brackets etc. inside right-to-left runs.
  const mirrored = bidi.getMirroredCharactersMap(text, levels.levels);
  mirrored.forEach((ch: string, i: number) => (chars[i] = ch));
  for (const [start, end] of bidi.getReorderSegments(text, levels)) {
    const seg = chars.slice(start, end + 1).reverse();
    chars.splice(start, seg.length, ...seg);
  }
  return chars.join('');
}

export type TextOutline = { polys: P2[][]; minX: number; maxX: number; minY: number; maxY: number; missing: string[] };

const cache = new Map<string, TextOutline | null>();

/**
 * Outline text with letter height `size` (font em size in mm), centred on
 * (0, 0). Returns null when the font is not loaded yet.
 */
export function outlineText(text: string, font: FontId, size: number): TextOutline | null {
  const pair = getFont(font);
  if (!pair) return null;
  const key = `${font}|${size}|${text}`;
  if (cache.has(key)) return cache.get(key)!;
  const vis = visualOrder(text);
  const polys: P2[][] = [];
  const missing: string[] = [];
  let x = 0;
  for (const ch of vis.split('')) {
    const f = isHebrew(ch) ? pair.hebrew : pair.latin;
    let fnt = f;
    let glyph = fnt.charToGlyph(ch);
    if (!glyph || glyph.index === 0) {
      fnt = f === pair.hebrew ? pair.latin : pair.hebrew;
      glyph = fnt.charToGlyph(ch);
    }
    const scale = size / fnt.unitsPerEm;
    if (!glyph || glyph.index === 0) {
      if (ch.trim()) missing.push(ch);
      x += size * 0.3;
      continue;
    }
    const path = glyph.getPath(x, 0, size);
    polys.push(...flattenCommands(path.commands as Cmd[]));
    x += (glyph.advanceWidth ?? fnt.unitsPerEm * 0.5) * scale;
  }
  // y-down font coordinates → y-up, then centre on the outline box
  for (const p of polys) for (const q of p) q.y = -q.y;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of polys)
    for (const q of p) {
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
  if (!polys.length) {
    minX = maxX = minY = maxY = 0;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  for (const p of polys) for (const q of p) (q.x -= cx), (q.y -= cy);
  const out = { polys, minX: minX - cx, maxX: maxX - cx, minY: minY - cy, maxY: maxY - cy, missing };
  cache.set(key, out);
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return out;
}

type Cmd =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' };

/** Bezier commands → closed polygons, chord error ≤ TEXT_TOL. */
export function flattenCommands(cmds: Cmd[], tol = TEXT_TOL): P2[][] {
  const out: P2[][] = [];
  let cur: P2[] = [];
  let p: P2 = { x: 0, y: 0 };
  const close = () => {
    if (cur.length > 2) {
      const a = cur[0], b = cur[cur.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) cur.pop();
      if (cur.length > 2) out.push(cur);
    }
    cur = [];
  };
  const steps = (len: number) => Math.max(1, Math.min(64, Math.ceil(Math.sqrt(len / (8 * tol)))));
  for (const c of cmds) {
    if (c.type === 'M') {
      close();
      p = { x: c.x, y: c.y };
      cur.push(p);
    } else if (c.type === 'L') {
      p = { x: c.x, y: c.y };
      cur.push(p);
    } else if (c.type === 'Q') {
      const n = steps(Math.hypot(c.x1 - p.x, c.y1 - p.y) + Math.hypot(c.x - c.x1, c.y - c.y1));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        cur.push({ x: u * u * p.x + 2 * u * t * c.x1 + t * t * c.x, y: u * u * p.y + 2 * u * t * c.y1 + t * t * c.y });
      }
      p = { x: c.x, y: c.y };
    } else if (c.type === 'C') {
      const n = steps(Math.hypot(c.x1 - p.x, c.y1 - p.y) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        cur.push({
          x: u * u * u * p.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          y: u * u * u * p.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        });
      }
      p = { x: c.x, y: c.y };
    } else close();
  }
  close();
  return out;
}
