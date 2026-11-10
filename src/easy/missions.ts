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
import { sheetUse } from './sheet';
import { boxBases, bestCell, capacity, compartments, contentFit, objectById, sizeOf } from './objects';
import { boxRecipe } from './recipes';
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

// ---------- the missions ----------

export const MISSIONS: Mission[] = [
  {
    id: 'pencil-box',
    version: 1,
    title: 'mission.pencil',
    description: 'mission.pencil.desc',
    materials: ['plywood', 'corrugated', 'card'],
    template: { id: 'organiser', params: { sizeMode: 'inner', width: 186, depth: 60, height: 30, dividersX: 0, dividersY: 2, dividerHeight: 24, lid: 'none' } },
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
    version: 1,
    title: 'mission.organiser',
    description: 'mission.organiser.desc',
    materials: ['plywood', 'corrugated', 'card'],
    template: { id: 'organiser', params: { sizeMode: 'inner', width: 200, depth: 140, height: 50, dividersX: 1, dividersY: 0, dividerHeight: 40, lid: 'none' } },
    contents: [{ object: 'deck', count: 1 }, { object: 'dice', count: 5 }],
    goals: [compartmentsAtLeast(4), hasLid, contentsFit('goal.deckIn', 'deck', 1), oneSheet, readyToCut],
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
