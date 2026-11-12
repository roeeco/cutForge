// The sketch view's drawing tools as reducers (SKETCH_OVERHAUL.md §7):
// step(state, event, env) → state. Edits go through env (one history step
// each, or previews during a drag), so the tools run without a browser.
import type { P2 } from '../model/types';
import { addArc, addBez, addLine, curveThrough, eraseSeg, movePts, removePt, setPt, splitSeg, weld, type End } from './ops';
import { mergeSel, outlineAt } from './select';
import { bulgeThrough } from './flatten';
import { parsePolar, polarPoint } from './dims';
import { bounds, degree, segsAt, selPts, type Sketch, type SkSel } from './model';
import { hitTest, inBox } from './hit';
import { snapPoint, snapTargets, type Snap } from './snap';

export type SkToolId = 'select' | 'line' | 'arc' | 'smooth' | 'bezier' | 'points' | 'erase' | 'tape';
export type Mods = { shift: boolean; alt: boolean };
const NO_MODS: Mods = { shift: false, alt: false };

export type ToolEv =
  | { t: 'move'; p: P2; mods?: Mods }
  | { t: 'down'; p: P2; mods?: Mods }
  | { t: 'drag'; p: P2; mods?: Mods }
  | { t: 'up'; p: P2; mods?: Mods }
  | { t: 'click'; p: P2; mods?: Mods }
  | { t: 'right' }
  | { t: 'double'; p: P2 }
  | { t: 'key'; key: string };

export type Env = {
  sk: () => Sketch;
  /** One step of the sketch's history. */
  edit: <T>(fn: (sk: Sketch) => T) => T;
  /** A gesture's preview from the draft at its start; commit or cancel ends it. */
  preview: (fn: (sk: Sketch) => unknown) => void;
  commit: () => void;
  cancel: () => void;
  undo: () => void;
  mmPerPx: number;
  /** Round to the grid (to 0.01 mm under Alt). */
  grid: (x: number, alt: boolean) => number;
  /** Smart snapping is on in the settings. */
  smart: boolean;
  /** New segments are construction lines. */
  cons: boolean;
  /** The corners of the shapes shown underneath. */
  underlay?: P2[][];
  /** The selection (the Select tool). */
  sel?: () => SkSel;
  setSel?: (s: SkSel) => void;
};

type Pin = { id?: string; p: P2 };
export type Chain = { start: Pin; first: string | null; last: string | null; n: number; pts: string[]; out?: P2 | null };
export type Typed = { len: string; ang: string; focus: 'len' | 'ang' };

export type ToolState = {
  tool: SkToolId;
  cur: P2 | null;
  snap: Snap | null;
  chain: Chain | null;
  typed: Typed | null;
  arc: { a: Pin | null; b: Pin | null };
  bez: { down: Snap | null; h: P2 | null };
  tape: { a: P2 | null; b: P2 | null };
  box: { a: P2; b: P2 } | null;
  drag: { pt: string; start: P2; moved: boolean; handle?: { seg: string; end: 'a' | 'b' }; item?: SkSel; pts?: string[]; mid?: P2; base?: Record<string, P2> } | null;
  /** The erase or selection box adds to the selection (Shift). */
  additive?: boolean;
  /** Ask the view to switch to the Select tool. */
  done?: boolean;
};

export function initTool(tool: SkToolId): ToolState {
  return { tool, cur: null, snap: null, chain: null, typed: null, arc: { a: null, b: null }, bez: { down: null, h: null }, tape: { a: null, b: null }, box: null, drag: null };
}

const dist = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.y - b.y);
const pinEnd = (p: Pin): End => p.id ?? p.p;
const posOf = (sk: Sketch, id: string | null | undefined, fallback: P2): P2 => (id && sk.pts[id] ? { x: sk.pts[id].x, y: sk.pts[id].y } : fallback);

/** Where a chain's next segment starts. */
function chainLast(sk: Sketch, c: Chain): { end: End; p: P2 } {
  if (c.last) return { end: c.last, p: posOf(sk, c.last, c.start.p) };
  return { end: pinEnd(c.start), p: posOf(sk, c.start.id, c.start.p) };
}

