// Preset records and the recogniser (milestone 150, DIELINE_GENERATOR_ANALYSIS.md §4). A record says what a design is
// made of, whatever made it (a structure's words, a mission, the student's own hands): its body, its footprint, how
// each end of a tube closes, its lid, how its parts relate and what it has on it. A catalogue variant is a pattern over
// records (catalogue.ts `match`); `recognise` names a design by the most specific pattern it fits, so a carton built
// board by board is still a reverse tuck end, and a trade code comes with the style it names.
import type { Design, Tray } from '../model/types';
import { endSpec, endStyleOf, trayRing } from '../model/cartons';
import { boxLid, capRimOf } from '../easy/lid';
import { dividersOn } from '../model/dividers';
import { findEdge, segLength } from '../model/edges';
import { MIN_EDGE } from '../model/trays';
import { flexDoors, isStripBand } from '../model/stripTrim';

export type Body = 'tube' | 'cross' | 'flat' | 'folded' | 'stand' | 'slot' | 'solid' | 'free' | 'layers' | 'ring';

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
  /** Milestone 157: a box's walls slope (a wall's top corner lowered: a magazine file). */
  slope?: boolean;
  /** Milestone 157: boards set at a slant inside a box, joined to its walls (a dice tower's baffles). */
  baffles?: boolean;
  /** Milestone 164: a board at a slant inside a box that rests on its base, joined to its walls (a scoop tray's ramp). */
  ramp?: boolean;
  /** Milestone 165: a slot body's boards cross each other in half-slots. */
  crossing?: boolean;
  /** Milestone 165: a slot body of three boards or more crossing (a grid of spaces with no box: an insert). */
  grid?: boolean;
  /** Milestone 165: a slot body with boards lying level, held in upright ones (shelves, rails). */
  shelves?: boolean;
  /** Milestone 166: a slot body with a board at a slant (a desk sign's plate); `tiers`, two or more (a slanted shelf). */
  slant?: boolean;
  tiers?: boolean;
  /** Milestone 165: round holes cut through a slot body's upright boards (a bottle rack's cradles). */
  holes?: boolean;
  /** Milestone 169: narrow level strips of their own on a box's walls (a sliding lid's rails). */
  rails?: boolean;
  /** Milestone 164: a box with a roof (boards at a slant grown off its walls, over them: a bird house). */
  roof?: boolean;
  /** Milestone 164: a level board inside a box, joined to its walls (a pen holder's plate with holes). */
  plate?: boolean;
  /** Milestone 162: how many of a box's walls are left open (an open-front box has one). */
  open?: number;
  /** Milestone 171: how deep a cap reaches down its box, when more than a shallow rim (a two-piece box: full). */
  rim?: 'half' | 'full';
  /** Milestone 171: holes to hang it by (keyholes) on one of its boards: it hangs on a wall. */
  hang?: boolean;
  /** Milestone 171: square holes for a clamp's jaws through a box's walls (a clamping square). */
  jig?: boolean;
  /** Milestone 173: a lid that lifts off with a board glued under its top that fits inside the walls (a plug lid). */
  plug?: boolean;
  /** Milestone 173: a lid that lifts off with strips standing under its top inside the walls (a brim lid). */
  brim?: boolean;
  /** Milestone 182: boards of their own glued face to face (body `layers`): how many in the deepest stack. */
  layers?: number;
  /** Milestone 182: a stack of four layers or more (a shadow box's spacers). */
  deep?: boolean;
  /** Milestone 182: a layered body with round boards (a spool's flanges: an outline of 16 points or more). */
  disc?: boolean;
  /** Milestone 174: a door of living hinge that slides in grooves round the box's rounded top corners (a roll-top box): how many corners are rounded. */
  tambour?: number;
  /** Milestone 175: a ring's doors (body `ring`: a wall of living hinge round side plates, its doors swinging on its bands). */
  doors?: number;
  /** Milestone 157: a folded piece that is a wrap (boards grown off a board's ends and glued to the boards beside them: a mailer). */
  wrap?: boolean;
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

/** A wall of a box with its top sloping: a top corner lowered by more than a few mm (milestone 157). */
function hasSlope(d: Design, t: Tray): boolean {
  return trayRing(d, t).some((r) => {
    const s = d.panels[r.wall]?.sketch;
    return s?.kind === 'wall' && ['tl', 'tr'].some((k) => (s.corners?.[k as 'tl' | 'tr']?.dy ?? 0) < -5);
  });
}

/**
 * Boards at a slant inside a box (neither level nor upright), joined to its walls (milestone 157); `onBase` (milestone
 * 164): only those also joined to the base (a ramp), else only those that are not (a dice tower's baffles).
 */
