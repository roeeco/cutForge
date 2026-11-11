// Missions and what goes inside (milestone 40).
import { dividerRow } from '../src/model/dividers';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FONTS, registerFont } from '../src/text/fonts';
import { addText, autoConnect, createDesign, parentConnection, setMaterial, solve, setPanelSize, addRootPanel, growPanel, setDividerOffset } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { MISSIONS, missionById, missionState, placeContents, startMission } from '../src/easy/missions';
import { regenerate } from '../src/templates/registry';
import { capacity, compartments, contentFit } from '../src/easy/objects';
import { stickerRecipe } from '../src/easy/recipes';
import { STICKERS } from '../src/easy/stickers';
import { fitShape } from '../src/easy/guard';
import type { Design } from '../src/model/types';

beforeAll(() => {
  const buf = (f: string) => {
    const b = readFileSync(`public/fonts/${f}`);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  for (const f of FONTS) registerFont(f.id, buf(`${f.file}-hebrew-400-normal.woff`), buf(`${f.file}-latin-400-normal.woff`));
});

const PLY = MATERIALS.find((m) => m.id === 'ply-3')!;
const ok = (d: Design) => Object.fromEntries(missionState(d)!.goals.map((g) => [g.goal.id, g.ok]));
const wall = (d: Design, base: string, e: string) => Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === e)!.b.panelId;
function engrave(d: Design, panel: string, value: string) {
  const p = d.panels[panel];
  const id = addText(d, panel, p.w / 2, p.h / 2, value, 'engrave', 'rubik', 8)!;
  fitShape(d, id);
  solve(d);
}

/** The reference solution of each mission. */
const SOLVE: Record<string, (d: Design) => Design> = {
  'pencil-box': (d) => {
    // widen the pencils' compartment: the second divider moves out
    // milestone 44: a divider moves along its normal
    setDividerOffset(d, 't:divY2', dividerRow(d, 't:divY2')!.pos + 12);
    setDividerOffset(d, 't:divY1', dividerRow(d, 't:divY1')!.pos - 4);
    solve(d);
    const cells = compartments(d, 't:base');
    const big = [...cells].sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0))[0];
    d.contents![0] = { ...d.contents![0], x: (big.x0 + big.x1) / 2, y: (big.y0 + big.y1) / 2 };
    engrave(d, 't:wall0', 'Maya');
    return d;
  },
  'dice-tray': (d) => {
    const base = d.order[0];
    setPanelSize(d, base, 90, 90);
    solve(d);
    autoConnect(d);
    const cell = compartments(d, base)[0];
    d.contents![0] = { ...d.contents![0], x: (cell.x0 + cell.x1) / 2, y: (cell.y0 + cell.y1) / 2 };
    const w = wall(d, base, 'e0');
    const id = stickerRecipe(d, w, STICKERS[0].polys, d.panels[w].w / 2, d.panels[w].h / 2, 12)!;
    fitShape(d, id);
    solve(d);
    return d;
  },
  'card-stand': (d) => regenerate(d, { ...d.template!.params, cardThickness: 18, angle: 45, slots: 2, baseDepth: 220 }).design,
  'game-organiser': (d) => {
    const r = regenerate(d, { ...d.template!.params, dividersY: 1, lid: 'liftoff' }).design;
    // the student drags the deck into a compartment again
    r.contents = placeContents(r, [{ object: 'deck', count: 1 }, { object: 'dice', count: 5 }]);
    return r;
  },
};

describe('missions', () => {
  for (const m of MISSIONS) {
    it(`${m.id}: the starter meets some goals at most; the reference solution meets them all`, () => {
      const d = startMission(m, PLY);
      expect(d.mission).toEqual({ id: m.id, version: m.version });
      const start = missionState(d)!;
      expect(start.done).toBe(false);
      const solved = SOLVE[m.id](JSON.parse(JSON.stringify(d)));
      const end = missionState(solved)!;
      expect(ok(solved)).toEqual(Object.fromEntries(m.goals.map((g) => [g.id, true])));
      expect(end.stars).toBe(Math.min(3, new Set(m.goals.map((g) => g.group)).size));
      expect(end.done).toBe(true);
    });
  }
  it('the registry has the four first missions', () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(['pencil-box', 'dice-tray', 'card-stand', 'game-organiser']);
    expect(missionById('pencil-box')?.goals.length).toBeGreaterThan(2);
  });
});

describe('what goes inside', () => {
  const box = (W: number, D: number, H: number) => {
    const d = createDesign();
    setMaterial(d, PLY);
    const b = addRootPanel(d, 0, D, W, D);
    for (const e of [0, 1, 2, 3]) growPanel(d, b, e, { height: H, angle: 90, dir: 'up', kind: 'finger' });
    solve(d);
    autoConnect(d);
    return { d, b };
  };
  it('an object fits a compartment exactly when its footprint plus clearance is inside the clear inside', () => {
    const c = PLY.clearance, t = PLY.thickness;
    // a compartment exactly a deck plus clearance wide and deep (and tall enough)
    const W = 64 + 2 * c + 2 * t, D = 89 + 2 * c + 2 * t;
    const { d, b } = box(W, D, 40);
    const cells = compartments(d, b);
    expect(cells).toHaveLength(1);
    expect(cells[0].x1 - cells[0].x0).toBeCloseTo(64 + 2 * c, 6);
    const deck = { id: 'o', object: 'deck', baseId: b, x: W / 2, y: D / 2 };
    expect(contentFit(d, deck).ok).toBe(true);
    // half a millimetre narrower: it does not, and says by how much
    const n = box(W - 0.5, D, 40);
    const f = contentFit(n.d, { ...deck, baseId: n.b, x: (W - 0.5) / 2 });
    expect(f.ok).toBe(false);
    expect(f.need.w).toBeCloseTo(0.5, 6);
    // stacking: two decks need twice the height
    expect(capacity(d, cells[0], { w: 64, d: 89, h: 18 })).toBe(Math.floor((40 - t - c) / 18));
  });
});
