// Guided, the mode and the shell (milestone 105, GUIDED_MODE.md G2): a third level with a full column of
// its own, the guard, the keys, the step, and the opening view.
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPrefs, useStore } from '../src/store/store';
import { addDetail, addRootPanel, addTray, createDesign, setMaterial } from '../src/model/ops';
import { FEATURES, GUIDED, featureState, keepsCuttable } from '../src/easy/features';
import { applyClassMode, levels, setMode } from '../src/easy/mode';
import { handleKey } from '../src/store/hooks';
import { MATERIALS, minWeb } from '../src/model/materials';
import { boxRecipe } from '../src/easy/recipes';
import { guidedCamera, GUIDED_ELEVATION } from '../src/guided/camera';
import { thingFacts } from '../src/guided/thing';
import { generate, templateById, defaults } from '../src/templates/registry';

const s = () => useStore.getState();
const PLY = MATERIALS.find((m) => m.id === 'ply-3')!;
beforeEach(() => {
  s().setPrefs({ mode: 'workshop', modeLocked: false, joints: false, outlineMode: false });
  s().replaceDesign(createDesign());
  s().apply((d) => setMaterial(d, PLY));
});
const key = (k: string, o: { ctrl?: boolean; shift?: boolean } = {}) =>
  handleKey({ key: k, ctrlKey: !!o.ctrl, metaKey: false, shiftKey: !!o.shift, altKey: false, target: null, preventDefault() {} } as unknown as KeyboardEvent);
function aBox(): string {
  let base = '';
  s().apply((d) => void (base = boxRecipe(d, { kind: 'rect', x0: -60, z0: -40, x1: 60, z1: 40 }, 45)!.baseId));
  return base;
}

describe('three levels', () => {
  it('Workshop shows everything, Quick build follows its column, Guided its own', () => {
    for (const f of Object.keys(FEATURES) as (keyof typeof FEATURES)[]) {
      expect(featureState(f, 'workshop')).toBe('show');
      expect(featureState(f, 'quick')).toBe(FEATURES[f]);
      expect(featureState(f, 'guided')).toBe(GUIDED[f]);
    }
    expect(keepsCuttable('guided')).toBe(true);
    expect(keepsCuttable('quick')).toBe(true);
    expect(keepsCuttable('workshop')).toBe(false);
  });

  it('the switch offers Guided only with the preview flag (or when already in it)', () => {
    expect(levels({})).toEqual(['quick', 'workshop']);
    expect(levels({ guidedPreview: true })).toEqual(['guided', 'quick', 'workshop']);
    expect(levels({ mode: 'guided' })).toEqual(['guided', 'quick', 'workshop']);
    expect(defaultPrefs(null).mode).toBe('workshop');
    expect(defaultPrefs(null, '?guided').guidedPreview).toBe(true);
    expect(defaultPrefs(JSON.stringify({ mode: 'quick' }), '').mode).toBe('quick');
    expect(defaultPrefs('{broken', '').mode).toBe('workshop');
  });

  it('switching to and from Guided never changes the design or its history', () => {
    aBox();
    const before = JSON.stringify(s().design);
    const past = s().past.length;
    setMode('guided');
    expect(s().viewPrefs.mode).toBe('guided');
    setMode('quick');
    setMode('guided');
    setMode('workshop');
    expect(JSON.stringify(s().design)).toBe(before);
    expect(s().past.length).toBe(past);
  });

  it('Guided leaves Workshop views behind: no joints view, no outline mode, no face-on view, Build first', () => {
    const base = aBox();
    s().setPrefs({ joints: true });
    s().openSolo(base);
    useStore.setState({ guidedStep: 'send' });
    setMode('guided');
    expect(s().viewPrefs.joints).toBe(false);
    expect(s().viewPrefs.outlineMode).toBe(false);
    expect(s().view).toBe('3d');
    expect(s().soloPanel).toBeNull();
    expect(s().guidedStep).toBe('build');
    s().setPrefs({ mode: 'workshop', outlineMode: true });
    setMode('guided');
    expect(s().viewPrefs.outlineMode).toBe(false);
  });

  it('a class locked in Guided stays there', () => {
    applyClassMode('guided', true);
    setMode('quick');
    expect(s().viewPrefs.mode).toBe('guided');
    setMode('workshop');
    expect(s().viewPrefs.mode).toBe('guided');
  });
});

