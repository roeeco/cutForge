// The Board tool in one drag (milestone 42): what a released ghost makes, and Flip side on a standing board.
import { describe, expect, it, beforeEach } from 'vitest';
import { useStore, type PanelGhost } from '../src/store/store';
import { addDividerFor, addPlacedPanel, addRootPanel, createDesign, flipPlacedSide, setMaterial, setPanelSize } from '../src/model/ops';
import { MATERIALS, tOf } from '../src/model/materials';
import { matDir, toWorld } from '../src/model/frame';
import { boxRecipe } from '../src/easy/recipes';
import { boardFromGhost, drawsDivider, ghostPlace } from '../src/views/board';
import type { Design, V3 } from '../src/model/types';

const ply = () => {
  const d = createDesign();
  setMaterial(d, MATERIALS.find((m) => m.id === 'ply-3')!);
  return d;
};
const copy = (d: Design): Design => JSON.parse(JSON.stringify(d));
/** A design with its generated ids replaced by their order of appearance, to compare two runs. */
function canon(d: Design): string {
  const ids = new Map<string, string>();
  return JSON.stringify(d).replace(/\b([a-z]{1,4})_[a-z0-9]{5,14}\b/g, (m, p) => {
    if (!ids.has(m)) ids.set(m, `${p}#${ids.size}`);
    return ids.get(m)!;
  });
}
const ghost = (g: Partial<PanelGhost>): PanelGhost => ({ host: null, face: 1, pose: 'flat', a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, height: 40, side: 1, drawing: true, ...g });
const close = (a: V3, b: V3) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 6));
const wallOn = (d: Design, base: string, edge: string) => Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === edge)!.b.panelId;

beforeEach(() => {
  useStore.getState().setPrefs({ mode: 'workshop', modeLocked: false });
});

describe('flipPlacedSide', () => {
  it('keeps a standing board on its line and puts its material on the other side', () => {
    const d = ply();
    const host = addRootPanel(d, -60, 40, 120, 80);
    const id = addPlacedPanel(d, { host, face: 1, x: 20, y: 30, rot: 0, pose: 'standing', side: 1 }, 50, 30)!;
    const t = tOf(d, id);
    const f0 = d.panels[id].frame;
    const foot0 = [toWorld(f0, 0, 0, 0), toWorld(f0, 50, 0, 0)];
    const mid0 = toWorld(f0, 25, 15, t / 2);
    flipPlacedSide(d, id);
    const f1 = d.panels[id].frame;
    expect(d.panels[id].place?.side).toBe(-1);
    // the line it stands on is where it was
    close(toWorld(f1, 0, 0, 0), foot0[0]);
    close(toWorld(f1, 50, 0, 0), foot0[1]);
    // the material is on the other side of it
    const m0 = matDir(f0), m1 = matDir(f1);
    expect(m0[0] * m1[0] + m0[1] * m1[1] + m0[2] * m1[2]).toBeCloseTo(-1, 6);
    const mid1 = toWorld(f1, 25, 15, t / 2);
    const side = (p: V3) => (p[0] - foot0[0][0]) * m0[0] + (p[1] - foot0[0][1]) * m0[1] + (p[2] - foot0[0][2]) * m0[2];
    expect(side(mid0)).toBeCloseTo(t / 2, 6);
    expect(side(mid1)).toBeCloseTo(-t / 2, 6);
    // and back
    flipPlacedSide(d, id);
    expect(d.panels[id].place?.side).toBe(1);
    close(toWorld(d.panels[id].frame, 25, 15, t / 2), mid0);
  });

  it('leaves a flat board alone; the H field changes a standing board’s height', () => {
    const d = ply();
    const host = addRootPanel(d, -60, 40, 120, 80);
    const flat = addPlacedPanel(d, { host, face: 1, x: 10, y: 10, rot: 0, pose: 'flat' }, 30, 20)!;
    const before = JSON.stringify(d.panels[flat]);
    flipPlacedSide(d, flat);
    expect(JSON.stringify(d.panels[flat])).toBe(before);
    const id = addPlacedPanel(d, { host, face: 1, x: 20, y: 30, rot: 0, pose: 'standing', side: 1 }, 50, 40)!;
    setPanelSize(d, id, undefined, 25);
    expect(d.panels[id].h).toBe(25);
    expect(d.panels[id].place).toMatchObject({ x: 20, y: 30, pose: 'standing' });
  });
});

