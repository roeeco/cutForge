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
    const placeholders = new Set((['en', 'he'] as Lang[]).map((l) => translate(l, 'text.default')));
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
    const placeholders = new Set((['en', 'he'] as Lang[]).map((l) => translate(l, 'text.default')));
    for (const t of Object.values(d.trays ?? {})) {
      if (t.lidOf) continue;
      const ids = [t.baseId, ...Object.values(d.connections).filter((c) => c.grown && c.trayId === t.id).map((c) => c.b.panelId)];
      for (const id of ids) if (d.panels[id]?.details.some((x) => x.shape === 'text' && x.op === 'engrave' && x.text?.value.trim() && !placeholders.has(x.text.value.trim()))) return { ok: true, target: id };
    }
    return { ok: false, target: mainBox(d) };
  },
};

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
];
export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);

/** A mission's starting design in a material: its template or recipe, the mission named, its objects placed. */
export function startMission(m: Mission, mat: MaterialProfile): Design {
  let d: Design;
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