describe('the step', () => {
  it('is view state: changing it clears the selection and closes the face-on view; a new design starts at Build', () => {
    const base = aBox();
    setMode('guided');
    const past = s().past.length;
    s().select({ kind: 'panel', id: base });
    s().openSolo(base);
    s().setGuidedStep('decorate');
    expect(s().guidedStep).toBe('decorate');
    expect(s().selection).toBeNull();
    expect(s().view).toBe('3d');
    expect(s().past.length).toBe(past);
    s().replaceDesign(createDesign());
    expect(s().guidedStep).toBe('build');
  });
});

describe('the guard runs in Guided as in Quick build', () => {
  it('a shape pushed into the edge keep-out is moved back', () => {
    setMode('guided');
    let p = '', id = '';
    s().apply((d) => {
      p = addRootPanel(d, 0, 0, 100, 60);
      id = addDetail(d, p, 'circle', 'cut', 50, 30, 10, 10)!;
    });
    s().apply((d) => void (d.panels[p].details.find((x) => x.id === id)!.cx = 130));
    expect(s().design.panels[p].details.find((x) => x.id === id)!.cx).toBeCloseTo(100 - minWeb(PLY) - 5, 2);
  });
});

describe('keys in Guided', () => {
  it('letter keys do not change the tool; Workshop keeps them', () => {
    aBox();
    setMode('guided');
    key('b');
    key('p');
    expect(s().tool).toBe('select');
    setMode('workshop');
    key('p');
    expect(s().tool).toBe('panel');
  });

  it('Ctrl+C / Ctrl+V do nothing (a paste would wait for ✓)', () => {
    let p = '', id = '';
    s().apply((d) => {
      p = addRootPanel(d, 0, 0, 100, 60);
      id = addDetail(d, p, 'circle', 'cut', 50, 30, 10, 10)!;
    });
    setMode('guided');
    s().select({ kind: 'detail', id, ids: [id] } as never);
    key('c', { ctrl: true });
    expect(s().clipboard ?? null).toBeNull();
    useStore.setState({ clipboard: [JSON.parse(JSON.stringify(s().design.panels[p].details[0]))] as never });
    key('v', { ctrl: true });
    expect(s().pending).toBeNull();
    key('d', { ctrl: true });
    expect(s().design.panels[p].details.length).toBe(1);
  });

  it('Delete removes a divider but never a side or the bottom', () => {
    const d0 = generate(templateById('box')!, PLY, { ...defaults(templateById('box')!), spacesBy: 'count', nx: 2, ny: 1 });
    s().replaceDesign(d0);
    setMode('guided');
    const divider = Object.values(s().design.panels).find((x) => x.divider)!;
    const wall = s().design.order.find((id) => !s().design.panels[id].divider && s().design.panels[id].place == null && id !== s().design.order[0])!;
    s().select({ kind: 'panel', id: wall });
    key('Delete');
    expect(s().design.panels[wall]).toBeDefined();
    s().select({ kind: 'panel', id: divider.id });
    key('Delete');
    expect(s().design.panels[divider.id]).toBeUndefined();
  });
});

describe('the opening view and the side sheet', () => {
  it('looks from about 50° up, in front of the thing, at its middle', () => {
    aBox();
    const [pos, target] = guidedCamera(s().design);
    const v = [pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]];
    const up = (Math.atan2(v[1], Math.hypot(v[0], v[2])) * 180) / Math.PI;
    expect(up).toBeCloseTo(GUIDED_ELEVATION, 3);
    expect(v[2]).toBeGreaterThan(0);
    expect(Math.abs(target[0])).toBeLessThan(10);
  });

  it('says the thing’s inside, its spaces and its lid', () => {
    const d = generate(templateById('box')!, PLY, defaults(templateById('box')!));
    const f = thingFacts(d);
    expect(f.inside).not.toBeNull();
    expect(f.spaces).toBeGreaterThanOrEqual(1);
    expect(f.lid).toBe('none');
    expect(thingFacts(createDesign()).inside).toBeNull();
  });
});

it('an empty tray-less design is fine too', () => {
  s().apply((d) => void addTray(d, addRootPanel(d, 0, 0, 50, 50), 20));
  expect(thingFacts(s().design).inside).not.toBeNull();
});
