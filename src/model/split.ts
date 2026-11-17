// Splitting a net into pieces (milestone 69, PACKAGING_PLAN.md §9.1).
//
// A net may be cut at any grown fold, except a closure's hinge and a fold with
// a radius (a band). A cut fold becomes the joint a wall cut as its own piece
// already gets: a glue flap, or for a tray wall the design's wall-to-base joint
// (`ownKind`). Cuts come from three places:
//   - the student's pin on the fold (`Connection.cut`: 'cut' or 'keep');
//   - the app, when a net does not fit its sheet (`Connection.autoCut`): kept
//     until the net would fit whole again, never re-planned behind the
//     student's back (§4.6 rule 5);
//   - *Save material* (`planSaveMaterial`), which proposes cuts that lower the
//     sheets (then the sheet area) the layout takes; applied, they are pins.
import type { Connection, ConnectionKind, Design, P2 } from './types';
import type { Xform2 } from '../geom/types';
import { applyX, composeX, contourArea, flattenContour, IDENTITY, invertPoint } from '../geom/vec';
import { findEdge, panelEdges } from './edges';
import { extrasByPanel } from './geometry';
import { matIdOf, profileOf } from './materials';
import { grownFoldXform, netFolds } from './pieces';
import { constructionSet } from './place';
import { bandOf } from './bands';
import { closureId } from './closures';
import { ownKind } from './flatnet';
import { pack, pieceCopies } from './pack';

export type SplitMode = 'must' | 'save' | 'never';
export const splitMode = (d: Design): SplitMode => d.split ?? 'must';

/** A fold that may be cut: grown, a crease (not a band), not a closure's hinge, both edges there. */
export function canCut(d: Design, c: Connection): boolean {
  if (!c.grown || c.wing || c.broken || !(c.kind === 'fold' || c.split)) return false;
  if ((c.radius ?? 0) > 0 || d.connections[closureId(c.b.panelId)]) return false;
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  if (!A || !B || !findEdge(A, c.a.edge) || !findEdge(B, c.b.edge)) return false;
  return c.split || !bandOf(d, c);
}

/** Is this fold to be cut (the student's pin first)? */
function wantsCut(d: Design, c: Connection): boolean {
  if (c.cut) return c.cut === 'cut';
  return !!c.autoCut && splitMode(d) !== 'never';
}

/** The joint a cut fold's two parts are joined with. */
export function cutKind(d: Design, c: Connection): ConnectionKind {
  // a tray wall: the design's wall-to-base joint; any other grown panel keeps its place on the edge with a glue flap
  return c.trayId ? ownKind(d, c.a.panelId, c.b.panelId) : 'glue';
}

/**
 * During `solve`, once a grown joint's kind is fitted: a fold to be cut takes
 * its cut kind (and is marked `split`).
 */
export function applyCut(d: Design, c: Connection) {
  delete c.split;
  if (c.kind !== 'fold' || !wantsCut(d, c) || !canCut(d, c)) return;
  c.kind = cutKind(d, c);
  c.split = true;
}

// ---------------------------------------------------------------- whole nets

type VFold = { id: string; parent: string; child: string; xf: Xform2 };
/** A net as it would be with every cut fold folded: its panels (from the root) and the folds joining them. */
type Whole = { root: string; panels: { id: string; xf: Xform2; via?: string; parent?: string }[] };

/** The nets with every cut fold folded again (student cuts included). */
function wholeNets(d: Design): Whole[] {
  const folds: VFold[] = [];
  for (const f of netFolds(d)) {
    const xf = f.xf(d);
    if (xf) folds.push({ id: f.id, parent: f.parent, child: f.child, xf });
  }
  for (const c of Object.values(d.connections)) if (c.split && canCut(d, c)) folds.push({ id: c.id, parent: c.a.panelId, child: c.b.panelId, xf: grownFoldXform(d, c) });
  const guides = constructionSet(d);
  const seen = new Set<string>();
  const out: Whole[] = [];
  const grow = (id: string) => {
    const panels: Whole['panels'] = [{ id, xf: IDENTITY }];
    seen.add(id);
    for (let i = 0; i < panels.length; i++)
      for (const f of folds) {
        if (f.parent !== panels[i].id || seen.has(f.child) || guides.has(f.child)) continue;
        panels.push({ id: f.child, xf: composeX(panels[i].xf, f.xf), via: f.id, parent: panels[i].id });
        seen.add(f.child);
      }
    out.push({ root: id, panels });
  };
  for (const id of d.order) if (d.panels[id] && !seen.has(id) && !guides.has(id) && !folds.some((f) => f.child === id)) grow(id);
  for (const id of d.order) if (d.panels[id] && !seen.has(id) && !guides.has(id)) grow(id);
  return out;
}

