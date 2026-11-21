// Strip and wrap builders (milestone 156, DIELINE_GENERATOR_ANALYSIS.md §3.1). Two of the seven bodies a preset can
// be made of, over the grow ops every board already uses:
//   a strip  panels in a row, each folded off the one before along a crease: a U liner, a Z profile, an angle guard,
//            an accordion pad (FEFCO 09's inserts, 01's folded sheets);
//   a wrap   a strip whose sections carry end flanges, rising off their two ends to close its sides: a wrapper, a
//            mailer, a book wrap (FEFCO 04).
import type { ConnectionKind, Design } from './types';
import { addRootPanel, connectSeams, growPanel, solve } from './ops';

/**
 * A strip: `widths` across it (the first lying flat), `length` along every crease, and a bend at each crease in
 * degrees (0 flat, 90 square; positive folds up, towards the first panel's top face, negative down). Folded panels are
 * joined by `kind` (a fold). Returns the panels in order, or null when one cannot be grown.
 */
export type StripSpec = { widths: number[]; length: number; bends: number[]; x?: number; z?: number; kind?: ConnectionKind };

export function addStrip(d: Design, s: StripSpec): string[] | null {
  if (!s.widths.length || s.bends.length !== s.widths.length - 1 || s.widths.some((w) => !(w > 0)) || !(s.length > 0)) return null;
  const first = addRootPanel(d, s.x ?? -s.length / 2, s.z ?? s.widths[0] / 2, s.length, s.widths[0]);
  const rest = growChain(d, first, 'e2', s.widths.slice(1).map((w, i) => ({ width: w, bend: s.bends[i] })), s.kind ?? 'fold');
  if (!rest) return null;
  solve(d);
  return [first, ...rest];
}

/** Panels grown one off another from a board's edge: each from the last one's far edge (a grown board's e2). */
function growChain(d: Design, from: string, edge: string, items: { width: number; bend: number }[], kind: ConnectionKind): string[] | null {
  const ids: string[] = [];
  let at = from, e = edge;
  for (const it of items) {
    // positive folds towards the board's top face (a grown board's up is its parent's, turned with it)
    const g = growPanel(d, at, e, { height: it.width, angle: 180 - Math.abs(it.bend), dir: it.bend >= 0 ? 'up' : 'down', kind });
    if (!g) return null;
    ids.push(g.panelId);
    at = g.panelId;
    e = 'e2';
  }
  return ids;
}

/** A section of a wrap: its depth across, its bend from the section before (as a strip's), and the height of the flanges on its two ends (0 or absent: none). */
export type WrapSection = { depth: number; bend: number; flanges?: number };

/**
 * A wrap: a strip of `sections`, each `length` long. Section `root` (default the first) lies flat; those after it
 * fold off its far edge one after another, those before it off its near edge (the nearest first). Sections with
 * `flanges` grow them off both ends at 90°, glued at the corners to the sections beside them. Returns the sections in
 * order and the flanges, or null.
 */
export function addWrap(d: Design, w: { length: number; sections: WrapSection[]; root?: number; x?: number; z?: number }): { sections: string[]; flanges: string[] } | null {
  const r = w.root ?? 0;
  const base = w.sections[r];
  if (!base || w.sections.some((s) => !(s.depth > 0)) || !(w.length > 0)) return null;
  const rootId = addRootPanel(d, w.x ?? -w.length / 2, w.z ?? base.depth / 2, w.length, base.depth);
  const after = growChain(d, rootId, 'e2', w.sections.slice(r + 1).map((s) => ({ width: s.depth, bend: s.bend })), 'fold');
  // before the root, nearest first: each section's bend is to the one after it
  const before = growChain(d, rootId, 'e0', w.sections.slice(0, r).reverse().map((s, i, all) => ({ width: s.depth, bend: (i === 0 ? base : all[i - 1]).bend })), 'fold');
  if (!after || !before) return null;
  const ids = [...before.reverse(), rootId, ...after];
  const flanges: string[] = [];
  w.sections.forEach((s, i) => {
    if (!s.flanges) return;
    // a section's two ends: its side edges
    for (const e of ['e1', 'e3']) {
      const g = growPanel(d, ids[i], e, { height: s.flanges, angle: 90, dir: 'up', kind: 'fold' });
      if (g) flanges.push(g.panelId);
    }
  });
  solve(d);
  // the flanges' corners with the sections beside them: glue flaps (card and corrugated fold them)
  for (const f of flanges) connectSeams(d, f, 'glue');
  solve(d);
  return { sections: ids, flanges };
}
