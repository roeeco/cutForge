// Milestone 61 (PACKAGING_PLAN.md §4.6, §4.7, §11): the harness on main's features, the
// memoised derivations equal the plain ones, and the store solves outside Immer.
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addDetail, addDivider, addFoldOver, addPolygonPanel, addRootPanel, addTray, autoConnect, createDesign, regularPolygon, setPanelSize, setTrayHeight, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { panelExtras, panelNotches } from '../src/model/geometry';
import { allFoldOvers } from '../src/model/foldover';
import { buildPieces } from '../src/model/pieces';
import { settle, reconcile } from '../src/model/derived';
import { generate, templateById, defaults } from '../src/templates/registry';
import { useStore } from '../src/store/store';
import type { Design } from '../src/model/types';
import { copy, frozen, idempotence, lostShapes, roundTrip, speedRatio, sweepBack, canon } from './harness';

const [CARD, CORR16, , PLY] = MATERIALS;

function box(m: typeof CARD, sides = 4) {
  const d = createDesign(m);
  const base = sides === 4 ? addRootPanel(d, 0, 0, 160, 110) : addPolygonPanel(d, 0, 0, regularPolygon(sides, 70))!;
  const tray = addTray(d, base, 50)!;
  autoConnect(d);
  return { d, base, tray };
}

describe('the harness on main', () => {
  for (const m of [CARD, CORR16, PLY])
    it(`${m.id}: a tray with dividers, a fold-over and a hole solves to itself, saves and reopens to itself`, () => {
      const { d, base } = box(m);
      addDivider(d, base, 0, 50, 40);
      addDivider(d, base, 0, 100, 40);
      const wall = d.order.find((id) => id !== base && !d.panels[id].place && d.panels[id].w > 150)!;
      if (m.kind !== 'plywood') addFoldOver(d, wall);
      addDetail(d, wall, 'circle', 'cut', 80, 25, 12, 12);
      solve(d);
      autoConnect(d);
      expect(idempotence(d)).toBeNull();
      expect(roundTrip(d)).toBeNull();
    });

  it('a tray height swept up and back returns to the same design, ids included', () => {
    for (const m of [CARD, CORR16, PLY]) {
      const { d, tray } = box(m, 6);
      expect(sweepBack(d, (x, v) => setTrayHeight(x, tray, v), 50, [80, 140, 20, 300, 35])).toBeNull();
    }
  });

  it('a base resized and back returns to the same design', () => {
    const { d, base } = box(CARD);
    expect(sweepBack(d, (x, v) => setPanelSize(x, base, v, undefined), 160, [200, 90, 400, 60])).toBeNull();
  });

  it('resizing never removes a panel that has shapes on it', () => {
    const { d, base } = box(CORR16);
    for (const id of d.order) if (id !== base) addDetail(d, id, 'circle', 'engrave', 20, 20, 6, 6);
    expect(lostShapes(d, (x) => [400, 60, 160].forEach((w) => setPanelSize(x, base, w, 200)))).toEqual([]);
  });
});

describe('derivations on a frozen design equal the plain ones', () => {
  const cases: [string, () => Design][] = [
    ['card tray with fold-over', () => {
      const { d } = box(CARD);
      const wall = d.order[1];
      addFoldOver(d, wall);
      solve(d);
      return d;
    }],
    ['plywood hexagon tray', () => box(PLY, 6).d],
    ['organiser template', () => generate(templateById('organiser')!, CORR16, defaults(templateById('organiser')!))],
  ];
  for (const [name, make] of cases)
    it(name, () => {
      const d = make();
      const f = frozen(d);
      for (const id of d.order) {
        expect(panelNotches(f, f.panels[id])).toEqual(panelNotches(d, d.panels[id]));
        expect(panelExtras(f, f.panels[id])).toEqual(panelExtras(d, d.panels[id]));
      }
      expect(allFoldOvers(f)).toEqual(allFoldOvers(d));
      // the cached index is used: asking again gives the same arrays' contents, and pieces are unchanged
      expect(canon(buildPieces(f) as never)).toBe(canon(buildPieces(d) as never));
    });
});

describe('the store solves outside Immer', () => {
  it('settle equals solving in a draft, and keeps what did not change', () => {
    const { d, base } = box(CARD);
    const before = frozen(d);
    const edit = (x: Design) => setPanelSize(x, base, 200, undefined);
    const viaDraft = produce(before, (x) => {
      edit(x as Design);
      solve(x as Design);
      autoConnect(x as Design);
    });
    const edited = produce(before, (x) => void edit(x as Design));
    const viaPlain = settle(edited, (x) => {
      solve(x);
      autoConnect(x);
    });
    expect(canon(viaPlain)).toBe(canon(viaDraft));
    expect(Object.isFrozen(viaPlain)).toBe(true);
    // an unchanged design keeps its identity, and so do unchanged parts
    const again = settle(viaPlain, (x) => solve(x));
    expect(again).toBe(viaPlain);
    expect(viaPlain.material).toBe(before.material);
  });

  it('reconcile keeps equal parts and replaces changed ones', () => {
    const a = { x: { y: [1, 2] }, z: { w: 1 } };
    const b = reconcile(a, { x: { y: [1, 2] }, z: { w: 2 } });
    expect(b.x).toBe(a.x);
    expect(b.z).not.toBe(a.z);
    expect(reconcile(a, { x: { y: [1, 2] }, z: { w: 1 } })).toBe(a);
    expect(reconcile({ a: 1, b: 2 }, { a: 1 } as never)).toEqual({ a: 1 });
  });

  it('an edit through the store gives the same design as before (apply)', () => {
    useStore.getState().replaceDesign(createDesign(CORR16));
    useStore.getState().apply((x) => {
      const b = addRootPanel(x, 0, 0, 120, 80);
      addTray(x, b, 40);
    });
    const s = useStore.getState().design;
    expect(Object.isFrozen(s)).toBe(true);
    const plain = copy(s);
    solve(plain);
    autoConnect(plain);
    expect(canon(plain)).toBe(canon(s));
  });
});

describe('speed', () => {
  it('a frozen design asks for joint geometry once, not once per panel', () => {
    const t = templateById('organiser')!;
    const d = generate(t, CARD, { ...defaults(t), dividersX: 4, dividersY: 3 });
    const f = frozen(d);
    const plain = () => d.order.forEach((id) => panelExtras(d, d.panels[id]));
    const cached = () => d.order.forEach((id) => panelExtras(f, f.panels[id]));
    expect(speedRatio(cached, plain)).toBeLessThan(0.5);
  });
});
