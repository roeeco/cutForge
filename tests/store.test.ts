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
