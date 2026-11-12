// Waffle commands shared by the rail, the card and the keyboard (WAFFLE_MODE.md §5).
import { selectedShapeIds, shapeSel, useStore } from '../../store/store';
import type { Design, SketchGraph } from '../../model/types';
import { bounds, selPts, type SkSel } from '../../sketch/model';
import { rotateSel, setLock } from '../../sketch/ops';
import { copySel, deleteSel, nudge, outlinesIn, pasteClip, pasteOffset, type Clip } from '../../sketch/select';
import { setHandle } from '../../sketch/tools';

import { deleteShapes, duplicateShapes, groupShapes, moveShapes, parentOf, setHole, ungroupShape } from '../ops';

const st = () => useStore.getState();

/** Handlers the lazily loaded waffle editor registers (so the keyboard code stays in the main chunk without it). */
export const lazyHandlers: { deleteSlice?: () => void } = {};

/** Shapes the selection can group: two or more with the same parent. */
export function canGroup(d: Design, ids: string[]): boolean {
  const sc = d.sculpt;
  if (!sc || ids.length < 2) return false;
  const p = parentOf(sc, ids[0]);
  return ids.every((id) => sc.shapes[id] && parentOf(sc, id) === p);
}
export function canUngroup(d: Design, ids: string[]): boolean {
  return ids.length === 1 && d.sculpt?.shapes[ids[0]]?.kind === 'group';
}

export function groupSelected() {
  const ids = selectedShapeIds(st().selection);
  if (!canGroup(st().design, ids)) return;
  let g: string | null = null;
  st().apply((d) => void (g = groupShapes(d as Design, ids)));
  if (g) st().select(shapeSel([g]));
}
export function ungroupSelected() {
  const ids = selectedShapeIds(st().selection);
  if (!canUngroup(st().design, ids)) return;
  let kids: string[] = [];
  st().apply((d) => void (kids = ungroupShape(d as Design, ids[0])));
  st().select(shapeSel(kids));
}
/** H: the selected shapes switch Solid ↔ Hole; with none selected, the next shape does. */
export function toggleHole() {
  const ids = selectedShapeIds(st().selection);
  if (ids.length) st().apply((d) => setHole(d as Design, ids));
  else st().setSculpt({ nextHole: !st().sculpt.nextHole });
}
export function duplicateSelected() {
  const ids = selectedShapeIds(st().selection);
  if (!ids.length) return;
  let out: string[] = [];
  st().apply((d) => void (out = duplicateShapes(d as Design, ids)));
  st().select(shapeSel(out));
}
export function deleteSelected() {
  const ids = selectedShapeIds(st().selection);
  if (ids.length) st().apply((d) => deleteShapes(d as Design, ids));
}
export function nudgeSelected(dx: number, dz: number, dy = 0) {
  const ids = selectedShapeIds(st().selection);
  if (ids.length) st().apply((d) => moveShapes(d as Design, ids, [dx, dy, dz]));
}

/** The waffle design's keys (they belong to the design type: no clash with the box rail's). Returns true when handled. */
export function sculptKey(e: KeyboardEvent): boolean {
  const s = st();
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'g') {
    e.preventDefault();
    if (e.shiftKey) ungroupSelected();
    else groupSelected();
    return true;
  }
  if (mod && key === 'd') {
    e.preventDefault();
    duplicateSelected();
    return true;
  }
  if (mod) return false;
  // the sketch tool: Enter opens the sketch view on its plane (milestone 57)
  if (e.key === 'Enter' && s.tool === 'sketch' && !s.pending && s.sculpt.stage === 'shape') {
    e.preventDefault();
    s.openSketch(null);
    return true;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection?.kind === 'slice') {
    e.preventDefault();
    lazyHandlers.deleteSlice?.();
    return true;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    if (s.selection?.kind === 'shape') deleteSelected();
    return true;
  }
  if (e.key === 'Escape') {
    if (s.txnBase || s.pending) return true;
    if (s.steps !== null) return void useStore.setState({ steps: null }), true;
    if (s.tool !== 'select') s.setTool('select');
    else if (s.selection) s.select(null);
    else if (s.sculpt.focus) s.setSculpt({ focus: null });
    return true;
  }
  if (e.key.startsWith('Arrow') && s.selection?.kind === 'shape') {
    const step = e.shiftKey ? 10 : 1;
    nudgeSelected(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
    e.preventDefault();
    return true;
  }
  if (e.altKey || e.key.length !== 1) return false;
  if (s.sculpt.stage !== 'shape') return false;
  const tools: Record<string, 'select' | 'shapes' | 'sketch' | 'radius'> = { v: 'select', s: 'shapes', k: 'sketch', f: 'radius' };
  if (tools[key]) {
    if (s.view !== '3d' && key !== 'v') s.setView('3d');
    s.setTool(tools[key]);
    return true;
  }
  if (key === 'h') {
    toggleHole();
    return true;
  }
  return false;
}

