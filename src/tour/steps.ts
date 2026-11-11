// The first-use tour's steps (milestone 43, TOUR_PLAN.md): a declarative list.
// Each step points at something (a part of the interface, a point on the
// stage, or the centre), says what to do, knows when it is done (a pure check
// of the editor's state against the design the step started with), and what
// Skip applies (model ops, so later steps still make sense).
import type { Design, V3 } from '../model/types';
import type { EditorState } from '../store/store';
import type { MsgKey } from '../i18n';
import { addDetail, addDividerFor, addRootPanel, addTray, parentConnection, setAllJoints, setMaterial } from '../model/ops';
import { MATERIALS, tOf } from '../model/materials';
import { toWorld } from '../model/frame';
import { findEdge } from '../model/edges';
import { trayWalls } from '../model/trays';
import { groupKinds, groupShown, jointsOf, standsOnFace } from '../model/jointDefaults';
import { quickWallHeight, wallRecipe } from '../easy/recipes';
import { requestCamera, TOUR_CAMERA } from './stage';

/** The divider step's camera: higher up, looking into the box. */
const INSIDE_CAMERA: [V3, V3] = [
  [60, 330, 170],
  [0, 0, 0],
];

/** What the spotlight and the card point at. */
export type Anchor = { dom: string } | { stage: (d: Design) => V3 | null } | { centre: true };

export type TourStep = {
  id: string;
  /** Where to point; a function when it moves on as the student goes (the tool, then the stage). */
  anchor: Anchor | ((s: EditorState) => Anchor);
  title: MsgKey;
  body: MsgKey;
  /** Done when this turns true (the student did it); `entry` is the design when the step was entered. */
  done?: (s: EditorState, entry: Design) => boolean;
  /** A short "Not quite" line when the state clearly went another way. */
  notQuite?: (s: EditorState, entry: Design) => MsgKey | null;
  /** What Skip applies to the design (one undo step). */
  skip?: (d: Design) => void;
  /** What Skip sets outside the design (a tool). */
  skipUi?: (s: EditorState) => void;
  /** Run on entering the step. */
  prepare?: (s: EditorState) => void;
  /** An explain-only step: the card offers Next. */
  next?: boolean;
  /** Panels left off the stage during the step (view only): the lid while the student draws inside the box. */
  hide?: (d: Design) => string[];
};

const PLY3 = () => MATERIALS.find((m) => m.id === 'ply-3')!;
const CARD = () => MATERIALS.find((m) => m.id === 'card-0.5')!;
const dom = (testId: string): Anchor => ({ dom: `[data-testid="${testId}"]` });

// ---------- the box the tour builds ----------

/** The tour's base: a board on the floor (not a guide) at least 60 × 40 mm. */
export function tourBase(d: Design): string | null {
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p || p.construction || p.place || parentConnection(d, id)) continue;
    if (Math.max(p.w, p.h) >= 60 && Math.min(p.w, p.h) >= 40) return id;
  }
  return null;
}

/** The tray standing on the tour's base. */
export function tourTray(d: Design): string | null {
  const b = tourBase(d);
  return (b && Object.values(d.trays ?? {}).find((t) => t.baseId === b)?.id) || null;
}

/** World centre of a panel (its middle, half way through the slab). */
function centre(d: Design, id: string): V3 {
  const p = d.panels[id];
  return toWorld(p.frame, p.w / 2, p.h / 2, tOf(d, id) / 2);
}

/** The tray's walls by where they stand: back (away from the start camera, −z), front, left and right. */
export function tourWalls(d: Design): { back: string; front: string; left: string; right: string; all: string[] } | null {
  const tr = tourTray(d);
  if (!tr) return null;
  const all = trayWalls(d, tr).filter((id) => d.panels[id]);
  if (all.length < 4) return null;
  const by = (k: 0 | 2, sign: 1 | -1) => all.reduce((a, b) => (sign * centre(d, b)[k] > sign * centre(d, a)[k] ? b : a));
  return { back: by(2, -1), front: by(2, 1), left: by(0, -1), right: by(0, 1), all };
}

/** Stage anchor: the middle of the base's top face. */
export function baseCentre(d: Design): V3 | null {
  const b = tourBase(d);
  if (!b) return null;
  const p = d.panels[b];
  return toWorld(p.frame, p.w / 2, p.h / 2, tOf(d, b));
}