/** Snap the pointer for the tool (the chain's first point closes it once it has two segments). */
export function snapFor(s: ToolState, raw: P2, env: Env, mods: Mods = NO_MODS, exclude: string[] = []): Snap {
  const sk = env.sk();
  const c = s.chain;
  const last = c ? chainLast(sk, c).p : s.arc.a && !s.arc.b ? s.arc.a.p : null;
  return snapPoint(raw, {
    mmPerPx: env.mmPerPx,
    targets: snapTargets(sk, { exclude, underlay: env.underlay }),
    first: c?.first ? { id: c.first, p: posOf(sk, c.first, c.start.p) } : null,
    canClose: !!c && c.n >= 2,
    last,
    shift: mods.shift,
    noSmart: mods.alt || !env.smart,
    free: mods.alt,
    grid: (x) => env.grid(x, mods.alt),
  });
}

const cons = (env: Env) => (env.cons ? { cons: true } : undefined);

/** Add the chain's next segment to a snapped point; returns the chain after it (null when it ended). */
function extend(s: ToolState, sn: Snap, env: Env): Chain | null {
  const c = s.chain!;
  const sk = env.sk();
  const from = chainLast(sk, c);
  if (dist(sn.p, from.p) < 1e-6 || (sn.ptId && sn.ptId === c.last)) return c;
  const smooth = s.tool === 'smooth';
  const seg = (a: End, b: End, bp: P2) =>
    env.edit((x) => {
      const r = smooth ? addBez(x, a, b, { x: (bp.x - from.p.x) / 3, y: (bp.y - from.p.y) / 3 }, { x: (from.p.x - bp.x) / 3, y: (from.p.y - bp.y) / 3 }, cons(env)) : addLine(x, a, b, cons(env));
      return r;
    });
  // close on the first point
  if (sn.kind === 'close' && c.first) {
    seg(from.end, c.first, sn.p);
    if (smooth) env.edit((x) => void curveThrough(x, c.pts));
    return null;
  }
  // onto another existing point: joined there, and the chain ends
  if (sn.ptId && sn.ptId !== c.start.id) {
    const r = seg(from.end, sn.ptId, sn.p);
    if (smooth && c.pts.length >= 2) env.edit((x) => void curveThrough(x, [...c.pts, r.b]));
    return null;
  }
  const r = seg(from.end, sn.ptId ?? sn.p, sn.p);
  const pts = c.pts.length ? [...c.pts, r.b] : [r.a, r.b];
  if (smooth && pts.length >= 3) env.edit((x) => void curveThrough(x, pts));
  return { ...c, first: c.first ?? r.a, last: r.b, n: c.n + 1, pts };
}

/** Close the chain on its first point (Enter), when it has two segments or more. */
function closeChain(s: ToolState, env: Env): ToolState {
  const c = s.chain;
  if (!c || !c.first || c.n < 2) return { ...s, chain: null, typed: null };
  const sk = env.sk();
  const fp = posOf(sk, c.first, c.start.p);
  extend(s, { p: fp, kind: 'close', ptId: c.first }, env);
  return { ...s, chain: null, typed: null };
}

const TYPED_KEY = /^[0-9.+\-*/()]$/;

/** The typed length and angle as a point from the chain's last point; the pointer's angle when none is typed. */
export function typedTarget(s: ToolState, env: Env): P2 | null {
  if (!s.typed || !s.chain) return null;
  const v = parsePolar(`${s.typed.len}${s.typed.ang ? `<${s.typed.ang}` : ''}`);
  if (!v || !(v.len > 0)) return null;
  const from = chainLast(env.sk(), s.chain).p;
  const ang = v.angle ?? (s.cur ? (Math.atan2(s.cur.y - from.y, s.cur.x - from.x) * 180) / Math.PI : 0);
  return polarPoint(from, v.len, ang);
}

