// Waffle commands shared by the rail, the card and the keyboard (WAFFLE_MODE.md §5).
import { selectedShapeIds, shapeSel, useStore } from '../../store/store';
import type { Design, V3 } from '../../model/types';
import { dropOffset } from '../workplane';
import { outcomeOf, outcomeUi } from '../outcomes';

import { deleteShapes, duplicateShapes, groupShapes, hullShapes, moveShapes, parentOf, setHole, ungroupShape } from '../ops';

const st = () => useStore.getState();


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
/** Wrap the selected shapes in their hull (milestone 121). */
export function hullSelected() {
  const ids = selectedShapeIds(st().selection);
  if (!canGroup(st().design, ids) || ids.some((id) => st().design.sculpt?.shapes[id]?.hole)) return;
  let g: string | null = null;
  st().apply((d) => void (g = hullShapes(d as Design, ids)));
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
/** A nudge as part of a held key: one transaction, committed when the key comes up. */
let held: { ids: string; off: V3 } | null = null;
function nudgeHeld(ids: string[], dx: number, dz: number) {
  const key = ids.join(',');
  if (!held || held.ids !== key) {
    if (st().txnBase) st().commit();
    held = { ids: key, off: [0, 0, 0] };
    const up = () => {
      window.removeEventListener('keyup', up);
      held = null;
      st().commit();
    };
    window.addEventListener('keyup', up);
  }
  // along the workplane's own axes when there is one
  const w = st().sculpt.work;
  const [u, v] = w ? planeAxes(w.n) : [[1, 0, 0] as V3, [0, 0, 1] as V3];
  held.off = [held.off[0] + u[0] * dx + v[0] * dz, held.off[1] + u[1] * dx + v[1] * dz, held.off[2] + u[2] * dx + v[2] * dz];
  const off = held.off;
  st().preview((d) => moveShapes(d as Design, ids, off));
}
/** Two axes in a plane with normal n: x as near the world's x as it can be. */
export function planeAxes(n: V3): [V3, V3] {
  const ref: V3 = Math.abs(n[0]) > 0.9 ? [0, 0, 1] : [1, 0, 0];
  const d0 = ref[0] * n[0] + ref[1] * n[1] + ref[2] * n[2];
  let u: V3 = [ref[0] - n[0] * d0, ref[1] - n[1] * d0, ref[2] - n[2] * d0];
  const l = Math.hypot(...u) || 1;
  u = [u[0] / l, u[1] / l, u[2] / l];
  const v: V3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return [u, [-v[0], -v[1], -v[2]]];
}
/** Drop the selection onto the workplane (the floor when there is none). */
export function dropSelected() {
  const ids = selectedShapeIds(st().selection);
  const w = st().sculpt.work ?? { o: [0, 0, 0] as V3, n: [0, 1, 0] as V3 };
  const off = dropOffset(st().design, ids, w);
  if (off) st().apply((d) => moveShapes(d as Design, ids, off));
}

export function nudgeSelected(dx: number, dz: number, dy = 0) {
  const ids = selectedShapeIds(st().selection);
  if (ids.length) st().apply((d) => moveShapes(d as Design, ids, [dx, dy, dz]));
}

/** Leave the group being worked inside, the group selected: the card and the gizmo show it, not the member last picked (exploratory test report, finding 10). */
export function leaveGroup() {
  const g = st().sculpt.focus;
  st().setSculpt({ focus: null });
  if (g && st().design.sculpt?.shapes[g]) st().select(shapeSel([g]));
}

/** Select every shape at this level: the top level, or the members of the group being worked inside. */
export function selectAllShapes() {
  const sc = st().design.sculpt;
  const f = st().sculpt.focus;
  const ids = (f ? sc?.shapes[f]?.children : sc?.order) ?? [];
  if (ids.length) st().select(shapeSel(ids));
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
  // every shape, not the page's text (exploratory test report, 24)
  if (mod && key === 'a' && s.sculpt.stage === 'shape') {
    e.preventDefault();
    selectAllShapes();
    return true;
  }
  if (mod) return false;
  // the sketch tool: Enter opens the sketch view on its plane (milestone 57)
  if (e.key === 'Enter' && s.tool === 'sketch' && !s.pending && s.sculpt.stage === 'shape') {
    e.preventDefault();
    s.openSketch(null);
    return true;
  }
  // stage 2: an outcome's own selection (not a shape) is deleted by the outcome
  const made = outcomeOf(s.design);
  const onDelete = s.sculpt.stage === 'make' && made ? outcomeUi(made)?.onDelete : undefined;
  if ((e.key === 'Delete' || e.key === 'Backspace') && onDelete && s.selection?.kind !== 'shape') {
    e.preventDefault();
    onDelete();
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
    else if (s.sculpt.focus) leaveGroup();
    return true;
  }
  if (e.key.startsWith('Arrow') && s.selection?.kind === 'shape') {
    // 1 mm, Shift 5 mm; a key held down is one undo step (milestone 121)
    const step = e.shiftKey ? 5 : 1;
    nudgeHeld(s.selection.ids, e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
    e.preventDefault();
    return true;
  }
  // milestone 132: E edits a group in place, P measures the angle between two faces
  if (!mod && key === 'e' && s.selection?.kind === 'shape' && s.design.sculpt?.shapes[s.selection.id]?.kind === 'group') {
    s.setSculpt({ focus: s.selection.id });
    s.select(null);
    return true;
  }
  if (!mod && key === 'p' && s.sculpt.stage === 'shape') {
    s.setSculpt({ protractor: s.sculpt.protractor ? null : {} });
    return true;
  }
  // the workplane (milestone 121): W picks a face, D drops the selection onto it
  if (!mod && key === 'w' && s.sculpt.stage === 'shape') {
    s.setSculpt({ picking: !s.sculpt.picking });
    return true;
  }
  if (!mod && key === 'd' && s.selection?.kind === 'shape') {
    dropSelected();
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
export const sketchHandlers: { key?: (e: KeyboardEvent) => boolean; keys?: (e: KeyboardEvent) => boolean; duplicate?: () => void } = {};

/** Keys in the sketch view: the view registers its handlers (they load with it); Esc works before they have. */
export function sketchKey(e: KeyboardEvent): boolean {
  if (sketchHandlers.key?.(e)) return true;
  if (sketchHandlers.keys?.(e)) return true;
  const s = st();
  const k = s.sketch;
  if (!k || e.ctrlKey || e.metaKey || e.key !== 'Escape') return false;
  e.preventDefault();
  if (k.tool !== 'select') s.setSketch({ tool: 'select' });
  else s.setSketch({ sel: { pts: [], segs: [] } });
  return true;
}
