// The stage side of Quick build's actions (milestone 38): each runs a recipe
// as a ghost that ✓ makes, as one undo step, then the rail goes back to Select.
import type { P2, V3 } from '../model/types';
import { detailSel, useStore } from '../store/store';
import { addTray } from '../model/ops';
import { addBoxBase, dividerLine, stickerRecipe } from './recipes';
import { stickerById, stickerSize } from './stickers';

/** Box: the dragged footprint becomes a base waiting for ✓, with its walls rising as a ghost at the last height used. */
export function boxFootprintGo(a: V3, b: V3) {
  const st = useStore.getState();
  st.cancelPending();
  let id: string | null = null;
  st.apply((d) => void (id = addBoxBase(d, { kind: st.boxFoot, x0: a[0], z0: a[2], x1: b[0], z1: b[2], sides: st.boxSides, r: st.boxCorner })));
  if (!id) return;
  st.beginPending({ kind: 'panel', ids: [id], panelId: id });
  st.select({ kind: 'panel', id });
  st.set({ extrude: { baseId: id, height: st.boxHeight } });
}

/** ✓ on the walls rising from a base: the tray; a Box made this way is one undo step with its base. */
export function extrudeGo() {
  const st = useStore.getState();
  const ex = st.extrude;
  if (!ex) return;
  st.apply((x) => void addTray(x, ex.baseId, ex.height));
  st.set({ extrude: null, boxHeight: ex.height });
  const g = useStore.getState().pending;
  if (g && g.ids.includes(ex.baseId)) {
    // the Box: base and walls together
    useStore.getState().confirmPending();
    useStore.getState().select({ kind: 'panel', id: ex.baseId });
  }
}

/** ✕ on the rising walls: a Box's base goes too. */
export function extrudeCancel() {
  const st = useStore.getState();
  const ex = st.extrude;
  st.set({ extrude: null });
  const g = st.pending;
  if (ex && g && g.ids.includes(ex.baseId)) st.cancelPending();
}

/** Sticker: placed where the panel was clicked, a quarter of the panel's size, waiting for ✓. */
export function placeSticker(panelId: string, x: number, y: number) {
  const st = useStore.getState();
  st.cancelPending();
  const p = st.design.panels[panelId];
  if (!p) return;
  const s = stickerById(st.sticker);
  let id: string | null = null;
  st.apply((d) => void (id = stickerRecipe(d, panelId, s.polys, Math.round(x), Math.round(y), stickerSize(p.w, p.h), 'engrave')));
  if (id) {
    st.select(detailSel([id]));
    st.beginPending({ kind: 'shape', ids: [id], panelId });
  }
}

/** ✓ on a divider line: a divider from wall to wall, or a panel standing on the base. */
export function confirmDividerLine(host: string, a: P2, b: P2, height: number): string | null {
  const st = useStore.getState();
  let made: { id: string } | null = null;
  st.apply((d) => void (made = dividerLine(d, host, a, b, height)));
  const r = made as { id: string } | null;
  st.set({ panelGhost: null });
  if (r) st.select({ kind: 'panel', id: r.id });
  st.setTool('select');
  return r?.id ?? null;
}