function lineKey(s: ToolState, key: string, env: Env): ToolState {
  // typed numbers while a chain is open
  if (s.chain && s.typed) {
    const ty = s.typed;
    if (key === 'Escape') return { ...s, typed: null };
    if (key === '<' || key === 'Tab') return { ...s, typed: { ...ty, focus: ty.focus === 'len' ? 'ang' : 'len' } };
    if (key === 'Backspace') {
      const f = ty.focus;
      const v = ty[f].slice(0, -1);
      if (!v && f === 'ang') return { ...s, typed: { ...ty, ang: '', focus: 'len' } };
      if (!v && !ty.ang) return { ...s, typed: null };
      return { ...s, typed: { ...ty, [f]: v } };
    }
    if (key === 'Enter') {
      const p = typedTarget(s, env);
      if (!p) return s;
      const chain = extend(s, { p, kind: 'free' }, env);
      return { ...s, chain, typed: null };
    }
    if (TYPED_KEY.test(key)) return { ...s, typed: { ...ty, [ty.focus]: ty[ty.focus] + key } };
    return s;
  }
  if (s.chain && /^[0-9.]$/.test(key)) return { ...s, typed: { len: key, ang: '', focus: 'len' } };
  if (key === 'Enter') return closeChain(s, env);
  if (key === 'Escape') return s.chain ? { ...s, chain: null } : { ...s, done: true };
  if (key === 'Backspace' && s.chain) {
    if (!s.chain.n) return { ...s, chain: null };
    env.undo();
    const pts = s.chain.pts.slice(0, -1);
    const n = s.chain.n - 1;
    return { ...s, chain: n ? { ...s.chain, n, pts, last: pts[pts.length - 1] } : { ...s.chain, n: 0, pts: [], first: null, last: null } };
  }
  return s;
}

/** Bezier: each press places a point; dragging sets its handle (the in-handle mirrored). */
function bezierStep(s: ToolState, ev: ToolEv, env: Env): ToolState {
  if (ev.t === 'down') {
    const sn = snapFor(s, ev.p, env, ev.mods);
    return { ...s, bez: { down: sn, h: null }, cur: ev.p, snap: sn };
  }
  if (ev.t === 'drag' && s.bez.down) return { ...s, bez: { ...s.bez, h: { x: ev.p.x - s.bez.down.p.x, y: ev.p.y - s.bez.down.p.y } }, cur: ev.p };
  if ((ev.t === 'up' || ev.t === 'click') && s.bez.down) {
    const sn = s.bez.down;
    const h = ev.t === 'up' ? s.bez.h : null;
    const out = h && Math.hypot(h.x, h.y) > 1e-6 ? h : null;
    if (!s.chain) return { ...s, bez: { down: null, h: null }, chain: { start: { id: sn.ptId, p: sn.p }, first: null, last: null, n: 0, pts: [], out } };
    const c = s.chain;
    const sk = env.sk();
    const from = chainLast(sk, c);
    if (dist(sn.p, from.p) < 1e-6) return { ...s, bez: { down: null, h: null } };
    const ha = c.out ?? { x: 0, y: 0 }, hb = out ? { x: -out.x, y: -out.y } : { x: 0, y: 0 };
    const closing = sn.kind === 'close' && !!c.first;
    const to: End = closing ? c.first! : (sn.ptId ?? sn.p);
    const r = env.edit((x) => {
      const straight = Math.hypot(ha.x, ha.y) < 1e-9 && Math.hypot(hb.x, hb.y) < 1e-9;
      const res = straight ? addLine(x, from.end, to, cons(env)) : addBez(x, from.end, to, ha, hb, cons(env));
      if (out && x.pts[res.b]) x.pts[res.b].smooth = true;
      return res;
    });
    if (closing || (sn.ptId && sn.ptId !== c.start.id)) return { ...s, chain: null, bez: { down: null, h: null } };
    return { ...s, bez: { down: null, h: null }, chain: { ...c, first: c.first ?? r.a, last: r.b, n: c.n + 1, pts: c.pts.length ? [...c.pts, r.b] : [r.a, r.b], out } };
  }
  return s;
}

/** Remove a point and every segment at it (Erase). */
function erasePoint(sk: Sketch, id: string) {
  for (const g of segsAt(sk, id)) eraseSeg(sk, g);
  delete sk.pts[id];
}

