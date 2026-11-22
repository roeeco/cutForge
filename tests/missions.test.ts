// Missions and what goes inside (milestone 40).
import { dividerRow } from '../src/model/dividers';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FONTS } from '../src/text/fonts';
import { registerFont } from '../src/text/registerFont';
import { addDetail, setLidHasps, addText, autoConnect, createDesign, parentConnection, setMaterial, solve, setPanelSize, addRootPanel, growPanel, setDividerOffset } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { boxLid, setBoxLid } from '../src/easy/lid';
import { MISSIONS, missionById, missionState, placeContents, startMission } from '../src/easy/missions';
import { defaults, generate, regenerate, templateById } from '../src/templates/registry';
import { addSpaces, frontWall, mainTray } from '../src/templates/structures/box';
import { dividerLine } from '../src/easy/recipes';
import { dividersOn } from '../src/model/dividers';
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
    // version 2 (milestone 106): widen the pencils' space by sliding the two dividers apart
    const tray = mainTray(d)!;
    const base = d.trays[tray].baseId;
    const [a, b] = [...dividersOn(d, base)].sort((x, y) => dividerRow(d, x)!.pos - dividerRow(d, y)!.pos);
    setDividerOffset(d, b, dividerRow(d, b)!.pos + 12);
    setDividerOffset(d, a, dividerRow(d, a)!.pos - 4);
    solve(d);
    const cells = compartments(d, base);
    const big = [...cells].sort((x, y) => y.y1 - y.y0 - (x.y1 - x.y0))[0];
    d.contents![0] = { ...d.contents![0], x: (big.x0 + big.x1) / 2, y: (big.y0 + big.y1) / 2 };
    engrave(d, frontWall(d, tray)!, 'Maya');
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
    // version 2: a divider from side to side makes four spaces; a lid that lifts off
    const tray = mainTray(d)!;
    const base = d.trays[tray].baseId;
    const b = d.panels[base], t = d.material.thickness;
    dividerLine(d, base, { x: t + 1, y: b.h / 2 }, { x: b.w - t - 1, y: b.h / 2 });
    setBoxLid(d, tray, 'liftoff');
    solve(d);
    // the student drags the deck into a compartment again
    d.contents = placeContents(d, [{ object: 'deck', count: 1 }, { object: 'dice', count: 5 }]);
    return d;
  },
  // milestone 82: a Flat lid with one hasp, a clue engraved on the front wall
  'escape-box': (d) => {
    const tray = Object.keys(d.trays)[0];
    setBoxLid(d, tray, 'liftoff', 'flat');
    const lid = boxLid(d, tray);
    if (lid.kind === 'liftoff') setLidHasps(d, lid.top, 1);
    engrave(d, wall(d, d.trays[tray].baseId, 'e0'), 'Look under');
    return d;
  },
  // milestones 178 (part 2) and 179: boxes.py's challenges
  'wall-tray': (d) => {
    // six spaces, three across and two front to back; the dice into one of them
    const tray = mainTray(d)!;
    addSpaces(d, tray, { spacesBy: 'count', nx: 3, ny: 2 });
    solve(d);
    d.contents = placeContents(d, [{ object: 'dice', count: 3 }]);
    engrave(d, frontWall(d, tray)!, 'Ori');
    return d;
  },
  'card-box': (d) => {
    const tray = mainTray(d)!;
    addSpaces(d, tray, { spacesBy: 'count', nx: 2, ny: 1 });
    solve(d);
    d.contents = placeContents(d, [{ object: 'deck', count: 1 }]);
    engrave(d, frontWall(d, tray)!, 'Noa');
    return d;
  },
  'display-case': (d) => {
    const tray = mainTray(d)!;
    const front = frontWall(d, tray)!;
    const p = d.panels[front];
    addDetail(d, front, 'rect', 'cut', p.w / 2, p.h * 0.45, p.w * 0.5, p.h * 0.4);
    engrave(d, wall(d, d.trays[tray].baseId, 'e1'), 'Dan');
    solve(d);
    return d;
  },
  'traffic-light': (d) => {
    const tray = mainTray(d)!;
    const front = frontWall(d, tray)!;
    const p = d.panels[front];
    for (const k of [0.25, 0.5, 0.75]) addDetail(d, front, 'circle', 'cut', p.w / 2, p.h * k, 36, 36);
    const w = wall(d, d.trays[tray].baseId, 'e1');
    const id = stickerRecipe(d, w, STICKERS[0].polys, d.panels[w].w / 2, d.panels[w].h / 2, 12)!;
    fitShape(d, id);
    solve(d);
    return d;
  },
  'sbc-rack': (d) => {
    // a Raspberry Pi's four holes (58 × 49 mm apart, M2.5) in the second shelf
    const s = d.panels['t:shelf-2'];
    for (const [dx, dy] of [[-29, -24.5], [29, -24.5], [-29, 24.5], [29, 24.5]]) addDetail(d, s.id, 'circle', 'cut', s.w / 2 + dx, s.h / 2 + dy, 2.7, 2.7);
    solve(d);
    return d;
  },
  'game-insert': (d) => {
    // six spaces, three across and two front to back (a deck lies across in one); a lid that lifts off; the deck and dice put in
    const tray = mainTray(d)!;
    addSpaces(d, tray, { spacesBy: 'count', nx: 3, ny: 2 });
    setBoxLid(d, tray, 'liftoff');
    solve(d);
    d.contents = placeContents(d, [{ object: 'deck', count: 1 }, { object: 'dice', count: 8 }]);
    return d;
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
  it('a saved version-1 Pencil box (the organiser template) still opens and its goals count (milestone 106)', () => {
    const tp = templateById('organiser')!;
    const v1 = generate(tp, PLY, { ...defaults(tp), sizeMode: 'inner', width: 186, depth: 60, height: 30, dividersX: 0, dividersY: 2, dividerHeight: 24, lid: 'none' });
    v1.mission = { id: 'pencil-box', version: 1 };
    v1.contents = placeContents(v1, [{ object: 'pencil', count: 12 }]);
    const st = missionState(v1)!;
    expect(st.goals.filter((g) => g.ok).map((g) => g.goal.id).sort()).toEqual(['compartments-3', 'one-sheet', 'ready']);
    // and with its dividers moved as version 1 was solved
    setDividerOffset(v1, 't:divY2', dividerRow(v1, 't:divY2')!.pos + 12);
    setDividerOffset(v1, 't:divY1', dividerRow(v1, 't:divY1')!.pos - 4);
    solve(v1);
    const cells = compartments(v1, 't:base');
    const big = [...cells].sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0))[0];
    v1.contents![0] = { ...v1.contents![0], x: (big.x0 + big.x1) / 2, y: (big.y0 + big.y1) / 2 };
    expect(ok(v1)['fits-pencil']).toBe(true);
  });

  it('version 2 of Pencil box and Game organiser are boxes with the goals version 1 started with', () => {
    for (const m of MATERIALS.slice(0, 4)) {
      const p = startMission(missionById('pencil-box')!, m);
      expect(mainTray(p)).not.toBeNull();
      expect(missionState(p)!.goals.filter((g) => g.ok).map((g) => g.goal.id).sort()).toEqual(['compartments-3', 'one-sheet', 'ready']);
      const o = startMission(missionById('game-organiser')!, m);
      expect(mainTray(o)).not.toBeNull();
      expect(missionState(o)!.goals.filter((g) => g.ok).map((g) => g.goal.id).sort()).toEqual(['fits-deck', 'one-sheet', 'ready']);
    }
  });

  it('the registry has the four first missions and the Escape box', () => {
    // milestones 178 (part 2) and 179: boxes.py's challenges after them
    expect(MISSIONS.map((m) => m.id)).toEqual(['pencil-box', 'dice-tray', 'card-stand', 'game-organiser', 'escape-box', 'wall-tray', 'card-box', 'display-case', 'traffic-light', 'sbc-rack', 'game-insert']);
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
