// The sketch view's keys (SKETCH_OVERHAUL.md §8.5), loaded with the view and
// registered with the keyboard handler in the main chunk.
import { useStore } from '../../../store/store';
import type { SketchGraph } from '../../../model/types';
import { bounds, selPts, type SkSel } from '../../../sketch/model';
import { rotateSel, setLock } from '../../../sketch/ops';
import { copySel, deleteSel, nudge, outlinesIn, pasteClip, pasteOffset, type Clip } from '../../../sketch/select';
import { setHandle } from '../../../sketch/tools';
import { sketchHandlers } from '../commands';

const st = () => useStore.getState();

/** The sketch view's clipboard (copied points and segments). */
let sketchClip: Clip | null = null;

/** Keys in the sketch view after the tool's own: Esc, Delete, arrows, R, locks and the clipboard. */
export function sketchViewKey(e: KeyboardEvent): boolean {
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

sketchHandlers.keys = sketchViewKey;