function hasBaffles(d: Design, t: Tray, onBase = false): boolean {
  const walls = new Set(trayRing(d, t).map((r) => r.wall));
  const onIt = (id: string) => Object.values(d.connections).some((c) => !c.grown && ((c.a.panelId === id && c.b.panelId === t.baseId) || (c.b.panelId === id && c.a.panelId === t.baseId)));
  // a board grown off another (a roof off a wall) is not one: baffles and ramps are boards of their own
  const grown = new Set(Object.values(d.connections).filter((c) => c.grown).map((c) => c.b.panelId));
  return Object.values(d.panels).some((p) => {
    if (walls.has(p.id) || p.id === t.baseId || p.lidOf || grown.has(p.id)) return false;
    if (onIt(p.id) !== onBase) return false;
    // how level it lies: its normal's upward part
    const n = Math.abs(p.frame.u[2] * p.frame.v[0] - p.frame.u[0] * p.frame.v[2]);
    if (n < 0.2 || n > 0.98) return false;
    return Object.values(d.connections).some((c) => !c.grown && ((c.a.panelId === p.id && walls.has(c.b.panelId)) || (c.b.panelId === p.id && walls.has(c.a.panelId))));
  });
}

/** A board's area (its outline's), from its sketch's points. */
function sketchArea(p: Design['panels'][string]): number {
  const s = p.sketch as { kind: string; pts?: { x: number; y: number }[] };
  if (s.kind !== 'poly' || !s.pts) return p.w * p.h;
  let a = 0;
  for (let i = 0; i < s.pts.length; i++) {
    const q = s.pts[i], r = s.pts[(i + 1) % s.pts.length];
    a += q.x * r.y - r.x * q.y;
  }
  return Math.abs(a) / 2;
}

/** A board lying level inside a box (not its base, not a lid), joined to its walls (milestone 164). */
function hasPlate(d: Design, t: Tray, strips = false): boolean {
  const walls = new Set(trayRing(d, t).map((r) => r.wall));
  // a board grown off another (a hinged lid off the back wall) is not one: a plate is a board of its own
  const grown = new Set(Object.values(d.connections).filter((c) => c.grown).map((c) => c.b.panelId));
  const base = d.panels[t.baseId];
  const room = base ? base.w * base.h : 0;
  return Object.values(d.panels).some((p) => {
    // milestone 173: a board laid on another (a base plate, a lid's plug) is a layer of it, not a plate
    if (walls.has(p.id) || p.id === t.baseId || p.lidOf || grown.has(p.id) || p.place?.host) return false;
    // milestone 169: a plate spans most of the inside; a strip (a rail) is narrow
    if ((sketchArea(p) < room * 0.25) !== strips) return false;
    const n = Math.abs(p.frame.u[2] * p.frame.v[0] - p.frame.u[0] * p.frame.v[2]);
    if (n < 0.98) return false;
    return Object.values(d.connections).some((c) => !c.grown && ((c.a.panelId === p.id && walls.has(c.b.panelId)) || (c.b.panelId === p.id && walls.has(c.a.panelId))));
  });
}

/**
 * A roof (milestone 164): boards grown off a sloped edge of a box's walls (a gable's), not off their level tops (a
 * hinged lid, open or shut).
 */
function hasRoof(d: Design, t: Tray): boolean {
  const walls = new Set(trayRing(d, t).map((r) => r.wall));
  return Object.values(d.connections).some((c) => {
    if (!c.grown || !walls.has(c.a.panelId) || walls.has(c.b.panelId) || !d.panels[c.b.panelId]) return false;
    const e = findEdge(d.panels[c.a.panelId], c.a.edge);
    return !!e && Math.abs(e.a.y - e.b.y) > 1 && Math.abs(e.a.x - e.b.x) > 1;
  });
}

/** Milestone 171: a board with holes to hang it by. */
const hangs = (d: Design) => Object.values(d.panels).some((p) => p.details.some((x) => x.mount === 'keyhole'));

/** Milestone 171: square holes a clamp's jaws go through (20 mm or more, nearly square, rounded) in two of a box's walls or more. */
function hasJig(d: Design, t: Tray): boolean {
  return trayRing(d, t).filter((r) => d.panels[r.wall]?.details.some((x) => x.op === 'cut' && x.shape === 'roundrect' && Math.min(x.w, x.h) >= 20 && Math.abs(x.w - x.h) < 2)).length >= 2;
}

/** A box's walls left open (milestone 162): its open edges that are long enough to stand a wall on. */
function openWalls(d: Design, t: Tray): number {
  const base = d.panels[t.baseId];
  if (!base) return 0;
  return t.openEdges.filter((e) => {
    const x = findEdge(base, e);
    return !!x && segLength(x) >= MIN_EDGE;
  }).length;
}

