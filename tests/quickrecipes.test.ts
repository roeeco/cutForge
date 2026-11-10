// Quick build's actions (milestone 38): each recipe makes what the same steps make in Workshop.
import { describe, expect, it, beforeEach } from 'vitest';
import { useStore } from '../src/store/store';
import { addDetail, addDividerFor, autoConnect, growPanel, addPathShape, addPolygonPanel, addRootPanel, addTray, createDesign, parentConnection, regularPolygon, setMaterial, solve } from '../src/model/ops';
import { MATERIALS, tOf } from '../src/model/materials';
import { boxRecipe, dividerLine, holeRecipe, planDividerLine, quickWallHeight, stickerRecipe, wallRecipe } from '../src/easy/recipes';
import { doGrow } from '../src/views/ghost';
import { STICKERS } from '../src/easy/stickers';
import type { Design } from '../src/model/types';

/** A design with its generated ids replaced by their order of appearance, to compare two runs. */
function canon(d: Design): string {
  const s = JSON.stringify(d);
  const ids = new Map<string, string>();
  return s.replace(/\b([a-z]{1,4})_[a-z0-9]{5,14}\b/g, (m, p) => {
    if (!ids.has(m)) ids.set(m, `${p}#${ids.size}`);
    return ids.get(m)!;
  });
}

const ply = () => {
  const d = createDesign();
  setMaterial(d, MATERIALS.find((m) => m.id === 'ply-3')!);
  return d;
};
const copy = (d: Design): Design => JSON.parse(JSON.stringify(d));
const wallOn = (d: Design, base: string, edge: string) => Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === edge)!.b.panelId;

beforeEach(() => {
  useStore.getState().setPrefs({ mode: 'workshop', modeLocked: false });
});

describe('Box', () => {
  it('a rectangle footprint: the floor panel the Panel tool draws, then Extrude', () => {
    const a = ply(), b = ply();
    boxRecipe(a, { kind: 'rect', x0: -60, z0: -45, x1: 60, z1: 45 }, 45);
    const base = addRootPanel(b, -60, 45, 120, 90);
    addTray(b, base, 45);
    expect(canon(a)).toBe(canon(b));
  });
  it('a regular footprint: the polygon tool’s regular base, then Extrude', () => {
    const a = ply(), b = ply();
    boxRecipe(a, { kind: 'regular', x0: 0, z0: 0, x1: 100, z1: 100, sides: 6 }, 40);
    const base = addPolygonPanel(b, 50, 50, regularPolygon(6, 50))!;
    addTray(b, base, 40);
    expect(canon(a)).toBe(canon(b));
  });
});

describe('Wall / lid', () => {
  it('equals Workshop’s grow card at 90° on the whole edge, adapting', () => {
    const d = ply();
    const base = boxRecipe(d, { kind: 'rect', x0: -60, z0: -45, x1: 60, z1: 45 }, 45)!.baseId;
    const front = wallOn(d, base, 'e0');
    solve(d);
    const a = copy(d);
    wallRecipe(a, front, 'e2', 90);
    const s = useStore.getState();
    s.replaceDesign(copy(d));
    s.setGrow({ height: 90, angle: 90, kind: undefined, span: null, adapt: true, sketch: null });
    s.select({ kind: 'edge', panelId: front, edge: 'e2' });
    doGrow(front, 'e2');
    // the editor solves and joins after every edit
    solve(a);
    autoConnect(a);
    expect(canon(a)).toBe(canon(useStore.getState().design));
  });
});

describe('Wall / lid height', () => {
  it('a lid reaches across to the opposite wall; a wall is as tall as its neighbours', () => {
    const d = ply();
    const base = addRootPanel(d, -60, 45, 120, 90);
    for (const e of ['e0', 'e1', 'e2']) growPanel(d, base, e, { height: 45, angle: 90, dir: 'up', kind: 'finger' });
    autoConnect(d);
    expect(quickWallHeight(d, base, 'e3', 60)).toBeCloseTo(45, 0);
    const back = wallOn(d, base, 'e2');
    expect(quickWallHeight(d, back, 'e2', 60)).toBeCloseTo(90, 0);
  });
});

describe('Divider', () => {
  const box = () => {
    const d = ply();
    const base = boxRecipe(d, { kind: 'rect', x0: -60, z0: -45, x1: 60, z1: 45 }, 45)!.baseId;
    return { d, base, front: wallOn(d, base, 'e0'), back: wallOn(d, base, 'e2') };
  };

  it('a line from wall to wall is the divider + Divider makes there', () => {
    const { d, base, front, back } = box();
    const a = copy(d), b = copy(d);
    // across the middle, its ends a little short of the walls (they snap)
    const r = dividerLine(a, base, { x: 60, y: 8 }, { x: 60, y: 84 });
    expect(r?.kind).toBe('divider');
    addDividerFor(b, front, back);
    expect(canon(a)).toBe(canon(b));
  });

  it('off-centre, the divider stands at the line', () => {
    const { d, base } = box();
    const t = tOf(d, base);
    const plan = planDividerLine(d, base, { x: 40, y: 2 }, { x: 40, y: 88 });
    expect(plan?.kind).toBe('divider');
    const r = dividerLine(d, base, { x: 40, y: 2 }, { x: 40, y: 88 })!;
    const c = parentConnection(d, r.id)!;
    // from the left edge (or the right one, by the base's edge order): the slab centred on the line
    expect([c.offset, 120 - c.offset - t]).toContainEqual(expect.closeTo(40 - t / 2, 0));
    // the compartments either side
    if (plan?.kind === 'divider' && plan.gaps) expect(plan.gaps[0] + plan.gaps[1] + t).toBeCloseTo(120 - 2 * t, 0);
  });

  it('a line that stops short is a panel standing on the base', () => {
    const { d, base } = box();
    const r = dividerLine(d, base, { x: 60, y: 8 }, { x: 60, y: 40 })!;
    expect(r.kind).toBe('standing');
    expect(d.panels[r.id].place).toMatchObject({ host: base, face: 1, pose: 'standing' });
  });
});

describe('Hole, text and stickers', () => {
  it('are the shape ops, cut out or engraved', () => {
    const a = ply(), b = ply();
    const pa = addRootPanel(a, 0, 0, 100, 60), pb = addRootPanel(b, 0, 0, 100, 60);
    holeRecipe(a, pa, 'circle', 30, 30, 20, 20);
    addDetail(b, pb, 'circle', 'cut', 30, 30, 20, 20);
    stickerRecipe(a, pa, STICKERS[0].polys, 70, 30, 20);
    addPathShape(b, pb, STICKERS[0].polys, 70, 30, 20, 20, 'engrave');
    expect(canon(a)).toBe(canon(b));
  });
  it('every sticker is closed outlines inside its unit box', () => {
    for (const s of STICKERS) {
      expect(s.polys.length).toBeGreaterThan(0);
      for (const r of s.polys) {
        expect(r.length).toBeGreaterThanOrEqual(3);
        for (const p of r) {
          expect(Math.abs(p.x)).toBeLessThanOrEqual(0.5 + 1e-9);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(0.5 + 1e-9);
        }
      }
    }
  });
});
