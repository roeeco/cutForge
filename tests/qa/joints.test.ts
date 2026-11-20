// QA repros for changing joint types (REPORT.md §10, J-a…J-i): "not all of them change, sometimes nothing changes".
// Fixed by milestone 135 (QA_FIX_PLAN.md Q1). Each `it.fails` states what should hold; see tests/qa/README.md.
import { describe, expect, it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { groupKinds, jointGroup } from '../../src/model/jointDefaults';
import type { Design } from '../../src/model/types';
import { changeGroup, groupKeys, jointKey, kindsOf, settle, shownLies } from './promises';

const [CARD, , , PLY] = MATERIALS;

/** A box as Workshop's *Extrude walls* makes it: a base and a tray of four walls. */
function tray(m = PLY, W = 120, D = 80, H = 40) {
  const d = ops.createDesign(m);
  const base = ops.addRootPanel(d, 0, 0, W, D);
  const t = ops.addTray(d, base, H)!;
  settle(d);
  return { d, base, t };
}
/** A box of four walls grown one by one (not a tray). */
function grownBox(m = PLY) {
  const d = ops.createDesign(m);
  const base = ops.addRootPanel(d, 0, 0, 80, 60);
  const walls = [0, 1, 2, 3].map((e) => ops.growPanel(d, base, e, { height: 40, angle: 90, dir: 'up', kind: m.kind === 'plywood' ? 'finger' : 'fold' })!.panelId);
  settle(d);
  return { d, base, walls };
}
const ofGroup = (d: Design, g: 'base' | 'corner') => Object.values(d.connections).filter((c) => jointGroup(c) === g).map((c) => c.id);
const keysOf = groupKeys;

describe('J-a / J-e: walls standing on the base change the corners behind the list', () => {
  for (const [m, corner] of [[CARD, 'lock'], [PLY, 'tabslot']] as const)
    it.fails(`${m.id}: after Wall to base → Tabs and slots, the Corners list shows what the corners are`, () => {
      const { d } = tray(m);
      changeGroup(d, 'corner', corner);
      const corners = keysOf(d, 'corner');
      changeGroup(d, 'base', 'tabslot');
      // today: the corners became half-laps (and left the group), the list still shows the old choice
      expect(shownLies(d, 'corner', corners)).toEqual([]);
    });
});

describe('J-b / J-f: a corner choice is applied, or the list does not claim it', () => {
  for (const [m, pick] of [[CARD, 'glue'], [PLY, 'butt']] as const)
    it.fails(`${m.id}: Corners → ${pick} after the walls stand on the base`, () => {
      const { d } = tray(m);
      const corners = keysOf(d, 'corner');
      changeGroup(d, 'base', 'tabslot');
      const r = changeGroup(d, 'corner', pick);
      // today: "0 joints changed", the list says the new kind, the corners are half-laps
      expect({ changed: r.result.changed, lies: shownLies(d, 'corner', corners) }).toEqual({ changed: corners.length, lies: [] });
    });
});

describe('§10.1 #1: a mixed group is shown as mixed', () => {
  it.fails('one corner set by hand: the Corners list does not show a single kind', () => {
    const { d } = grownBox();
    changeGroup(d, 'corner', 'tabslot');
    const one = ofGroup(d, 'corner')[0];
    ops.setConnection(d, one, { kind: 'finger' });
    settle(d);
    expect(d.connections[one].kind).toBe('finger');
    expect(shownLies(d, 'corner')).toEqual([]);
  });
});

describe('§10.1 #2: a kind is offered only where the working material can take it', () => {
  it.fails('plywood box with one card wall: Corners → Glue is not offered, or it changes the plywood corners', () => {
    const { d, walls } = grownBox();
    ops.setPanelMaterial(d, [walls[0]], { ...CARD, id: 'card-x' });
    settle(d);
    const offered = groupKinds(d, 'corner').includes('glue');
    const r = changeGroup(d, 'corner', 'glue');
    // today: Glue is offered, "0 changed, 2 kept", the list says Glue and the plywood corners are fingers
    expect(offered ? shownLies(d, 'corner') : []).toEqual([]);
    expect(offered ? r.result.changed : 0).toBe(offered ? r.promised.length : 0);
  });
});

describe('J-d / §10.1 #6: Wall to base covers walls only', () => {
  it.fails('dividers keep their joints when Wall to base changes', () => {
    const { d, base } = tray(PLY, 160, 110, 45);
    const div = ops.addDivider(d, base, 0, 50, 40)!;
    settle(d);
    const joints = Object.values(d.connections).filter((c) => c.a.panelId === div || c.b.panelId === div).map(jointKey);
    expect(joints.length).toBeGreaterThan(0);
    const before = kindsOf(d, joints);
    changeGroup(d, 'base', 'butt');
    // today: the divider's joints follow Wall to base (REPORT.md J-d: "13 joints changed")
    expect(kindsOf(d, joints)).toEqual(before);
  });
  it.fails("a carton's tuck lid still folds after Wall to base → Glue", () => {
    const { d, t } = tray(CARD, 80, 60, 50);
    ops.setTrayEnds(d, t, { top: 'tuck' });
    settle(d);
    const folds = Object.values(d.connections).filter((c) => c.grown && c.kind === 'fold' && !c.b.panelId.endsWith(`/e0`) && c.b.panelId.includes('top')).map((c) => c.id);
    expect(folds.length).toBeGreaterThan(0);
    changeGroup(d, 'base', 'glue');
    expect(folds.map((id) => d.connections[id]?.kind)).toEqual(folds.map(() => 'fold'));
  });
});

describe('§10.1 #4: the count is what happened', () => {
  it.fails('open-base carton: Wall to base → Glue changes what it says it changed', () => {
    const { d, t } = tray(CARD, 80, 60, 50);
    ops.setTrayEnds(d, t, { base: 'open' });
    settle(d);
    const r = changeGroup(d, 'base', 'glue');
    expect(r.result.changed).toBe(r.promised.length - r.wrong.length - r.gone.length);
  });
});

describe('§10.1 #7: a joint set by hand is kept', () => {
  it.fails('plywood → card → plywood keeps a corner set by hand', () => {
    const { d } = grownBox();
    changeGroup(d, 'corner', 'finger');
    const one = ofGroup(d, 'corner')[0];
    ops.setConnection(d, one, { kind: 'tabslot' });
    settle(d);
    ops.setMaterial(d, CARD);
    settle(d);
    ops.setMaterial(d, PLY);
    settle(d);
    expect(d.connections[one]?.kind).toBe('tabslot');
  });
});
