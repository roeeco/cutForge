// Milestone 23: design-wide joint kinds.
import { describe, expect, it } from 'vitest';
import { addDivider, addRootPanel, addTray, autoConnect, createDesign, growPanel, setAllJoints, setConnection, setDefaultFlap, setMaterial, solve, baseJointOf } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { groupKinds, groupShown, jointGroup, dividerKind, inactiveChoice } from '../src/model/jointDefaults';
import { changeMaterial, generate, templateById } from '../src/templates/registry';
import { migrateDesign } from '../src/model/serialize';
import { growKind } from '../src/store/store';
import { panelExtras } from '../src/model/geometry';
import { validate } from '../src/model/validate';
import { parseProject, serializeProject } from '../src/model/serialize';
import { contourBBox } from '../src/geom/vec';
import { maxOverlap } from './solid';
import type { Design } from '../src/model/types';

const PLY = { ...MATERIALS[3], clearance: 0 };
const CARD = MATERIALS[0];

function box(material = PLY, W = 80, D = 60, H = 40) {
  const d = createDesign(material);
  const base = addRootPanel(d, 0, 0, W, D);
  const k = material.kind === 'plywood' ? 'finger' : 'fold';
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: H, angle: 90, dir: 'up', kind: k })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}
const conns = (d: Design) => Object.values(d.connections);
const grown = (d: Design) => conns(d).filter((c) => c.grown);
const corners = (d: Design) => conns(d).filter((c) => jointGroup(c) === 'corner');

describe('joint groups and the kinds they offer', () => {
  it('plywood box: wall to base offers fingers, tabs and slots, butt; corners the same', () => {
    const { d } = box();
    expect(grown(d).every((c) => jointGroup(c) === 'base')).toBe(true);
    expect(corners(d)).toHaveLength(4);
    expect(groupKinds(d, 'base')).toEqual(['finger', 'tabslot', 'butt']);
    expect(groupKinds(d, 'corner')).toEqual(['finger', 'tabslot', 'butt']);
    expect(groupShown(d, 'base')).toBe('finger');
  });

  it('an empty card design offers what a new joint could take', () => {
    const d = createDesign(CARD);
    expect(groupKinds(d, 'base')).toEqual(['fold', 'glue', 'tabslot', 'butt', 'slide']);
    expect(groupKinds(d, 'corner')).toEqual(['glue', 'tabslot', 'slide', 'butt']);
  });

  it('a card wall at 60° adds nothing a 90° wall lacks; the list is kinds allowed for at least one joint', () => {
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 60, 40);
    growPanel(d, b, 0, { height: 30, angle: 60, dir: 'up', kind: 'fold' });
    expect(groupKinds(d, 'base')).toEqual(['fold', 'glue']);
    growPanel(d, b, 2, { height: 30, angle: 90, dir: 'up', kind: 'fold' });
    expect(groupKinds(d, 'base')).toEqual(['fold', 'glue', 'tabslot', 'butt']);
  });
});

describe('setAllJoints', () => {
  it('plywood box, wall to base → tabs and slots: every wall changes, stands in, no overlap', () => {
    const { d } = box();
    const r = setAllJoints(d, 'base', 'tabslot');
    expect(r).toEqual({ changed: 4, kept: 0 });
    expect(grown(d).every((c) => c.kind === 'tabslot' && c.pref === 'tabslot' && c.offset >= 3)).toBe(true);
    expect(d.joints).toEqual({ plywood: { base: 'tabslot' } });
    autoConnect(d);
    expect(conns(d).some((c) => c.broken)).toBe(false);
    expect(validate(d)).toEqual([]);
    expect(maxOverlap(d, [-5, -5, -65], [85, 45, 5])).toBe(1);
  });

  it('changes joints set by hand too, and they stay hand-set', () => {
    const { d } = box();
    const c0 = corners(d)[0];
    setConnection(d, c0.id, { kind: 'butt' });
    expect(d.connections[c0.id].auto).toBe(false);
    const r = setAllJoints(d, 'corner', 'tabslot');
    expect(r).toEqual({ changed: 4, kept: 0 });
    expect(corners(d).every((c) => c.kind === 'tabslot')).toBe(true);
    expect(d.connections[c0.id].auto).toBe(false);
    expect(validate(d)).toEqual([]);
  });

  it('joints the kind cannot be keep theirs, and are counted', () => {
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 60, 40);
    const lean = growPanel(d, b, 0, { height: 30, angle: 60, dir: 'up', kind: 'fold' })!;
    growPanel(d, b, 2, { height: 30, angle: 90, dir: 'up', kind: 'fold' });
    const r = setAllJoints(d, 'base', 'tabslot');
    expect(r).toEqual({ changed: 1, kept: 1 });
    expect(d.connections[lean.connectionId].kind).toBe('fold');
  });

  it('a later angle change that allows the design kind picks it up', () => {
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 60, 40);
    const w = growPanel(d, b, 0, { height: 30, angle: 60, dir: 'up', kind: 'glue' })!;
    setAllJoints(d, 'base', 'butt');
    expect(d.connections[w.connectionId].kind).toBe('glue');
    // the wall keeps its own wish (glue) where it is allowed
    setConnection(d, w.connectionId, { angle: 90 });
    expect(d.connections[w.connectionId].kind).toBe('glue');
  });
});

