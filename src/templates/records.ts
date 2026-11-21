// Preset records and the recogniser (milestone 150, DIELINE_GENERATOR_ANALYSIS.md §4). A record says what a design is
// made of, whatever made it (a structure's words, a mission, the student's own hands): its body, its footprint, how
// each end of a tube closes, its lid, how its parts relate and what it has on it. A catalogue variant is a pattern over
// records (catalogue.ts `match`); `recognise` names a design by the most specific pattern it fits, so a carton built
// board by board is still a reverse tuck end, and a trade code comes with the style it names.
import type { Design, Tray } from '../model/types';
import { endSpec, endStyleOf, trayRing } from '../model/cartons';
import { boxLid } from '../easy/lid';
import { dividersOn } from '../model/dividers';

export type Body = 'tube' | 'cross' | 'flat' | 'folded' | 'stand' | 'solid' | 'free';

export type PresetRecord = {
  /** What the blank is (§2 of the analysis): a tube (walls in a ring, no base), a cross (a base with walls on its edges), one flat board, boards folded off each other with no box, a stand (boards leaning on a base), a ready shape, or anything else. */
  body: Body;
  /** A box's base: a rectangle, an n-gon (`sides`), round (a circle or an oval) or rounded. */
  footprint?: 'rect' | 'poly' | 'round' | 'rounded';
  sides?: number;
  /** How a tube's ends close: a named end style (`END_STYLES`), `custom` for a list of its own, `tuck` (a tuck lid), `roof` (a gable top), or null (open). */
  top?: string | null;
  bottom?: string | null;
  /** A box's lid (`boxLid`). */
  lid?: string;
  /** How a box's walls meet at its corners (milestone 154): the tray's corner joint (`gusset`, `glue`, `finger`, …). */
  corner?: string;
  /** Another part it is sized from: a drawer's sleeve. */
  relation?: 'drawer' | null;
  /** It has dividers. */
  spaces?: boolean;
  /** A board leans on the base (a stand). */
  lean?: boolean;
  /** Cut slits on a board (a card holder's corners, a folder's card slits). */
  slits?: boolean;
  /** Milestone 155: a window cut in a wall (a rectangle or circle in its lower part, not a handle or finger notch). */
  window?: boolean;
  /** Milestone 155: how many boards lean on a stand's base (a phone stand has one). */
  supports?: number;
  /** Milestone 156: a folded piece that is one strip (every board folded off one other, none off two): its folds, sorted (`+90,-90`), and whether they go back and forth (an accordion). */
  strip?: boolean;
  folds?: string;
  accordion?: boolean;
  /** A flat piece's shaped flaps by shape, sorted (`dust,dust,glue,tuck`). */
  flaps?: string;
  /** How many boards a folded piece is (a folder's covers and pockets, a holder's two faces). */
  boards?: number;
  /** A ready shape's kind. */
  solid?: 'pyramid' | 'diamond';
};

const boxTrays = (d: Design): Tray[] => Object.values(d.trays ?? {}).filter((t) => !t.lidOf);

/** The tray a design is: the one with a base that is cut (a drawer's tray, not its sleeve), else the first. */
function mainOf(d: Design): Tray | undefined {
  const ts = boxTrays(d);
  return ts.find((t) => t.base !== 'open') ?? ts[0];
}

function footprintOf(d: Design, t: Tray): Pick<PresetRecord, 'footprint' | 'sides'> {
  const b = d.panels[t.baseId];
  if (!b) return {};
  const s = b.sketch as { kind: string; pts?: { bulge?: number; arc?: unknown }[]; round?: unknown };
  if (s.kind === 'round' || s.round) return { footprint: 'round' };
  const ring = trayRing(d, t);
  // rounded corners are bands between the walls (milestone 64): more walls than straight edges
  if (s.pts?.some((q) => q.bulge || q.arc)) return { footprint: 'rounded' };
  const n = s.pts?.length ?? ring.length;
  return n === 4 ? { footprint: 'rect' } : { footprint: 'poly', sides: n };
}

/** How one end of a tube closes. */
function endOf(d: Design, t: Tray, end: 'top' | 'bottom'): string | null {
  if (end === 'top' && t.top === 'tuck') return 'tuck';
  const spec = endSpec(t, end);
  if (spec) return endStyleOf(spec) ?? 'custom';
  // a gable top (C4): roofs grown off the walls' tops at a slope
  if (end === 'top') {
    const walls = new Set(trayRing(d, t).map((r) => r.wall));
    const roofs = Object.values(d.connections).filter((c) => c.grown && walls.has(c.a.panelId) && c.a.edge === 'e2' && c.angle > 100 && c.angle < 170);
    if (roofs.length >= 2) return 'roof';
  }
  return null;
}