/** Each panel's outline points (panel-local), with the flaps and tabs joints add to it. */
function panelPoints(d: Design): (id: string) => P2[] {
  const extras = extrasByPanel(d);
  const cache = new Map<string, P2[]>();
  return (id) => {
    let pts = cache.get(id);
    if (!pts) {
      const p = d.panels[id];
      pts = p ? panelEdges(p).map((e) => e.a) : [];
      for (const poly of extras.get(id)?.adds ?? []) pts = pts.concat(poly);
      cache.set(id, pts);
    }
    return pts;
  };
}

export type Part = { root: string; panels: string[]; w: number; h: number; mat: string; via?: string; q: number };

/** The parts a whole net falls into with `cuts` cut, each measured in its own root's frame. */
function partsOf(d: Design, net: Whole, cuts: Set<string>, pts: (id: string) => P2[]): Part[] {
  const parts = new Map<string, Part>();
  const xfOf = new Map(net.panels.map((p) => [p.id, p.xf]));
  const partOf = new Map<string, string>();
  for (const p of net.panels) {
    // a panel reached over a cut fold starts a part; any other is in its parent's
    const parentPart = p.via && !cuts.has(p.via) ? partOf.get(p.parent!) : undefined;
    const r = parentPart ?? p.id;
    partOf.set(p.id, r);
    if (!parts.has(r)) parts.set(r, { root: r, panels: [], w: 0, h: 0, mat: matIdOf(d, r), via: p.via && cuts.has(p.via) ? p.via : undefined, q: Math.max(1, d.pieces[net.root]?.quantity ?? 1) });
    parts.get(r)!.panels.push(p.id);
  }
  for (const part of parts.values()) {
    const rx = xfOf.get(part.root)!;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of part.panels) {
      const xf = xfOf.get(id)!;
      for (const q of pts(id)) {
        const w = invertPoint(rx, applyX(xf, q));
        if (w.x < x0) x0 = w.x;
        if (w.x > x1) x1 = w.x;
        if (w.y < y0) y0 = w.y;
        if (w.y > y1) y1 = w.y;
      }
    }
    part.w = x1 > x0 ? x1 - x0 : 0;
    part.h = y1 > y0 ? y1 - y0 : 0;
  }
  return [...parts.values()];
}

/** How far (mm) a part is from fitting inside its sheet's margin, turned where the grain allows. */
function overflow(d: Design, p: Part): number {
  const m = profileOf(d, p.mat);
  const W = m.sheetW - 2 * d.sheetMargin, H = m.sheetH - 2 * d.sheetMargin;
  const o0 = Math.max(0, p.w - W) + Math.max(0, p.h - H);
  const turn = m.grain === 'none' || !!d.allowRotate;
  return turn ? Math.min(o0, Math.max(0, p.h - W) + Math.max(0, p.w - H)) : o0;
}

/** The folds of a whole net the app may cut (not pinned either way). */
function freeFolds(d: Design, net: Whole): string[] {
  return net.panels.flatMap((p) => {
    const c = p.via ? d.connections[p.via] : undefined;
    return c && !c.cut && canCut(d, c) ? [c.id] : [];
  });
}

const totalOver = (d: Design, parts: Part[]) => parts.reduce((s, p) => s + overflow(d, p), 0);

/** The cuts that make a net fit its sheet, starting from `start` (kept where they still help). */
function fitNet(d: Design, net: Whole, fixed: Set<string>, start: string[], pts: (id: string) => P2[]): string[] {
  const free = freeFolds(d, net);
  let cur = start.filter((id) => free.includes(id));
  const over = (cs: string[]) => totalOver(d, partsOf(d, net, new Set([...fixed, ...cs]), pts));
  const prune = () => {
    // a cut that no longer helps goes
    for (const id of [...cur].sort()) {
      const without = cur.filter((x) => x !== id);
      if (over(without) <= over(cur) + 1e-6) cur = without;
    }
  };
  prune();
  for (let it = 0; it < free.length && over(cur) > 1e-6; it++) {
    let best: { id: string; o: number; big: number } | null = null;
    for (const id of free) {
      if (cur.includes(id)) continue;
      const parts = partsOf(d, net, new Set([...fixed, ...cur, id]), pts);
      const o = totalOver(d, parts);
      const big = Math.max(...parts.map((p) => p.w * p.h));
      if (!best || o < best.o - 1e-6 || (Math.abs(o - best.o) <= 1e-6 && (big < best.big - 1e-6 || (Math.abs(big - best.big) <= 1e-6 && id < best.id)))) best = { id, o, big };
    }
    if (!best || best.o >= over(cur) - 1e-6) break;
    cur = [...cur, best.id];
  }
  prune();
  return cur.sort();
}