describe('new joints take the design defaults', () => {
  it('corners and walls grown afterwards', () => {
    const d = createDesign(PLY);
    setAllJoints(d, 'corner', 'tabslot');
    setAllJoints(d, 'base', 'butt');
    const b = addRootPanel(d, 0, 0, 80, 60);
    const kind = growKind(d, { height: 40, angle: 90, kind: null } as never);
    expect(kind).toBe('butt');
    for (const e of [0, 1, 2, 3]) growPanel(d, b, e, { height: 40, angle: 90, dir: 'up', kind });
    autoConnect(d);
    expect(corners(d)).toHaveLength(4);
    expect(corners(d).every((c) => c.kind === 'tabslot')).toBe(true);
    expect(validate(d)).toEqual([]);
  });

  it('dividers take the base kind when an edge on a face may have it', () => {
    const { d, base } = box(PLY, 100, 60, 40);
    expect(dividerKind(d)).toBe('tabslot');
    setAllJoints(d, 'base', 'butt');
    expect(dividerKind(d)).toBe('butt');
    const div = addDivider(d, base, 0, 40, 35)!;
    expect(baseJointOf(d, div)!.kind).toBe('butt');
    // fingers cannot stand on a face: dividers keep tabs and slots
    setAllJoints(d, 'base', 'finger');
    expect(dividerKind(d)).toBe('tabslot');
    expect(baseJointOf(d, div)!.kind).toBe('butt');
  });

  it("a tray's own corner joint wins; a new tray starts from the design's", () => {
    const d = createDesign(PLY);
    setAllJoints(d, 'corner', 'tabslot');
    const b1 = addRootPanel(d, 0, 0, 60, 40);
    const t1 = addTray(d, b1, 30)!;
    expect(d.trays[t1].cornerKind).toBe('tabslot');
    const b2 = addRootPanel(d, 200, 0, 60, 40);
    const t2 = addTray(d, b2, 30, { cornerKind: 'finger' })!;
    autoConnect(d);
    const of = (t: string) => conns(d).filter((c) => c.trayId === t && !c.grown);
    expect(of(t1).every((c) => c.kind === 'tabslot')).toBe(true);
    expect(of(t2).every((c) => c.kind === 'finger')).toBe(true);
    // a design-wide change reaches trays too
    setAllJoints(d, 'corner', 'butt');
    expect(d.trays[t2].cornerKind).toBe('butt');
    expect(of(t2).every((c) => c.kind === 'butt')).toBe(true);
  });
});

describe('design glue flap width', () => {
  const flapH = (d: Design) =>
    conns(d)
      .filter((c) => c.kind === 'glue')
      .map((c) => {
        const a = c.geom!.adds[0];
        const bb = contourBBox({ closed: true, segs: a.poly.map((p, i) => ({ k: 'L' as const, a: p, b: a.poly[(i + 1) % a.poly.length] })) });
        return Math.min(bb.w, bb.h);
      });

  it('replaces the automatic width; a joint with its own keeps it; null goes back', () => {
    const { d } = box(CARD);
    expect(flapH(d).every((h) => Math.abs(h - 10) < 1e-6)).toBe(true);
    const c0 = conns(d).find((c) => c.kind === 'glue')!;
    setConnection(d, c0.id, { flap: 6 });
    setDefaultFlap(d, 14);
    const hs = flapH(d).sort((a, b) => a - b);
    expect(hs[0]).toBeCloseTo(6, 6);
    expect(hs.slice(1).every((h) => Math.abs(h - 14) < 1e-6)).toBe(true);
    expect(panelExtras(d, d.panels[c0.a.panelId]).adds.length).toBeGreaterThan(0);
    setDefaultFlap(d, null);
    expect(d.joints).toBeUndefined();
    expect(flapH(d).filter((h) => Math.abs(h - 10) < 1e-6)).toHaveLength(3);
  });
});