/** The joints a slot body is held by: half-slots, tabs in slots, and edges stopped at a face. */
const SLOT_KINDS = new Set(['halflap', 'tabslot', 'slide', 'butt', 'finger', 'key']);

/**
 * A slot body (milestone 165; the analysis's *slot*): two boards or more, none grown off another, every joint between
 * them one of `SLOT_KINDS` and every board joined. Null when the design is not one.
 */
function slotOf(d: Design, ids: string[]): PresetRecord | null {
  const cs = Object.values(d.connections);
  if (ids.length < 2 || !cs.length || cs.some((c) => c.grown || !SLOT_KINDS.has(c.kind))) return null;
  if (ids.some((id) => !cs.some((c) => c.a.panelId === id || c.b.panelId === id))) return null;
  const level = (id: string) => {
    const f = d.panels[id].frame;
    return Math.abs(f.u[2] * f.v[0] - f.u[0] * f.v[2]) > 0.98;
  };
  const crossing = cs.some((c) => c.kind === 'halflap');
  const rec: PresetRecord = { body: 'slot' };
  if (crossing) rec.crossing = true;
  if (crossing && ids.length >= 3) rec.grid = true;
  if (ids.some(level)) rec.shelves = true;
  // milestone 172: narrow level strips beside full ones (a rack's rails)
  const areas = ids.filter(level).map((id) => sketchArea(d.panels[id]));
  if (areas.length >= 2 && Math.min(...areas) < 0.4 * Math.max(...areas)) rec.rails = true;
  const upright = (id: string) => {
    const f = d.panels[id].frame;
    return Math.abs(f.u[2] * f.v[0] - f.u[0] * f.v[2]) < 0.2;
  };
  const slanted = ids.filter((id) => !level(id) && !upright(id)).length;
  if (slanted) rec.slant = true;
  if (slanted >= 2) rec.tiers = true;
  if (ids.some((id) => !level(id) && d.panels[id].details.some((x) => x.op === 'cut' && x.shape === 'circle' && x.w >= 20))) rec.holes = true;
  // milestone 172: it hangs on a wall (a bin rack's back, a wall rack's)
  if (hangs(d)) rec.hang = true;
  return rec;
}

/**
 * A layered body (milestone 182): boards of their own, none grown off another, glued face to face (`laminate`) in
 * stacks, the rest held by the joints a slot body has; every board joined. Its `layers`: the most boards in one stack.
 */
function layersOf(d: Design, ids: string[]): PresetRecord | null {
  const cs = Object.values(d.connections);
  const lam = cs.filter((c) => c.kind === 'laminate');
  if (ids.length < 2 || !lam.length || cs.some((c) => c.grown || (c.kind !== 'laminate' && !SLOT_KINDS.has(c.kind)))) return null;
  if (ids.some((id) => !cs.some((c) => c.a.panelId === id || c.b.panelId === id))) return null;
  // stacks: boards linked by glued faces
  const up = new Map(ids.map((id) => [id, id]));
  const root = (x: string): string => (up.get(x) === x ? x : root(up.get(x)!));
  for (const c of lam) if (up.has(c.a.panelId) && up.has(c.b.panelId)) up.set(root(c.a.panelId), root(c.b.panelId));
  const size = new Map<string, number>();
  for (const id of ids) size.set(root(id), (size.get(root(id)) ?? 0) + 1);
  const n = Math.max(...size.values());
  const rec: PresetRecord = { body: 'layers', layers: n };
  if (n >= 4) rec.deep = true;
  if (ids.some((id) => { const s = d.panels[id].sketch; return s.kind === 'poly' && s.pts.length >= 16; })) rec.disc = true;
  if (hangs(d)) rec.hang = true;
  return rec;
}

/**
 * A sliding door of living hinge (milestone 174): boards chained by a strip's bands (stripTrim.ts), joined to nothing
 * else but a handle standing on them. Its box's rounded top corners: a side wall's top corners lowered by more than
 * 5 mm, its top edge turned through points (0 when there is no such door).
 */
