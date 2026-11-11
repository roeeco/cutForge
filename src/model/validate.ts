// Pre-export checks, explained in plain language by the UI.
import type { Design, P2, Panel, V3 } from './types';
import { allFoldOvers, foldOverDims } from './foldover';
import { segDir, segInward } from './edges';
import { toWorld } from './frame';
import { instancePolys, isOutlineShape, ownOutline } from './outline';
import { throughHits, throughRegions } from './through';
import { isRectSketch, segLength, sketchRing } from './edges';
import { polygonArea } from '../geom/vec';
import type { MsgKey } from '../i18n';
import { crossesItself, detailBBox, panelExtras, panelNotches, panelOutline, panelOutlines } from './geometry';
import { bboxOf } from '../geom/vec';
import { matOf, minWeb as materialMinWeb, profileOf, tOf } from './materials';
import { findOpenSeams } from './seams';
import { leanSupported, pairKey } from './ops';
import { panelContacts, TOUCH_EPS } from './contact';
import { MIN_CORNER } from './seams';
import { templateIssues } from '../templates/registry';
import { detailInstances, shapeContours, textBox } from './geometry';
import { flattenContour, pointInPolygon, segDistPoint } from '../geom/vec';
import { pack, pieceCopies, placementXform } from './pack';
import { netOverlaps } from './pieces';
import { applyX } from '../geom/vec';
import polygonClipping from 'polygon-clipping';
import { outlineText } from '../text/outline';
import type { FontId } from '../text/fonts';
import { constructionSet } from './place';

export type IssueTarget = { kind: 'panel'; id: string } | { kind: 'detail'; id: string };
/** `pair`: the two panels a joint message is about (both are selected when it is clicked). */
export type Issue = { key: MsgKey; vars: Record<string, string | number>; target: IssueTarget; pair?: [string, string] };

export function minWeb(d: Design, panelId?: string): number {
  return materialMinWeb(panelId ? matOf(d, panelId) : d.material);
}

