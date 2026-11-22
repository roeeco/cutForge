// Preset records and the recogniser (milestone 150, DIELINE_GENERATOR_ANALYSIS.md §4). A record says what a design is
// made of, whatever made it (a structure's words, a mission, the student's own hands): its body, its footprint, how
// each end of a tube closes, its lid, how its parts relate and what it has on it. A catalogue variant is a pattern over
// records (catalogue.ts `match`); `recognise` names a design by the most specific pattern it fits, so a carton built
// board by board is still a reverse tuck end, and a trade code comes with the style it names.
import type { Design, Tray } from '../model/types';
import { endSpec, endStyleOf, trayRing } from '../model/cartons';
import { boxLid, capRimOf } from '../easy/lid';
import { dividersOn } from '../model/dividers';
import { findEdge, segLength, straightRing } from '../model/edges';
import { MIN_EDGE } from '../model/trays';
import { stacks } from '../model/stack';
import { hasBand } from '../model/bands';
import { knucklesOf, pinLidBoards, pinLids } from '../model/pinHinge';
import { flexDoors, isStripBand } from '../model/stripTrim';

export type Body = 'tube' | 'cross' | 'flat' | 'folded' | 'stand' | 'slot' | 'solid' | 'free' | 'layers' | 'ring';

export type PresetRecord = {
  /** What the blank is (§2 of the analysis): a tube (walls in a ring, no base), a cross (a base with walls on its edges), one flat board, boards folded off each other with no box, a stand (boards leaning on a base), a ready shape, or anything else. */
  body: Body;
  /**
   * A box's base: a rectangle, an n-gon (`sides`), round (a circle or an oval) or rounded. Milestone 180: `free`, a
   * convex polygon that is no regular polygon stretched (a chamfered box, a coffin, a trapezoid), and `concave`, a
   * polygon with an inside corner (a tetromino, a star, a heart); both with their `sides`.
   */
  footprint?: 'rect' | 'poly' | 'round' | 'rounded' | 'free' | 'concave';
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
  /** Milestone 180: a concave footprint whose corners go in and out in turn (a star). */
  star?: boolean;
  /** Milestone 181: some of the footprint's corners are rounded, its walls bent round them (bands). */
  rounded?: boolean;
  /** Milestone 181: the base bends up into walls round living hinges (a U box). */
  bends?: boolean;
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
  /** Milestone 178: boards of their own crossing a box's walls in half-slots (loose dividers, lifted out by hand). */
  loose?: boolean;
  /** Milestone 178: upright boards of their own inside a box, standing on its base (partitions between its spaces). */
  partitions?: boolean;
  /** Milestone 178: ramps inside a box facing both ways (a scoop at each end). */
  bothEnds?: boolean;
  /** Milestone 178: more than two of a box's walls slope (a height per corner). */
  uneven?: boolean;
  /** Milestone 178: an upright board of its own across a box, held by its walls and standing clear of its base (a dispenser's front). */
  chute?: boolean;
  /** Milestone 178: a wall's top cut down in notches (a castle's crenels). */
  crenels?: boolean;
  /** Milestone 178: a level plate in a box with square openings 30 mm or more (a Gridfinity base). */
  openings?: boolean;
  /** Milestone 178: a board of its own rising well above a box's walls with a hand hole (a caddy's handle). */
  carry?: boolean;
  /** Milestone 178: a board with a row of long narrow slits (a record rack's). */
  combs?: boolean;
  /** Milestone 178: a board with a motor's hole pattern: a boss hole and four screw holes round it. */
  motor?: boolean;
  /** Milestone 178: a board with rows of small upright slots for pegboard hooks. */
  pegs?: boolean;
  /** Milestone 178: a slot body of two boards, one lying level that the other stands in (a flyer stand's foot). */
  foot?: boolean;
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
  /** Milestone 177: stacking edges (feet under its boards, tongues on their tops): one like it stacks on it. */
  stack?: boolean;
  /** Milestone 177: a grid of holes through a box's base (four or more): a sieve. */
  sieve?: boolean;
  /** Milestone 176: a box's lid hinged on pins (knuckles and a pin), not on a living hinge. */
  pins?: boolean;
  /** Milestone 176: boards built up on a pin-hinged lid (a chest's crown of slats between two ends). */
  crown?: boolean;
  /** Milestone 183: boards of their own with teeth round them (gears) inside a box: a gearbox. */
  gears?: boolean;
  /** Milestone 183: a board with a game's squares engraved on it (twelve or more of one size). */
  game?: boolean;
  /** Milestone 179: it hangs on a cleat (boards marked `Panel.cleat`); the rest of the record is the thing without them. */
  cleat?: boolean;
  /** Milestone 179: a level board of a slot body cut in from an edge in slots (a tool holder's shelf): square to it, or at a slant (a wrench holder's). */
  notches?: 'square' | 'angled';
  /** Milestone 179: round holes 10 mm or more through a level board of a slot body, two or more (tools or jars stand in them). */
  wells?: boolean;
  /** Milestone 179: upright boards of a slot body with a curved mouth in their outline (J hooks). */
  hooks?: boolean;
  /** Milestone 179: a hung slot body with no level board and an upright board in front of the one it hangs by, parallel to it (a pliers holder's bar). */
  bar?: boolean;
  /** Milestone 179: level boards at two heights or more whose fronts step back as they rise (wall steps). */
  steps?: boolean;
  /** Milestone 179: a box wall whose top steps down along it (inserts going one way only: a hopper's sides, a drill stand's). */
  stepped?: boolean;
  /** Milestone 178 (part 2): a board at a slant inside a box, of its own, with a round hole 15 mm or more (a showcase's coin plate). */
  coin?: boolean;
  /** Milestone 178 (part 2): an upright board of a slot body with two hollows or more in its outline (a bottle stack's cradles). */
  cradles?: boolean;
  /** Milestone 178 (part 2): a strip of three boards bent on living hinges, the middle one narrower than the others (a book cover's spine). */
  spine?: boolean;
};