/** Handlers the sketch view registers for its keys (milestones 58–59). */
export const sketchHandlers: { key?: (e: KeyboardEvent) => boolean; duplicate?: () => void } = {};

/** The sketch view's clipboard (copied points and segments). */
let sketchClip: Clip | null = null;

/** Keys in the sketch view: the view's handler first, then Esc, Delete, arrows and the clipboard. */
export function sketchKey(e: KeyboardEvent): boolean {
  if (sketchHandlers.key?.(e)) return true;
  const s = st();
  const k = s.sketch;
  if (!k) return false;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const has = k.sel.pts.length > 0 || k.sel.segs.length > 0;
  const edit = (fn: (sk: SketchGraph) => unknown) => s.sketchEdit((x) => fn(x as SketchGraph));
  if (mod) {
    if (key === 'c' || key === 'x') {
      const c = has ? copySel(k.draft, k.sel) : null;
      if (!c) return false;
      e.preventDefault();
      sketchClip = c;
      if (key === 'x') edit((x) => void deleteSel(x, k.sel));
      return true;
    }
    if (key === 'v' && sketchClip) {
      e.preventDefault();
      const c = sketchClip;
      const d = pasteOffset(k.draft, c);
      let made: SkSel | null = null;
      s.sketchEdit((x) => void (made = pasteClip(x as SketchGraph, c, d)));
      if (made) s.setSketch({ tool: 'select', sel: made });
      return true;
    }
    if (key === 'd' && has) {
      e.preventDefault();
      sketchHandlers.duplicate?.();
      return true;
    }
    if (key === 'l' && has) {
      e.preventDefault();
      const ids = selPts(k.draft, k.sel);
      const on = !ids.every((p) => k.draft.pts[p]?.lock);
      edit((x) => void setLock(x, ids, on));
      return true;
    }
    return false;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (k.tool !== 'select') s.setSketch({ tool: 'select' });
    else if (has || k.sel.handle) s.setSketch({ sel: { pts: [], segs: [] } });
    return true;
  }
  if (k.tool !== 'select') return false;
  if ((e.key === 'Delete' || e.key === 'Backspace') && has) {
    e.preventDefault();
    edit((x) => void deleteSel(x, k.sel));
    return true;
  }
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  if (arrows[e.key] && (has || k.sel.handle)) {
    e.preventDefault();
    const step = (s.viewPrefs.gridStep > 0 ? s.viewPrefs.gridStep : 1) * (e.shiftKey ? 10 : 1);
    const [dx, dy] = arrows[e.key];
    const h = k.sel.handle;
    if (h) {
      const g = k.draft.segs[h.seg];
      if (g?.k === 'bez') {
        const v = h.end === 'a' ? g.ha : g.hb;
        edit((x) => void setHandle(x, h.seg, h.end, { x: v.x + dx * step, y: v.y + dy * step }));
      }
      return true;
    }
    edit((x) => nudge(x, k.sel, dx * step, dy * step));
    return true;
  }
  // R turns a selected closed outline by 45°
  if (key === 'r' && !e.altKey) {
    const outs = outlinesIn(k.draft, k.sel);
    if (!outs.length) return false;
    e.preventDefault();
    const b = bounds(k.draft, outs.flat())!;
    const c = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
    edit((x) => rotateSel(x, { pts: outs.flat(), segs: [] }, c, 45));
    return true;
  }
  return false;
}
