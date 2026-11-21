// The ends of a board (milestone 161, GROW_ENDINGS_PLAN.md): every edge of a
// grown board but the one it hinges on ends in something, and every ending is
// set the same way. An edge is either
//   free   it ends in nothing, a flap (plain, tuck, dust, glue, hang) or a
//          fold-over: one at a time, at a length that is automatic until it is
//          set, folded (flaps) about its crease with a grown fold's numbers
//   meets  it is joined to another board's edge or face: a lip (the seam's
//          glue flap, offered first wherever the materials allow it) or one of
//          the seam's other joints, the lip's width automatic until it is set
// An edge joined by a grown fold (the edge the board hinges on, or one a
// child board grows from) and an edge a lid's closure or a band's wing owns
// are not ends: they are set where those are.
//
// The rules, in one place:
//   1. one ending per edge; changing it is one edit that takes the old one off
//   2. a new ending starts at its automatic length and follows its board while
//      it stays automatic; a length typed or dragged is kept; null makes it
//      automatic again
//   3. a fold is a grown fold's 360° number: 180 lies flat, 90 stands square
//      towards the board's material side, past 180 folds the other way (out)
//   4. a lip and a fold-over fold flat against a board: they have a length and
//      no fold of their own
import type { Connection, ConnectionKind, Design, EdgeFlap, FlapShape, Panel } from './types';
import type { MsgKey } from '../i18n';
import { FACE, findEdge, isCurveKey, panelEdges, segLength, type EdgeSeg } from './edges';
import { matOf } from './materials';
import { flapDefaultLen, flapSpec } from './edgeFeatures';
import { tOf } from './materials';
import { foldOverDims } from './foldover';
import { flapWidth, pairKinds } from './jointDefaults';

/** How a free edge ends. */
export type Ending = 'none' | FlapShape | 'foldover';
/** Every ending a free edge can take, in the order the card shows them. */
export const ENDINGS: Ending[] = ['none', 'plain', 'tuck', 'dust', 'glue', 'hang', 'foldover'];
/** The joint a meeting edge calls its lip. */
export const LIP: ConnectionKind = 'glue';
/** Shortest edge that takes an ending (mm). */
export const MIN_ENDING_EDGE = 10;

export type FreeEnding = {
  kind: 'free';
  edge: string;
  ending: Ending;
  /** Its length (a flap's reach, a fold-over's liner), mm; 0 for none. */
  len: number;
  /** The length follows the board (rule 2). */
  auto: boolean;
  /** Its fold, a grown fold's number (rule 3); null: it does not fold on its own (none, a fold-over). */
  hinge: number | null;
  /** Why an ending cannot go on this edge (absent: it can). */
  why: Partial<Record<Ending, MsgKey>>;
};

export type MeetEnding = {
  kind: 'meets';
  edge: string;
  conn: string;
  /** The board on the other side. */
  other: string;
  /** The board that carries the joint's flap (a lip is cut on it). */
  owner: string;
  joint: ConnectionKind;
  /** The joints the seam can be. */
  options: ConnectionKind[];
  /** A lip's width (mm), when it is one. */
  width: number | null;
  auto: boolean;
};

export type BoardEnding = FreeEnding | MeetEnding;

const keyOf = (p: Panel, edge: string) => findEdge(p, edge)?.key;

/** The connections on this edge of a board (by its key), not counting boards standing in from it. */
function connsOnEdge(d: Design, p: Panel, edge: string): Connection[] {
  const k = keyOf(p, edge);
  if (!k) return [];
  return Object.values(d.connections).filter(
    (c) =>
      (c.a.panelId === p.id && keyOf(p, c.a.edge) === k && !(c.grown && c.offset > 0)) ||
      (c.b.panelId === p.id && c.b.edge !== FACE && keyOf(p, c.b.edge) === k),
  );
}

/** Does this board take ends at all: a board of card or corrugated that was grown off another. */
export function takesEndings(d: Design, panelId: string): boolean {
  const p = d.panels[panelId];
  if (!p || p.construction || matOf(d, panelId).kind === 'plywood') return false;
  return Object.values(d.connections).some((c) => c.grown && c.b.panelId === panelId);
}

/** A flap's fold as a grown fold's number (rule 3). */
export function flapHinge(f: Pick<EdgeFlap, 'shape' | 'angle' | 'dir'>, t: number): number {
  const s = flapSpec({ id: '', edge: '', len: 10, ...f }, t);
  return s.dir === 'out' ? 180 + s.angle : 180 - s.angle;
}