/** Milestone 176: the boards of pin-hinged lids (the lid, its knuckles, a crown built on it) and the box's knuckles: the lid's, not boards in the box. */
const pinSide = (d: Design): Set<string> => new Set(pinLids(d).flatMap((L) => [...pinLidBoards(d, L.id), ...knucklesOf(d, L.id).map((p) => p.id)]));

const boxTrays = (d: Design): Tray[] => Object.values(d.trays ?? {}).filter((t) => !t.lidOf);

/** The tray a design is: the one with a base that is cut (a drawer's tray, not its sleeve), else the first. */
function mainOf(d: Design): Tray | undefined {
  const ts = boxTrays(d);
  return ts.find((t) => t.base !== 'open') ?? ts[0];
}

function footprintOf(d: Design, t: Tray): Pick<PresetRecord, 'footprint' | 'sides' | 'star' | 'rounded'> {
  const b = d.panels[t.baseId];
  if (!b) return {};
  const s = b.sketch as { kind: string; pts?: { bulge?: number; arc?: unknown }[]; round?: unknown };
  if (s.kind === 'round' || s.round) return { footprint: 'round' };
  const ring = trayRing(d, t);
  // rounded corners are bands between the walls (milestone 64): more walls than straight edges
  if (s.pts?.some((q) => q.bulge || q.arc)) return { footprint: 'rounded' };
  const n = s.pts?.length ?? ring.length;
  // milestone 180: a polygon with an inside corner, or one that is not a regular polygon stretched (a box's *poly*
  // shape is one, stretched to its width and depth; a rectangle and any parallelogram is one with four sides)
  const pts = (s.pts ?? []) as { x: number; y: number; curve?: string }[];
  const curved = pts.some((q) => q.curve === 'round') ? { rounded: true } : {};
  if (pts.length >= 4) {
    const turns = pts.map((q, i) => {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      return (q.x - a.x) * (b.y - q.y) - (q.y - a.y) * (b.x - q.x);
    });
    const ccw = Math.sign(turns.reduce((x, y) => x + y, 0)) || 1;
    const reflex = turns.map((x) => x * ccw < -1e-6);
    if (reflex.some(Boolean)) {
      const star = n >= 6 && n % 2 === 0 && reflex.every((r, i) => r !== reflex[(i + 1) % n]);
      return { footprint: 'concave', sides: n, ...(star ? { star: true } : {}), ...curved };
    }
    if (!affineRegular(pts)) return { footprint: 'free', sides: n, ...curved };
  }
  return n === 4 ? { footprint: 'rect', ...curved } : { footprint: 'poly', sides: n, ...curved };
}

