import { describe, expect, it } from 'vitest';
import { addRootPanel, addSideWalls, createDesign, growPanel, leanSupported } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { checkHinge, fromHinge, hingeOf, snapHinge } from '../src/model/hinge';
import { growFrame, toWorld } from '../src/model/frame';

const PLY = MATERIALS[3];
const CARD = MATERIALS[0];

function base(material = PLY) {
  const d = createDesign(material);
  const id = addRootPanel(d, 0, 0, 100, 80);
  return { d, id };
}

describe('hinge angle (0–360°)', () => {
  it('maps to and from the stored fold angle and face', () => {
    expect(fromHinge(90)).toEqual({ angle: 90, dir: 'up' });
    expect(fromHinge(60)).toEqual({ angle: 60, dir: 'up' });
    expect(fromHinge(270)).toEqual({ angle: 90, dir: 'down' });
    expect(fromHinge(300)).toEqual({ angle: 60, dir: 'down' });
    for (const h of [15, 45, 90, 135, 200, 270, 345]) {
      const { angle, dir } = fromHinge(h);
      expect(hingeOf(angle, dir)).toBeCloseTo(h, 9);
    }
  });

  it('is one continuous rotation about the edge', () => {
    const { d, id } = base();
    const p = d.panels[id];
    // the far edge of a 50 mm panel traces a circle around the hinge as the angle runs 0..360
    const tip = (h: number) => {
      const { angle, dir } = fromHinge(h);
      return toWorld(growFrame(p, 0, angle, dir, 3, 'overlap'), 50, 50);
    };
    for (let h = 5; h < 360; h += 5) {
      const a = tip(h), b = tip(h + 5);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(6);
    }
  });

  it('snaps to 5° steps and pulls onto 45° multiples', () => {
    expect(snapHinge(62)).toBe(60);
    expect(snapHinge(88)).toBe(90);
    expect(snapHinge(47.5)).toBe(45);
    expect(snapHinge(-2)).toBe(0);
    expect(snapHinge(62, true)).toBe(62);
  });
});

describe('what can be built at each angle', () => {
  it('plywood on the floor: only impossible angles block; the rest are notes', () => {
    const { d, id } = base();
    expect(checkHinge(d, id, 0, 90, 50)).toMatchObject({ zone: 'ok', blocking: false });
    expect(checkHinge(d, id, 0, 60, 50)).toMatchObject({ zone: 'support', reason: 'needsWalls', blocking: false, sideWalls: true, kinds: ['lean', 'butt'] });
    expect(checkHinge(d, id, 0, 120, 50)).toMatchObject({ zone: 'support', reason: 'outward', blocking: false, kinds: ['butt'] });
    expect(checkHinge(d, id, 0, 180, 50)).toMatchObject({ zone: 'support', reason: 'flat', blocking: false });
    expect(checkHinge(d, id, 0, 270, 50)).toMatchObject({ zone: 'bad', reason: 'floor', blocking: true });
    expect(checkHinge(d, id, 0, 5, 50)).toMatchObject({ zone: 'bad', reason: 'onPanel', blocking: true });
  });

  it('most of the circle above the floor is buildable without errors', () => {
    const { d, id } = base();
    let bad = 0;
    for (let a = 0; a < 180; a += 5) if (checkHinge(d, id, 0, a, 50).zone === 'bad') bad++;
    expect(bad).toBeLessThanOrEqual(2);
  });

  it('side walls turn a needs-support lean into a buildable one', () => {
    const { d, id } = base();
    addSideWalls(d, id, 0, 60, 50);
    expect(checkHinge(d, id, 0, 60, 50)).toMatchObject({ zone: 'ok', kinds: ['lean', 'butt'] });
    const r = growPanel(d, id, 0, { height: 50, ...fromHinge(60), kind: 'lean' })!;
    expect(leanSupported(d, r.panelId)).toBe(true);
  });

  it('angles are relative to the parent: from a wall top, 270° is a shelf on its other face', () => {
    const { d, id } = base();
    const wall = growPanel(d, id, 0, { height: 80, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    expect(checkHinge(d, wall, 2, 270, 30)).toMatchObject({ zone: 'ok' });
    // folded far down the wall's other face, a long panel reaches the floor
    expect(checkHinge(d, wall, 2, 330, 200)).toMatchObject({ zone: 'bad', reason: 'floor' });
  });

  it('card folds at any angle without warnings', () => {
    const { d, id } = base(CARD);
    const c = checkHinge(d, id, 0, 60, 40);
    expect(c).toMatchObject({ zone: 'ok', blocking: false });
    expect(c.kinds).toContain('fold');
    expect(checkHinge(d, id, 0, 120, 40)).toMatchObject({ zone: 'ok' });
  });
});
