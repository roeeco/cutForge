// Milestone 101 (DIELINE_DNA_PLAN.md D0): outline mode, and one rule for which outlines can be edited.
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store/store';
import { addRootPanel, addRoundPanel, addTray, autoConnect, createDesign } from '../src/model/ops';
import { outlineWhy } from '../src/model/outlineWhy';
import { MATERIALS } from '../src/model/materials';
import { dividerLine } from '../src/easy/recipes';
import { setBoxLid } from '../src/easy/lid';
import type { Design } from '../src/model/types';

const s = () => useStore.getState();
let a = '', b = '', round = '';
beforeEach(() => {
  s().setPrefs({ mode: 'workshop', modeLocked: false, outlineMode: false, joints: false });
  const d = createDesign(MATERIALS[3]);
  a = addRootPanel(d, 0, 0, 100, 60);
  b = addRootPanel(d, 200, 0, 80, 50);
  round = addRoundPanel(d, 400, 0, 60, 60, { shape: 'circle', seam: 'teeth' } as never)!;
  s().replaceDesign(d);
});

describe('outline mode', () => {
  it('selecting an editable board edits its outline; another moves it; a round one does not', () => {
    s().setPrefs({ outlineMode: true });
    expect(s().tool).toBe('select');
    s().select({ kind: 'panel', id: a });
    expect(s().editOutline).toBe(a);
    s().select({ kind: 'panel', id: b });
    expect(s().editOutline).toBe(b);
    s().select({ kind: 'panel', id: round });
    expect(s().editOutline).toBeNull();
  });

  it('turning it on edits what is selected; off lets go', () => {
    s().select({ kind: 'panel', id: a });
    expect(s().editOutline).toBeNull();
    s().setPrefs({ outlineMode: true });
    expect(s().editOutline).toBe(a);
    s().setPrefs({ outlineMode: false });
    expect(s().editOutline).toBeNull();
  });

  it('joints and outline mode exclude each other', () => {
    s().setPrefs({ outlineMode: true });
    s().setPrefs({ joints: true });
    expect(s().viewPrefs.outlineMode).toBe(false);
    s().setPrefs({ outlineMode: true });
    expect(s().viewPrefs.joints).toBe(false);
  });

  it('without the mode, selecting a board edits nothing (as before)', () => {
    s().select({ kind: 'panel', id: a });
    expect(s().editOutline).toBeNull();
  });
});

describe('which outlines can be edited', () => {
  function box(): { d: Design; base: string; wall: string; div: string; tray: string } {
    const d = createDesign(MATERIALS[3]);
    const base = addRootPanel(d, 0, 0, 120, 80);
    const tray = addTray(d, base, 50)!;
    autoConnect(d);
    const wall = Object.values(d.connections).find((c) => c.grown && c.a.panelId === base)!.b.panelId;
    const div = dividerLine(d, base, { x: 60, y: 5 }, { x: 60, y: 75 })!.id;
    return { d, base, wall, div, tray };
  }
  it('a base and a wall can; a round board, a divider and a generated lid say why', () => {
    const { d, base, wall, div, tray } = box();
    expect(outlineWhy(d, base)).toBeNull();
    expect(outlineWhy(d, wall)).toBeNull();
    expect(outlineWhy(d, div)).toBe('outline.why.divider');
    setBoxLid(d, tray, 'liftoff');
    const lid = Object.values(d.trays).find((t) => t.lidOf)?.baseId ?? d.order.find((id) => d.panels[id].lidOf);
    expect(lid && outlineWhy(d, lid)).toBe('outline.why.lid');
    const s2 = createDesign(MATERIALS[3]);
    const r = addRoundPanel(s2, 0, 0, 60, 60, { shape: 'circle', seam: 'teeth' } as never)!;
    expect(outlineWhy(s2, r)).toBe('outline.why.round');
  });
});