/**
 * After a solve: cut nets that do not fit their sheet (and uncut those that
 * fit whole again), unless the design says never. Returns true when it changed
 * a cut (the design is then solved again).
 */
export function fitSplit(d: Design): boolean {
  const mode = splitMode(d);
  const had = Object.values(d.connections).filter((c) => c.autoCut);
  if (mode === 'never') {
    for (const c of had) delete c.autoCut;
    return had.some((c) => c.split);
  }
  const nets = wholeNets(d);
  // the quick look: every net well inside its sheet and nothing cut by the app
  const ring = (id: string) => {
    const p = d.panels[id];
    return p ? panelEdges(p).map((e) => e.a) : [];
  };
  const slack = 40;
  if (!had.length && nets.every((n) => partsOf(d, n, new Set(), ring).every((p) => overflow(d, { ...p, w: p.w + slack, h: p.h + slack }) <= 0))) return false;
  const pts = panelPoints(d);
  const fixed = new Set(Object.values(d.connections).filter((c) => c.cut === 'cut' && c.split).map((c) => c.id));
  const want = new Set<string>();
  for (const net of nets) {
    const start = net.panels.filter((p) => p.via && d.connections[p.via]?.autoCut).map((p) => p.via!);
    for (const id of fitNet(d, net, fixed, start, pts)) want.add(id);
  }
  let changed = false;
  for (const c of Object.values(d.connections)) {
    const w = want.has(c.id);
    if (w && !c.autoCut) (c.autoCut = true), (changed = true);
    else if (!w && c.autoCut) {
      delete c.autoCut;
      // a stale flag on a fold it never cut changes nothing
      if (c.split && !c.cut) changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------- Save material

/** What a layout costs: sheets, the sheet area it takes, pieces, glue joints, cut length. */
export type Yield = { sheets: number; area: number; pieces: number; glue: number };

/** Rough layout of parts as boxes (the bounding-box packer): sheets and the area they take. */
function boxLayout(d: Design, parts: Part[]): { sheets: number; area: number } {
  const copies = parts.flatMap((p) => {
    return Array.from({ length: p.q }, (_, i) => ({ key: `${p.root}#${i}`, pieceKey: p.root, copy: i, contours: [], w: p.w, h: p.h, origin: { x: 0, y: 0 }, panels: [], mat: p.mat }));
  });
  const pl = pack({ ...d, placements: {} }, copies);
  return layoutCost(d, copies, pl);
}

/** Sheets a layout takes and the area it covers (whole sheets, then the used part of each material's last sheet). */
export function layoutCost(d: Design, copies: { key: string; w: number; h: number }[], pl: Record<string, { sheet: number; x: number; y: number; rot: number; mat?: string }>): { sheets: number; area: number } {
  const last = new Map<string, number>();
  for (const p of Object.values(pl)) last.set(p.mat ?? '', Math.max(last.get(p.mat ?? '') ?? 0, p.sheet));
  let sheets = 0, area = 0;
  for (const [mat, n] of last) {
    const m = profileOf(d, mat || undefined);
    sheets += n + 1;
    area += n * m.sheetW * m.sheetH;
    // the used band of the last sheet: from its top edge (the packer fills from the top-left) to the lowest piece
    let low = m.sheetH;
    for (const c of copies) {
      const p = pl[c.key];
      if (!p || (p.mat ?? '') !== mat || p.sheet !== n) continue;
      low = Math.min(low, p.y);
    }
    area += m.sheetW * (m.sheetH - low);
  }
  return { sheets, area };
}

export type SavePlan = {
  /** Folds to cut. */
  cuts: string[];
  before: Yield;
  after: Yield;
};

/** Glue joints (and other joints that are assembly work, not folds) in a design. */
export function joints(d: Design): number {
  const guides = constructionSet(d);
  return Object.values(d.connections).filter((c) => c.kind !== 'fold' && c.kind !== 'butt' && !c.wing && c.kind !== 'closure' && !guides.has(c.a.panelId) && !guides.has(c.b.panelId)).length;
}

/**
 * *Save material*: look for folds to cut so the layout takes fewer sheets
 * (then less sheet area), with as few cuts as that takes. A beam search over
 * the nets' folds, scored with the parts' boxes; the answer is then checked by
 * solving the design with the cuts and laying it out as the sheet meter does.
 * `measure` lays out a solved design (the bounding-box packer unless given).
 * Null when no cut saves anything.
 */
export function planSaveMaterial(d: Design, solveFn: (d: Design) => void, measure: (d: Design) => Yield): SavePlan | null {
  const nets = wholeNets(d);
  const pts = panelPoints(d);
  const fixed = new Set(Object.values(d.connections).filter((c) => c.split).map((c) => c.id));
  const free = nets.flatMap((n) => freeFolds(d, n)).filter((id) => !fixed.has(id));
  if (!free.length) return null;
  const score = (cuts: string[]) => {
    const set = new Set([...fixed, ...cuts]);
    const parts = nets.flatMap((n) => partsOf(d, n, set, pts));
    const over = totalOver(d, parts);
    const { sheets, area } = boxLayout(d, parts);
    return { cuts, key: [over > 1e-6 ? 1 : 0, sheets, Math.round(area / 100), cuts.length] };
  };
  const better = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  };
  const start = score([]);
  let best = start;
  let beam = [start];
  const seen = new Set<string>(['']);
  for (let depth = 0; depth < 3; depth++) {
    const next: typeof beam = [];
    for (const s of beam)
      for (const id of free) {
        if (s.cuts.includes(id)) continue;
        const cuts = [...s.cuts, id].sort();
        const k = cuts.join(',');
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(score(cuts));
      }
    next.sort((a, b) => (better(a.key, b.key) ? -1 : better(b.key, a.key) ? 1 : 0));
    beam = next.slice(0, 3);
    if (beam[0] && better(beam[0].key, best.key)) best = beam[0];
    if (!beam.length) break;
  }
  if (!best.cuts.length) return null;
  // checked for real: solved with the cuts, laid out
  const before = measure(d);
  const probe = structuredClone(d) as Design;
  for (const id of best.cuts) if (probe.connections[id]) probe.connections[id].cut = 'cut';
  probe.placements = Object.fromEntries(Object.entries(probe.placements).filter(([, p]) => p.manual && !p.nested));
  solveFn(probe);
  const after = measure(probe);
  // fewer sheets, or at least a twentieth of a sheet less
  const enough = 0.05 * d.material.sheetW * d.material.sheetH;
  if (!(after.sheets < before.sheets || (after.sheets === before.sheets && after.area < before.area - enough))) return null;
  return { cuts: best.cuts, before, after };
}

/** A solved design's yield as the bounding-box packer lays it out (manual moves kept). */
export function measureYield(d: Design, layout: (d: Design) => { copies: { key: string; w: number; h: number }[]; pl: Record<string, { sheet: number; x: number; y: number; rot: number; mat?: string }> }): Yield {
  const { copies, pl } = layout(d);
  const { sheets, area } = layoutCost(d, copies, pl);
  return { sheets, area, pieces: copies.length, glue: joints(d) };
}

/** The yield report (§9.3): sheets, percent of sheet used, total cut length (mm), pieces, glue joints. */
export type YieldReport = { sheets: number; pct: number; cut: number; pieces: number; glue: number };

export function yieldReport(d: Design): YieldReport {
  const copies = pieceCopies(d);
  const pl = pack(d, copies);
  let used = 0, total = 0, cut = 0;
  const seen = new Set<string>();
  const len = new Map<string, number>();
  for (const c of copies) {
    const p = pl[c.key];
    if (!p) continue;
    used += c.contours.filter((x) => x.role === 'outer').reduce((s, x) => s + Math.abs(contourArea(x.contour)), 0);
    let l = len.get(c.pieceKey);
    if (l === undefined) {
      l = 0;
      for (const x of c.contours) {
        if (x.op !== 'cut') continue;
        const pts = flattenContour(x.contour, 0.1);
        for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      }
      len.set(c.pieceKey, l);
    }
    cut += l;
    const k = `${p.mat ?? ''}#${p.sheet}`;
    if (!seen.has(k)) {
      seen.add(k);
      const m = profileOf(d, p.mat);
      total += m.sheetW * m.sheetH;
    }
  }
  return { sheets: Math.max(1, seen.size), pct: total ? Math.round((100 * used) / total) : 0, cut, pieces: copies.length, glue: joints(d) };
}

/** The bounding-box packer's layout of a solved design, the student's own moves kept (what *Save material* compares). */
export function boxPlan(d: Design) {
  const copies = pieceCopies(d);
  const keep = Object.fromEntries(Object.entries(d.placements).filter(([, p]) => p.manual && !p.nested));
  return { copies, pl: pack({ ...d, placements: keep }, copies) };
}
