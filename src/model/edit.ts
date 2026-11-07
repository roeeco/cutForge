// Group editing of details: move, duplicate, delete, scale about the group's
// box, align and distribute within one flat surface, live arrays.
import type { Design, Detail, DetailArray, Panel, V3 } from './types';
import { findDetail, newId, updateDetail } from './ops';
import { detailBBox, detailInstances } from './geometry';
import { frameNormal, toLocal, toWorld } from './frame';
import { v3add, v3dot, v3mul, v3sub } from '../geom/v3';

export function moveDetails(d: Design, moves: { id: string; dx: number; dy: number }[]) {
  for (const m of moves) {
    const f = findDetail(d, m.id);
    if (f) updateDetail(d, m.id, { cx: f.detail.cx + m.dx, cy: f.detail.cy + m.dy });
  }
}

/** Duplicate details on their own panels, offset by (dx, dy). Returns the new ids in the same order. */
export function duplicateDetails(d: Design, ids: string[], dx = 5, dy = -5): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const f = findDetail(d, id);
    if (!f) continue;
    const copy: Detail = JSON.parse(JSON.stringify(f.detail));
    copy.id = newId('x');
    copy.cx += dx;
    copy.cy += dy;
    f.panel.details.push(copy);
    out.push(copy.id);
  }
  return out;
}

export function deleteDetails(d: Design, ids: string[]) {
  const set = new Set(ids);
  for (const pid of d.order) {
    const p = d.panels[pid];
    if (p) p.details = p.details.filter((x) => !set.has(x.id));
  }
}

/**
 * Scale details about an anchor (panel coordinates), all on one panel:
 * centres and sizes scale; circles keep their shape (geometric mean).
 */
export function scaleDetails(d: Design, ids: string[], anchor: { x: number; y: number }, sx: number, sy: number, base?: Design) {
  const src = base ?? d;
  for (const id of ids) {
    const f = findDetail(src, id);
    if (!f) continue;
    const o = f.detail;
    const k = Math.sqrt(Math.abs(sx * sy));
    const w = o.shape === 'circle' ? o.w * k : o.w * Math.abs(sx);
    const h = o.shape === 'circle' ? o.h * k : o.h * Math.abs(sy);
    const patch: Partial<Detail> = { cx: anchor.x + (o.cx - anchor.x) * sx, cy: anchor.y + (o.cy - anchor.y) * sy, w, h };
    if (o.array) patch.array = { ...o.array, dx: o.array.dx * sx, dy: o.array.dy * sy };
    if (o.r !== undefined) patch.r = o.r * Math.min(Math.abs(sx), Math.abs(sy));
    const t = findDetail(d, id);
    if (t) Object.assign(t.detail, patch);
    if (t && t.detail.text && o.text) t.detail.text.size = Math.max(1, o.text.size * k);
  }
}

// ---- one flat surface ------------------------------------------------------

/** Two panels lie in the same plane (same facing line, same plane). */
export function coplanar(a: Panel, b: Panel): boolean {
  if (a.id === b.id) return true;
  const na = frameNormal(a.frame), nb = frameNormal(b.frame);
  if (Math.abs(v3dot(na, nb)) < 0.999) return false;
  return Math.abs(v3dot(v3sub(b.frame.o, a.frame.o), na)) < 0.01;
}

/** The panel all details can be measured on, or null when they span different planes. */
export function commonSurface(d: Design, ids: string[]): Panel | null {
  const panels = ids.map((id) => findDetail(d, id)?.panel).filter((p): p is Panel => !!p);
  if (!panels.length) return null;
  const ref = panels[0];
  return panels.every((p) => coplanar(ref, p)) ? ref : null;
}

type Item = { id: string; panel: Panel; minX: number; maxX: number; minY: number; maxY: number };