export function validate(d: Design): Issue[] {
  const issues: Issue[] = [];
  const name = (id: string) => d.panels[id]?.name ?? '?';
  const guides = constructionSet(d);
  for (const id of d.order) {
    const p = d.panels[id];
    // construction guides are never cut: nothing to check (milestone 28)
    if (!p || guides.has(id)) continue;
    // each board's own material: its web and its sheet
    const min = minWeb(d, id);
    const pm = matOf(d, id);
    const notches = panelNotches(d, p);
    const fitsW = Math.min(p.w, p.h) <= Math.min(pm.sheetW, pm.sheetH) - 2 * d.sheetMargin;
    const fitsL = Math.max(p.w, p.h) <= Math.max(pm.sheetW, pm.sheetH) - 2 * d.sheetMargin;
    if (!fitsW || !fitsL) issues.push({ key: 'val.tooBig', vars: { panel: p.name }, target: { kind: 'panel', id } });
    const fit = panelFit(d, p);
    const { own } = fit;
    // a cut that splits the panel (its own shapes, or through-cuts from other panels), and pieces too thin to cut safely
    const hit = throughHits(d).get(id);
    const frags = hit ? fragmentsAfterThrough(d, id) : own.rings.length;
    // removed by a through-cut, or by its own shapes (a cut covering the whole board): flagged, not cut
    if (frags === 0) {
      issues.push({ key: 'val.removed', vars: { panel: p.name }, target: { kind: 'panel', id } });
      if (p.broken) issues.push({ key: 'val.orphan', vars: { panel: p.name }, target: { kind: 'panel', id } });
      continue;
    }
    else if (frags > 1) issues.push({ key: 'val.split', vars: { panel: p.name, n: frags }, target: { kind: 'panel', id } });
    if (hit?.approx && frags > 0) issues.push({ key: 'val.bevel', vars: { panel: p.name }, target: { kind: 'detail', id: hit.sources[0] } });
    for (const r of own.rings) {
      const pts = r.map((e) => e.a);
      const per = r.reduce((s2, e) => s2 + segLength(e), 0);
      if (per > 0 && (2 * Math.abs(polygonArea(pts))) / per < min / 2) issues.push({ key: 'val.sliver', vars: { panel: p.name, min }, target: { kind: 'panel', id } });
    }
    if (p.broken) issues.push({ key: 'val.orphan', vars: { panel: p.name }, target: { kind: 'panel', id } });
    // a sketch whose edges cross (BUGFIX_PLAN B10: edits refuse this; older files may have one)
    if (crossesItself(sketchRing(p).map((e) => e.a))) issues.push({ key: 'val.selfCross', vars: { panel: p.name }, target: { kind: 'panel', id } });
    const band = jointBands(p, notches);
    for (const dt of p.details) {
      const k = shapeFit(fit, p, dt, isOutlineShape(p, dt.id)) ?? (cutNearJoint(band, dt, min) ? 'val.tooThin' : null);
      if (k) issues.push({ key: k, vars: k === 'val.tooThin' ? { panel: p.name, min } : { panel: p.name }, target: { kind: 'detail', id: dt.id } });
    }
    const outline = panelOutline(p, notches);
    for (const h of panelExtras(d, p).holes) {
      // a slot must lie inside the manufactured outline with at least a web of material around it
      const inside = h.every((q) => pointInPolygon(q, outline));
      if (!inside || webTo(h, outline) < min - 1e-6) issues.push({ key: 'val.slotEdge', vars: { panel: p.name, min }, target: { kind: 'panel', id } });
    }
  }
  issues.push(...foldOverIssues(d));
  for (const c of Object.values(d.connections)) {
    if (guides.has(c.a.panelId) || guides.has(c.b.panelId)) continue;
    if (c.broken && c.thin) issues.push({ key: 'val.littleContact', vars: { a: name(c.a.panelId), b: name(c.b.panelId) }, target: { kind: 'panel', id: c.a.panelId }, pair: [c.a.panelId, c.b.panelId] });
    else if (c.broken) issues.push({ key: 'val.broken', vars: { a: name(c.a.panelId), b: name(c.b.panelId) }, target: { kind: 'panel', id: c.a.panelId }, pair: [c.a.panelId, c.b.panelId] });
    if (c.grown && c.kind === 'lean' && !leanSupported(d, c.b.panelId))
      issues.push({ key: 'val.unsupported', vars: { panel: name(c.b.panelId) }, target: { kind: 'panel', id: c.b.panelId } });
  }
  // a fold net that would not lie flat (milestone 35): auto trays are fixed in solve, so this names nets kept whole and panels grown by hand
  for (const o of netOverlaps(d)) issues.push({ key: 'val.netOverlap', vars: { a: name(o.a), b: name(o.b) }, target: { kind: 'panel', id: o.a }, pair: [o.a, o.b] });
  issues.push(...shapeIssues(d), ...sheetIssues(d));
  for (const ti of templateIssues(d)) issues.push({ key: ti.key, vars: ti.vars, target: { kind: 'panel', id: d.panels[ti.panel] ? ti.panel : d.order[0] } });
  for (const s of findOpenSeams(d)) {
    if (s.overlapping) issues.push({ key: 'val.overlap', vars: { a: name(s.a.panelId), b: name(s.b.panelId) }, target: { kind: 'panel', id: s.a.panelId }, pair: [s.a.panelId, s.b.panelId] });
  }
  issues.push(...contactIssues(d, issues));
  return issues;
}

/** What the export check needs to place shapes on a panel (milestone 39: shared with Quick build's guard). */
export type PanelFit = { min: number; lim: { x0: number; y0: number; x1: number; y1: number }; own: ReturnType<typeof ownOutline>; plainRect: boolean; outlines: P2[][] };

export function panelFit(d: Design, p: Panel): PanelFit {
  const min = minWeb(d, p.id);
  const notches = panelNotches(d, p);
  // inner limits: an edge cut back by joint notches loses that depth
  const inset = [0, 1, 2, 3].map((e) => Math.max(0, ...(notches[`e${e}`] ?? []).map((n) => n.depth)));
  const lim = { x0: inset[3], y0: inset[0], x1: p.w - inset[1], y1: p.h - inset[2] };
  const own = ownOutline(p);
  const plainRect = own.rings.length === 1 && isRectSketch(p) && own.rings[0].length === 4 && own.rings[0].every((e, i) => e.key === `e${i}`);
  return { min, lim, own, plainRect, outlines: own.rings.flatMap((r) => panelOutlines(p, notches, r)) };
}