/** And back: a grown fold's number as a flap's angle and side. */
export function hingeToFlap(h: number): { angle: number; dir: 'in' | 'out' } {
  const x = ((h % 360) + 360) % 360;
  if (x <= 180) return { angle: Math.round((180 - x) * 10) / 10, dir: 'in' };
  return { angle: Math.round((x - 180) * 10) / 10, dir: 'out' };
}

/** Why an ending cannot go on a free edge (milestone 161), or null. */
function endingWhy(d: Design, p: Panel, e: EdgeSeg, ending: Ending): MsgKey | null {
  if (ending === 'none') return null;
  if (matOf(d, p.id).kind === 'plywood') return 'flap.why.plywood';
  if (segLength(e) < MIN_ENDING_EDGE) return 'endings.why.short';
  if (ending === 'foldover') {
    // a fold-over turns in over a wall's top: a grown board, an edge across from its hinge
    if (!Object.values(d.connections).some((c) => c.grown && c.b.panelId === p.id)) return 'endings.why.notGrown';
    if (e.key !== 'e2') return 'endings.why.foldTop';
  }
  return null;
}

/** The ends of a board: one row per edge it can end on (milestone 161). Empty for a board that takes none. */
export function boardEndings(d: Design, panelId: string): BoardEnding[] {
  const p = d.panels[panelId];
  if (!p || !takesEndings(d, panelId)) return [];
  const t = tOf(d, panelId);
  const out: BoardEnding[] = [];
  for (const e of panelEdges(p)) {
    if (isCurveKey(e.key) || segLength(e) < MIN_ENDING_EDGE) continue;
    const cs = connsOnEdge(d, p, e.key);
    if (cs.some((c) => c.grown || c.wing || c.kind === 'closure' || c.bandEnd)) continue;
    const seam = cs[0];
    if (seam) {
      const other = seam.a.panelId === p.id ? seam.b.panelId : seam.a.panelId;
      const options = pairKinds(d, seam);
      out.push({
        kind: 'meets',
        edge: e.key,
        conn: seam.id,
        other,
        owner: seam.a.panelId,
        joint: seam.kind,
        options,
        width: seam.kind === LIP ? flapWidth(d, seam) : null,
        auto: seam.flap === null,
      });
      continue;
    }
    const f = p.edgeFlaps?.find((x) => keyOf(p, x.edge) === e.key);
    const fo = p.foldOvers?.find((x) => keyOf(p, x.edge) === e.key);
    const why: FreeEnding['why'] = {};
    for (const k of ENDINGS) {
      const w = endingWhy(d, p, e, k);
      if (w) why[k] = w;
    }
    if (f) {
      const s = flapSpec(f, t);
      out.push({ kind: 'free', edge: e.key, ending: s.shape, len: s.len, auto: !!f.auto, hinge: flapHinge(f, t), why });
    } else if (fo) {
      out.push({ kind: 'free', edge: e.key, ending: 'foldover', len: foldOverDims(d, p, fo).liner, auto: fo.depth === null, hinge: null, why });
    } else out.push({ kind: 'free', edge: e.key, ending: 'none', len: 0, auto: true, hinge: null, why });
  }
  return out;
}

/** One row of a board's ends. */
export function boardEnding(d: Design, panelId: string, edge: string): BoardEnding | undefined {
  const p = d.panels[panelId];
  const k = p && keyOf(p, edge);
  return k ? boardEndings(d, panelId).find((r) => r.edge === k) : undefined;
}

/** An automatic flap's length on its edge now (rule 2). */
export function autoFlapLen(d: Design, p: Panel, f: EdgeFlap): number | null {
  const e = findEdge(p, f.edge);
  return e ? flapDefaultLen(d, p, e, f.shape ?? 'plain') : null;
}

/**
 * Automatic flaps follow their boards (rule 2): their length re-worked out
 * from the board as it is now. Called by `solve` once the boards are sized.
 * True when one changed.
 */
export function refreshAutoFlaps(d: Design): boolean {
  let changed = false;
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p?.edgeFlaps?.some((f) => f.auto)) continue;
    for (const f of p.edgeFlaps) {
      if (!f.auto) continue;
      const len = autoFlapLen(d, p, f);
      if (len !== null && Math.abs(len - f.len) > 1e-9) {
        f.len = len;
        changed = true;
      }
    }
  }
  return changed;
}
