// Milestone 92 (GUIDED_MODE.md G1 item 1): a draft waiting for ✓ is never what autosave writes.
import { beforeEach, describe, expect, it } from 'vitest';
import { designToSave, useStore } from '../../src/store/store';
import { boxFootprintGo, extrudeGo } from '../../src/easy/actions';
import { addRootPanel, createDesign } from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';

const s = () => useStore.getState();
beforeEach(() => {
  s().setPrefs({ mode: 'quick', modeLocked: false });
  s().replaceDesign(createDesign(MATERIALS[3]));
});

describe('autosave and drafts', () => {
  it('a Box footprint not yet confirmed saves the design from before it', () => {
    boxFootprintGo([0, 0, 0], [120, 0, 80]);
    expect(s().pending).not.toBeNull();
    expect(Object.keys(s().design.panels).length).toBe(1);
    expect(Object.keys(designToSave(s()).panels).length).toBe(0);
    extrudeGo();
    expect(s().pending).toBeNull();
    const saved = designToSave(s());
    expect(saved).toBe(s().design);
    expect(Object.keys(saved.panels).length).toBeGreaterThan(4);
  });

  it('a shape waiting for ✓ saves the board without it, and cancelling leaves the board', () => {
    let base = '';
    s().apply((d) => void (base = addRootPanel(d, 0, 0, 100, 60)));
    const before = s().design;
    s().apply((d) => void d.panels[base].details.push({ id: 'x1', shape: 'rect', op: 'cut', cx: 50, cy: 30, w: 10, h: 10 }));
    s().beginPending({ kind: 'shape', ids: ['x1'], panelId: base });
    expect(designToSave(s())).toBe(before);
    s().cancelPending();
    expect(designToSave(s())).toBe(before);
  });
});

describe('the empty stage (milestone 92, G1 item 4)', () => {
  it('Quick build does not name the Board tool; Workshop does', async () => {
    const { stageHintKey } = await import('../../src/views/View3D');
    expect(stageHintKey(true, 'select', 'quick', 'tool.hint.select')).toBeNull();
    expect(stageHintKey(true, 'select', 'workshop', 'tool.hint.select')).toBe('view.empty3d');
    expect(stageHintKey(false, 'select', 'quick', 'tool.hint.select')).toBe('tool.hint.select');
  });
});