/** A shape's place on its panel: outside the panel, too close to its edge, or fine (null). */
export function shapeFit(fit: PanelFit, p: Panel, dt: Panel['details'][number], outlineShape: boolean): 'val.holeOutside' | 'val.tooThin' | null {
  const { min, lim, own, plainRect, outlines } = fit;
  if (dt.op === 'score') return null;
  // Adds and Cuts across the edge shape the outline: only one that misses the panel entirely is a problem
  if (dt.op === 'add' || outlineShape) {
    // an Add standing alone (its own ring), or a Cut that misses the material, does nothing useful
    const alone = dt.op === 'add' && own.rings.some((r) => r.every((e) => e.key.startsWith(dt.id + '.')));
    const misses = dt.op === 'cut' && !touchesMaterial(own, dt);
    return alone || misses ? 'val.holeOutside' : null;
  }
  if (!plainRect || (dt.rot && dt.shape !== 'circle')) {
    // any outline (or a turned shape): the shape must lie inside the panel's material, a cut with a web around it
    const polys = instancePolys(dt).flatMap((ip) => ip.polys);
    const inRing = (q: P2) => outlines.some((o) => pointInPolygon(q, o));
    if (!polys.every((poly) => poly.every(inRing))) return 'val.holeOutside';
    if (dt.op === 'cut' && polys.some((poly) => outlines.some((o) => webTo(poly, o) < min - 1e-9))) return 'val.tooThin';
    return null;
  }
  const bb = detailBBox(dt);
  if (bb.minX < 0 || bb.minY < 0 || bb.maxX > p.w || bb.maxY > p.h) return 'val.holeOutside';
  const thin = bb.minX - lim.x0 < min - 1e-9 || bb.minY - lim.y0 < min - 1e-9 || lim.x1 - bb.maxX < min - 1e-9 || lim.y1 - bb.maxY < min - 1e-9;
  return dt.op === 'cut' && thin ? 'val.tooThin' : null;
}

/** Smallest distance from a closed polygon's edges to a ring's edges (they do not cross). */
export function webTo(poly: P2[], ring: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++)
    for (let j = 0; j < ring.length; j++) {
      best = Math.min(best, segDistPoint(poly[i], ring[j], ring[(j + 1) % ring.length]), segDistPoint(ring[j], poly[i], poly[(i + 1) % poly.length]));
    }
  return best;
}

/** Where each joint notch cuts back into the panel (a cut-back's rectangle along its edge), with that edge. */
function jointBands(p: Panel, notches: Record<string, { s0: number; s1: number; depth: number }[]>) {
  const out: { a: P2; b: P2; band: P2[] }[] = [];
  for (const e of ownOutline(p).rings.flat()) {
    const dir = segDir(e), ie = segInward(e);
    const at = (s: number, dd: number) => ({ x: e.a.x + dir.x * s + ie.x * dd, y: e.a.y + dir.y * s + ie.y * dd });
    for (const x of notches[e.key] ?? []) if (x.depth > 1e-6) out.push({ a: e.a, b: e.b, band: [at(x.s0, 0), at(x.s1, 0), at(x.s1, x.depth), at(x.s0, x.depth)] });
  }
  return out;
}

const segsMeet = (p1: P2, p2: P2, q1: P2, q2: P2) => {
  const cr = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = cr(q1, q2, p1), d2 = cr(q1, q2, p2), d3 = cr(p1, p2, q1), d4 = cr(p1, p2, q2);
  return d1 * d2 <= 0 && d3 * d4 <= 0 && Math.min(p1.x, p2.x) <= Math.max(q1.x, q2.x) + 1e-9 && Math.min(q1.x, q2.x) <= Math.max(p1.x, p2.x) + 1e-9 && Math.min(p1.y, p2.y) <= Math.max(q1.y, q2.y) + 1e-9 && Math.min(q1.y, q2.y) <= Math.max(p1.y, p2.y) + 1e-9;
};

