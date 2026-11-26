// Milestone 125 (Shapes R6): joints chosen for the material and its thickness.
import { describe, expect, it } from 'vitest';
import { chooseJoint, closingFace, fingersFor, flapDepthFor, LOCK_MIN, tabsFor, type SeamCtx } from '../src/model/jointChoice';
import { MATERIALS } from '../src/model/materials';
import { profileById } from '../src/model/boards';
import { createDesign } from '../src/model/ops';
import { reassemble, rechooseJoints } from '../src/model/reassemble';
import { boxSolid, pyramidSolid } from './solids';
import type { MaterialProfile } from '../src/model/types';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;
const ctx = (mat: MaterialProfile, over: Partial<SeamCtx> = {}): SeamCtx => ({ mat, role: 'seam', len: 60, dihedral: 90, spanA: 60, spanB: 60, ...over });

describe('card 0.3–0.6 mm', () => {
  it('folds are folded', () => expect(chooseJoint(ctx(CARD, { role: 'fold' })).kind).toBe('fold'));
  it('a cut seam gets a glue flap, 8–15 mm and at most a third of the smaller face', () => {
    const c = chooseJoint(ctx(CARD));
    expect(c.kind).toBe('glue');
    expect(c.params.flap).toBeGreaterThanOrEqual(8);
    expect(c.params.flap).toBeLessThanOrEqual(15);
    expect(chooseJoint(ctx(CARD, { spanB: 15 })).params.flap).toBeCloseTo(5, 9);
    expect(c.why).toBe('joint.why.cardGlue');
  });
  it(`a seam of the face that closes last gets a slit lock when it is at least ${LOCK_MIN} mm`, () => {
    expect(chooseJoint(ctx(CARD, { closesLast: true })).kind).toBe('lock');
    expect(chooseJoint(ctx(CARD, { closesLast: true })).why).toBe('joint.why.lockLast');
    expect(chooseJoint(ctx(CARD, { closesLast: true, len: 20 })).kind).toBe('glue');
  });
  it('greyboard over 1 mm does not fold: its seams are glued', () => {
    const g = profileById('grey-2')!;
    expect(chooseJoint(ctx(g, { role: 'fold' })).kind).toBe('butt');
    expect(chooseJoint(ctx(g)).kind).toBe('glue');
  });
});

describe('corrugated', () => {
  it('1.6 mm: folds crease; seams are glue flaps 12–20 mm (26 November), the one that closes the form last tabs max(8, 5t) wide', () => {
    expect(chooseJoint(ctx(CORR16, { role: 'fold' })).kind).toBe('fold');
    const s = chooseJoint(ctx(CORR16));
    expect(s.kind).toBe('glue');
    expect(s.why).toBe('joint.why.corrGlue');
    const t = chooseJoint(ctx(CORR16, { closesLast: true }));
    expect(t.kind).toBe('tabslot');
    expect(t.params.tabs).toBe(tabsFor(CORR16, 60));
    expect(tabsFor(CORR16, 60)).toBe(3);
    const g = chooseJoint(ctx(CORR16, { len: 25 }));
    expect(g.kind).toBe('glue');
    expect(g.params.flap).toBeGreaterThanOrEqual(8);
    expect(flapDepthFor(CORR16, 100, 100)).toBeGreaterThanOrEqual(12);
    expect(flapDepthFor(CORR16, 100, 100)).toBeLessThanOrEqual(20);
  });
  it('4 mm: tabs and slots; a fold under 30° is a cut-crease; flaps 18–25 mm', () => {
    expect(chooseJoint(ctx(CORR4, { len: 80 })).kind).toBe('tabslot');
    expect(chooseJoint(ctx(CORR4, { role: 'fold', dihedral: 20 })).params.crease).toBe('cutcrease');
    expect(chooseJoint(ctx(CORR4, { role: 'fold', dihedral: 90 })).params.crease).toBeUndefined();
    const f = flapDepthFor(CORR4, 200, 200);
    expect(f).toBeGreaterThanOrEqual(18);
    expect(f).toBeLessThanOrEqual(25);
  });
  it('board corners outside 30–150° are glued', () => {
    expect(chooseJoint(ctx(CORR16, { role: 'corner', dihedral: 160 })).kind).toBe('glue');
    expect(chooseJoint(ctx(CORR16, { role: 'corner', dihedral: 160 })).why).toBe('joint.why.outsideAngle');
  });
});

