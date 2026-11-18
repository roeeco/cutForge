// The stage side of Quick build's actions (milestone 38): each runs a recipe
// as a ghost that ✓ makes, as one undo step, then the rail goes back to Select.
import type { MaterialKind, P2, V3 } from '../model/types';
import { detailSel, useStore, type BoxKind } from '../store/store';
import { addBoxBase, boxTray, dividerLine, stickerRecipe, type Footprint } from './recipes';
import { boxLid, setBoxLid, type LidChoice } from './lid';
import { stickerById, stickerSize } from './stickers';

/** Box: the dragged footprint becomes a base waiting for ✓, with its walls rising as a ghost at the last height used. */
export function boxFootprintGo(a: V3, b: V3) {
  const st = useStore.getState();
  st.cancelPending();
  let id: string | null = null;
  st.apply((d) => void (id = addBoxBase(d, { kind: st.boxFoot, x0: a[0], z0: a[2], x1: b[0], z1: b[2], sides: st.boxSides, r: st.boxCorner, height: st.boxHeight })));
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
  // the Box action's kind (milestone 73): only for a box made with it, never for Workshop's Extrude
  const fromBox = !!st.pending?.ids.includes(ex.baseId);
  const kind = fromBox ? boxKindFor(st.viewPrefs.boxKind, st.design.material.kind, st.boxFoot) : 'open';
  // a carton (milestone 68), or a box with its automatic lid made with it (LIDS_LINES_PROJECTS_PLAN.md §3.2)
  st.apply((x) => void boxTray(x, ex.baseId, ex.height, kind));
  st.set({ extrude: null, boxHeight: ex.height });
  const g = useStore.getState().pending;
  if (g && g.ids.includes(ex.baseId)) {
    // the Box: base and walls together
    useStore.getState().confirmPending();
    useStore.getState().select({ kind: 'panel', id: ex.baseId });
  }
}

/** Why the Box action cannot make a carton here (null when it can): a carton folds from card or corrugated, on a rectangle. */
export function cartonWhy(material: MaterialKind, foot: Footprint['kind']): 'quick.kind.cartonNo' | null {
  return material === 'plywood' || foot !== 'rect' ? 'quick.kind.cartonNo' : null;
}

/** The kind the Box action makes: the one chosen, unless a carton cannot be made here. */
export function boxKindFor(kind: BoxKind | undefined, material: MaterialKind, foot: Footprint['kind']): BoxKind {
  const k = kind ?? 'open';
  return k === 'carton' && cartonWhy(material, foot) ? 'open' : k;
}

/** ✓ on Quick build's Wall / lid across a box's top: the box's lid (one undo step), then the lid is selected and the rail goes back to Select. */
export function closeBoxGo(trayId: string, choice: LidChoice) {
  const st = useStore.getState();
  st.apply((x) => void setBoxLid(x, trayId, choice));
  const lid = boxLid(useStore.getState().design, trayId);
  const top = lid.kind === 'liftoff' ? lid.top : lid.kind === 'hinged' ? lid.lid : null;
  if (top) useStore.getState().select({ kind: 'panel', id: top });
  if (useStore.getState().tool === 'wall') useStore.getState().setTool('select');
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