/**
 * A cut that comes into a joint's notch band, or closer to it than the
 * material's web, without crossing that edge (BUGFIX_PLAN B9): a notch cut
 * down from a wall's top into its bottom fingers. A cut across the jointed
 * edge itself is laid out around by the joint (surviving contact) instead.
 */
function cutNearJoint(bands: ReturnType<typeof jointBands>, dt: Panel['details'][number], min: number): boolean {
  if (dt.op !== 'cut' || dt.through || !bands.length) return false;
  for (const poly of instancePolys(dt).flatMap((x) => x.polys)) {
    for (const b of bands) {
      const crosses = poly.some((q, i) => segsMeet(q, poly[(i + 1) % poly.length], b.a, b.b));
      if (crosses) continue;
      const inside = poly.some((q) => pointInPolygon(q, b.band)) || b.band.some((q) => pointInPolygon(q, poly));
      if (inside || webTo(poly, b.band) < min - 1e-6) return true;
    }
  }
  return false;
}

/** Does a cut shape reach the panel's material (it changed the outline)? */
function touchesMaterial(own: ReturnType<typeof ownOutline>, dt: Panel['details'][number]): boolean {
  return own.rings.some((r) => r.some((e) => e.key.startsWith(dt.id + '.')));
}

/** Connected pieces a panel's material falls into after through-cuts (0 = removed). */
function fragmentsAfterThrough(d: Design, id: string): number {
  const p = d.panels[id];
  const own = ownOutline(p);
  try {
    const mat = own.rings.map((r) => [ring(r.map((e) => e.a))]);
    const left = polygonClipping.difference(mat, ...throughRegions(d, id).map((r) => [ring(r)]));
    return left.filter((pp) => Math.abs(polygonArea(pp[0].slice(0, -1).map(([x, y]) => ({ x, y })))) > 0.5).length;
  } catch {
    return own.rings.length;
  }
}

/** Fold-over rules (foldform's, plus webs, collisions and flute direction). */
function foldOverIssues(d: Design): Issue[] {
  const out: Issue[] = [];
  const fos = allFoldOvers(d);
  if (!fos.length) return out;
  const pl = pack(d);
  const copies = pieceCopies(d);
  for (const { panelId, f, g } of fos) {
    const p = d.panels[panelId];
    const target = { kind: 'panel' as const, id: panelId };
    const fm = matOf(d, panelId);
    const t = fm.thickness, c = fm.clearance;
    const dims = foldOverDims(d, p, f);
    const vars = { panel: p.name };
    if (p.h <= 2 * t) out.push({ key: 'val.foldShort', vars, target });
    if (f.depth !== null && f.depth > 0.45 * p.h + 1e-9) out.push({ key: 'val.hemDeep', vars, target });
    if (f.lock === 'tabs') {
      if (f.depth !== null) out.push({ key: 'val.lockHem', vars, target });
      if (dims.lockDepth > 0.6 * p.h + 1e-9) out.push({ key: 'val.lockDeep', vars, target });
      const L = g.liner.x1 - g.liner.x0;
      const w = g.tabs[0] ? g.tabs[0].x1 - g.tabs[0].x0 : 0;
      if (L < 2 * c + 2 + 2 * w) out.push({ key: 'val.foldNarrow', vars, target });
      if (c < 0.75 * t) out.push({ key: 'val.foldClearance', vars: { ...vars, c, min: Math.round(0.75 * t * 100) / 100 }, target });
    }
    // flute direction on 4 mm board: a fold-over score across the flutes cracks
    if (fm.kind === 'corrugated' && t >= 3.5 && fm.grain !== 'none') {
      const copy = copies.find((x) => x.copy === 0 && x.panels.some((n) => n.panelId === panelId));
      const place = copy && pl[copy.key];
      const n = copy?.panels.find((x) => x.panelId === panelId);
      if (place && n) {
        const e = g.liner.e;
        const a = applyX(n.xf, e.a), b = applyX(n.xf, e.b);
        let dx = b.x - a.x, dy = b.y - a.y;
        if (place.rot === 90) [dx, dy] = [-dy, dx];
        const along = fm.grain === 'x' ? Math.abs(dx) : Math.abs(dy);
        if (along < 0.7 * Math.hypot(dx, dy)) out.push({ key: 'val.flute', vars, target });
      }
    }
  }
  // liners must not meet each other (inside corners)
  for (let i = 0; i < fos.length; i++)
    for (let j = i + 1; j < fos.length; j++) {
      const A = linerBox(d, fos[i]), B = linerBox(d, fos[j]);
      if (A && B && boxesOverlap(A, B)) out.push({ key: 'val.linerCollide', vars: { a: d.panels[fos[i].panelId].name, b: d.panels[fos[j].panelId].name }, target: { kind: 'panel', id: fos[i].panelId } });
    }
  return out;
}