describe('the Board tool on release', () => {
  it('a flat drag on the floor is the floor board drawn there', () => {
    const a = ply(), b = ply();
    const r = boardFromGhost(a, ghost({ a: { x: -60, y: -40 }, b: { x: 60, y: 40 } }));
    expect(r?.kind).toBe('flat');
    addRootPanel(b, -60, 40, 120, 80);
    expect(canon(a)).toBe(canon(b));
  });

  it('a click or a drag shorter than the smallest board makes nothing', () => {
    const d = ply();
    const before = JSON.stringify(d);
    expect(boardFromGhost(d, ghost({ a: { x: 5, y: 5 }, b: { x: 5, y: 5 } }))).toBeNull();
    expect(boardFromGhost(d, ghost({ a: { x: 5, y: 5 }, b: { x: 7, y: 60 } }))).toBeNull();
    expect(boardFromGhost(d, ghost({ pose: 'standing', a: { x: 5, y: 5 }, b: { x: 6, y: 6 } }))).toBeNull();
    expect(JSON.stringify(d)).toBe(before);
  });

  it('perpendicular on a plain board: a board standing on the line, at the height given', () => {
    const d = ply();
    const host = addRootPanel(d, -60, 40, 120, 80);
    expect(drawsDivider(d, 'standing', host, 1)).toBe(false);
    const r = boardFromGhost(d, ghost({ host, pose: 'standing', a: { x: 10, y: 20 }, b: { x: 70, y: 20 }, height: 40 }))!;
    expect(r.kind).toBe('standing');
    expect(d.panels[r.id].place).toMatchObject({ host, face: 1, x: 10, y: 20, rot: 0, pose: 'standing', side: 1 });
    expect([d.panels[r.id].w, d.panels[r.id].h]).toEqual([60, 40]);
    expect(ghostPlace(ghost({ host, pose: 'standing', a: { x: 10, y: 20 }, b: { x: 70, y: 20 } }))?.w).toBe(60);
  });

  it('perpendicular on a box’s base: wall to wall is the divider + Divider makes; a line that stops short stands on the base', () => {
    const d = ply();
    const base = boxRecipe(d, { kind: 'rect', x0: -60, z0: -45, x1: 60, z1: 45 }, 45)!.baseId;
    // only a standing line on the base's inner face is a divider line
    expect(drawsDivider(d, 'standing', base, 1)).toBe(true);
    expect(drawsDivider(d, 'flat', base, 1)).toBe(false);
    expect(drawsDivider(d, 'standing', base, -1)).toBe(false);
    expect(drawsDivider(d, 'standing', null, 1)).toBe(false);
    const a = copy(d), b = copy(d);
    const r = boardFromGhost(a, ghost({ host: base, pose: 'standing', divider: true, a: { x: 60, y: 8 }, b: { x: 60, y: 84 } }));
    expect(r?.kind).toBe('divider');
    addDividerFor(b, wallOn(b, base, 'e0'), wallOn(b, base, 'e2'));
    expect(canon(a)).toBe(canon(b));
    const s = boardFromGhost(d, ghost({ host: base, pose: 'standing', divider: true, a: { x: 60, y: 8 }, b: { x: 60, y: 40 } }))!;
    expect(s.kind).toBe('standing');
    expect(d.panels[s.id].place).toMatchObject({ host: base, face: 1, pose: 'standing' });
  });

  it('through the store: release makes the board in one undo step, selects it and goes back to Select', async () => {
    const { confirmPanelGhost } = await import('../src/views/panelTool');
    const st = useStore.getState();
    st.replaceDesign(ply());
    st.setTool('panel');
    st.setBoardPose('standing');
    expect(useStore.getState().panelPose).toBe('standing');
    st.setBoardPose('flat');
    const p0 = useStore.getState().past.length;
    st.set({ panelGhost: ghost({ a: { x: 0, y: 0 }, b: { x: 80, y: 50 } }) });
    const id = confirmPanelGhost()!;
    const s = useStore.getState();
    expect(s.design.panels[id]).toBeTruthy();
    expect(s.past.length).toBe(p0 + 1);
    expect(s.selection).toEqual({ kind: 'panel', id });
    expect(s.tool).toBe('select');
    expect(s.panelGhost).toBeNull();
    // the pose is kept for the next time
    expect(s.panelPose).toBe('flat');
  });
});