describe('plywood 3 mm', () => {
  it('fingers at 60–120°, an odd count about max(3t, 10 mm) wide', () => {
    const c = chooseJoint(ctx(PLY, { role: 'corner', len: 100 }));
    expect(c.kind).toBe('finger');
    expect(c.params.fingers! % 2).toBe(1);
    expect(c.params.fingers).toBe(fingersFor(PLY, 100));
  });
  it('tabs and slots at 30–60° and 120–150°', () => {
    expect(chooseJoint(ctx(PLY, { role: 'corner', dihedral: 45 })).kind).toBe('tabslot');
    expect(chooseJoint(ctx(PLY, { role: 'corner', dihedral: 135 })).kind).toBe('tabslot');
  });
  it('butt and glue when shorter than 4t or outside 30–150°', () => {
    expect(chooseJoint(ctx(PLY, { role: 'corner', len: 10 })).kind).toBe('butt');
    expect(chooseJoint(ctx(PLY, { role: 'corner', dihedral: 20 })).kind).toBe('butt');
    expect(chooseJoint(ctx(PLY, { role: 'corner', dihedral: 170 })).why).toBe('joint.why.outsideAngle');
  });
  it('the board that closes last gets tabs and slots, so it drops in from outside', () => {
    expect(chooseJoint(ctx(PLY, { role: 'corner', closesLast: true })).kind).toBe('tabslot');
  });
});

describe('the board that closes last', () => {
  it('is the largest face facing up', () => {
    expect(closingFace([{ key: 'side', n: [1, 0, 0], area: 900 }, { key: 'top', n: [0, 1, 0], area: 400 }, { key: 'bottom', n: [0, -1, 0], area: 400 }])).toBe('top');
    expect(closingFace([{ key: 'a', n: [0, 0.7, 0.7], area: 100 }, { key: 'b', n: [0, 0.8, 0.6], area: 400 }])).toBe('b');
  });
});

describe('a change of material', () => {
  it('re-chooses every joint the student did not pick, and keeps the one they did', () => {
    const P = pyramidSolid(4, 60, 70);
    const d = createDesign(CARD);
    reassemble(d, P, { as: 'fold' });
    const seams = Object.values(d.connections).filter((c) => c.kind !== 'fold');
    expect(seams.length).toBeGreaterThan(0);
    const mine = seams[0];
    mine.kind = mine.pref = 'butt';
    mine.picked = true;
    // to 4 mm board, whose seams take tabs (card and 1.6 mm board both glue them, 26 November)
    d.material = { ...CORR4 };
    const n = rechooseJoints(d, P);
    expect(n).toBeGreaterThan(0);
    expect(d.connections[mine.id].kind).toBe('butt');
    for (const c of Object.values(d.connections)) if (c.id !== mine.id && c.kind !== 'fold') expect(['tabslot', 'glue']).toContain(c.kind);
  });
  it('a box as boards: card to plywood changes nothing the student picked', () => {
    const P = boxSolid(80, 60, 70);
    const d = createDesign(PLY);
    reassemble(d, P, { as: 'boards' });
    const before = Object.fromEntries(Object.values(d.connections).map((c) => [c.id, c.kind]));
    d.material = { ...PLY, thickness: 6, id: 'ply-6' };
    rechooseJoints(d, P);
    for (const c of Object.values(d.connections)) expect(['finger', 'tabslot']).toContain(c.kind);
    expect(Object.keys(before).sort()).toEqual(Object.keys(d.connections).sort());
  });
});