function tambourOf(d: Design, t: Tray): number {
  const cs = Object.values(d.connections);
  const bands = cs.filter((c) => c.grown && c.kind === 'fold' && isStripBand(d, c));
  if (!bands.length) return 0;
  // the chains: boards linked by bands
  const up = new Map<string, string>();
  const root = (x: string): string => (up.has(x) && up.get(x) !== x ? root(up.get(x)!) : x);
  for (const c of bands) up.set(root(c.b.panelId), root(c.a.panelId));
  const chains = new Map<string, string[]>();
  for (const c of bands) for (const id of [c.a.panelId, c.b.panelId]) chains.set(root(id), [...new Set([...(chains.get(root(id)) ?? []), id])]);
  const door = [...chains.values()].some((ids) => {
    const set = new Set(ids);
    const out = cs.filter((c) => !(set.has(c.a.panelId) && set.has(c.b.panelId)) && (set.has(c.a.panelId) || set.has(c.b.panelId)));
    // its handle: the one board it is joined to, joined to nothing else
    const others = new Set(out.map((c) => (set.has(c.a.panelId) ? c.b.panelId : c.a.panelId)));
    return others.size === 1 && cs.filter((c) => others.has(c.a.panelId) || others.has(c.b.panelId)).every((c) => set.has(c.a.panelId) || set.has(c.b.panelId));
  });
  if (!door) return 0;
  let n = 0;
  for (const r of trayRing(d, t)) {
    if (r.edge !== 'e1' && r.edge !== 'e3') continue;
    const s = d.panels[r.wall]?.sketch;
    if (s?.kind !== 'wall' || !s.inserts?.some((x) => x.edge === 'e2')) continue;
    n = Math.max(n, ['tl', 'tr'].filter((k) => (s.corners?.[k as 'tl' | 'tr']?.dy ?? 0) < -5).length);
  }
  return n;
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
      const lid = boxLid(d, t.id);
      rec.lid = lid.kind;
      if (lid.kind === 'liftoff' && (lid.style === 'plug' || lid.style === 'brim')) rec[lid.style] = true;
      const rim = rec.lid === 'liftoff' ? capRimOf(d, t.id) : null;
      if (rim === 'half' || rim === 'full') rec.rim = rim;
      rec.corner = t.cornerKind;
      rec.spaces = dividersOn(d, t.baseId).length > 0;
    }
    rec.relation = ts.length === 2 && ts.some((x) => x !== t && x.base === 'open' && !x.top && !x.bottom) ? 'drawer' : null;
    if (slits) rec.slits = true;
    if (hasWindow(d, t)) rec.window = true;
    // milestone 174: a roll-top box's rounded side walls and the shell its door runs on are its own, not a slope or a plate
    const door = tube ? 0 : tambourOf(d, t);
    if (door) rec.tambour = door;
    if (!tube && !door && hasSlope(d, t)) rec.slope = true;
    if (!tube && hasBaffles(d, t)) rec.baffles = true;
    if (!tube && hasBaffles(d, t, true)) rec.ramp = true;
    if (!tube && !door && hasPlate(d, t)) rec.plate = true;
    if (!tube && !door && hasPlate(d, t, true)) rec.rails = true;
    if (!tube && hasRoof(d, t)) rec.roof = true;
    const open = openWalls(d, t);
    if (!tube && open) rec.open = open;
    if (hangs(d)) rec.hang = true;
    if (!tube && hasJig(d, t)) rec.jig = true;
    return rec;
  }
  const ids = d.order.filter((id) => d.panels[id]);
  const flaps = ids.flatMap((id) => (d.panels[id].edgeFlaps ?? []).map((f) => f.shape ?? 'plain')).sort().join(',');
  if (ids.length === 1) return { body: 'flat', ...(flaps ? { flaps } : {}), ...(slits ? { slits } : {}) };
  const grown = Object.values(d.connections).filter((c) => c.grown);
  // milestone 175: a wall of living hinge round side plates whose ends are doors (a flex-door box)
  const doors = flexDoors(d);
  if (doors.length) return { body: 'ring', doors: doors.length };
  // milestone 165: boards of their own held together by slots and tabs, nothing grown off another (BOXES_PRESETS_PLAN.md)
  const slot = slotOf(d, ids);
  if (slot) return slot;
  const stack = layersOf(d, ids);
  if (stack) return stack;
  const lean = grown.some((c) => c.kind !== 'fold' && c.angle > 10 && c.angle < 170 && Math.abs(c.angle - 90) > 1);
  if (lean) return { body: 'stand', lean: true, supports: grown.filter((c) => c.angle > 10 && c.angle < 170 && Math.abs(c.angle - 90) > 1).length };
  if (grown.length && grown.every((c) => c.kind === 'fold' || c.kind === 'glue')) {
    const rec: PresetRecord = { body: 'folded', boards: ids.length, ...(slits ? { slits } : {}), ...(flaps ? { flaps } : {}) };
    // a wrap: boards on a board's two ends, glued at their corners to the boards beside them
    if (Object.values(d.connections).some((c) => !c.grown && c.kind === 'glue')) rec.wrap = true;
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
const FLAGS: (keyof PresetRecord)[] = ['relation', 'lean', 'slope', 'baffles', 'wrap', 'open', 'plate', 'ramp', 'roof', 'crossing', 'grid', 'shelves', 'holes', 'slant', 'tiers', 'rails', 'hang', 'jig', 'plug', 'brim', 'deep', 'disc', 'tambour', 'doors'];

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
