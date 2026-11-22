// Missions (milestone 40): a registry like the templates'. A mission is a
// starting design (a template with parameters, or a Quick build recipe), the
// objects that go inside it, and goals checked against the design as it is
// now. Goals come in up to three groups, one star each.
import type { Content, Design, MaterialKind, MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import { defaults, generate, templateById } from '../templates/registry';
import { createDesign, newId, parentConnection, solve } from '../model/ops';
import { validate } from '../model/validate';
import { blocking } from './fix';
import { boxLid } from './lid';
import { sheetUse } from './sheet';
import { boxBases, bestCell, capacity, compartments, contentFit, objectById, sizeOf } from './objects';
import { boxRecipe } from './recipes';
import { setBoxSize } from '../model/boxSize';
import { addSpaces, mainTray } from '../templates/structures/box';
import { recordOf } from '../templates/records';
import { wallsOf } from '../templates/structures/shaped';
import { hangByKeyholes } from '../templates/structures/boards';
import { setCustomHeight, setPanelSize } from '../model/ops';
import type { Mode } from './features';
import { translate, type Lang } from '../i18n';

export type GoalResult = { ok: boolean; target?: string };
export type Goal = { id: string; group: 0 | 1 | 2; label: MsgKey; vars?: Record<string, string | number>; check: (d: Design) => GoalResult };
export type Mission = {
  id: string;
  version: number;
  title: MsgKey;
  description: MsgKey;
  materials: MaterialKind[];
  /** The starting design: a template with parameters, or a recipe. */
  template?: { id: string; params: Record<string, number | string> };
  start?: (d: Design) => void;
  /** The levels whose gallery offers it (milestone 106); absent: every level. */
  levels?: Mode[];
  /** What goes inside at the start: an object and how many. */
  contents: { object: string; count: number }[];
  /** Milestone 184 (E9): the sheet it needs at least (mm): it starts on the material with a sheet this large (787 × 488, the largest). */
  sheet?: { w: number; h: number };
  goals: Goal[];
};

// ---------- goals ----------

/** The main box: the first base with walls. */
const mainBox = (d: Design) => boxBases(d)[0];

/** Every object placed in the design fits where it is. */
function contentsFit(label: MsgKey, object: string, count: number): Goal {
  return {
    id: `fits-${object}`,
    group: 0,
    label,
    vars: { n: count },
    check: (d) => {
      const c = (d.contents ?? []).find((x) => x.object === object);
      if (c) return { ok: contentFit(d, c).ok, target: c.baseId };
      // nothing placed: any compartment that would hold them
      for (const b of boxBases(d)) if (compartments(d, b).some((k) => capacity(d, k, sizeOf({ id: '', object, baseId: b, x: 0, y: 0 })) >= count)) return { ok: true, target: b };
      return { ok: false, target: mainBox(d) };
    },
  };
}

function compartmentsAtLeast(n: number): Goal {
  return { id: `compartments-${n}`, group: 0, label: 'goal.compartments', vars: { n }, check: (d) => ({ ok: !!mainBox(d) && compartments(d, mainBox(d)).length >= n, target: mainBox(d) }) };
}

const oneSheet: Goal = { id: 'one-sheet', group: 1, label: 'goal.oneSheet', check: (d) => ({ ok: d.order.length > 0 && sheetUse(d).sheets === 1 }) };
const readyToCut: Goal = { id: 'ready', group: 1, label: 'goal.ready', check: (d) => ({ ok: d.order.length > 0 && validate(d).filter(blocking).length === 0 }) };

/** Text engraved on the box (not the placeholder). */
const nameEngraved: Goal = {
  id: 'name',
  group: 2,
  label: 'goal.name',
  check: (d) => {
    // the text tool's default and Guided's *Your name* (milestone 108) are placeholders, not words of the student's
    const placeholders = new Set((['en', 'he'] as Lang[]).flatMap((l) => [translate(l, 'text.default'), translate(l, 'g.deco.namePlaceholder')]));
    for (const id of d.order) if (d.panels[id].details.some((x) => x.shape === 'text' && x.op === 'engrave' && x.text && x.text.value.trim() && !placeholders.has(x.text.value.trim()))) return { ok: true, target: id };
    return { ok: false, target: mainBox(d) };
  },
};

const sticker: Goal = {
  id: 'sticker',
  group: 2,
  label: 'goal.sticker',
  check: (d) => {
    for (const id of d.order) if (d.panels[id].details.some((x) => x.shape === 'path')) return { ok: true, target: id };
    return { ok: false, target: mainBox(d) };
  },
};

/** A lid: a panel grown from a wall (across the top), or the template's lift-off lid. */
const hasLid: Goal = {
  id: 'lid',
  group: 0,
  label: 'goal.lid',
  check: (d) => {
    if (d.template?.params.lid === 'liftoff') return { ok: true };
    // a box's lid, however it was made (milestone 73): a cap, a hinged or arched lid, a carton's top
    for (const t of Object.values(d.trays ?? {})) {
      const l = boxLid(d, t.id);
      if (l.kind !== 'none') return { ok: true, target: l.kind === 'liftoff' ? l.top : l.kind === 'flaps' ? t.baseId : l.lid };
    }
    for (const c of Object.values(d.connections)) if (c.grown && parentConnection(d, c.a.panelId) && c.a.edge === 'e2' && Math.abs(c.angle - 90) < 1e-6) return { ok: true, target: c.b.panelId };
    return { ok: false, target: mainBox(d) };
  },
};

/** The card stand holds a deck: wide enough for the cards, deep enough for the deck. */
const deckFits: Goal = {
  id: 'deck',
  group: 0,
  label: 'goal.deck',
  check: (d) => {
    const p = d.template?.params;
    const deck = objectById('deck');
    return { ok: !!p && Number(p.cardWidth) >= deck.w + 2 && Number(p.cardThickness) >= deck.h, target: 't:base' };
  },
};

const angleChosen: Goal = { id: 'angle', group: 2, label: 'goal.angle', check: (d) => ({ ok: !!d.template && Number(d.template.params.angle) <= 45, target: 't:base' }) };

/** The box's lid opens (milestone 82): it lifts off or is hinged. */
const lidOpens: Goal = {
  id: 'opens',
  group: 0,
  label: 'goal.opens',
  check: (d) => {
    for (const t of Object.values(d.trays ?? {})) {
      const l = boxLid(d, t.id);
      if (l.kind === 'liftoff' || l.kind === 'hinged') return { ok: true, target: l.kind === 'liftoff' ? l.top : l.lid };
    }
    return { ok: false, target: mainBox(d) };
  },
};

/** It takes a padlock: a hasp through its lid (milestone 82). */
const takesPadlock: Goal = {
  id: 'padlock',
  group: 0,
  label: 'goal.padlock',
  check: (d) => {
    const L = d.order.map((id) => d.panels[id]).find((p) => p?.lidOf?.hasps);
    return { ok: !!L, target: L?.id ?? mainBox(d) };
  },
};

/** A clue engraved inside the box: text on its base or a wall (not on the lid). */
const clueInside: Goal = {
  id: 'clue',
  group: 2,
  label: 'goal.clue',
  check: (d) => {
    // the text tool's default and Guided's *Your name* (milestone 108) are placeholders, not words of the student's
    const placeholders = new Set((['en', 'he'] as Lang[]).flatMap((l) => [translate(l, 'text.default'), translate(l, 'g.deco.namePlaceholder')]));
    for (const t of Object.values(d.trays ?? {})) {
      if (t.lidOf) continue;
      const ids = [t.baseId, ...Object.values(d.connections).filter((c) => c.grown && c.trayId === t.id).map((c) => c.b.panelId)];
      for (const id of ids) if (d.panels[id]?.details.some((x) => x.shape === 'text' && x.op === 'engrave' && x.text?.value.trim() && !placeholders.has(x.text.value.trim()))) return { ok: true, target: id };
    }
    return { ok: false, target: mainBox(d) };
  },
};

// milestone 178 (part 2) and 179: goals read from what the design is (its record) or what is cut in it

/** It hangs on a wall: keyholes or a cleat (milestone 179). */
const hangsOnWall: Goal = { id: 'hangs', group: 0, label: 'goal.hangs', check: (d) => ({ ok: !!recordOf(d).hang, target: mainBox(d) }) };

/** A window cut in one of its walls (a rectangle or circle 12 mm or more in its lower part). */
const windowIn: Goal = { id: 'window', group: 0, label: 'goal.window', check: (d) => ({ ok: !!recordOf(d).window, target: mainBox(d) }) };

/** `n` round holes or more of `min` to `max` mm in one board (the lights of a traffic light, a board's screw holes). */
function holesIn(id: string, label: MsgKey, n: number, min: number, max: number, level = false): Goal {
  return {
    id,
    group: 0,
    label,
    vars: { n },
    check: (d) => {
      for (const pid of d.order) {
        const p = d.panels[pid];
        if (level && Math.abs(p.frame.u[2] * p.frame.v[0] - p.frame.u[0] * p.frame.v[2]) < 0.98) continue;
        if (p.details.filter((x) => x.op === 'cut' && x.shape === 'circle' && x.w >= min - 1e-6 && x.w <= max + 1e-6).length >= n) return { ok: true, target: pid };
      }
      return { ok: false, target: mainBox(d) };
    },
  };
}

/** `n` spaces or more in the main box, each holding one `object` (a deck in each of a card box's spaces). */
function eachHolds(id: string, label: MsgKey, object: string, n: number): Goal {
  return {
    id,
    group: 0,
    label,
    vars: { n },
    check: (d) => {
      const b = mainBox(d);
      const one = b ? compartments(d, b).filter((k) => capacity(d, k, sizeOf({ id: '', object, baseId: b, x: 0, y: 0 })) >= 1).length : 0;
      return { ok: one >= n, target: b };
    },
  };
}

/** A box with spaces and a back wall raised over the others with two keyholes in it: it hangs (WallTypeTray). */
function wallTray(d: Design, inside: { w: number; d: number; h: number }) {
  boxWithSpaces(d, inside, 1, 1);
  const back = wallsOf(d).e2;
  if (!back) return;
  setCustomHeight(d, back, true);
  setPanelSize(d, back, undefined, d.panels[back].h + 45);
  hangByKeyholes(d, back, undefined, Math.max(d.panels[back].w / 8, 2 * d.material.thickness + 10));
}

// milestone 184 (BOXES_PLYWOOD_PLAN.md §3.8): enclosures' goals

/** The walls of the main box (by base edge), or all of them. */
function boxWalls(d: Design, edge?: string): string[] {
  const b = mainBox(d);
  return Object.values(d.connections).filter((c) => c.grown && c.a.panelId === b && (!edge || c.a.edge.split('#')[0] === edge)).map((c) => c.b.panelId);
}

/** A round hole cut in a board, `min` to `max` mm across. */
const roundHoles = (d: Design, id: string, min: number, max: number) => (d.panels[id]?.details ?? []).filter((x) => x.op === 'cut' && x.shape === 'circle' && x.w >= min - 1e-6 && x.w <= max + 1e-6).length;

/** `n` screw holes or more (2 to 4.5 mm) in the main box's base: a circuit board's standoffs. */
function baseHoles(n: number): Goal {
  return { id: 'base-holes', group: 0, label: 'goal.baseHoles', vars: { n }, check: (d) => ({ ok: !!mainBox(d) && roundHoles(d, mainBox(d), 2, 4.5) >= n, target: mainBox(d) }) };
}

/** A hole for a cable (round, 5 to 25 mm) in a wall of the main box, its back wall, or its base. */
function cableHole(where: 'wall' | 'back' | 'base'): Goal {
  return {
    id: 'cable',
    group: 0,
    label: 'goal.cableHole',
    check: (d) => {
      const ids = where === 'base' ? [mainBox(d)].filter(Boolean) : boxWalls(d, where === 'back' ? 'e2' : undefined);
      const hit = ids.find((id) => roundHoles(d, id, 5, 25) > 0);
      return { ok: !!hit, target: hit ?? ids[0] ?? mainBox(d) };
    },
  };
}

/** `n` round holes or more (5 to 30 mm) in a rack box's front panel: a switch, a socket. */
function frontHoles(n: number): Goal {
  return {
    id: 'front-holes',
    group: 0,
    label: 'goal.frontHoles',
    vars: { n },
    check: (d) => {
      const f = d.order.find((id) => d.panels[id]?.fitting === 'front');
      return { ok: !!f && roundHoles(d, f, 5, 30) >= n, target: f ?? mainBox(d) };
    },
  };
}

/** `n` seven-segment digits or more cut in the main box's front wall (Shapes, Parts: milestone 183). */
function digitsIn(n: number): Goal {
  return {
    id: 'digits',
    group: 0,
    label: 'goal.digits',
    vars: { n },
    check: (d) => {
      const f = boxWalls(d, 'e0')[0];
      const k = (d.panels[f]?.details ?? []).filter((x) => x.op === 'cut' && x.part?.kind === 'digits').reduce((s, x) => s + Number(x.part!.p.count ?? 1), 0);
      return { ok: k >= n, target: f ?? mainBox(d) };
    },
  };
}

/** The largest sheet (owner, 21 November): the challenges larger than 600 × 400 start on it. */
const BIG_SHEET = { w: 787, h: 488 };

// ---------- the missions ----------

/** A rectangular open box of this inside size (sizes stated as inside), split into equal spaces `nx` across and `ny` front to back. */
function boxWithSpaces(d: Design, inside: { w: number; d: number; h: number }, nx: number, ny: number) {
  if (!boxRecipe(d, { kind: 'rect', x0: -inside.w / 2, z0: -inside.d / 2, x1: inside.w / 2, z1: inside.d / 2 }, inside.h)) return;
  const tray = mainTray(d)!;
  d.sizeAs = 'inside';
  setBoxSize(d, tray, inside, 'inside');
  if (nx > 1 || ny > 1) addSpaces(d, tray, { spacesBy: 'count', nx, ny });
}

export const MISSIONS: Mission[] = [
  {
    // version 2 (milestone 106): a box of the Lid section with dividers of its own, so Guided's arrows and grips and one
    // kind of lid serve it; version 1 started from the organiser template (a saved one still opens and counts)
    id: 'pencil-box',
    version: 2,
    title: 'mission.pencil',
    description: 'mission.pencil.desc',
    materials: ['plywood', 'corrugated', 'card'],
    start: (d) => boxWithSpaces(d, { w: 186, d: 60, h: 30 }, 1, 3),
    contents: [{ object: 'pencil', count: 12 }],
    goals: [contentsFit('goal.pencils', 'pencil', 12), compartmentsAtLeast(3), oneSheet, readyToCut, nameEngraved],
  },
  {
    id: 'dice-tray',
    version: 1,
    title: 'mission.dice',
    description: 'mission.dice.desc',
    materials: ['plywood', 'corrugated', 'card'],
    start: (d) => void boxRecipe(d, { kind: 'regular', x0: -32, z0: -32, x1: 32, z1: 32, sides: 6 }, 25),
    contents: [{ object: 'dice', count: 6 }],
    goals: [contentsFit('goal.dice', 'dice', 6), oneSheet, readyToCut, sticker],
  },
  {
    id: 'card-stand',
    version: 1,
    title: 'mission.stand',
    description: 'mission.stand.desc',
    materials: ['plywood', 'corrugated', 'card'],
    template: { id: 'stand', params: { cardWidth: 90, cardThickness: 2, angle: 60, slots: 3, baseDepth: 120 } },
    contents: [],
    goals: [deckFits, oneSheet, readyToCut, angleChosen],
  },
  {
    id: 'game-organiser',
    version: 2,
    title: 'mission.organiser',
    description: 'mission.organiser.desc',
    materials: ['plywood', 'corrugated', 'card'],
    start: (d) => boxWithSpaces(d, { w: 200, d: 140, h: 50 }, 2, 1),
    contents: [{ object: 'deck', count: 1 }, { object: 'dice', count: 5 }],
    goals: [compartmentsAtLeast(4), hasLid, contentsFit('goal.deckIn', 'deck', 1), oneSheet, readyToCut],
  },
  {
    // milestone 82 (LIDS_LINES_PROJECTS_PLAN.md §4): three locks, three puzzles; nothing is met on arrival
    id: 'escape-box',
    version: 1,
    title: 'mission.escape',
    description: 'mission.escape.desc',
    materials: ['plywood'],
    // its padlock needs hasps, which Guided does not offer (owner question 8: it stays Quick build's)
    levels: ['quick', 'workshop'],
    start: (d) => void boxRecipe(d, { kind: 'rect', x0: -70, z0: -50, x1: 70, z1: 50 }, 70),
    contents: [],
    goals: [lidOpens, takesPadlock, oneSheet, readyToCut, clueInside],
  },
  // milestones 178 (part 2) and 179 (BOXES_PLYWOOD_PLAN.md §3.2, §3.3): boxes.py's challenges in plywood, offered in
  // Quick build and Workshop (Guided's gallery keeps its order)
  {
    // WallTypeTray: a type tray on the wall, its back raised with keyholes; split it into spaces for small parts
    id: 'wall-tray',
    version: 1,
    title: 'mission.wallTray',
    description: 'mission.wallTray.desc',
    materials: ['plywood'],
    levels: ['quick', 'workshop'],
    start: (d) => wallTray(d, { w: 180, d: 60, h: 40 }),
    contents: [{ object: 'dice', count: 3 }],
    goals: [contentsFit('goal.dice', 'dice', 3), compartmentsAtLeast(6), hangsOnWall, oneSheet, readyToCut, nameEngraved],
  },
  {
    // CardBox: a lidded box for two decks of cards, a space for each
    id: 'card-box',
    version: 1,
    title: 'mission.cardBox',
    description: 'mission.cardBox.desc',
    materials: ['plywood'],
    levels: ['quick', 'workshop'],
    template: { id: 'box', params: { width: 140, depth: 95, height: 35, sizeAs: 'inside', lid: 'liftoff' } },
    contents: [{ object: 'deck', count: 1 }],
    goals: [eachHolds('decks', 'goal.decksIn', 'deck', 2), lidOpens, oneSheet, readyToCut, nameEngraved],
  },
  {
    // DisplayCase: a closed box on a base plate wider than it; cut a window to see what is inside
    id: 'display-case',
    version: 1,
    title: 'mission.displayCase',
    description: 'mission.displayCase.desc',
    materials: ['plywood'],
    levels: ['quick', 'workshop'],
    template: { id: 'box', params: { width: 150, depth: 100, height: 100, sizeAs: 'inside', lid: 'closed', overhang: 'plate' } },
    contents: [],
    goals: [windowIn, oneSheet, readyToCut, nameEngraved],
  },
  {
    // TrafficLight: a tall closed box; three round lights down its front
    id: 'traffic-light',
    version: 1,
    title: 'mission.trafficLight',
    description: 'mission.trafficLight.desc',
    materials: ['plywood'],
    levels: ['quick', 'workshop'],
    template: { id: 'box', params: { width: 70, depth: 60, height: 180, sizeAs: 'inside', lid: 'closed' } },
    contents: [],
    goals: [holesIn('lights', 'goal.lights', 3, 20, 50), oneSheet, readyToCut, sticker],
  },
  {
    // SBCMicroRack: a shelf for small computer boards; screw holes in a shelf for their standoffs
    id: 'sbc-rack',
    version: 1,
    title: 'mission.sbcRack',
    description: 'mission.sbcRack.desc',
    materials: ['plywood'],
    levels: ['quick', 'workshop'],
    template: { id: 'shelf', params: { width: 140, depth: 100, height: 130, shelves: 3 } },
    contents: [],
    goals: [holesIn('mounts', 'goal.mounts', 4, 2, 4.5, true), oneSheet, readyToCut],
  },
  {
    // AgricolaInsert: an insert for a board game's box: spaces for its cards, dice and tokens, and a lid
    id: 'game-insert',
    version: 1,
    title: 'mission.gameInsert',
    description: 'mission.gameInsert.desc',
    materials: ['plywood'],
    levels: ['quick', 'workshop'],
    start: (d) => boxWithSpaces(d, { w: 280, d: 150, h: 40 }, 1, 2),
    contents: [{ object: 'deck', count: 1 }, { object: 'dice', count: 8 }],
    goals: [compartmentsAtLeast(4), contentsFit('goal.deckIn', 'deck', 1), contentsFit('goal.dice', 'dice', 8), hasLid, oneSheet, readyToCut],
  },
  // milestone 184 (BOXES_PLYWOOD_PLAN.md §3.8): enclosures in plywood, Quick build and Workshop
  {
    // ElectronicsBox: a closed box whose top is screwed on corner blocks; the board's standoffs and its cable
    id: 'electronics-box',
    version: 1,
    title: 'mission.electronicsBox',
    description: 'mission.electronicsBox.desc',
    materials: ['plywood'],
    levels: ['quick', 'workshop'],
    template: { id: 'box', params: { width: 120, depth: 80, height: 45, sizeAs: 'inside', lid: 'screwed' } },
    contents: [],
    goals: [baseHoles(4), cableHole('wall'), oneSheet, readyToCut, nameEngraved],
  },
  {
    // Rack19Box: two rack units, its front panel's ears screwed into a 19-inch rack; larger than 600 × 400 allows
    id: 'rack-box',
    version: 1,
    title: 'mission.rackBox',
    description: 'mission.rackBox.desc',
    materials: ['plywood'],
    levels: ['quick', 'workshop'],
    sheet: BIG_SHEET,
    template: { id: 'box', params: { width: 448, depth: 100, height: 88.11, sizeAs: 'outside', lid: 'screwed', rack: '19' } },
    contents: [],
    goals: [frontHoles(2), oneSheet, readyToCut, nameEngraved],
  },
  {
    // EuroRackSkiff: 84 HP of 3U modules on two rails (wider than the box's words take on 600 × 400; its pieces lie on one)
    id: 'euro-skiff',
    version: 1,
    title: 'mission.euroSkiff',
    description: 'mission.euroSkiff.desc',
    materials: ['plywood'],
    levels: ['quick', 'workshop'],
    template: { id: 'box', params: { width: 84 * 5.08, depth: 130.5, height: 60, sizeAs: 'inside', rack: 'euro' } },
    contents: [],
    goals: [cableHole('back'), oneSheet, readyToCut, nameEngraved],
  },
  {
    // Matrix: a grid of cells in front of an LED panel, a light in each; the panel behind its base
    id: 'led-matrix',
    version: 1,
    title: 'mission.ledMatrix',
    description: 'mission.ledMatrix.desc',
    materials: ['plywood'],
    levels: ['quick', 'workshop'],
    template: { id: 'box', params: { width: 160, depth: 160, height: 25, sizeAs: 'inside' } },
    contents: [],
    goals: [compartmentsAtLeast(64), cableHole('base'), oneSheet, readyToCut],
  },
  {
    // SevenSegmentClock: four big digits cut in a box's front, an LED strip behind them; the digits are a part of
    // Shapes (milestone 183), which is Workshop's
    id: 'segment-clock',
    version: 1,
    title: 'mission.segmentClock',
    description: 'mission.segmentClock.desc',
    materials: ['plywood'],
    levels: ['workshop'],
    template: { id: 'box', params: { width: 240, depth: 80, height: 100, sizeAs: 'inside', lid: 'screwed' } },
    contents: [],
    goals: [digitsIn(4), cableHole('back'), oneSheet, readyToCut],
  },
];
export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);

