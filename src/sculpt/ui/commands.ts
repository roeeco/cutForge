// Waffle commands shared by the rail, the card and the keyboard (WAFFLE_MODE.md §5).
import { selectedShapeIds, shapeSel, useStore } from '../../store/store';
import type { Design } from '../../model/types';
import { deleteShapes, duplicateShapes, groupShapes, moveShapes, parentOf, setHole, ungroupShape } from '../ops';

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
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    if (s.selection?.kind === 'shape') deleteSelected();
    return true;
  }
  if (e.key === 'Escape') {
    if (s.txnBase || s.pending) return true;
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