/** A detail's box (array included) in the reference panel's coordinates. */
function itemIn(d: Design, ref: Panel, id: string): Item | null {
  const f = findDetail(d, id);
  if (!f) return null;
  const bb = detailBBox(f.detail);
  const corners: V3[] = [
    [bb.minX, bb.minY],
    [bb.maxX, bb.minY],
    [bb.maxX, bb.maxY],
    [bb.minX, bb.maxY],
  ].map(([x, y]) => toWorld(f.panel.frame, x, y));
  const l = corners.map((c) => toLocal(ref.frame, c));
  const xs = l.map((q) => q.x), ys = l.map((q) => q.y);
  return { id, panel: f.panel, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Move a detail by (dx, dy) given in the reference panel's coordinates. */
function shiftIn(d: Design, ref: Panel, it: Item, dx: number, dy: number) {
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return;
  const w = v3add(v3mul(ref.frame.u, dx), v3mul(ref.frame.v, dy));
  const lx = v3dot(w, it.panel.frame.u), ly = v3dot(w, it.panel.frame.v);
  const f = findDetail(d, it.id)!;
  updateDetail(d, it.id, { cx: f.detail.cx + lx, cy: f.detail.cy + ly });
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'bottom' | 'vcenter' | 'top';
export type DistributeMode = 'hgap' | 'vgap' | 'hcenter' | 'vcenter';

/** Align details (≥2) on one surface. Returns false when they span different planes. */
export function alignDetails(d: Design, ids: string[], mode: AlignMode): boolean {
  const ref = commonSurface(d, ids);
  if (!ref || ids.length < 2) return false;
  const items = ids.map((id) => itemIn(d, ref, id)).filter((x): x is Item => !!x);
  const minX = Math.min(...items.map((i) => i.minX)), maxX = Math.max(...items.map((i) => i.maxX));
  const minY = Math.min(...items.map((i) => i.minY)), maxY = Math.max(...items.map((i) => i.maxY));
  for (const it of items) {
    const cx = (it.minX + it.maxX) / 2, cy = (it.minY + it.maxY) / 2;
    const dx = mode === 'left' ? minX - it.minX : mode === 'right' ? maxX - it.maxX : mode === 'hcenter' ? (minX + maxX) / 2 - cx : 0;
    const dy = mode === 'bottom' ? minY - it.minY : mode === 'top' ? maxY - it.maxY : mode === 'vcenter' ? (minY + maxY) / 2 - cy : 0;
    shiftIn(d, ref, it, dx, dy);
  }
  return true;
}

/** Distribute details (≥3) with equal gaps or equal centre spacing, keeping the outer two in place. */
export function distributeDetails(d: Design, ids: string[], mode: DistributeMode): boolean {
  const ref = commonSurface(d, ids);
  if (!ref || ids.length < 3) return false;
  const items = ids.map((id) => itemIn(d, ref, id)).filter((x): x is Item => !!x);
  const horiz = mode === 'hgap' || mode === 'hcenter';
  const lo = (i: Item) => (horiz ? i.minX : i.minY), hi = (i: Item) => (horiz ? i.maxX : i.maxY);
  const ctr = (i: Item) => (lo(i) + hi(i)) / 2;
  items.sort((a, b) => ctr(a) - ctr(b));
  const first = items[0], last = items[items.length - 1];
  if (mode === 'hgap' || mode === 'vgap') {
    const total = hi(last) - lo(first);
    const sizes = items.reduce((s, i) => s + hi(i) - lo(i), 0);
    const gap = (total - sizes) / (items.length - 1);
    let pos = hi(first) + gap;
    for (let k = 1; k < items.length - 1; k++) {
      const it = items[k];
      const delta = pos - lo(it);
      shiftIn(d, ref, it, horiz ? delta : 0, horiz ? 0 : delta);
      pos += hi(it) - lo(it) + gap;
    }
  } else {
    const step = (ctr(last) - ctr(first)) / (items.length - 1);
    for (let k = 1; k < items.length - 1; k++) {
      const delta = ctr(first) + k * step - ctr(items[k]);
      shiftIn(d, ref, items[k], horiz ? delta : 0, horiz ? 0 : delta);
    }
  }
  return true;
}

// ---- arrays ------------------------------------------------------------------

export function setArray(d: Design, id: string, array: DetailArray | null) {
  const f = findDetail(d, id);
  if (!f) return;
  if (!array) delete f.detail.array;
  else f.detail.array = { nx: Math.max(1, Math.round(array.nx)), ny: Math.max(1, Math.round(array.ny)), dx: array.dx, dy: array.dy };
}

/** Turn a live array into independent details. Returns all ids (the source keeps the first copy). */
export function explodeArray(d: Design, id: string): string[] {
  const f = findDetail(d, id);
  if (!f || !f.detail.array) return [id];
  const inst = detailInstances(f.detail);
  delete f.detail.array;
  const ids = [id];
  for (const x of inst.slice(1)) {
    const nid = newId('x');
    f.panel.details.push({ ...x, id: nid });
    ids.push(nid);
  }
  return ids;
}

/**
 * Nudge shapes by (dx, dy). With a reference panel (solo view) the step is
 * measured on that panel and mapped onto each shape's own panel; otherwise
 * each shape moves in its own panel's coordinates.
 */
export function moveDetailsVisual(d: Design, ids: string[], dx: number, dy: number, refPanelId: string | null) {
  const ref = refPanelId ? d.panels[refPanelId] : undefined;
  for (const id of ids) {
    const f = findDetail(d, id);
    if (!f) continue;
    let lx = dx, ly = dy;
    if (ref && ref.id !== f.panel.id) {
      const w = v3add(v3mul(ref.frame.u, dx), v3mul(ref.frame.v, dy));
      lx = v3dot(w, f.panel.frame.u);
      ly = v3dot(w, f.panel.frame.v);
    }
    updateDetail(d, id, { cx: f.detail.cx + lx, cy: f.detail.cy + ly });
  }
}
