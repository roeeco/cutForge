// One-click fixes for what the guardrails cannot prevent (milestone 39): a
// panel resized under its shapes, a material change, pieces moved on the
// sheet. `fixIssue` changes only what its issue is about.
import type { Design } from '../model/types';
import type { Issue } from '../model/validate';
import { findDetail, setPanelSize, solve } from '../model/ops';
import { matOf } from '../model/materials';
import { fitShape } from './guard';
import { validate } from '../model/validate';
import { pieceCopies } from '../model/pack';
import { pieceRoot } from '../model/pieces';
import { profileOf } from '../model/materials';

/** The same issue (key and target) is still reported. */
const sheetIssueFor = (d: Design, i: Issue) => validate(d).some((x) => x.key === i.key && x.target.kind === i.target.kind && x.target.id === i.target.id);

/**
 * Shrink a piece too big for its sheet, uniformly, until its whole net fits inside the margin: its
 * root board (and the tray's height when it has walls) scaled by one factor, a few passes since
 * joints and folds do not scale exactly. Done only when it fits.
 */
function shrinkToSheet(d: Design, rootId: string): boolean {
  const fits = () => {
    const c = pieceCopies(d).find((x) => x.copy === 0 && pieceRoot(x.pieceKey) === rootId);
    if (!c) return { ok: true, f: 1 };
    const prof = profileOf(d, c.mat);
    const W = prof.sheetW - 2 * d.sheetMargin, H = prof.sheetH - 2 * d.sheetMargin;
    const canTurn = prof.grain === 'none' || !!d.allowRotate;
    const f0 = Math.min(W / c.w, H / c.h), f90 = canTurn ? Math.min(W / c.h, H / c.w) : 0;
    const f = Math.max(f0, f90);
    return { ok: f >= 1 - 1e-9, f };
  };
  for (let k = 0; k < 6; k++) {
    const r = fits();
    if (r.ok) {
      d.placements = {};
      return true;
    }
    const p = d.panels[rootId];
    if (!p) return false;
    const f = r.f * 0.995;
    for (const t of Object.values(d.trays ?? {})) if (t.baseId === rootId) t.height = Math.max(5, t.height * f);
    // what stands on the board keeps its place relative to it: dividers' offsets, boards placed on it
    for (const c of Object.values(d.connections)) if (c.grown && c.a.panelId === rootId && !c.trayId && c.offset > 0) c.offset *= f;
    for (const q of Object.values(d.panels)) if (q.place?.host === rootId) (q.place.x *= f), (q.place.y *= f);
    setPanelSize(d, rootId, p.w * f, p.h * f);
    solve(d);
  }
  return fits().ok;
}

/** Warnings that do not stop a cut: shown as notes, not as things to fix. */
export const NOTE_KEYS = new Set(['val.split', 'val.bevel']);
export const blocking = (i: Issue) => !NOTE_KEYS.has(i.key);

const FIXABLE = new Set(['val.holeOutside', 'val.tooThin', 'val.shapesOverlap', 'val.stencil', 'val.tooBig', 'val.tooBigGrain', 'val.offSheet', 'val.piecesOverlap']);
export const canFix = (i: Issue) => FIXABLE.has(i.key);

/** Apply the fix for an issue to the design (in place); false when there is none or it did not work. */
export function fixIssue(d: Design, i: Issue): boolean {
  switch (i.key) {
    case 'val.holeOutside':
    case 'val.tooThin':
    case 'val.shapesOverlap':
      // move the shape inside, away from the edge, the joints and the other cut-outs
      // done only when the shape is clear of its problem
      return i.target.kind === 'detail' && fitShape(d, i.target.id) && !sheetIssueFor(d, i);
    case 'val.stencil': {
      const f = i.target.kind === 'detail' ? findDetail(d, i.target.id) : null;
      if (!f) return false;
      f.detail.op = 'engrave';
      delete f.detail.through;
      return true;
    }
    case 'val.tooBig':
      return i.target.kind === 'panel' && shrinkToSheet(d, i.target.id);
    case 'val.tooBigGrain':
      // it fits turned: let the packer turn pieces against the grain
      d.allowRotate = true;
      d.placements = {};
      return !sheetIssueFor(d, i);
    case 'val.offSheet':
    case 'val.piecesOverlap':
      // let the packer place every piece again; done only when the sheet check is clear of it (BUGFIX_PLAN B15)
      d.placements = {};
      return !sheetIssueFor(d, i);
  }
  return false;
}
