// The Shapes tool's Parts (milestone 183): a click puts the chosen part down, on the board clicked (cut, engraved,
// scored or added, as the shape card says) or, with the operator *Board*, as a board of its own on the floor. Each
// waits for ✓ as any new shape does. A puzzle cut is lines over the board clicked.
import { detailSel, useStore } from '../store/store';
import { addPartBoard, addPartShape, addPuzzle, addRootPanel } from '../model/ops';
import { defaultPart } from '../model/parts';

/** A click on a board (its local coordinates) with Parts in use. */
export function placePart(panelId: string, x: number, y: number) {
  const st = useStore.getState();
  st.cancelPending();
  if (!st.design.panels[panelId]) return;
  if (st.partKind === 'puzzle') {
    st.apply((d) => void addPuzzle(d, panelId, st.puzzlePiece));
    st.select({ kind: 'panel', id: panelId });
    return;
  }
  let id: string | null = null;
  const kind = st.partKind;
  st.apply((d) => void (id = addPartShape(d, panelId, defaultPart(kind), Math.round(x), Math.round(y), st.shapeOp, undefined, st.shapeThrough)));
  if (id) {
    st.select(detailSel([id]));
    st.beginPending({ kind: 'shape', ids: [id], panelId });
  }
}

/** A click on the floor (world x, z) with Parts in use and the operator *Board*: the part a board of its own there. */
export function placePartBoard(x: number, z: number) {
  const st = useStore.getState();
  st.cancelPending();
  let id: string | null = null;
  const kind = st.partKind;
  st.apply((d) => {
    if (kind === 'puzzle') {
      // a board of a puzzle's size, the lines over it
      const b = addRootPanel(d, Math.round(x - 100), Math.round(z + 75), 200, 150);
      addPuzzle(d, b, st.puzzlePiece);
      id = b;
    } else id = addPartBoard(d, defaultPart(kind), Math.round(x), Math.round(z));
  });
  if (id) {
    st.select({ kind: 'panel', id });
    st.beginPending({ kind: 'panel', ids: [id], panelId: id });
  }
}