/** World corner points of a folded liner slab. */
function linerBox(d: Design, fo: ReturnType<typeof allFoldOvers>[number]) {
  const p = d.panels[fo.panelId];
  const t = tOf(d, fo.panelId);
  const { e, x0, x1, q0, q1 } = fo.g.liner;
  const dir = segDir(e), inw = segInward(e);
  const pts: V3[] = [];
  for (const s of [x0, x1]) for (const q of [q0, q1]) for (const z of [t + 0.01, 2 * t - 0.01]) pts.push(toWorld(p.frame, e.a.x + dir.x * s + inw.x * q, e.a.y + dir.y * s + inw.y * q, z));
  return pts;
}
/** Do two convex point sets' volumes overlap (separating-axis test on their bounding boxes in a shared frame)? */
function boxesOverlap(a: V3[], b: V3[]): boolean {
  for (let k = 0; k < 3; k++) {
    const amin = Math.min(...a.map((p) => p[k])), amax = Math.max(...a.map((p) => p[k]));
    const bmin = Math.min(...b.map((p) => p[k])), bmax = Math.max(...b.map((p) => p[k]));
    if (amax <= bmin + 1e-6 || bmax <= amin + 1e-6) return false;
  }
  return true;
}

type Poly = [number, number][];
const ring = (pts: { x: number; y: number }[]): Poly => pts.map((p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6]);
function overlapArea(a: Poly, b: Poly): number {
  try {
    const r = polygonClipping.intersection([a], [b]);
    let area = 0;
    for (const poly of r)
      poly.forEach((rg, i) => {
        let s = 0;
        for (let k = 0; k < rg.length - 1; k++) s += rg[k][0] * rg[k + 1][1] - rg[k + 1][0] * rg[k][1];
        area += (i === 0 ? 1 : -1) * Math.abs(s / 2);
      });
    return area;
  } catch {
    return 0;
  }
}

