// Sketching on a board's face in Workshop (the shapes workbench's 2D sketcher brought to the boards): the student picks
// a face, the sketch view opens square-on to it with the board drawn underneath, and Finish makes what was drawn a
// shape on the board (a cut-out, an engraving, a score line, added material) or a board of its own lying on it.
//
// The sketch is drawn in the board's own coordinates (millimetres from its corner), seen from the face picked: a face
// that shows the board the other way round (its coordinates' right hand to the left) is mirrored left to right, and
// the sketch mirrored back when it is written.
import type { Design, DetailOp, P2, SketchGraph } from '../model/types';
import { addPlacedOutline, newId } from '../model/ops';
import { panelNotches, panelOutline } from '../model/geometry';
import { instancePolys } from '../model/outline';
import { scaleSketch } from './ops';
import { sketchRegion } from './regions';
import { graphShape } from './cutforge';

/** What a board sketch becomes: a shape of this kind on the board, or a board of its own lying on it. */
export type BoardSketchOp = DetailOp | 'board';

/** Where a sketch on a board's face is drawn and what Finish makes of it. */
export type BoardSketch = {
  panelId: string;
  /** The face it was picked on: 1 its material side, −1 the other. */
  side: 1 | -1;
  /** Seen from that face, the board's coordinates run right to left: the sketch is their mirror image. */
  mirror: boolean;
  op: BoardSketchOp;
  /** A cut through every board in its path (as the Shapes tool's *Cut through the whole design*). */
  through: boolean;
};

/** A point of the board as the sketch shows it (and back: the same mirror). */
export const boardToSketch = (mirror: boolean, p: P2): P2 => (mirror ? { x: -p.x, y: p.y } : p);

/**
 * Is a board seen mirrored from this face? Its coordinates read left to right seen from the side its frame's normal
 * points to; its material side (face 1) is that side when its frame says so (`side` 1), and the other otherwise.
 */
export const mirroredFrom = (frameSide: 1 | -1, face: 1 | -1): boolean => frameSide * face < 0;

/** The board and its shapes as outlines under the sketch, in sketch coordinates. */
export function boardUnderlay(d: Design, b: Pick<BoardSketch, 'panelId' | 'mirror'>): P2[][] {
  const p = d.panels[b.panelId];
  if (!p) return [];
  const rings: P2[][] = [panelOutline(p, panelNotches(d, p))];
  for (const dt of p.details) for (const inst of instancePolys(dt)) rings.push(...inst.polys);
  return rings.map((r) => r.map((q) => boardToSketch(b.mirror, q)));
}

/** The sketch in the board's own coordinates (a copy). */
function onBoard(draft: SketchGraph, mirror: boolean): SketchGraph {
  const g: SketchGraph = JSON.parse(JSON.stringify(draft));
  if (mirror) scaleSketch(g, -1, 1);
  return g;
}

/** Why Finish cannot make this, or null: nothing closed to make, or a board from more than one outline. */
export function boardSketchBlock(draft: SketchGraph, op: BoardSketchOp): 'empty' | 'oneOutline' | null {
  const region = sketchRegion(draft);
  if (!region.length) return 'empty';
  if (op === 'board' && (region.length > 1 || region[0].length > 1)) return 'oneOutline';
  return null;
}

/**
 * Write a finished board sketch into the design (one undo step at the caller): a shape on the board, which keeps the
 * sketch itself so its curves and corners stay editable (milestone 104), or a board lying on the face. Returns what was
 * made, or null when nothing could be.
 */
export function writeBoardSketch(d: Design, b: BoardSketch, draft: SketchGraph): { kind: 'detail' | 'panel'; id: string } | null {
  const p = d.panels[b.panelId];
  if (!p || boardSketchBlock(draft, b.op)) return null;
  const g = onBoard(draft, b.mirror);
  if (b.op === 'board') {
    const ring = sketchRegion(g)[0][0];
    const id = addPlacedOutline(d, p.id, b.side, { kind: 'poly', pts: ring });
    return id ? { kind: 'panel', id } : null;
  }
  const id = newId('x');
  p.details.push({ id, shape: 'polygon', op: b.op, cx: 0, cy: 0, w: 1, h: 1, path: { polys: [] }, ...(b.through && b.op === 'cut' ? { through: true } : {}) });
  if (!graphShape(d, id, g)) {
    p.details = p.details.filter((x) => x.id !== id);
    return null;
  }
  return { kind: 'detail', id };
}