/**
 * Is a polygon a regular one stretched (an affine image of a regular n-gon)? The map that takes its first three
 * corners to a regular polygon's must take every other corner there too.
 */
function affineRegular(pts: { x: number; y: number }[]): boolean {
  const n = pts.length;
  const reg = Array.from({ length: n }, (_, i) => ({ x: Math.cos((2 * Math.PI * i) / n), y: Math.sin((2 * Math.PI * i) / n) }));
  // the affine map from (reg0, reg1, reg2) to (p0, p1, p2), then each regular corner through it
  const [r0, r1, r2] = reg, [p0, p1, p2] = pts;
  const ax = r1.x - r0.x, ay = r1.y - r0.y, bx = r2.x - r0.x, by = r2.y - r0.y, det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-12) return false;
  const ux = p1.x - p0.x, uy = p1.y - p0.y, vx = p2.x - p0.x, vy = p2.y - p0.y;
  const size = Math.max(...pts.map((q) => Math.hypot(q.x - p0.x, q.y - p0.y)), 1);
  for (let i = 3; i < n; i++) {
    const dx = reg[i].x - r0.x, dy = reg[i].y - r0.y;
    const k1 = (dx * by - dy * bx) / det, k2 = (ax * dy - ay * dx) / det;
    const qx = p0.x + k1 * ux + k2 * vx, qy = p0.y + k1 * uy + k2 * vy;
    if (Math.hypot(qx - pts[i].x, qy - pts[i].y) > 1e-4 * size) return false;
  }
  return true;
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
  const lid = pinSide(d);
  return Object.values(d.panels).some((p) => {
    if (walls.has(p.id) || p.id === t.baseId || p.lidOf || grown.has(p.id) || lid.has(p.id)) return false;
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
  const lid = pinSide(d);
  return Object.values(d.panels).some((p) => {
    // milestone 173: a board laid on another (a base plate, a lid's plug) is a layer of it, not a plate
    if (walls.has(p.id) || p.id === t.baseId || p.lidOf || grown.has(p.id) || p.place?.host || lid.has(p.id)) return false;
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

/** Milestone 177: a grid of holes cut through a box's base, four or more of one size (a sieve's floor). */
function hasSieve(d: Design, t: Tray): boolean {
  const b = d.panels[t.baseId];
  if (!b) return false;
  const cuts = b.details.filter((x) => x.op === 'cut' && x.w >= 4 && x.h >= 4);
  return cuts.length >= 4 && cuts.every((x) => Math.abs(x.w - cuts[0].w) < 0.01 && Math.abs(x.h - cuts[0].h) < 0.01);
}

/** Milestone 178: free boards (not walls, base, lid, divider or grown) inside a box: those that match. */
function freeIn(d: Design, t: Tray, test: (p: Design['panels'][string]) => boolean): Design['panels'][string][] {
  const walls = new Set(trayRing(d, t).map((r) => r.wall));
  const grown = new Set(Object.values(d.connections).filter((c) => c.grown).map((c) => c.b.panelId));
  // milestone 176: a pin hinge's lid and knuckles are the lid's, not boards in the box
  const lid = pinSide(d);
  return Object.values(d.panels).filter((p) => !walls.has(p.id) && p.id !== t.baseId && !p.lidOf && !lid.has(p.id) && !p.divider && !p.place && !grown.has(p.id) && test(p));
}

/** Milestone 178: a board of its own crossing one of a box's walls in a half-slot. */
function hasLoose(d: Design, t: Tray): boolean {
  const walls = new Set(trayRing(d, t).map((r) => r.wall));
  const free = new Set(freeIn(d, t, () => true).map((p) => p.id));
  return Object.values(d.connections).some((c) => c.kind === 'halflap' && ((walls.has(c.a.panelId) && free.has(c.b.panelId)) || (walls.has(c.b.panelId) && free.has(c.a.panelId))));
}

/** Milestone 178: an upright board of its own on a box's base, joined to it (not by a half-slot). */
function hasPartitions(d: Design, t: Tray): boolean {
  const on = (id: string) => Object.values(d.connections).some((c) => !c.grown && c.kind !== 'halflap' && ((c.a.panelId === id && c.b.panelId === t.baseId) || (c.b.panelId === id && c.a.panelId === t.baseId)));
  return freeIn(d, t, (p) => Math.abs(p.frame.u[2] * p.frame.v[0] - p.frame.u[0] * p.frame.v[2]) < 0.02 && on(p.id)).length > 0;
}

/** Milestone 178: ramps (slanted boards of their own on the base, joined to the walls) facing both ways along the box. */
function rampsBothWays(d: Design, t: Tray): boolean {
  const on = (id: string) => Object.values(d.connections).some((c) => !c.grown && ((c.a.panelId === id && c.b.panelId === t.baseId) || (c.b.panelId === id && c.a.panelId === t.baseId)));
  const ramps = freeIn(d, t, (p) => {
    const n = Math.abs(p.frame.u[2] * p.frame.v[0] - p.frame.u[0] * p.frame.v[2]);
    return n > 0.2 && n < 0.98 && on(p.id);
  });
  // which way each faces: its slope's run along the box (v's level part)
  const ways = new Set(ramps.map((p) => Math.sign(Math.round(p.frame.v[2] * 1000 + p.frame.v[0] * 1000) * Math.sign(p.frame.v[1] || 1))));
  return ways.has(1) && ways.has(-1);
}

/** Milestone 178: walls whose tops slope (a top corner lowered more than a few mm): how many. */
function slopedWalls(d: Design, t: Tray): number {
  return trayRing(d, t).filter((r) => {
    const s = d.panels[r.wall]?.sketch;
    return s?.kind === 'wall' && ['tl', 'tr'].some((k) => (s.corners?.[k as 'tl' | 'tr']?.dy ?? 0) < -5);
  }).length;
}

/** Milestone 178: an upright board of its own joined to a box's walls (not by half-slots) and not to its base, its foot clear of it. */
function hasChute(d: Design, t: Tray): boolean {
  const walls = new Set(trayRing(d, t).map((r) => r.wall));
  const base = d.panels[t.baseId];
  if (!base) return false;
  const floor = base.frame.o[1] + d.material.thickness;
  const joins = (id: string, to: (x: string) => boolean) => Object.values(d.connections).some((c) => !c.grown && c.kind !== 'halflap' && ((c.a.panelId === id && to(c.b.panelId)) || (c.b.panelId === id && to(c.a.panelId))));
  return freeIn(d, t, (p) => Math.abs(p.frame.v[1]) > 0.98 && p.frame.v[1] > 0 && p.frame.o[1] > floor + 3 && joins(p.id, (x) => walls.has(x)) && !joins(p.id, (x) => x === t.baseId)).length > 0;
}

/** Milestone 178: a wall whose top is notched down (inserts on its top edge more than 3 mm below it). */
function hasCrenels(d: Design, t: Tray): boolean {
  return trayRing(d, t).some((r) => {
    const s = d.panels[r.wall]?.sketch;
    // milestone 179: notches that go down and back up (a top stepping one way is `stepped`)
    return s?.kind === 'wall' && (s.inserts ?? []).filter((x) => x.edge === 'e2' && x.off < -3).length >= 2 && !oneWay(d.panels[r.wall]);
  });
}

/** Milestone 179: a wall's top, from its top right corner to its top left one, through its inserts (its outline's points). */
function topProfile(p: Design['panels'][string]): { x: number; y: number }[] {
  const ring = straightRing(p);
  const top = ring.filter((e) => e.key !== 'e0' && e.key !== 'e1' && e.key !== 'e3');
  return top.length ? [...top.map((e) => e.a), top[top.length - 1].b] : [];
}

/** Milestone 179: a wall's top never turning back: each point no higher than the one before along it, or each no lower. */
function oneWay(p: Design['panels'][string]): boolean {
  const ys = topProfile(p).map((q) => q.y);
  const down = ys.every((v, i) => i === 0 || v <= ys[i - 1] + 0.5), up = ys.every((v, i) => i === 0 || v >= ys[i - 1] - 0.5);
  return down || up;
}

/** Milestone 179: a wall whose top steps down along it, one way only (an upright drop of 3 mm or more in it, never turning back). */
function hasStepped(d: Design, t: Tray): boolean {
  return trayRing(d, t).some((r) => {
    const P = d.panels[r.wall];
    const s = P?.sketch;
    if (s?.kind !== 'wall' || !(s.inserts ?? []).some((x) => x.edge === 'e2')) return false;
    const pts = topProfile(P);
    const drop = pts.some((q, i) => i > 0 && Math.abs(q.x - pts[i - 1].x) < 1 && Math.abs(q.y - pts[i - 1].y) >= 3);
    return drop && oneWay(P);
  });
}

/** Milestone 178: a level board of its own in a box with square openings, 30 mm or larger. */
function hasOpenings(d: Design, t: Tray): boolean {
  return freeIn(d, t, (p) => Math.abs(p.frame.u[2] * p.frame.v[0] - p.frame.u[0] * p.frame.v[2]) > 0.98 && p.details.filter((x) => x.op === 'cut' && x.shape === 'roundrect' && Math.min(x.w, x.h) >= 30 && Math.abs(x.w - x.h) < 2).length >= 1).length > 0;
}

/** Milestone 178: an upright board of its own reaching 20 mm or more above a box's tallest wall, with a hole cut in it. */
function hasCarry(d: Design, t: Tray): boolean {
  const top = Math.max(...trayRing(d, t).map((r) => (d.panels[r.wall] ? d.panels[r.wall].frame.o[1] + d.panels[r.wall].h : 0)));
  return freeIn(d, t, (p) => Math.abs(p.frame.v[1]) > 0.98 && p.frame.o[1] + p.h > top + 20 && p.details.some((x) => x.op === 'cut')).length > 0;
}

/** Milestone 183: a board whose outline has teeth round it (a gear's or a pulley's: eight or more). */
export function toothed(p: Design['panels'][string]): boolean {
  const s = p.sketch;
  if (s.kind !== 'poly' || s.pts.length < 48) return false;
  const cx = s.pts.reduce((a, q) => a + q.x, 0) / s.pts.length, cy = s.pts.reduce((a, q) => a + q.y, 0) / s.pts.length;
  const r = s.pts.map((q) => Math.hypot(q.x - cx, q.y - cy));
  const hi = Math.max(...r), lo = Math.min(...r), mid = (hi + lo) / 2;
  if (hi - lo < 1) return false;
  let n = 0;
  for (let i = 0; i < r.length; i++) if (r[i] > mid && r[(i + r.length - 1) % r.length] <= mid) n++;
  return n >= 8;
}

/** Milestone 183: a game's squares engraved on a board: twelve or more engraved squares of one size, 10 mm or more. */
const hasGame = (d: Design) =>
  Object.values(d.panels).some((p) => {
    const sq = p.details.filter((x) => x.op === 'engrave' && (x.shape === 'rect' || x.shape === 'roundrect') && Math.min(x.w, x.h) >= 10 && Math.abs(x.w - x.h) < 0.5);
    return sq.length >= 12 && sq.filter((x) => Math.abs(x.w - sq[0].w) < 0.01).length >= 12;
  });

/** A box's walls left open (milestone 162): its open edges that are long enough to stand a wall on. */
function openWalls(d: Design, t: Tray): number {
  const base = d.panels[t.baseId];
  if (!base) return 0;
  return t.openEdges.filter((e) => {
    const x = findEdge(base, e);
    return !!x && segLength(x) >= MIN_EDGE;
  }).length;
}

/** Milestone 178: what a board's cuts make of it: long narrow slits, a motor's holes, pegboard slots. */
function cutsOf(p: Design['panels'][string]): { combs: boolean; motor: boolean; pegs: boolean } {
  const cuts = p.details.filter((x) => x.op === 'cut');
  const slits = cuts.filter((x) => x.shape === 'roundrect' && Math.min(x.w, x.h) <= 15 && Math.max(x.w, x.h) >= 4 * Math.min(x.w, x.h));
  const circles = cuts.filter((x) => x.shape === 'circle');
  const pegs = cuts.filter((x) => x.shape === 'roundrect' && Math.min(x.w, x.h) < 8 && Math.max(x.w, x.h) < 4 * Math.min(x.w, x.h));
  return { combs: slits.length >= 2, motor: circles.some((x) => x.w >= 20) && circles.filter((x) => x.w < 8).length >= 4, pegs: pegs.length >= 10 };
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
  // milestone 177: one like it stacks on it (a rack's sides and back)
  if (stacks(d)) rec.stack = true;
  // milestone 178: slits, a motor's holes, pegboard slots; a foot with one board standing in it
  const cut = ids.map((id) => cutsOf(d.panels[id]));
  if (cut.some((x) => x.combs)) rec.combs = true;
  if (cut.some((x) => x.motor)) rec.motor = true;
  if (cut.some((x) => x.pegs)) rec.pegs = true;
  if (ids.length === 2 && ids.filter(level).length === 1) rec.foot = true;
  // milestone 179: a shelf cut in slots, round holes through a level board, J hooks, a bar, steps
  const notch = ids.filter(level).map((id) => notchesOf(d.panels[id])).find((x) => x);
  if (notch) rec.notches = notch;
  const steps = hasSteps(d, ids.filter(level));
  if (steps) rec.steps = true;
  // (holes in steps are the steps')
  if (!steps && ids.some((id) => level(id) && d.panels[id].details.filter((x) => x.op === 'cut' && x.shape === 'circle' && x.w >= 10).length >= 2)) rec.wells = true;
  if (ids.some((id) => upright(id) && isHook(d.panels[id]))) rec.hooks = true;
  // milestone 178 (part 2): cradles in a beam's top, a round board (a clock's face)
  if (ids.some((id) => upright(id) && hollows(d.panels[id]) >= 2)) rec.cradles = true;
  if (ids.some((id) => isRound(d.panels[id]))) rec.disc = true;
  if (hungBoards(d).size && !rec.shelves && hasBar(d, ids)) rec.bar = true;
  return rec;
}

/** Milestone 179: a board's outline points and which corners turn inwards. */
function outlineOf(p: Design['panels'][string]): { pts: { x: number; y: number }[]; reflex: boolean[] } {
  const s = p.sketch as { kind: string; pts?: { x: number; y: number }[] };
  const pts = s.kind === 'poly' && s.pts ? s.pts : [];
  const n = pts.length;
  const turns = pts.map((q, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    return (q.x - a.x) * (b.y - q.y) - (q.y - a.y) * (b.x - q.x);
  });
  const ccw = Math.sign(turns.reduce((x, y) => x + y, 0)) || 1;
  return { pts, reflex: turns.map((x) => x * ccw < -1e-6) };
}

/** Milestone 179: slots cut in from a board's edge (two or more, four inward corners or more): square to its sides, or at a slant. */
function notchesOf(p: Design['panels'][string]): 'square' | 'angled' | null {
  const { pts, reflex } = outlineOf(p);
  if (reflex.filter(Boolean).length < 4 || pts.length > 80) return null;
  // a slanted side next to an inward corner: neither along the board's x nor its y
  const n = pts.length;
  const slanted = pts.some((q, i) => {
    if (!reflex[i]) return false;
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    return [a, b].some((r) => {
      const dx = Math.abs(r.x - q.x), dy = Math.abs(r.y - q.y);
      return Math.min(dx, dy) > 0.1 * Math.max(dx, dy) && Math.hypot(dx, dy) > 4;
    });
  });
  return slanted ? 'angled' : 'square';
}

/** Milestone 179: the hollows in a board's outline: runs of three inward corners or more in a row. */
function hollows(p: Design['panels'][string]): number {
  const { reflex } = outlineOf(p);
  const n = reflex.length;
  if (!n || reflex.every(Boolean)) return 0;
  // start after a corner that turns outwards, so a run is not split at the outline's first point
  const s = reflex.findIndex((r) => !r);
  let runs = 0, len = 0;
  for (let k = 1; k <= n; k++) {
    if (reflex[(s + k) % n]) len++;
    else {
      if (len >= 3) runs++;
      len = 0;
    }
  }
  return runs;
}

/** Milestone 179: a hook: a board whose outline is curved (ten points or more) with one mouth. */
function isHook(p: Design['panels'][string]): boolean {
  return outlineOf(p).pts.length >= 10 && hollows(p) === 1;
}

/** Milestone 178 (part 2): a round board: sixteen points or more, all as far from their middle. */
function isRound(p: Design['panels'][string]): boolean {
  const { pts } = outlineOf(p);
  if (pts.length < 16) return false;
  const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length, cy = pts.reduce((a, q) => a + q.y, 0) / pts.length;
  const r = pts.map((q) => Math.hypot(q.x - cx, q.y - cy));
  return Math.max(...r) - Math.min(...r) < 0.02 * Math.max(...r);
}

/** Milestone 179: the boards a design hangs by: its keyholes', or (set while a cleat's boards are read away) those the cleat is glued to. */
let hungBy: Set<string> | null = null;
const hungBoards = (d: Design) => hungBy ?? new Set(Object.values(d.panels).filter((p) => p.details.some((x) => x.mount === 'keyhole')).map((p) => p.id));

/** Milestone 179: an upright board parallel to a board the thing hangs by, 15 mm or more in front of it, its span over that board's. */
function hasBar(d: Design, ids: string[]): boolean {
  const hung = [...hungBoards(d)].filter((id) => ids.includes(id));
  const nrm = (id: string) => {
    const f = d.panels[id].frame;
    return [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]];
  };
  return hung.some((h) => {
    const nh = nrm(h), oh = d.panels[h].frame.o;
    return ids.some((id) => {
      if (id === h) return false;
      const n = nrm(id), o = d.panels[id].frame.o;
      if (Math.abs(n[0] * nh[0] + n[1] * nh[1] + n[2] * nh[2]) < 0.999 || Math.abs(n[1]) > 0.02) return false;
      return Math.abs((o[0] - oh[0]) * nh[0] + (o[1] - oh[1]) * nh[1] + (o[2] - oh[2]) * nh[2]) >= 15;
    });
  });
}

/** Milestone 179: level boards at two heights or more whose fronts (their furthest reach towards +z) step back as they rise. */
function hasSteps(d: Design, levels: string[]): boolean {
  const at = new Map<number, number>();
  for (const id of levels) {
    const p = d.panels[id], f = p.frame;
    const y = Math.round(f.o[1]);
    const { pts } = outlineOf(p);
    const ring = pts.length ? pts : [{ x: 0, y: 0 }, { x: p.w, y: 0 }, { x: p.w, y: p.h }, { x: 0, y: p.h }];
    const front = Math.max(...ring.map((q) => f.o[2] + q.x * f.u[2] + q.y * f.v[2]));
    at.set(y, Math.max(at.get(y) ?? -Infinity, front));
  }
  const fronts = [...at.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  return fronts.length >= 2 && fronts.every((v, i) => i === 0 || v <= fronts[i - 1] + 0.5) && fronts[0] - fronts[fronts.length - 1] >= 10;
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
  // milestone 179: a thing hung on a cleat is the thing (read without the cleat's boards), and it hangs
  if (d.order.some((id) => d.panels[id]?.cleat)) {
    const keep = (id: string) => !!d.panels[id] && !d.panels[id].cleat;
    const bare: Design = {
      ...d,
      panels: Object.fromEntries(Object.entries(d.panels).filter(([id]) => keep(id))),
      order: d.order.filter(keep),
      connections: Object.fromEntries(Object.entries(d.connections).filter(([, c]) => keep(c.a.panelId) && keep(c.b.panelId))),
    };
    const glued = (id: string) => Object.values(d.connections).filter((c) => c.kind === 'laminate' && (c.a.panelId === id || c.b.panelId === id)).map((c) => (c.a.panelId === id ? c.b.panelId : c.a.panelId));
    const was = hungBy;
    hungBy = new Set(d.order.filter((id) => d.panels[id]?.cleat === 'item').flatMap(glued).filter(keep));
    try {
      return { ...recordOf(bare), hang: true, cleat: true };
    } finally {
      hungBy = was;
    }
  }
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
      if (lid.kind === 'hinged' && lid.pins) rec.pins = true;
      if (lid.kind === 'hinged' && lid.pins && pinLidBoards(d, lid.lid).some((id) => id !== lid.lid && !d.panels[id]?.knuckle)) rec.crown = true;
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
    // milestone 181: walls grown off the base round a living hinge (a U box), not a lid's hinge
    if (!tube && Object.values(d.connections).some((c) => c.a.panelId === t.baseId && hasBand(d, c))) rec.bends = true;
    const open = openWalls(d, t);
    if (!tube && open) rec.open = open;
    if (hangs(d)) rec.hang = true;
    if (!tube && hasJig(d, t)) rec.jig = true;
    if (stacks(d)) rec.stack = true;
    if (!tube && hasSieve(d, t)) rec.sieve = true;
    if (!tube && hasLoose(d, t)) rec.loose = true;
    if (!tube && hasPartitions(d, t)) rec.partitions = true;
    if (!tube && rampsBothWays(d, t)) rec.bothEnds = true;
    if (!tube && slopedWalls(d, t) > 2) rec.uneven = true;
    if (!tube && hasChute(d, t)) rec.chute = true;
    if (!tube && hasCrenels(d, t)) rec.crenels = true;
    if (!tube && hasOpenings(d, t)) rec.openings = true;
    if (!tube && hasCarry(d, t)) rec.carry = true;
    // milestone 183: gears inside the box (two or more toothed boards of their own); a game's squares engraved
    if (!tube && freeIn(d, t, toothed).length >= 2) rec.gears = true;
    if (hasGame(d)) rec.game = true;
    if (!tube && hasStepped(d, t)) rec.stepped = true;
    // milestone 178 (part 2): a slanted board of its own with a coin's hole
    if (!tube && freeIn(d, t, (p) => { const n = Math.abs(p.frame.u[2] * p.frame.v[0] - p.frame.u[0] * p.frame.v[2]); return n > 0.2 && n < 0.98 && p.details.some((x) => x.op === 'cut' && x.shape === 'circle' && x.w >= 15); }).length) rec.coin = true;
    return rec;
  }
  const ids = d.order.filter((id) => d.panels[id]);
  const flaps = ids.flatMap((id) => (d.panels[id].edgeFlaps ?? []).map((f) => f.shape ?? 'plain')).sort().join(',');
  // milestone 178: a pegboard is one board too, its slots and keyholes said
  if (ids.length === 1) {
    const pegs = cutsOf(d.panels[ids[0]]).pegs, hang = hangs(d);
    return { body: 'flat', ...(flaps ? { flaps } : {}), ...(slits ? { slits } : {}), ...(pegs ? { pegs } : {}), ...(pegs && hang ? { hang } : {}) };
  }
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
      // milestone 178 (part 2): three boards bent on living hinges, the middle one narrower (0.6 or less) than the others (a book cover)
      const area = (id: string) => sketchArea(d.panels[id]);
      const mid = ids.find((id) => grown.some((c) => c.b.panelId === id) && grown.some((c) => c.a.panelId === id));
      if (ids.length === 3 && mid && grown.every((c) => hasBand(d, c)) && ids.every((id) => id === mid || area(mid) <= 0.6 * area(id))) rec.spine = true;
    }
    return rec;
  }
  return { body: 'free' };
}

/** Pattern keys that, left out of a pattern, mean the record must not have them (a drawer is not a plain box). */
const FLAGS: (keyof PresetRecord)[] = ['relation', 'lean', 'slope', 'baffles', 'wrap', 'open', 'plate', 'ramp', 'roof', 'crossing', 'grid', 'shelves', 'holes', 'slant', 'tiers', 'rails', 'hang', 'jig', 'plug', 'brim', 'deep', 'disc', 'stack', 'sieve', 'loose', 'partitions', 'bothEnds', 'uneven', 'chute', 'crenels', 'openings', 'carry', 'combs', 'motor', 'pegs', 'foot', 'pins', 'crown', 'tambour', 'doors', 'gears', 'game', 'notches', 'wells', 'hooks', 'bar', 'steps', 'stepped', 'coin', 'cradles', 'spine'];

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
