// Hand-built designs for the golden export tests (tests/golden.test.ts).
// `E(n)` names rectangle edge n (bottom 0, right 1, top 2, left 3).
import { addDetail, addDivider, addRootPanel, addSideWalls, addText, autoConnect, connectSeams, createDesign, growPanel, setPanelSize } from '../src/model/ops';
import { setArray } from '../src/model/edit';
import { MATERIALS } from '../src/model/materials';
import type { Design } from '../src/model/types';

const [CARD, , CORR4, PLY] = MATERIALS;
const E = (n: number) => `e${n}`;

/** Plywood box by hand: finger corners, a shelf grown from a wall, dividers with a half-lap, cutouts, text, an array, a score. */
export function plyBox(): Design {
  const d = createDesign(PLY);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, E(e), { height: 50, angle: 90, dir: 'up', kind: 'finger' })!.panelId);
  autoConnect(d);
  addDivider(d, base, E(0), 40, 35);
  addDivider(d, base, E(3), 60, 35);
  autoConnect(d);
  growPanel(d, walls[2], E(2), { height: 30, angle: 90, dir: 'up', kind: 'finger' });
  autoConnect(d);
  setPanelSize(d, walls[0], 130, undefined);
  addDetail(d, walls[0], 'circle', 'cut', 65, 25, 20, 20);
  addDetail(d, walls[0], 'roundrect', 'engrave', 30, 15, 24, 10);
  const arr = addDetail(d, walls[1], 'rect', 'cut', 15, 20, 6, 4)!;
  setArray(d, arr, { nx: 3, ny: 2, dx: 12, dy: 10 });
  addDetail(d, base, 'rect', 'score', 30, 30, 20, 10);
  addText(d, walls[2], 60, 25, 'שלום Box 7', 'engrave', 'rubik', 8);
  addText(d, walls[3], 40, 30, 'A', 'cut', 'frank', 12);
  autoConnect(d);
  return d;
}

/** Card tray folded from the base with glue-flap corners, a second-level fold, a 60° glued panel, a score shape. */
export function cardTray(): Design {
  const d = createDesign(CARD);
  const base = addRootPanel(d, 0, 0, 80, 60);
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, E(e), { height: 30, angle: 90, dir: 'up', kind: 'fold' })!.panelId);
  autoConnect(d);
  growPanel(d, walls[0], E(2), { height: 15, angle: 90, dir: 'up', kind: 'fold' });
  autoConnect(d);
  const other = addRootPanel(d, 200, 0, 60, 40);
  growPanel(d, other, E(0), { height: 30, angle: 60, dir: 'up', kind: 'glue' });
  addDetail(d, base, 'rect', 'score', 40, 30, 30, 20);
  addDetail(d, walls[1], 'circle', 'cut', 30, 15, 8, 8);
  autoConnect(d);
  return d;
}

/** Plywood leaning panel held by side walls, a tab-and-slot wall, a panel grown downwards and one at 120° (butt). */
export function plyLean(): Design {
  const d = createDesign(PLY);
  const base = addRootPanel(d, 0, 0, 100, 80);
  addSideWalls(d, base, E(0), 30, 60);
  growPanel(d, base, E(0), { height: 60, angle: 30, dir: 'up', kind: 'lean' });
  growPanel(d, base, E(2), { height: 40, angle: 90, dir: 'up', kind: 'tabslot' });
  autoConnect(d);
  const b2 = addRootPanel(d, 300, 0, 80, 50);
  growPanel(d, b2, E(1), { height: 30, angle: 90, dir: 'down', kind: 'finger' });
  growPanel(d, b2, E(3), { height: 25, angle: 60, dir: 'down', kind: 'butt' });
  autoConnect(d);
  return d;
}

/** Corrugated tray with sliding dividers crossing (half-lap) and a plain edge-to-edge panel. */
export function corrDividers(): Design {
  const d = createDesign(CORR4);
  const base = addRootPanel(d, 0, 0, 150, 100);
  for (const e of [0, 1, 2, 3]) growPanel(d, base, E(e), { height: 40, angle: 90, dir: 'up', kind: 'fold' });
  autoConnect(d);
  addDivider(d, base, E(0), 50, 30);
  addDivider(d, base, E(3), 75, 30);
  autoConnect(d);
  const p = addRootPanel(d, 300, 0, 70, 50);
  const w = growPanel(d, p, E(0), { height: 30, angle: 90, dir: 'up', kind: 'butt' })!.panelId;
  connectSeams(d, w);
  addDetail(d, p, 'roundrect', 'cut', 35, 25, 30, 14);
  autoConnect(d);
  return d;
}

