// One-click fixes for what the guardrails cannot prevent (milestone 39): a
// panel resized under its shapes, a material change, pieces moved on the
// sheet. `fixIssue` changes only what its issue is about.
import type { Design } from '../model/types';
import type { Issue } from '../model/validate';
import { findDetail, setPanelSize, solve } from '../model/ops';
import { matOf } from '../model/materials';
import { fitShape } from './guard';

/** Warnings that do not stop a cut: shown as notes, not as things to fix. */
export const NOTE_KEYS = new Set(['val.split', 'val.bevel']);
export const blocking = (i: Issue) => !NOTE_KEYS.has(i.key);

const FIXABLE = new Set(['val.holeOutside', 'val.tooThin', 'val.shapesOverlap', 'val.stencil', 'val.tooBig', 'val.offSheet', 'val.piecesOverlap']);
export const canFix = (i: Issue) => FIXABLE.has(i.key);

/** Apply the fix for an issue to the design (in place); false when there is none or it did not work. */
export function fixIssue(d: Design, i: Issue): boolean {
  switch (i.key) {
    case 'val.holeOutside':
    case 'val.tooThin':
    case 'val.shapesOverlap':
      // move the shape inside, away from the edge, the joints and the other cut-outs
      return i.target.kind === 'detail' && fitShape(d, i.target.id);
    case 'val.stencil': {
      const f = i.target.kind === 'detail' ? findDetail(d, i.target.id) : null;
      if (!f) return false;
      f.detail.op = 'engrave';
      delete f.detail.through;
      return true;
    }
    case 'val.tooBig': {
      if (i.target.kind !== 'panel') return false;
      const p = d.panels[i.target.id];
      if (!p) return false;
      const m = matOf(d, p.id);
      const W = Math.max(m.sheetW, m.sheetH) - 2 * d.sheetMargin, H = Math.min(m.sheetW, m.sheetH) - 2 * d.sheetMargin;
      const [lw, sh] = p.w >= p.h ? [W, H] : [H, W];
      setPanelSize(d, p.id, Math.min(p.w, lw), Math.min(p.h, sh));
      solve(d);
      return true;
    }
    case 'val.offSheet':
    case 'val.piecesOverlap':
      // let the packer place every piece again
      d.placements = {};
      return true;
  }
  return false;
}
