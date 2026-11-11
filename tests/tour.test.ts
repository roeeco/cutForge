// The first-use tour (milestone 43): each step's check, its action done with ops, and Skip.
import { describe, expect, it, beforeEach } from 'vitest';
import { useStore, type EditorState } from '../src/store/store';
import { addDetail, addPlacedPanel, addRootPanel, addTray, autoConnect, createDesign, setAllJoints, setMaterial, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { blocking } from '../src/easy/fix';
import { jointsOf } from '../src/model/jointDefaults';
import { dividerLine, quickWallHeight, wallRecipe } from '../src/easy/recipes';
import { TOUR_STEPS, backTopMid, baseCentre, boxFloor, frontCentre, hasDivider, hasWallCut, otherCornerKind, tourBase, tourTray, tourWalls, type TourStep } from '../src/tour/steps';
import type { Design } from '../src/model/types';

const mat = (id: string) => MATERIALS.find((m) => m.id === id)!;
const start = () => {
  const d = createDesign();
  setMaterial(d, mat('ply-3'));
  return d;
};
const copy = (d: Design): Design => JSON.parse(JSON.stringify(d));
/** An edit as the store makes it in the Workshop: the change, then solve and automatic joining. */
function edit(d: Design, fn: (d: Design) => unknown): Design {
  const x = copy(d);
  fn(x);
  solve(x);
  autoConnect(x);
  return x;
}
/** The editor state a step's check sees (the parts the steps read). */
const state = (d: Design, extra: Partial<EditorState> = {}): EditorState => ({ ...useStore.getState(), design: d, tool: 'select', pending: null, selection: null, panelPose: 'flat', drawerOpen: false, extrude: null, ...extra }) as EditorState;
const step = (id: string) => TOUR_STEPS.find((s) => s.id === id)!;
const done = (st: TourStep, d: Design, entry: Design, extra: Partial<EditorState> = {}) => !!st.done?.(state(d, extra), entry);
/** The design before a step: every earlier step skipped, in order. */
function before(id: string): Design {
  let d = start();
  for (const s of TOUR_STEPS) {
    if (s.id === id) return d;
    if (s.skip) d = edit(d, s.skip);
  }
  throw new Error(id);
}

beforeEach(() => {
  useStore.getState().setPrefs({ mode: 'workshop', modeLocked: false });
});

describe('the tour steps', () => {
  it('has 13 cards: a welcome, then 12 steps, each with English and Hebrew text', async () => {
    const { en } = await import('../src/i18n/en');
    const { he } = await import('../src/i18n/he');
    expect(TOUR_STEPS).toHaveLength(13);
    for (const s of TOUR_STEPS) for (const k of [s.title, s.body]) expect(en[k] && he[k]).toBeTruthy();
    // every step either waits for something to be done or is explain-only
    for (const s of TOUR_STEPS.slice(1)) expect(!!s.done !== !!s.next).toBe(true);
  });

  it('1 the Board tool: done when it is chosen', () => {
    const d = before('tool');
    expect(done(step('tool'), d, d)).toBe(false);
    expect(done(step('tool'), d, d, { tool: 'panel' })).toBe(true);
  });

  it('2 a base: a floor board of about 120 × 80; a small one does not count', () => {
    const d = before('base');
    const s = step('base');
    expect(done(s, d, d)).toBe(false);
    const small = edit(d, (x) => addRootPanel(x, 0, 0, 40, 30));
    expect(done(s, small, d)).toBe(false);
    const a = edit(d, (x) => addRootPanel(x, -50, 45, 110, 90));
    expect(done(s, a, d)).toBe(true);
    const k = edit(d, s.skip!);
    expect(done(s, k, d)).toBe(true);
    expect(baseCentre(k)).toEqual([0, 3, 0]);
  });

  it('4 walls: Extrude on the base', () => {
    const d = before('walls');
    const s = step('walls');
    expect(done(s, d, d)).toBe(false);
    const a = edit(d, (x) => addTray(x, tourBase(x)!, 40));
    expect(done(s, a, d)).toBe(true);
    const k = edit(d, s.skip!);
    expect(done(s, k, d)).toBe(true);
    // the walls by where they stand
    const w = tourWalls(k)!;
    expect(new Set([w.back, w.front, w.left, w.right]).size).toBe(4);
    expect(frontCentre(k)![2]).toBeGreaterThan(backTopMid(k)![2]);
    expect(backTopMid(k)![1]).toBeCloseTo(40, 0);
  });

  it('5 a lid on its own: grown from the back wall’s top edge; a side edge is not quite', () => {
    const d = before('lid');
    const s = step('lid');
    const w = tourWalls(d)!;
    expect(done(s, d, d)).toBe(false);
    const a = edit(d, (x) => wallRecipe(x, w.back, 'e2', quickWallHeight(x, w.back, 'e2', 80)));
    expect(done(s, a, d)).toBe(true);
    // the lid lies over the box at the walls' height and reaches the front wall
    const lid = a.order.at(-1)!;
    expect(a.panels[lid].h).toBeGreaterThan(70);
    // a board drawn on the back wall instead is not quite
    const board = edit(d, (x) => addPlacedPanel(x, { host: w.back, face: 1, x: 10, y: 10, rot: 0, pose: 'flat' }, 40, 20));
    expect(done(s, board, d)).toBe(false);
    expect(s.notQuite!(state(board), d)).toBe('tour.lid.notQuite');
    expect(s.notQuite!(state(a), d)).toBeNull();
    const k = edit(d, s.skip!);
    expect(done(s, k, d)).toBe(true);
  });

  it('6 card: done when the material is no longer plywood; 7 the joints changed with it', () => {
    const d = before('material');
    const s = step('material');
    expect(done(s, d, d)).toBe(false);
    const k = edit(d, s.skip!);
    expect(done(s, k, d)).toBe(true);
    expect(k.material.id).toBe('card-0.5');
    // card cannot take finger joints: the walls fold or glue now
    const kinds = new Set(Object.values(k.connections).map((c) => c.kind));
    expect(kinds.has('finger')).toBe(false);
  });

  it('8 corners: done when the design-wide corner choice changes; Skip picks another allowed kind', () => {
    const d = before('corners');
    const s = step('corners');
    expect(done(s, d, d)).toBe(false);
    const other = otherCornerKind(d)!;
    expect(other).toBeTruthy();
    const a = edit(d, (x) => setAllJoints(x, 'corner', other));
    expect(done(s, a, d)).toBe(true);
    const k = edit(d, s.skip!);
    expect(done(s, k, d)).toBe(true);
    expect(jointsOf(k)?.corner).toBe(other);
  });

  it('9 back to plywood: the plywood joints come back', () => {
    const d = before('plywood');
    const s = step('plywood');
    expect(done(s, d, d)).toBe(false);
    const k = edit(d, s.skip!);
    expect(done(s, k, d)).toBe(true);
    expect(Object.values(k.connections).some((c) => c.kind === 'finger')).toBe(true);
  });

  it('10 a divider: a wall-to-wall line on the base; a line that stops short is not quite', () => {
    const d = before('divider');
    const s = step('divider');
    expect(done(s, d, d)).toBe(false);
    // the lid is left off the stage while drawing inside
    const lid = Object.values(d.connections).find((c) => c.grown && c.a.panelId === tourWalls(d)!.back && c.a.edge.startsWith('e2'))!.b.panelId;
    expect(s.hide!(d)).toEqual([lid]);
    const base = tourBase(d)!, p = d.panels[base];
    // across the base from the left wall to the right one (a line drawn with the Board tool, perpendicular on)
    const a = edit(d, (x) => expect(dividerLine(x, base, { x: 5, y: p.h / 2 }, { x: p.w - 5, y: p.h / 2 })?.kind).toBe('divider'));
    expect(done(s, a, d)).toBe(true);
    const short = edit(d, (x) => expect(dividerLine(x, base, { x: 20, y: p.h / 2 }, { x: 60, y: p.h / 2 })?.kind).toBe('standing'));
    expect(done(s, short, d)).toBe(false);
    expect(s.notQuite!(state(short), d)).toBe('tour.divider.notQuite');
    const k = edit(d, s.skip!);
    expect(done(s, k, d)).toBe(true);
    expect(boxFloor(k)).toEqual(baseCentre(k));
  });

  it('11 a cutter: a confirmed cut-out on a wall; one waiting for ✓ or engraved does not count', () => {
    const d = before('cutter');
    const s = step('cutter');
    expect(done(s, d, d)).toBe(false);
    const w = tourWalls(d)!;
    let id = '';
    const a = edit(d, (x) => (id = addDetail(x, w.front, 'circle', 'cut', 30, 20, 16, 16)!));
    expect(done(s, a, d, { pending: { kind: 'shape', ids: [id], panelId: w.front, base: d, pastLen: 0 } })).toBe(false);
    expect(done(s, a, d)).toBe(true);
    const e = edit(d, (x) => addDetail(x, w.front, 'circle', 'engrave', 30, 20, 16, 16));
    expect(done(s, e, d)).toBe(false);
    expect(s.notQuite!(state(e), d)).toBe('tour.cutter.notQuite');
    const k = edit(d, s.skip!);
    expect(done(s, k, d)).toBe(true);
  });

  it('skipping every step from 1 to 12 ends with a box with a lid, a divider and a window that can be cut', () => {
    let d = start();
    for (const s of TOUR_STEPS) {
      const entry = copy(d);
      if (s.skip) d = edit(d, s.skip);
      if (s.done && s.id !== 'tool') expect(done(s, d, entry), s.id).toBe(true);
    }
    expect(tourTray(d)).toBeTruthy();
    const w = tourWalls(d)!;
    expect(Object.values(d.connections).some((c) => c.grown && c.a.panelId === w.back && c.a.edge.startsWith('e2'))).toBe(true);
    expect(hasDivider(d)).toBe(true);
    expect(hasWallCut({ design: d, pending: null })).toBe(true);
    expect(d.material.kind).toBe('plywood');
    expect(validate(d).filter(blocking)).toEqual([]);
  });
});
