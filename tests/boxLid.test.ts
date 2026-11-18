// A box's lid, one way (LIDS_LINES_PROJECTS_PLAN.md §4, §10.4; milestone 73):
// `boxLid` reads what a box has, however it was made; `setBoxLid` changes it
// in one edit and leaves nothing of the old lid; Quick build's Box *With a
// lid* and Wall / lid across a box's top make the same lid as the Lid section.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addArchedLid, addDetail, addLid, addRootPanel, addText, addTray, autoConnect, createDesign, growPanel, setTrayEnds } from '../src/model/ops';
import { boxLid, boxOfPanel, lidParts, lidWhy, setBoxLid, wallClosesBox, wallLidChoice, type LidChoice } from '../src/easy/lid';
import { boxRecipe, boxTray, quickWallHeight, quickWallRecipe } from '../src/easy/recipes';
import { boxKindFor } from '../src/easy/actions';
import { effectiveGrow } from '../src/views/ghost';
import { validate } from '../src/model/validate';
import { panelLabel } from '../src/model/names';
import { translate } from '../src/i18n';
import { MISSIONS, missionState } from '../src/easy/missions';
import type { Design } from '../src/model/types';
import { idempotence, roundTrip } from './harness';

const [CARD, CORR16, , PLY] = MATERIALS;
const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('en', k, v);

function box(m: (typeof MATERIALS)[number], w = 120, dp = 80, h = 60) {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, w, dp);
  const tray = addTray(d, base, h)!;
  autoConnect(d);
  return { d, base, tray };
}
const wallOn = (d: Design, base: string, e: string) => Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === e)!.b.panelId;
/** The design as text, for checking that a probe changed nothing. */
const plain = (d: Design) => JSON.stringify({ ...d, updatedAt: '' });
/** What a design is made of, ids aside: its boards' sizes, its joints' kinds, its trays' settings. */
const made = (d: Design) => ({
  boards: d.order.map((id) => `${d.panels[id].w.toFixed(3)}×${d.panels[id].h.toFixed(3)}`).sort(),
  joints: Object.values(d.connections).map((c) => `${c.kind}${c.grown ? '/grown' : ''}`).sort(),
  trays: Object.values(d.trays).map((x) => JSON.stringify({ ...x, id: '', baseId: '', lidOf: x.lidOf ? 'box' : undefined, fixes: undefined, fixPlan: undefined })).sort(),
});

describe('boxLid reads every kind of lid', () => {
  it('none, a cap, a tuck top, an arched lid, a carton’s flaps', () => {
    const a = box(CARD);
    expect(boxLid(a.d, a.tray).kind).toBe('none');
    const cap = addLid(a.d, a.tray)!;
    expect(boxLid(a.d, a.tray)).toMatchObject({ kind: 'liftoff', style: 'cap', tray: cap });
    const b = box(CARD);
    setTrayEnds(b.d, b.tray, { top: 'tuck' });
    expect(boxLid(b.d, b.tray)).toMatchObject({ kind: 'hinged', living: false });
    const c = box(CARD);
    addArchedLid(c.d, c.tray);
    expect(boxLid(c.d, c.tray).kind).toBe('arched');
    const e = box(CARD);
    setTrayEnds(e.d, e.tray, { base: 'open', top: 'seal' });
    expect(boxLid(e.d, e.tray).kind).toBe('flaps');
  });

  it('a board grown across a plywood box’s top with finger joints is Fixed; with a living hinge it is Hinged; a short flap is no lid', () => {
    const { d, base, tray } = box(PLY);
    const back = wallOn(d, base, 'e2');
    const h = quickWallHeight(d, back, 'e2', 40);
    const g = growPanel(d, back, 'e2', { height: h, angle: 90, dir: 'up', kind: 'finger' })!;
    autoConnect(d);
    expect(boxLid(d, tray)).toEqual({ kind: 'fixed', lid: g.panelId });
    expect(panelLabel(d, g.panelId, t)).toBe('Lid');
    const s = box(PLY);
    const sb = wallOn(s.d, s.base, 'e2');
    growPanel(s.d, sb, 'e2', { height: 20, angle: 90, dir: 'up', kind: 'finger' });
    expect(boxLid(s.d, s.tray).kind).toBe('none');
    const l = box(PLY);
    setTrayEnds(l.d, l.tray, { top: 'tuck' });
    expect(boxLid(l.d, l.tray)).toMatchObject({ kind: 'hinged', living: true });
  });

  it('the boards of a lid lead back to their box; the lid is named Lid and its rim Lid rim', () => {
    const { d, base, tray } = box(CORR16);
    setBoxLid(d, tray, 'liftoff');
    const lid = boxLid(d, tray);
    const parts = lidParts(d, lid);
    expect(parts).toHaveLength(5);
    for (const p of parts) expect(boxOfPanel(d, p)).toBe(tray);
    expect(boxOfPanel(d, base)).toBe(tray);
    const names = parts.map((p) => panelLabel(d, p, t)).sort();
    expect(names).toEqual(['Back lid rim', 'Front lid rim', 'Left lid rim', 'Lid', 'Right lid rim']);
    setBoxLid(d, tray, 'hinged');
    const h = boxLid(d, tray);
    expect(h.kind === 'hinged' && panelLabel(d, h.lid, t)).toBe('Lid');
  });
});

