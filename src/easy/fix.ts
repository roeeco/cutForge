// One-click fixes for what the guardrails cannot prevent (milestone 39): a
// panel resized under its shapes, a material change, pieces moved on the
// sheet. `fixIssue` changes only what its issue is about.
import type { Design } from '../model/types';
import type { Issue } from '../model/validate';
import { findDetail, setConnection, setPanelSize, setPointRound, solve } from '../model/ops';
import { bandOf, foldRadius } from '../model/bands';
import { cornerOf } from '../model/wings';
import { matOf } from '../model/materials';
import { fitShape } from './guard';
import { validate } from '../model/validate';
import { pieceCopies } from '../model/pack';
import { pieceRoot } from '../model/pieces';
import { profileOf } from '../model/materials';
import { regenerate, templateById } from '../templates/registry';

/** The same issue (key and target) is still reported. */
const sheetIssueFor = (d: Design, i: Issue) => validate(d).some((x) => x.key === i.key && x.target.kind === i.target.kind && x.target.id === i.target.id);

/**
 * Shrink a piece too big for its sheet, uniformly, until its whole net fits inside the margin: its
 * root board (and the tray's height when it has walls) scaled by one factor, a few passes since
 * joints and folds do not scale exactly. Done only when it fits.
 */
function shrinkToSheet(d: Design, rootId: string): boolean {
  if (!d.panels[rootId]) return false;
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
    // a divider keeps its place and reach in proportion (milestone 44)
    for (const q of Object.values(d.panels))
      if (q.divider && q.place?.host === rootId) q.divider = { ...q.divider, at: { x: q.divider.at.x * f, y: q.divider.at.y * f }, reach: [q.divider.reach[0] * f, q.divider.reach[1] * f] };
    setPanelSize(d, rootId, p.w * f, p.h * f);
    solve(d);
  }
  return fits().ok;
}

/** Put a copy's contents in place of a draft's, key by key (an immer draft cannot be reassigned). */
function replaceWith(d: Design, src: Design) {
  const t = d as unknown as Record<string, unknown>, f = src as unknown as Record<string, unknown>;
  for (const k of Object.keys(t)) if (!(k in f)) delete t[k];
  for (const k of Object.keys(f)) t[k] = f[k];
}

/**
 * A template's design shrinks through its own sizes (milestone 92), so the
 * next change of a size does not grow it back: every size in millimetres is
 * scaled by one factor (never under its minimum) and the design regenerated,
 * a few passes, until the piece fits.
 */
function shrinkTemplate(d: Design): boolean {
  const t = d.template && templateById(d.template.id);
  if (!t) return false;
  let cur: Design = JSON.parse(JSON.stringify(d));
  for (let k = 0; k < 6; k++) {
    const still = validate(cur).find((x) => x.key === 'val.tooBig');
    if (!still) {
      replaceWith(d, cur);
      return true;
    }
    const c = pieceCopies(cur).find((x) => x.copy === 0 && pieceRoot(x.pieceKey) === still.target.id) ?? pieceCopies(cur).find((x) => x.copy === 0);
    if (!c) return false;
    const prof = profileOf(cur, c.mat);
    const W = prof.sheetW - 2 * cur.sheetMargin, H = prof.sheetH - 2 * cur.sheetMargin;
    const canTurn = prof.grain === 'none' || !!cur.allowRotate;
    const f = Math.min(0.995, Math.max(Math.min(W / c.w, H / c.h), canTurn ? Math.min(W / c.h, H / c.w) : 0) * 0.995);
    const params = { ...cur.template!.params };
    for (const p of t.params) if (p.type === 'number' && p.unit === 'mm' && typeof params[p.key] === 'number') params[p.key] = Math.max(p.min ?? 0, Math.round(Number(params[p.key]) * f * 10) / 10);
    cur = regenerate(cur, params).design;
  }
  return false;
}

/** Warnings that do not stop a cut: shown as notes, not as things to fix. */
import { NOTE_KEYS } from './notes';
export { NOTE_KEYS };
export const blocking = (i: Issue) => !NOTE_KEYS.has(i.key);

