import { describe, expect, it, beforeEach } from 'vitest';
import { useStore } from '../src/store/store';
import { addRootPanel, createDesign, updateDetail, addDetail } from '../src/model/ops';
import { parseProject, serializeProject, ProjectError } from '../src/model/serialize';

beforeEach(() => useStore.getState().replaceDesign(createDesign()));

describe('transactions and history', () => {
  it('a drag (many previews) is one undo step; cancel restores', () => {
    const s = () => useStore.getState();
    let pid = '';
    s().apply((d) => void (pid = addRootPanel(d, 0, 0, 100, 50)));
    let xid = '';
    s().apply((d) => void (xid = addDetail(d, pid, 'rect', 'cut', 20, 20, 10, 10)!));
    expect(s().past).toHaveLength(2);
    for (let i = 1; i <= 10; i++) s().preview((d) => updateDetail(d, xid, { cx: 20 + i }));
    expect(s().design.panels[pid].details[0].cx).toBe(30);
    s().commit();
    expect(s().past).toHaveLength(3);
    s().undo();
    expect(s().design.panels[pid].details[0].cx).toBe(20);
    s().redo();
    expect(s().design.panels[pid].details[0].cx).toBe(30);
    for (let i = 1; i <= 5; i++) s().preview((d) => updateDetail(d, xid, { cx: 30 + i }));
    s().cancel();
    expect(s().design.panels[pid].details[0].cx).toBe(30);
    expect(s().past).toHaveLength(3);
  });

  it('ignores values returned by an edit recipe', () => {
    useStore.getState().apply((d) => addRootPanel(d, 0, 0, 10, 10));
    expect(useStore.getState().design.order).toHaveLength(1);
  });
});

describe('project file', () => {
  it('round-trips a design', () => {
    const d = createDesign();
    const p = addRootPanel(d, 0, 0, 80, 40);
    addDetail(d, p, 'circle', 'cut', 10, 10, 6, 6);
    d.pieces[p].quantity = 3;
    const back = parseProject(serializeProject(d));
    expect(back).toEqual(JSON.parse(JSON.stringify(d)));
  });
  it('rejects other files and newer versions', () => {
    expect(() => parseProject('{"hello":1}')).toThrow(ProjectError);
    const d = createDesign();
    const txt = serializeProject({ ...d, schemaVersion: 999 });
    expect(() => parseProject(txt)).toThrowError('newerVersion');
  });
});

describe('copy and paste shapes (milestone 33), ghosts waiting for ✓ (milestone 30)', () => {
  it('pasting with nothing under the pointer puts the shapes on the last selected panel’s centre; a through-cut stays one; ✓ is one undo step', () => {
    const s = () => useStore.getState();
    let a = '', b = '', x1 = '', x2 = '';
    s().apply((d) => {
      a = addRootPanel(d, 0, 0, 100, 60);
      b = addRootPanel(d, 200, 0, 80, 40);
      x1 = addDetail(d, a, 'circle', 'cut', 20, 20, 10, 10, undefined, true)!;
      x2 = addDetail(d, a, 'rect', 'cut', 40, 20, 10, 6)!;
    });
    s().select({ kind: 'detail', id: x2, ids: [x1, x2] });
    expect(s().copyShapes()).toBe(true);
    s().select({ kind: 'panel', id: b });
    useStore.setState({ pointerHit: null });
    const p0 = s().past.length;
    expect(s().pasteShapes()).toBe(true);
    const got = s().design.panels[b].details;
    expect(got).toHaveLength(2);
    // centred on the panel, the layout kept, the through-cut still through
    expect((got[0].cx - 5 + got[1].cx + 5) / 2).toBeCloseTo(40, 9);
    expect(got[1].cx - got[0].cx).toBeCloseTo(20, 9);
    expect(got[0].through).toBe(true);
    expect(s().pending?.ids).toEqual(got.map((x) => x.id));
    s().confirmPending();
    expect(s().past.length).toBe(p0 + 1);
    s().undo();
    expect(s().design.panels[b].details).toHaveLength(0);
    // ✕ leaves the design as it was
    s().pasteShapes();
    s().cancelPending();
    expect(s().design.panels[b].details).toHaveLength(0);
  });
});