/** A window in one of a tray's walls: a rectangle or circle cut in the lower part of a wall, 12 mm or more. */
function hasWindow(d: Design, t: Tray): boolean {
  return trayRing(d, t).some((r) => {
    const P = d.panels[r.wall];
    return !!P && P.details.some((x) => x.op === 'cut' && (x.shape === 'rect' || x.shape === 'circle') && Math.min(x.w, x.h) >= 12 && x.cy + x.h / 2 < P.h - 3);
  });
}

/** A design's record. */
export function recordOf(d: Design): PresetRecord {
  if (d.make?.solid) return { body: 'solid', solid: d.make.solid.kind };
  const t = mainOf(d);
  const slits = Object.values(d.panels).some((p) => (p.lines ?? []).some((l) => l.type === 'cut'));
  if (t) {
    const ts = boxTrays(d);
    const tube = t.base === 'open';
    const rec: PresetRecord = { body: tube ? 'tube' : 'cross', ...footprintOf(d, t) };
    if (tube) {
      rec.top = endOf(d, t, 'top');
      rec.bottom = endOf(d, t, 'bottom');
    } else {
      rec.lid = boxLid(d, t.id).kind;
      rec.corner = t.cornerKind;
      rec.spaces = dividersOn(d, t.baseId).length > 0;
    }
    rec.relation = ts.length === 2 && ts.some((x) => x !== t && x.base === 'open' && !x.top && !x.bottom) ? 'drawer' : null;
    if (slits) rec.slits = true;
    if (hasWindow(d, t)) rec.window = true;
    return rec;
  }
  const ids = d.order.filter((id) => d.panels[id]);
  const flaps = ids.flatMap((id) => (d.panels[id].edgeFlaps ?? []).map((f) => f.shape ?? 'plain')).sort().join(',');
  if (ids.length === 1) return { body: 'flat', ...(flaps ? { flaps } : {}), ...(slits ? { slits } : {}) };
  const grown = Object.values(d.connections).filter((c) => c.grown);
  const lean = grown.some((c) => c.kind !== 'fold' && c.angle > 10 && c.angle < 170 && Math.abs(c.angle - 90) > 1);
  if (lean) return { body: 'stand', lean: true, supports: grown.filter((c) => c.angle > 10 && c.angle < 170 && Math.abs(c.angle - 90) > 1).length };
  if (grown.length && grown.every((c) => c.kind === 'fold' || c.kind === 'glue')) {
    const rec: PresetRecord = { body: 'folded', boards: ids.length, ...(slits ? { slits } : {}), ...(flaps ? { flaps } : {}) };
    // one strip: a chain, each board's children on one edge at most, no glue and no shaped flaps
    const kids = new Map<string, number>();
    for (const c of grown) kids.set(c.a.panelId, (kids.get(c.a.panelId) ?? 0) + 1);
    const roots = ids.filter((id) => !grown.some((c) => c.b.panelId === id));
    const chain = grown.every((c) => c.kind === 'fold') && !flaps && roots.length === 1 && [...kids.entries()].every(([id, n]) => n <= (id === roots[0] ? 2 : 1));
    if (chain) {
      rec.strip = true;
      const sign = (c: (typeof grown)[number]) => (c.dir === 'up' ? '+' : '-');
      rec.folds = grown.map((c) => `${sign(c)}${Math.round(180 - c.angle)}`).sort().join(',');
      rec.accordion = grown.length >= 2 && grown.some((c) => c.dir === 'up') && grown.some((c) => c.dir === 'down') && grown.every((c) => Math.abs(c.angle - 90) > 1);
    }
    return rec;
  }
  return { body: 'free' };
}

/** Pattern keys that, left out of a pattern, mean the record must not have them (a drawer is not a plain box). */
const FLAGS: (keyof PresetRecord)[] = ['relation', 'lean'];

/** Does a record fit a pattern (every key it names equal; the flags it leaves out false)? */
export function fits(r: PresetRecord, pattern: Partial<PresetRecord>): boolean {
  for (const [k, v] of Object.entries(pattern)) if ((r[k as keyof PresetRecord] ?? null) !== (v ?? null)) return false;
  for (const f of FLAGS) if (!(f in pattern) && r[f]) return false;
  return true;
}

/** How specific a pattern is: the keys it names. */
export const specificity = (pattern: Partial<PresetRecord>) => Object.keys(pattern).length;

/** A record as one string (two designs of the same record are the same kind of thing). */
export const recordKey = (r: PresetRecord) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k as keyof PresetRecord] ?? null]));