describe('setBoxLid', () => {
  const choices: LidChoice[] = ['none', 'liftoff', 'hinged', 'arched'];
  for (const m of [CARD, CORR16, PLY])
    it(`${m.id}: from each lid to each other, one edit, nothing of the old lid left, stable and reopens`, () => {
      for (const from of choices)
        for (const to of choices) {
          const { d, tray } = box(m);
          const clean = box(m);
          expect(setBoxLid(d, tray, from).ok).toBe(true);
          const old = lidParts(d, boxLid(d, tray));
          const r = setBoxLid(d, tray, to);
          expect(r.ok, `${from} → ${to}`).toBe(true);
          expect(boxLid(d, tray).kind).toBe(to);
          if (from !== to) for (const p of old) expect(d.panels[p], `${from} → ${to}: ${p}`).toBeUndefined();
          // the same as making that lid on a fresh box (ids aside: compared by counts)
          setBoxLid(clean.d, clean.tray, to);
          expect(d.order.length, `${from} → ${to}`).toBe(clean.d.order.length);
          expect(Object.keys(d.connections).length, `${from} → ${to}`).toBe(Object.keys(clean.d.connections).length);
          expect(Object.keys(d.trays).length).toBe(Object.keys(clean.d.trays).length);
          expect(validate(d).map((i) => i.key).sort(), `${from} → ${to}`).toEqual(validate(clean.d).map((i) => i.key).sort());
          expect(idempotence(d), `${from} → ${to}`).toBeNull();
          expect(roundTrip(d), `${from} → ${to}`).toBeNull();
        }
    });

  it('shapes on the old lid’s top go to the new one where they were; what does not fit is counted', () => {
    const { d, tray } = box(CARD);
    setBoxLid(d, tray, 'liftoff');
    const cap = boxLid(d, tray);
    if (cap.kind !== 'liftoff') throw new Error();
    const P = d.panels[cap.top];
    addText(d, cap.top, P.w / 2, P.h / 2, 'Hi');
    // a shape as wide as the cap: wider than a lid that fits inside the box's outline
    addDetail(d, cap.top, 'rect', 'engrave', P.w / 2, 10, P.w - 0.2, 4);
    const r = setBoxLid(d, tray, 'hinged');
    expect(r.dropped).toBe(1);
    const h = boxLid(d, tray);
    if (h.kind !== 'hinged') throw new Error();
    const L = d.panels[h.lid];
    expect(L.details).toHaveLength(1);
    expect(L.details[0].text?.value).toBe('Hi');
    expect(L.details[0].cx).toBeCloseTo(L.w / 2, 0);
    // and back: still there
    setBoxLid(d, tray, 'liftoff');
    const c2 = boxLid(d, tray);
    expect(c2.kind === 'liftoff' && d.panels[c2.top].details.map((x) => x.text?.value)).toEqual(['Hi']);
  });

  it('says why a lid cannot be made: a carton takes its tuck top; plywood too small for a living hinge; no arch on a low box', () => {
    const c = box(CARD);
    setTrayEnds(c.d, c.tray, { base: 'open', bottom: 'snap', top: 'tuck' });
    expect(lidWhy(c.d, c.tray, 'liftoff')).toBe('lid.why.carton');
    expect(lidWhy(c.d, c.tray, 'arched')).toBe('lid.why.carton');
    expect(lidWhy(c.d, c.tray, 'hinged')).toBeNull();
    expect(lidWhy(c.d, c.tray, 'none')).toBeNull();
    const small = box(PLY, 60, 40, 30);
    expect(lidWhy(small.d, small.tray, 'hinged')).toBe('lid.why.hingeSmall');
    expect(lidWhy(small.d, small.tray, 'arched')).toBe('lid.why.arch');
    expect(lidWhy(small.d, small.tray, 'liftoff')).toBeNull();
    const big = box(PLY);
    expect(lidWhy(big.d, big.tray, 'hinged')).toBeNull();
    // the probe changes nothing
    const before = plain(big.d);
    lidWhy(big.d, big.tray, 'arched');
    expect(plain(big.d)).toBe(before);
  });
});