export function step(s: ToolState, ev: ToolEv, env: Env): ToolState {
  const mods = 'mods' in ev ? (ev.mods ?? NO_MODS) : NO_MODS;
  const tol = 10 * env.mmPerPx;
  if (ev.t === 'move') {
    if (s.typed) return { ...s, cur: ev.p };
    const drawing = s.tool === 'line' || s.tool === 'smooth' || s.tool === 'bezier' || s.tool === 'arc' || s.tool === 'tape';
    return { ...s, cur: ev.p, snap: drawing ? snapFor(s, ev.p, env, mods) : null };
  }
  switch (s.tool) {
    case 'line':
    case 'smooth': {
      if (ev.t === 'key') return lineKey(s, ev.key, env);
      if (ev.t === 'right' || ev.t === 'double') return { ...s, chain: null, typed: null };
      if (ev.t !== 'click') return s;
      const sn = snapFor(s, ev.p, env, mods);
      if (!s.chain) return { ...s, chain: { start: { id: sn.ptId, p: sn.p }, first: null, last: null, n: 0, pts: [] }, snap: sn };
      return { ...s, chain: extend(s, sn, env), typed: null };
    }
    case 'bezier': {
      if (ev.t === 'key') {
        if (ev.key === 'Enter') {
          const c = s.chain;
          if (c?.first && c.n >= 2) {
            const sk = env.sk();
            const from = chainLast(sk, c);
            const ha = c.out ?? { x: 0, y: 0 };
            env.edit((x) => (Math.hypot(ha.x, ha.y) < 1e-9 ? addLine(x, from.end, c.first!, cons(env)) : addBez(x, from.end, c.first!, ha, { x: 0, y: 0 }, cons(env))));
          }
          return { ...s, chain: null };
        }
        if (ev.key === 'Escape') return s.chain ? { ...s, chain: null } : { ...s, done: true };
        return s;
      }
      if (ev.t === 'right' || ev.t === 'double') return { ...s, chain: null };
      return bezierStep(s, ev, env);
    }
    case 'arc': {
      if (ev.t === 'key') return ev.key === 'Escape' ? (s.arc.a ? { ...s, arc: { a: null, b: null } } : { ...s, done: true }) : s;
      if (ev.t !== 'click') return s;
      const sn = snapFor(s, ev.p, env, mods);
      const pin = { id: sn.ptId, p: sn.p };
      if (!s.arc.a) return { ...s, arc: { a: pin, b: null } };
      if (!s.arc.b) return dist(pin.p, s.arc.a.p) < 1e-6 ? s : { ...s, arc: { a: s.arc.a, b: pin } };
      const a = s.arc.a, b = s.arc.b;
      const bulge = bulgeThrough(a.p, b.p, sn.p);
      env.edit((x) => (Math.abs(bulge) < 1e-9 ? addLine(x, pinEnd(a), pinEnd(b), cons(env)) : addArc(x, pinEnd(a), pinEnd(b), bulge, cons(env))));
      return { ...s, arc: { a: null, b: null } };
    }
    case 'points': {
      if (ev.t === 'key') return ev.key === 'Escape' ? { ...s, done: true } : s;
      if (ev.t !== 'click') return s;
      const h = hitTest(env.sk(), ev.p, tol);
      if (h?.kind === 'pt') env.edit((x) => removePt(x, h.id));
      else if (h?.kind === 'seg') env.edit((x) => splitSeg(x, h.id, h.t));
      return s;
    }
    case 'erase': {
      if (ev.t === 'key') return ev.key === 'Escape' ? { ...s, done: true } : s;
      if (ev.t === 'click') {
        const h = hitTest(env.sk(), ev.p, tol);
        if (h?.kind === 'pt') env.edit((x) => erasePoint(x, h.id));
        else if (h?.kind === 'seg') env.edit((x) => eraseSeg(x, h.id));
        return { ...s, box: null };
      }
      if (ev.t === 'down') return { ...s, box: { a: ev.p, b: ev.p } };
      if (ev.t === 'drag' && s.box) return { ...s, box: { a: s.box.a, b: ev.p } };
      if (ev.t === 'up' && s.box) {
        const got = inBox(env.sk(), s.box.a, s.box.b);
        if (got.pts.length || got.segs.length)
          env.edit((x) => {
            for (const g of got.segs) if (x.segs[g]) eraseSeg(x, g);
            for (const p of got.pts) if (x.pts[p]) erasePoint(x, p);
          });
        return { ...s, box: null };
      }
      return s;
    }
    case 'tape': {
      if (ev.t === 'key') return ev.key === 'Escape' ? (s.tape.a ? { ...s, tape: { a: null, b: null } } : { ...s, done: true }) : s;
      if (ev.t !== 'click') return s;
      const sn = snapFor(s, ev.p, env, mods);
      if (!s.tape.a || s.tape.b) return { ...s, tape: { a: sn.p, b: null } };
      return { ...s, tape: { a: s.tape.a, b: sn.p } };
    }
    case 'select':
      return selectStep(s, ev, env, mods);
  }
}

