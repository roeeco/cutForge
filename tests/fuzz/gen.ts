// Seeded random design generator for the output-pipeline fuzzers.
import { readFileSync } from 'node:fs';
import { FONTS, registerFont } from '../../src/text/fonts';
import type { Design, MaterialProfile } from '../../src/model/types';
import { MATERIALS } from '../../src/model/materials';
import { addDetail, addPolygonPanel, addRootPanel, addText, addTray, createDesign, growPanel, regularPolygon, setConstruction, setPanelMaterial, solve, addPathShape } from '../../src/model/ops';
import { STICKERS } from '../../src/easy/stickers';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type R = ReturnType<typeof rng>;
export function rng(seed: number) {
  const f = mulberry32(seed);
  const r = {
    f,
    num: (a: number, b: number) => a + (b - a) * f(),
    int: (a: number, b: number) => Math.floor(a + (b - a + 1) * f()),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(f() * xs.length)],
    chance: (p: number) => f() < p,
  };
  return r;
}

/** Make Math.random deterministic (ids from newId). */
export function seedMath(seed: number) {
  const f = mulberry32(seed ^ 0x9e3779b9);
  Math.random = f;
}

let fontsDone = false;
export function loadFonts() {
  if (fontsDone) return;
  const buf = (f: string) => {
    const b = readFileSync(`public/fonts/${f}`);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  for (const f of FONTS) registerFont(f.id, buf(`${f.file}-hebrew-400-normal.woff`), buf(`${f.file}-latin-400-normal.woff`));
  fontsDone = true;
}

export type GenOpts = { maxRoots?: number; allowHuge?: boolean; materials?: boolean };

/** A random design built from the public ops. Returns a log of what was done (for shrinking by hand). */
export function randomDesign(r: R, o: GenOpts = {}): { d: Design; log: string[] } {
  const log: string[] = [];
  const mat: MaterialProfile = { ...r.pick(MATERIALS) };
  const d = createDesign(mat);
  log.push(`createDesign(${mat.id})`);
  if (r.chance(0.3)) {
    d.sheetMargin = r.pick([0, 1, 5, 10, 30]);
    d.sheetSpacing = r.pick([0, 0.5, 3, 10]);
    log.push(`margin=${d.sheetMargin} spacing=${d.sheetSpacing}`);
  }
  if (r.chance(0.3)) {
    d.allowRotate = true;
    log.push('allowRotate');
  }
  const roots = r.int(1, o.maxRoots ?? 4);
  for (let k = 0; k < roots; k++) {
    const big = o.allowHuge && r.chance(0.15);
    const w = big ? r.num(300, 1200) : r.num(5, 250);
    const h = big ? r.num(300, 1200) : r.num(5, 250);
    const x = r.num(-300, 300), z = r.num(-300, 300);
    let id: string | null;
    if (r.chance(0.7)) {
      id = addRootPanel(d, x, z, w, h);
      log.push(`addRootPanel(${x.toFixed(2)},${z.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)})`);
    } else {
      const n = r.int(3, 9);
      const rad = Math.min(w, h) / 2;
      id = addPolygonPanel(d, x, z, regularPolygon(n, rad));
      log.push(`addPolygonPanel(${n},${rad.toFixed(2)})`);
    }
    if (!id) continue;
    const p = d.panels[id];
    const roll = r.f();
    if (roll < 0.45) {
      const hh = r.num(5, 120);
      const t = addTray(d, id, hh);
      log.push(`addTray(${hh.toFixed(2)}) -> ${t}`);
    } else if (roll < 0.75) {
      const edges = r.int(1, 3);
      for (let e = 0; e < edges; e++) {
        const kind = r.pick(mat.kind === 'plywood' ? (['finger', 'tabslot', 'butt'] as const) : (['fold', 'glue', 'tabslot', 'butt'] as const));
        const hh = r.num(5, 120);
        const ed = r.int(0, 3);
        const g = growPanel(d, id, ed, { height: hh, angle: 90, dir: 'up', kind });
        log.push(`growPanel(e${ed},${kind},${hh.toFixed(2)}) -> ${!!g}`);
      }
    }
    // details
    const nd = r.int(0, 5);
    for (let i = 0; i < nd; i++) {
      const cx = r.num(-20, p.w + 20), cy = r.num(-20, p.h + 20);
      const s = r.pick(['circle', 'rect', 'roundrect', 'text', 'sticker'] as const);
      const op = r.pick(['cut', 'engrave', 'score', 'cut'] as const);
      const sw = r.num(0.5, Math.min(p.w, p.h) * 0.8), sh = r.num(0.5, Math.min(p.w, p.h) * 0.8);
      if (s === 'text') addText(d, id, cx, cy, r.pick(['Hi', 'Box', 'שלום', 'A', 'Noa 3']), op === 'score' ? 'engrave' : op, 'rubik', r.num(3, 20));
      else if (s === 'sticker') addPathShape(d, id, r.pick(STICKERS).polys, cx, cy, sw, sw, op);
      else addDetail(d, id, s, op, cx, cy, sw, sh);
      log.push(`detail(${s},${op},${cx.toFixed(2)},${cy.toFixed(2)},${sw.toFixed(2)},${sh.toFixed(2)})`);
    }
    if (r.chance(0.25)) {
      const q = r.int(2, 5);
      d.pieces[id] = { quantity: q };
      log.push(`quantity=${q}`);
    }
    if (o.materials !== false && r.chance(0.2)) {
      const m2 = r.pick(MATERIALS);
      setPanelMaterial(d, [id], m2);
      log.push(`setPanelMaterial(${m2.id})`);
    }
    if (r.chance(0.08)) {
      setConstruction(d, id, true);
      log.push('setConstruction');
    }
  }
  solve(d);
  return { d, log };
}