describe('one way to make each lid (rule 4)', () => {
  for (const m of [CARD, CORR16, PLY])
    it(`${m.id}: Wall / lid across a box's top makes the box's lid, the same as the Lid section; never a board jointed shut`, () => {
      const a = box(m);
      const back = wallOn(a.d, a.base, 'e2');
      const h = quickWallHeight(a.d, back, 'e2', 40);
      const g = effectiveGrow(a.d, back, 'e2', { height: h, angle: 90, adapt: true, span: null, sketch: null });
      const closes = wallClosesBox(a.d, back, 'e2', g.ghost);
      expect(closes).toEqual({ tray: a.tray, choice: m.kind === 'plywood' ? 'liftoff' : 'hinged' });
      quickWallRecipe(a.d, back, 'e2', h);
      const b = box(m);
      setBoxLid(b.d, b.tray, wallLidChoice(b.d, b.tray));
      expect(boxLid(a.d, a.tray).kind).toBe(boxLid(b.d, b.tray).kind);
      expect(made(a.d)).toEqual(made(b.d));
      expect(Object.values(a.d.connections).some((c) => c.grown && c.a.panelId === back && c.kind !== 'fold')).toBe(false);
      // a wall that does not close the box is still a wall
      const s = box(m);
      const sb = wallOn(s.d, s.base, 'e2');
      quickWallRecipe(s.d, sb, 'e2', 15);
      expect(boxLid(s.d, s.tray).kind).toBe('none');
    });

  it('Box With a lid is the box and its cap in one edit; a carton is refused on plywood and other footprints', () => {
    const a = createDesign(PLY);
    const r = boxRecipe(a, { kind: 'rect', x0: 0, z0: 0, x1: 120, z1: 80 }, 50, 'lid')!;
    const tray = Object.values(a.trays).find((x) => x.baseId === r.baseId)!;
    expect(boxLid(a, tray.id).kind).toBe('liftoff');
    expect(validate(a).filter((i) => i.key === 'val.overlap' || i.key === 'val.collide')).toEqual([]);
    expect(boxKindFor('carton', 'plywood', 'rect')).toBe('open');
    expect(boxKindFor('carton', 'card', 'regular')).toBe('open');
    expect(boxKindFor('carton', 'card', 'rect')).toBe('carton');
    expect(boxKindFor(undefined, 'card', 'rect')).toBe('open');
    const c = createDesign(CARD);
    const base = addRootPanel(c, 0, 0, 100, 60);
    const ct = boxTray(c, base, 50, 'carton')!;
    expect(c.trays[ct]).toMatchObject({ base: 'open', bottom: 'snap', top: 'tuck' });
    expect(boxLid(c, ct).kind).toBe('hinged');
  });

  it('the mission goal *A lid* counts a lid however it was made', () => {
    const ms = MISSIONS.find((x) => x.goals.some((g) => g.id === 'lid'))!;
    for (const choice of ['liftoff', 'hinged'] as const) {
      const { d, tray } = box(CARD);
      d.mission = { id: ms.id, version: ms.version };
      expect(missionState(d)!.goals.find((g) => g.goal.id === 'lid')!.ok).toBe(false);
      setBoxLid(d, tray, choice);
      expect(missionState(d)!.goals.find((g) => g.goal.id === 'lid')!.ok).toBe(true);
    }
  });
});

describe('found by the fuzzer', () => {
  it('a board grown off a carton’s tuck lid goes with the lid; a carton takes no other lid', () => {
    const d = createDesign(CORR16);
    const base = addRootPanel(d, 0, 0, 120, 80);
    const tray = boxTray(d, base, 60, 'carton')!;
    const lid = boxLid(d, tray);
    if (lid.kind !== 'hinged') throw new Error();
    const g = growPanel(d, lid.lid, 'e3', { height: 20, angle: 90, dir: 'up', kind: 'fold' })!;
    expect(setBoxLid(d, tray, 'arched').ok).toBe(false);
    expect(boxLid(d, tray).kind).toBe('hinged');
    expect(setBoxLid(d, tray, 'none').ok).toBe(true);
    expect(d.panels[lid.lid]).toBeUndefined();
    expect(d.panels[g.panelId]).toBeUndefined();
  });
});
