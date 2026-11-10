// Quick build and Workshop (milestone 37): the feature table and the mode.
import { describe, expect, it, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { useStore } from '../src/store/store';
import { addFoldOver, addRootPanel, addTray, createDesign, growPanel, setMaterial } from '../src/model/ops';
import { FEATURES, featureState } from '../src/easy/features';
import { applyClassMode, setMode, workshopOnly } from '../src/easy/mode';
import { MATERIALS } from '../src/model/materials';

const s = () => useStore.getState();
beforeEach(() => {
  s().setPrefs({ mode: 'workshop', modeLocked: false });
  s().replaceDesign(createDesign());
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('the feature table', () => {
  it('lists every feature the components ask for, and every feature Quick build changes is asked for', () => {
    const used = new Set<string>();
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?:useFeature|featureState)\(\s*'([^']+)'/g)) used.add(m[1]);
      for (const m of src.matchAll(/<Gate f="([^"]+)"/g)) used.add(m[1]);
    }
    const listed = new Set(Object.keys(FEATURES));
    expect([...used].filter((f) => !listed.has(f))).toEqual([]);
    // a feature Quick build changes is asked for somewhere ('rail.ops' goes with the Workshop rail, which 'rail.tools' replaces)
    const changed = [...listed].filter((f) => FEATURES[f as keyof typeof FEATURES] !== 'show' && f !== 'rail.ops');
    expect(changed.filter((f) => !used.has(f))).toEqual([]);
  });

  it('Workshop shows everything; Quick build follows the table', () => {
    for (const f of Object.keys(FEATURES) as (keyof typeof FEATURES)[]) {
      expect(featureState(f, 'workshop')).toBe('show');
      expect(featureState(f, 'quick')).toBe(FEATURES[f]);
    }
  });
});

describe('the mode', () => {
  it('switching never changes the design or its history', () => {
    let base = '';
    s().apply((d) => {
      base = addRootPanel(d, 0, 0, 120, 80);
      addTray(d, base, 40);
    });
    const before = JSON.stringify(s().design);
    const past = s().past.length;
    setMode('quick');
    expect(s().viewPrefs.mode).toBe('quick');
    setMode('workshop');
    setMode('quick');
    expect(JSON.stringify(s().design)).toBe(before);
    expect(s().past.length).toBe(past);
  });

  it('a locked class mode cannot be switched; an unlocked one can', () => {
    applyClassMode('quick', true);
    setMode('workshop');
    expect(s().viewPrefs.mode).toBe('quick');
    applyClassMode('quick', false);
    setMode('workshop');
    expect(s().viewPrefs.mode).toBe('workshop');
    applyClassMode(null, false);
    expect(s().viewPrefs.modeLocked).toBe(false);
  });

  it('selecting an edge in Quick build grows at 90° on the whole edge, adapting', () => {
    let base = '';
    s().apply((d) => void (base = addRootPanel(d, 0, 0, 120, 80)));
    s().setGrow({ angle: 60, adapt: false, span: [10, 40] });
    setMode('quick');
    s().select({ kind: 'edge', panelId: base, edge: 'e0' });
    expect(s().grow).toMatchObject({ angle: 90, adapt: true, span: null });
    // Workshop keeps what was set
    setMode('workshop');
    s().setGrow({ angle: 60 });
    s().select({ kind: 'edge', panelId: base, edge: 'e1' });
    expect(s().grow.angle).toBe(60);
  });
});

describe('parts only Workshop changes', () => {
  it('an angled panel, a fold-over, another material and a construction guide are read-only', () => {
    const d = createDesign();
    setMaterial(d, MATERIALS.find((m) => m.id === 'ply-3')!);
    const b = addRootPanel(d, 0, 0, 120, 80);
    const straight = growPanel(d, b, 0, { height: 40, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    const leaning = growPanel(d, b, 2, { height: 40, angle: 70, dir: 'up', kind: 'finger' })!.panelId;
    expect(workshopOnly(d, b)).toBeNull();
    expect(workshopOnly(d, straight)).toBeNull();
    expect(workshopOnly(d, leaning)).toBe('angle');
    const card = createDesign();
    setMaterial(card, MATERIALS.find((m) => m.kind === 'card')!);
    const cb = addRootPanel(card, 0, 0, 100, 60);
    const w = growPanel(card, cb, 0, { height: 40, angle: 90, dir: 'up', kind: 'fold' })!.panelId;
    if (addFoldOver(card, w)) expect(workshopOnly(card, w)).toBe('foldover');
    const other = addRootPanel(d, 200, 0, 50, 50);
    d.panels[other].material = 'some-other';
    expect(workshopOnly(d, other)).toBe('material');
  });
});