/** Text that failed to outline, cut-through letters with islands, and cut shapes that overlap (doubled cut lines). */
function shapeIssues(d: Design): Issue[] {
  const out: Issue[] = [];
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    const cuts: { id: string; poly: Poly; bb: [number, number, number, number] }[] = [];
    for (const dt of p.details) {
      if (dt.shape === 'text' && dt.text) {
        const tb = textBox(dt);
        const o = outlineText(dt.text.value, dt.text.font as FontId, dt.text.size);
        if (!tb.ok) out.push({ key: 'val.textFailed', vars: { panel: p.name, chars: o?.missing.join(' ') ?? '' }, target: { kind: 'detail', id: dt.id } });
        if (dt.op === 'cut' && o && o.polys.some((a, i) => o.polys.some((b, j) => i !== j && pointInPolygon(a[0], b))))
          out.push({ key: 'val.stencil', vars: { panel: p.name }, target: { kind: 'detail', id: dt.id } });
        continue; // letters are allowed to touch each other
      }
      if (dt.op !== 'cut' || isOutlineShape(p, dt.id)) continue;
      for (const inst of detailInstances(dt))
        for (const c of shapeContours(inst)) {
          const pts = flattenContour(c, 0.05);
          const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
          cuts.push({ id: dt.id, poly: ring(pts), bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
        }
    }
    const flagged = new Set<string>();
    for (let i = 0; i < cuts.length; i++)
      for (let j = i + 1; j < cuts.length; j++) {
        const a = cuts[i], b = cuts[j];
        if (a.bb[0] > b.bb[2] + 1e-6 || b.bb[0] > a.bb[2] + 1e-6 || a.bb[1] > b.bb[3] + 1e-6 || b.bb[1] > a.bb[3] + 1e-6) continue;
        const touching = overlapArea(a.poly, b.poly) > 1e-4;
        const key = `${a.id}|${b.id}`;
        if (touching && !flagged.has(key)) {
          flagged.add(key);
          out.push({ key: 'val.shapesOverlap', vars: { panel: p.name }, target: { kind: 'detail', id: b.id } });
        }
      }
  }
  return out;
}

/** Pieces that overlap each other or lie outside their sheet (after manual moves). */
function sheetIssues(d: Design): Issue[] {
  const out: Issue[] = [];
  const copies = pieceCopies(d);
  const pl = pack(d, copies);
  const placed = copies
    .filter((c) => pl[c.key])
    .map((c) => {
      const xf = placementXform(pl[c.key], c.h);
      const outer = c.contours.find((x) => x.role === 'outer');
      const pts = outer ? flattenContour(outer.contour, 0.2).map((q) => applyX(xf, q)) : [];
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      const m = profileOf(d, pl[c.key].mat);
      return { c, sheet: `${pl[c.key].mat ?? ''}#${pl[c.key].sheet}`, W: m.sheetW, H: m.sheetH, poly: ring(pts), bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    });
  const name = (k: string) => d.panels[k]?.name ?? '?';
  for (const a of placed)
    if (a.bb[0] < -1e-6 || a.bb[1] < -1e-6 || a.bb[2] > a.W + 1e-6 || a.bb[3] > a.H + 1e-6)
      out.push({ key: 'val.offSheet', vars: { panel: name(a.c.pieceKey), copy: a.c.copy + 1 }, target: { kind: 'panel', id: a.c.pieceKey } });
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      if (a.sheet !== b.sheet || a.bb[0] > b.bb[2] || b.bb[0] > a.bb[2] || a.bb[1] > b.bb[3] || b.bb[1] > a.bb[3]) continue;
      if (overlapArea(a.poly, b.poly) > 1e-3)
        out.push({ key: 'val.piecesOverlap', vars: { a: name(a.c.pieceKey), b: name(b.c.pieceKey) }, target: { kind: 'panel', id: b.c.pieceKey } });
    }
  return out;
}

/**
 * Panels that touch or run into each other with no joint between them
 * (milestone 16): never silent. Pairs already named by another joint message
 * are left to that message.
 */
/** Contacts shorter than this (mm) are reported as too short to join (a corner grazing another panel). */
const SHORT_CONTACT = 10;

function contactIssues(d: Design, already: Issue[]): Issue[] {
  const name = (id: string) => d.panels[id]?.name ?? '?';
  const joined = new Set(Object.values(d.connections).map((c) => pairKey(c.a.panelId, c.b.panelId)));
  const named = new Set(already.filter((i) => i.pair).map((i) => pairKey(i.pair![0], i.pair![1])));
  const unjoined = new Set(d.noAutoSeams ?? []);
  const out: Issue[] = [];
  for (const c of panelContacts(d)) {
    const k = pairKey(c.a, c.b);
    if (joined.has(k) || named.has(k)) continue;
    const key: MsgKey =
      c.depth > TOUCH_EPS
        ? 'val.collide'
        : c.coplanar
          ? 'val.notJoined.sideBySide'
          : c.angle < 0.02
            ? 'val.notJoined.faceToFace'
            : unjoined.has(k)
              ? 'val.notJoined.unjoined'
              : c.extent < SHORT_CONTACT
                ? 'val.notJoined.short'
              : c.angle < MIN_CORNER - 1e-6
                ? 'val.notJoined.angle'
                : 'val.notJoined.noFit';
    out.push({ key, vars: { a: name(c.a), b: name(c.b), angle: Math.round(c.angle), len: Math.round(c.extent) }, target: { kind: 'panel', id: c.a }, pair: [c.a, c.b] });
  }
  return out;
}
