// Milestone 77 (UI_CLEANUP_PLAN.md Part 5): a grow that closes a box offers what it makes, in Workshop, in every material.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addRootPanel, addTray, autoConnect, createDesign } from '../src/model/ops';
import { boxLid, closeAsRecipe, closeChoice, closeChoices } from '../src/easy/lid';
import { quickWallHeight } from '../src/easy/recipes';
import { effectiveGrow, growWith } from '../src/views/ghost';
import { closureOf, reachFor } from '../src/model/closures';
import { validate } from '../src/model/validate';
import type { Design } from '../src/model/types';
import type { CloseAs, GrowOptions } from '../src/store/store';
import { idempotence } from './harness';

const [CARD, CORR16, , PLY] = MATERIALS;
function setup(m: (typeof MATERIALS)[number], kind?: 'finger' | 'fold' | 'tabslot') {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const tray = addTray(d, base, 60)!;
  autoConnect(d);
  const back = Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === 'e2')!.b.panelId;
  let grow: GrowOptions = { height: quickWallHeight(d, back, 'e2', 40), angle: 90, adapt: true, span: null, sketch: null, ...(kind ? { kind } : {}) };
  let g = effectiveGrow(d, back, 'e2', grow);
  // a joint that stands the board in (tab and slot) reaches the far wall sooner: the height the arrow snaps to
  const r = g.ghost && reachFor(d, g.ghost, back, 'ghost');
  if (r && g.ghost!.h > r.yOut) {
    grow = { ...grow, height: r.yOut };
    g = effectiveGrow(d, back, 'e2', grow);
  }
  return { d, tray, back, grow, ghost: g.ghost };
}
const make = (s: ReturnType<typeof setup>, o: CloseAs) => closeAsRecipe(s.d, s.tray, o, () => growWith(s.d, s.back, 'e2', s.grow, o.startsWith('style:') ? 'fold' : undefined)?.panelId ?? null);
const blocking = (d: Design) => validate(d).map((i) => i.key);

describe('a grow that closes a box', () => {
  it('plywood: hinged first, lifts off, fixed; whatever joint the ghost has', () => {
    for (const kind of [undefined, 'finger', 'tabslot'] as const) {
      const s = setup(PLY, kind);
      const c = closeChoices(s.d, s.back, 'e2', s.ghost)!;
      expect(c.options).toEqual(['hinged', 'liftoff', 'fixed']);
      expect(closeChoice(c, null)).toBe('hinged');
    }
  });

  it.each([CARD, CORR16])('$id: the closure styles, then lifts off', (m) => {
    const s = setup(m);
    const c = closeChoices(s.d, s.back, 'e2', s.ghost)!;
    expect(c.options[c.options.length - 1]).toBe('liftoff');
    expect(c.options.filter((o) => o.startsWith('style:')).length).toBeGreaterThan(2);
  });

  it.each([
    [PLY, 'hinged', 'hinged'],
    [PLY, 'liftoff', 'liftoff'],
    [PLY, 'fixed', 'fixed'],
    [CARD, 'style:tab', 'hinged'],
    [CARD, 'style:tuckLock', 'hinged'],
    [CARD, 'liftoff', 'liftoff'],
    [CORR16, 'style:tuck', 'hinged'],
  ] as const)('%#: %s made as %s gives that lid, in one edit', (m, o, kind) => {
    const s = setup(m);
    const id = make(s, o);
    expect(id).toBeTruthy();
    const lid = boxLid(s.d, s.tray);
    expect(lid.kind).toBe(kind);
    if (o.startsWith('style:') && lid.kind === 'hinged') expect(closureOf(s.d, lid.lid).style).toBe(o.slice(6));
    if (o !== 'fixed') expect(blocking(s.d)).toEqual([]);
    expect(idempotence(s.d)).toBeNull();
  });

  it('a ghost short of the far wall closes nothing', () => {
    const s = setup(CARD);
    const g = effectiveGrow(s.d, s.back, 'e2', { ...s.grow, height: 30 });
    expect(closeChoices(s.d, s.back, 'e2', g.ghost)).toBeNull();
  });
});

describe('heights that mean something (milestone 78)', () => {
  it('a lid reaches the far wall; a wall is as tall as the ones beside it', async () => {
    const { heightMarks } = await import('../src/easy/lid');
    const s = setup(CARD);
    const marks = heightMarks(s.d, s.back, s.ghost);
    expect(marks.some((m) => m.key === 'grow.mark.reach')).toBe(true);
    // a base with three walls: the fourth's ghost
    const d = createDesign(PLY);
    const b = addRootPanel(d, 0, 0, 120, 80);
    for (const e of ['e0', 'e1', 'e3']) growWith(d, b, e, { height: 45, angle: 90, adapt: true, span: null, sketch: null });
    const g = effectiveGrow(d, b, 'e2', { height: 30, angle: 90, adapt: true, span: null, sketch: null });
    const m2 = heightMarks(d, b, g.ghost);
    expect(m2.filter((m) => m.key === 'grow.mark.asTall').map((m) => m.y)).toEqual([45]);
  });
});