describe('saving', () => {
  it('the defaults survive save and load; a design without them saves none', () => {
    const { d } = box();
    expect(serializeProject(d)).not.toContain('"joints"');
    setAllJoints(d, 'corner', 'tabslot');
    setDefaultFlap(d, 12);
    const back = parseProject(serializeProject(d));
    expect(back.joints).toEqual({ plywood: { corner: 'tabslot', flap: 12 } });
    solve(back);
    expect(corners(back).every((c) => c.kind === 'tabslot')).toBe(true);
  });
});

describe('milestone 26: one set of choices per material kind', () => {
  const CORR = MATERIALS[1];
  it('plywood corners → tabs and slots; card keeps its own; switching back restores each', () => {
    const { d } = box();
    setAllJoints(d, 'corner', 'tabslot');
    expect(corners(d).every((c) => c.kind === 'tabslot')).toBe(true);
    // to card: the plywood choice is kept, card corners take card's default (tabs and slots are allowed on card too, but were not chosen there)
    setMaterial(d, CARD);
    expect(d.joints).toEqual({ plywood: { corner: 'tabslot' } });
    expect(groupShown(d, 'corner')).toBe(corners(d)[0].kind);
    // card corners → glue
    setAllJoints(d, 'corner', 'glue');
    expect(corners(d).every((c) => c.kind === 'glue')).toBe(true);
    expect(d.joints).toEqual({ plywood: { corner: 'tabslot' }, card: { corner: 'glue' } });
    // back to plywood: tabs and slots again
    setMaterial(d, PLY);
    expect(corners(d).every((c) => c.kind === 'tabslot')).toBe(true);
    expect(groupShown(d, 'corner')).toBe('tabslot');
    // back to card: glue again
    setMaterial(d, CARD);
    expect(corners(d).every((c) => c.kind === 'glue')).toBe(true);
    expect(inactiveChoice(d, 'corner')).toBeNull();
  });

  it('a choice another material keeps, not allowed here, is named for the card', () => {
    const { d } = box();
    setAllJoints(d, 'corner', 'finger');
    setMaterial(d, CARD);
    expect(inactiveChoice(d, 'corner')).toEqual({ kind: 'finger', used: groupShown(d, 'corner'), material: 'plywood' });
    // a choice of card's own clears it
    setAllJoints(d, 'corner', 'glue');
    expect(inactiveChoice(d, 'corner')).toBeNull();
  });

  it("the material's own choice that fits none of its joints is named too", () => {
    const d = createDesign(CARD);
    const b = addRootPanel(d, 0, 0, 60, 40);
    growPanel(d, b, 0, { height: 30, angle: 60, dir: 'up', kind: 'fold' });
    d.joints = { card: { base: 'tabslot' } };
    expect(groupKinds(d, 'base')).not.toContain('tabslot');
    expect(inactiveChoice(d, 'base')).toEqual({ kind: 'tabslot', used: 'fold', material: null });
  });

  it("an older flat set of choices loads into the file material's slot", () => {
    const { d } = box(CORR);
    const raw = JSON.parse(serializeProject(d)).design;
    raw.joints = { corner: 'tabslot', flap: 9 };
    const back = migrateDesign(raw);
    expect(back.joints).toEqual({ corrugated: { corner: 'tabslot', flap: 9 } });
    expect(corners(back).every((c) => c.kind === 'tabslot')).toBe(true);
  });

  it("a template keeps every material's choices through a material change", () => {
    const tpl = templateById('organiser')!;
    let d = generate(tpl, PLY, Object.fromEntries(tpl.params.map((p) => [p.key, p.default])));
    setAllJoints(d, 'corner', 'tabslot');
    d = changeMaterial(d, CORR).design;
    expect(d.joints).toEqual({ plywood: { corner: 'tabslot' } });
    setAllJoints(d, 'corner', 'glue');
    d = changeMaterial(d, PLY).design;
    expect(corners(d).every((c) => c.kind === 'tabslot')).toBe(true);
    d = changeMaterial(d, CORR).design;
    expect(corners(d).every((c) => c.kind === 'glue')).toBe(true);
  });
});