const EMPTY: SkSel = { pts: [], segs: [] };

/** The curve handles shown for a selection: each selected Bezier end's handle tip. */
export function shownHandles(sk: Sketch, sel: SkSel): { seg: string; end: 'a' | 'b'; p: P2; tip: P2 }[] {
  const pts = new Set(selPts(sk, sel));
  const out: { seg: string; end: 'a' | 'b'; p: P2; tip: P2 }[] = [];
  for (const g of sk.order) {
    const s = sk.segs[g];
    if (s.k !== 'bez') continue;
    for (const end of ['a', 'b'] as const) {
      const id = s[end];
      if (!pts.has(id) && !sel.segs.includes(g)) continue;
      const p = sk.pts[id], h = end === 'a' ? s.ha : s.hb;
      out.push({ seg: g, end, p, tip: { x: p.x + h.x, y: p.y + h.y } });
    }
  }
  return out;
}

/** Set a Bezier end's handle; at a smooth point the other handle there turns to stay in line (its length kept). */
export function setHandle(sk: Sketch, seg: string, end: 'a' | 'b', h: P2) {
  const s = sk.segs[seg];
  if (s?.k !== 'bez') return false;
  const id = s[end];
  if (sk.pts[id]?.lock) return false;
  if (end === 'a') s.ha = { x: h.x, y: h.y };
  else s.hb = { x: h.x, y: h.y };
  if (sk.pts[id]?.smooth) {
    const L = Math.hypot(h.x, h.y);
    for (const g of segsAt(sk, id)) {
      const o = sk.segs[g];
      if (g === seg || o.k !== 'bez') continue;
      const oe = o.a === id ? 'ha' : 'hb';
      const ol = Math.hypot(o[oe].x, o[oe].y);
      if (L > 1e-9) o[oe] = { x: (-h.x / L) * ol, y: (-h.y / L) * ol };
    }
  }
  return true;
}