const FIXABLE = new Set(['val.holeOutside', 'val.tooThin', 'val.shapesOverlap', 'val.stencil', 'val.stencilShape', 'val.tooBig', 'val.tooBigGrain', 'val.offSheet', 'val.piecesOverlap', 'val.bendTight', 'val.bendStyle', 'val.bendRoom', 'val.fluteBend']);
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
    case 'val.stencil':
    case 'val.stencilShape': {
      const f = i.target.kind === 'detail' ? findDetail(d, i.target.id) : null;
      if (!f) return false;
      f.detail.op = 'engrave';
      delete f.detail.through;
      return true;
    }
    case 'val.tooBig': {
      if (i.target.kind !== 'panel') return false;
      // done only when it fits and nothing new stops the cut (milestone 92); else the design is left as it was
      const work = JSON.parse(JSON.stringify(d)) as Design;
      const had = new Set(validate(work).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key));
      const ok = work.template ? shrinkTemplate(work) : shrinkToSheet(work, i.target.id);
      if (!ok || validate(work).some((x) => !NOTE_KEYS.has(x.key) && !had.has(x.key))) return false;
      replaceWith(d, work);
      return true;
    }
    case 'val.tooBigGrain':
      // it fits turned: let the packer turn pieces against the grain
      d.allowRotate = true;
      d.placements = {};
      return !sheetIssueFor(d, i);
    case 'val.bendTight':
    case 'val.bendStyle':
    case 'val.bendRoom':
    case 'val.fluteBend':
      return fixBend(d, i);
    case 'val.offSheet':
    case 'val.piecesOverlap':
      // let the packer place every piece again; done only when the sheet check is clear of it (BUGFIX_PLAN B15)
      d.placements = {};
      return !sheetIssueFor(d, i);
  }
  return false;
}

/**
 * A fold's bend (milestone 63): too tight, it gets the radius it needs; a
 * chosen pattern that does not reach goes back to Automatic; a radius too
 * large for its boards comes down to the largest that fits.
 */
function fixBend(d: Design, i: Issue): boolean {
  const [pid, cid] = i.pair ?? [];
  // round a tray's rounded corner (milestone 64): its radius is the base's corner's
  const w = Object.values(d.connections).find((x) => x.wing && x.a.panelId === pid && x.b.panelId === cid);
  if (w && i.key === 'val.bendTight') {
    const k = cornerOf(d, w);
    if (!k) return false;
    // the base's corner radius the check worked out
    setPointRound(d, k.base, k.i, Number(i.vars.r));
    return !validate(d).some((x) => x.key.startsWith('val.bend') && x.pair?.[0] === pid && x.pair?.[1] === cid);
  }
  // across the flutes: perforations bend either way (milestone 66)
  if (i.key === 'val.fluteBend') {
    const c = w ?? Object.values(d.connections).find((x) => x.grown && x.a.panelId === pid && x.b.panelId === cid);
    if (!c) return false;
    setConnection(d, c.id, { bend: { pattern: 'perf' } });
    return !validate(d).some((x) => x.key === 'val.fluteBend' && x.pair?.[0] === pid && x.pair?.[1] === cid);
  }
  if (w && i.key === 'val.bendStyle') {
    setConnection(d, w.id, { bend: { pattern: 'auto' } });
    return true;
  }
  const c = Object.values(d.connections).find((x) => x.grown && x.a.panelId === pid && x.b.panelId === cid);
  if (!c) return false;
  if (i.key === 'val.bendStyle') setConnection(d, c.id, { bend: { pattern: 'auto' } });
  else if (i.key === 'val.bendTight') setConnection(d, c.id, { radius: Number(i.vars.r) });
  else {
    let lo = 0, hi = foldRadius(d, c);
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      setConnection(d, c.id, { radius: mid });
      if (bandOf(d, d.connections[c.id])?.fits) lo = mid;
      else hi = mid;
    }
    setConnection(d, c.id, { radius: Math.floor(lo * 10) / 10 });
  }
  return !validate(d).some((x) => x.key.startsWith('val.bend') && x.pair?.[1] === cid);
}