/** Stage anchor: the middle of the back wall's top edge. */
export function backTopMid(d: Design): V3 | null {
  const w = tourWalls(d);
  if (!w) return null;
  const p = d.panels[w.back];
  const e = findEdge(p, 'e2');
  if (!e) return null;
  return toWorld(p.frame, (e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2, tOf(d, w.back) / 2);
}

/** Stage anchor: the floor inside the box (the base's top face, a little behind the middle). */
export function boxFloor(d: Design): V3 | null {
  return baseCentre(d);
}

/** Stage anchor: the middle of the front wall. */
export function frontCentre(d: Design): V3 | null {
  const w = tourWalls(d);
  return w ? centre(d, w.front) : null;
}

/** Panels grown from a tray wall's top edge: the lid. */
export function lidPanels(d: Design): string[] {
  const w = tourWalls(d)?.all ?? [];
  return Object.values(d.connections)
    .filter((c) => c.grown && w.includes(c.a.panelId) && c.a.edge.split('#')[0] === 'e2')
    .map((c) => c.b.panelId);
}

/** Grown from a tray wall's top edge (a lid on its own). */
function grownFromTop(d: Design, walls: string[]): boolean {
  return Object.values(d.connections).some((c) => c.grown && walls.includes(c.a.panelId) && c.a.edge.split('#')[0] === 'e2');
}

/** A divider in the box: a panel standing on the base, joined to two walls. */
export function hasDivider(d: Design): boolean {
  const b = tourBase(d), w = tourWalls(d);
  if (!b || !w) return false;
  return Object.values(d.connections).some((c) => {
    if (!c.grown || c.a.panelId !== b || !standsOnFace(d, c)) return false;
    const id = c.b.panelId;
    const ends = Object.values(d.connections).filter((x) => !x.grown && ((x.a.panelId === id && w.all.includes(x.b.panelId)) || (x.b.panelId === id && w.all.includes(x.a.panelId))));
    return new Set(ends.map((x) => (x.a.panelId === id ? x.b.panelId : x.a.panelId))).size >= 2;
  });
}

/** A confirmed cut-out on a tray wall (not one still waiting for ✓). */
export function hasWallCut(s: Pick<EditorState, 'design' | 'pending'>): boolean {
  const w = tourWalls(s.design);
  if (!w) return false;
  const pend = new Set(s.pending?.ids ?? []);
  return w.all.some((id) => s.design.panels[id].details.some((dt) => dt.op === 'cut' && !pend.has(dt.id)));
}

/** The corner kinds offered for the current material, and the first other than the one shown. */
export function otherCornerKind(d: Design) {
  const shown = groupShown(d, 'corner');
  return groupKinds(d, 'corner').find((k) => k !== shown) ?? null;
}

const isPly = (d: Design) => d.material.kind === 'plywood';

// ---------- the steps ----------

export const TOUR_STEPS: TourStep[] = [
  { id: 'welcome', anchor: { centre: true }, title: 'tour.welcome.title', body: 'tour.welcome.body' },
  {
    id: 'tool',
    anchor: dom('tool-panel'),
    title: 'tour.tool.title',
    body: 'tour.tool.body',
    done: (s) => s.tool === 'panel',
    skipUi: (s) => s.setTool('panel'),
  },
  {
    id: 'base',
    anchor: { stage: () => [0, 0, 0] },
    title: 'tour.base.title',
    body: 'tour.base.body',
    done: (s) => !!tourBase(s.design),
    skip: (d) => void addRootPanel(d, -60, 40, 120, 80),
  },
  {
    id: 'perpendicular',
    anchor: dom('tool-panel-standing'),
    title: 'tour.perpendicular.title',
    body: 'tour.perpendicular.body',
    // the button only shows while the tool is active
    prepare: (s) => s.tool !== 'panel' && s.setTool('panel'),
    next: true,
  },
  {
    id: 'walls',
    anchor: (s) => {
      const b = tourBase(s.design);
      if (s.extrude) return dom('extrude-go');
      if (b && s.selection?.kind === 'panel' && s.selection.id === b) return dom('extrude');
      return { stage: baseCentre };
    },
    title: 'tour.walls.title',
    body: 'tour.walls.body',
    prepare: (s) => s.tool !== 'select' && s.setTool('select'),
    done: (s) => !!tourTray(s.design),
    skip: (d) => {
      const b = tourBase(d);
      if (b) addTray(d, b, 40);
    },
  },
  {
    id: 'lid',
    anchor: (s) => (s.selection?.kind === 'edge' ? dom('grow-go') : { stage: backTopMid }),
    title: 'tour.lid.title',
    body: 'tour.lid.body',
    done: (s) => grownFromTop(s.design, tourWalls(s.design)?.all ?? []),
    // a board made some other way (drawn on a wall, grown elsewhere) is not the lid
    notQuite: (s, entry) => {
      const w = tourWalls(s.design)?.all ?? [];
      const fresh = s.design.order.filter((id) => !entry.panels[id]);
      const lid = (id: string) => {
        const c = parentConnection(s.design, id);
        return !!c && w.includes(c.a.panelId) && c.a.edge.split('#')[0] === 'e2';
      };
      return fresh.some((id) => !lid(id)) ? 'tour.lid.notQuite' : null;
    },
    skip: (d) => {
      const w = tourWalls(d);
      if (w) wallRecipe(d, w.back, 'e2', quickWallHeight(d, w.back, 'e2', 80));
    },
  },
  {
    id: 'material',
    anchor: (s) => (s.drawerOpen ? dom('drawer-mat-card-0.5') : dom('material-pill')),
    title: 'tour.material.title',
    body: 'tour.material.body',
    prepare: (s) => {
      if (s.tool !== 'select') s.setTool('select');
      s.select(null);
    },
    done: (s) => !isPly(s.design),
    skip: (d) => setMaterial(d, CARD()),
  },
  {
    id: 'changed',
    anchor: dom('toggle-joints'),
    title: 'tour.changed.title',
    body: 'tour.changed.body',
    // the joints view, on the left wall: its labels show what each joint became
    prepare: (s) => {
      s.set({ drawerOpen: false });
      if (!s.viewPrefs.joints) s.setPrefs({ joints: true });
      const w = tourWalls(s.design);
      if (w) s.select({ kind: 'panel', id: w.left });
    },
    next: true,
  },
  {
    id: 'corners',
    anchor: dom('joints-corner'),
    title: 'tour.corners.title',
    body: 'tour.corners.body',
    // the design card (nothing selected) with its Joints section open
    prepare: (s) => {
      if (s.viewPrefs.joints) s.setPrefs({ joints: false });
      s.select(null);
      s.setPrefs({ sections: { ...(s.viewPrefs.sections ?? {}), joints: true } });
    },
    done: (s, entry) => jointsOf(s.design)?.corner !== jointsOf(entry)?.corner && s.design.material.kind === entry.material.kind,
    skip: (d) => {
      const k = otherCornerKind(d);
      if (k) setAllJoints(d, 'corner', k);
    },
  },
  {
    id: 'plywood',
    anchor: (s) => (s.drawerOpen ? dom('drawer-mat-ply-3') : dom('material-pill')),
    title: 'tour.plywood.title',
    body: 'tour.plywood.body',
    done: (s) => isPly(s.design),
    skip: (d) => setMaterial(d, PLY3()),
  },
  {
    id: 'divider',
    anchor: (s) => (s.tool !== 'panel' ? dom('tool-panel') : s.panelPose !== 'standing' ? dom('tool-panel-standing') : { stage: boxFloor }),
    title: 'tour.divider.title',
    body: 'tour.divider.body',
    // the lid is left off the stage, and the camera looks in from higher up, so the box's floor can be reached
    prepare: (s) => {
      s.set({ drawerOpen: false });
      requestCamera(...INSIDE_CAMERA);
    },
    hide: lidPanels,
    done: (s) => hasDivider(s.design),
    notQuite: (s, entry) => {
      const b = tourBase(s.design);
      const made = s.design.order.some((id) => !entry.panels[id] && s.design.panels[id]?.place?.host === b);
      return made ? 'tour.divider.notQuite' : null;
    },
    skip: (d) => {
      const w = tourWalls(d);
      if (w) addDividerFor(d, w.left, w.right);
    },
  },
  {
    id: 'cutter',
    anchor: (s) => {
      if (s.pending) return dom('ghost-ok');
      if (!['rect', 'roundrect', 'circle'].includes(s.tool)) return dom('tool-shapes');
      if (s.tool !== 'circle') return dom('tool-circle');
      return { stage: frontCentre };
    },
    title: 'tour.cutter.title',
    body: 'tour.cutter.body',
    prepare: (s) => {
      if (s.tool !== 'select') s.setTool('select');
      s.select(null);
      requestCamera(...TOUR_CAMERA);
    },
    done: (s) => hasWallCut(s),
    notQuite: (s, entry) => {
      const w = tourWalls(s.design)?.all ?? [];
      const old = new Set(entry.order.flatMap((id) => entry.panels[id]?.details.map((dt) => dt.id) ?? []));
      const fresh = s.design.order.flatMap((id) => (s.design.panels[id]?.details ?? []).filter((dt) => !old.has(dt.id)).map((dt) => ({ id, dt })));
      return fresh.some(({ id, dt }) => dt.op !== 'cut' || !w.includes(id)) ? 'tour.cutter.notQuite' : null;
    },
    skip: (d) => {
      const w = tourWalls(d);
      if (!w) return;
      const p = d.panels[w.front];
      addDetail(d, w.front, 'circle', 'cut', p.w / 2, p.h / 2, 20, 20);
    },
  },
  { id: 'finish', anchor: dom('open-export'), title: 'tour.finish.title', body: 'tour.finish.body', next: true },
];

/** The anchor of a step for the current state. */
export function anchorOf(step: TourStep, s: EditorState): Anchor {
  return typeof step.anchor === 'function' ? step.anchor(s) : step.anchor;
}