function selectStep(s: ToolState, ev: ToolEv, env: Env, mods: Mods): ToolState {
  const tol = 10 * env.mmPerPx;
  const sel = env.sel?.() ?? EMPTY;
  const setSel = (x: SkSel) => env.setSel?.(x);
  const sk = env.sk();
  if (ev.t === 'down') {
    // a curve handle of the selection
    const hd = shownHandles(sk, sel).find((h) => Math.hypot(h.tip.x - ev.p.x, h.tip.y - ev.p.y) <= tol);
    if (hd) {
      setSel({ ...sel, handle: { seg: hd.seg, end: hd.end } });
      return { ...s, drag: { pt: '', start: ev.p, moved: false, handle: { seg: hd.seg, end: hd.end } } };
    }
    const h = hitTest(sk, ev.p, tol);
    const item: SkSel | null = h?.kind === 'pt' ? { pts: [h.id], segs: [] } : h?.kind === 'seg' ? { pts: [], segs: [h.id] } : outlineAt(sk, ev.p);
    if (!item) {
      if (!mods.shift) setSel(EMPTY);
      return { ...s, box: { a: ev.p, b: ev.p }, additive: mods.shift };
    }
    if (mods.shift) {
      setSel(mergeSel(sel, item, 'toggle'));
      return { ...s, drag: null };
    }
    const have = new Set(selPts(sk, sel));
    const inSel = item.pts.every((p) => have.has(p)) && item.segs.every((g) => sel.segs.includes(g) || (have.has(sk.segs[g].a) && have.has(sk.segs[g].b)));
    const now = inSel ? sel : item;
    if (!inSel) setSel(item);
    const pts = selPts(sk, now);
    const b = bounds(sk, pts)!;
    return { ...s, drag: { pt: h?.kind === 'pt' && pts.length === 1 ? h.id : '', start: ev.p, moved: false, item, pts, mid: { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 } } };
  }
  if (ev.t === 'drag' && s.box) return { ...s, box: { a: s.box.a, b: ev.p } };
  if (ev.t === 'drag' && s.drag?.handle) {
    const { seg, end } = s.drag.handle;
    const base = sk.pts[sk.segs[seg][end]];
    const q = { x: env.grid(ev.p.x, mods.alt), y: env.grid(ev.p.y, mods.alt) };
    env.preview((x) => void setHandle(x, seg, end, { x: q.x - base.x, y: q.y - base.y }));
    return { ...s, drag: { ...s.drag, moved: true } };
  }
  if (ev.t === 'drag' && s.drag?.pts) {
    const g = s.drag;
    let dx = ev.p.x - g.start.x, dy = ev.p.y - g.start.y;
    // Shift: along one axis
    if (mods.shift) Math.abs(dx) >= Math.abs(dy) ? (dy = 0) : (dx = 0);
    let snap: Snap | null = null;
    if (g.pt) {
      // one point: it snaps itself (to everything but its own lines' middles)
      const from = g.base?.[g.pt] ?? g.start;
      snap = snapFor({ ...s, chain: null }, { x: from.x + dx, y: from.y + dy }, env, { shift: false, alt: mods.alt }, g.pts);
      dx = snap.p.x - from.x;
      dy = snap.p.y - from.y;
    } else {
      // the selection's middle snaps
      snap = snapFor({ ...s, chain: null }, { x: g.mid!.x + dx, y: g.mid!.y + dy }, env, { shift: false, alt: mods.alt }, g.pts);
      if (snap.kind === 'grid' || snap.kind === 'free') {
        dx = env.grid(dx, mods.alt);
        dy = env.grid(dy, mods.alt);
      } else {
        dx = snap.p.x - g.mid!.x;
        dy = snap.p.y - g.mid!.y;
      }
      if (mods.shift) Math.abs(ev.p.x - g.start.x) >= Math.abs(ev.p.y - g.start.y) ? (dy = 0) : (dx = 0);
    }
    const pts = g.pts!;
    const base = g.base ?? Object.fromEntries(pts.map((id) => [id, { x: sk.pts[id].x, y: sk.pts[id].y }]));
    env.preview((x) => void movePts(x, pts, dx, dy));
    return { ...s, drag: { ...g, moved: true, base }, snap };
  }
  if ((ev.t === 'up' || ev.t === 'click') && s.box) {
    if (ev.t === 'up') {
      const got = inBox(sk, s.box.a, s.box.b);
      setSel(s.additive ? mergeSel(sel, got, 'add') : got);
    }
    return { ...s, box: null, additive: false };
  }
  if ((ev.t === 'up' || ev.t === 'click') && s.drag) {
    const g = s.drag;
    if (!g.moved) {
      // a plain click on something already in a larger selection picks it alone
      if (g.item) setSel(g.item);
      return { ...s, drag: null };
    }
    if (g.handle) {
      env.commit();
      return { ...s, drag: null };
    }
    const sn = s.snap;
    const pt = g.pt;
    const open = pt && degree(env.sk(), pt, { cons: false }) === 1;
    if (open && sn?.ptId && sn.ptId !== pt && env.sk().pts[sn.ptId]) {
      const target = sn.ptId;
      env.preview((x) => void (setPt(x, pt, x.pts[target]), weld(x, target, pt)));
      setSel({ pts: [target], segs: [] });
    }
    env.commit();
    return { ...s, drag: null, snap: null };
  }
  if (ev.t === 'key' && ev.key === 'Escape' && (s.drag || s.box)) {
    if (s.drag?.moved) env.cancel();
    return { ...s, drag: null, box: null, snap: null };
  }
  return s;
}

/** Is a drawing gesture in progress (a chain, an arc's first clicks, typed numbers)? Digit keys then belong to it. */
export const busy = (s: ToolState) => !!(s.chain || s.typed || s.arc.a || s.bez.down || s.drag || s.box);
