// QA repros: Guided (REPORT.md §11, B6 and B8). Placement is fixed by milestone 139 (QA_FIX_PLAN.md Q5), the
// rest by milestone 142 (Q8).
import { describe, expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { addName, addSticker, addWindow } from '../../src/guided/decorate';
import { startSolid } from '../../src/guided/things';
import { solidPoly } from '../../src/model/solids';
import { reassemble } from '../../src/model/reassemble';
import type { Design } from '../../src/model/types';
import { settle } from './promises';

const [CARD, , , PLY] = MATERIALS;

/** Pairs of a side's shapes whose boxes overlap. */
function overlaps(d: Design, panelId: string): string[] {
  const xs = d.panels[panelId].details;
  const out: string[] = [];
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) {
      const a = xs[i], b = xs[j];
      if (Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h) out.push(`${a.shape}/${b.shape}`);
    }
  return out;
}

describe('B6: decorations are placed where nothing else is', () => {
  it('a name, then a sticker, then a window on one side do not overlap', () => {
    const d = ops.createDesign(PLY);
    const base = ops.addRootPanel(d, 0, 0, 150, 80);
    ops.addTray(d, base, 45);
    settle(d);
    const side = Object.values(d.connections).find((c) => c.grown && c.a.panelId === base)!.b.panelId;
    for (const made of [addName(d, side, 'Your name'), addSticker(d, side, 'star'), addWindow(d, side, 'circle')]) expect('id' in made).toBe(true);
    // today: all three in the middle of the side, on top of each other
    expect(overlaps(d, side)).toEqual([]);
  });
});

describe('B8: a change of Sides keeps the decorations, or says what went', () => {
  it('a name on the last face of a pyramid is still there after Sides 4 → 3', () => {
    const d = startSolid('pyramid', CARD);
    const last = d.order[d.order.length - 1];
    expect('id' in addName(d, last, 'Hi')).toBe(true);
    const has = () => Object.values(d.panels).some((p) => p.details.some((x) => JSON.stringify(x).includes('"Hi"')));
    expect(has()).toBe(true);
    const solid = { ...d.make!.solid!, n: 3 };
    reassemble(d, solidPoly(solid), { ...d.make!, as: 'fold', solid });
    // today: the name is dropped with no note (there is no outcome to report it in yet: QA_FIX_PLAN.md S1)
    expect(has()).toBe(true);
  });
});