/** A mission's starting design in a material: its template or recipe, the mission named, its objects placed. */
export function startMission(m: Mission, mat: MaterialProfile): Design {
  let d: Design;
  // milestone 184: a challenge larger than the sheet starts on one large enough (a sheet changed is the material's own, as the drawer makes it)
  if (m.sheet && (mat.sheetW < m.sheet.w || mat.sheetH < m.sheet.h)) mat = { ...mat, id: mat.id.endsWith('-custom') ? mat.id : `${mat.id}-custom`, sheetW: Math.max(mat.sheetW, m.sheet.w), sheetH: Math.max(mat.sheetH, m.sheet.h) };
  const tp = m.template && templateById(m.template.id);
  if (tp) d = generate(tp, mat, { ...defaults(tp), ...m.template!.params });
  else {
    d = createDesign(mat);
    m.start?.(d);
    solve(d);
  }
  d.mission = { id: m.id, version: m.version };
  d.contents = placeContents(d, m.contents);
  return d;
}

/** The objects, each in the compartment it suits best. */
export function placeContents(d: Design, items: { object: string; count: number }[]): Content[] {
  const out: Content[] = [];
  const base = mainBox(d);
  if (!base) return out;
  const taken: ReturnType<typeof bestCell>[] = [];
  for (const it of items) {
    const o = objectById(it.object);
    const cell = bestCell(d, base, o, it.count, taken.filter((x) => !!x) as NonNullable<(typeof taken)[number]>[]);
    if (!cell) continue;
    taken.push(cell);
    out.push({ id: newId('o'), object: it.object, baseId: base, x: (cell.x0 + cell.x1) / 2, y: (cell.y0 + cell.y1) / 2, count: it.count });
  }
  return out;
}

export type GoalState = { goal: Goal; ok: boolean; target?: string };

/** Each goal, checked against the design now; and the stars: one for each group whose goals are all met. */
export function missionState(d: Design): { mission: Mission; goals: GoalState[]; stars: number; done: boolean } | null {
  const m = d.mission && missionById(d.mission.id);
  if (!m) return null;
  const goals = m.goals.map((g) => {
    const r = g.check(d);
    return { goal: g, ok: r.ok, target: r.target };
  });
  const groups = [...new Set(m.goals.map((g) => g.group))];
  const stars = Math.min(3, groups.filter((k) => goals.filter((g) => g.goal.group === k).every((g) => g.ok)).length);
  return { mission: m, goals, stars, done: goals.every((g) => g.ok) };
}
