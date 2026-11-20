// the template registry first: the structures it lists import the checks, which import the registry
import '../src/templates/registry';
// Hand-built designs for the golden export tests (tests/golden.test.ts).
// `E(n)` names rectangle edge n (bottom 0, right 1, top 2, left 3).
import { addEdgeFlap, addLine, setLidHasps, addDetail, addDivider, addDividerLine, addRootPanel, addSideWalls, addText, autoConnect, connectSeams, createDesign, growPanel, setClosure, setConnection, setPanelSize, solve } from '../src/model/ops';
import { setArray } from '../src/model/edit';
import { MATERIALS } from '../src/model/materials';
import { sealOf } from '../src/model/closures';
import { setBoxLid, setCapRim } from '../src/easy/lid';
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


// ---------------------------------------------------------------------------
// Schema v6 designs (polygons, trays, through-cuts, fold-over, wall outlines),
// saved as project files before schema v7 (milestone 17).
import { addFoldOver, addPolygonPanel, addRoundPanel, addRoundedRect, addTray, addWallInsert, regularPolygon, setTrayKinds, updateFoldOver } from '../src/model/ops';
const [, CORR16] = MATERIALS;

/** Plywood hexagon tray with a through-cut chamfer on one wall and a hole in the base. */
export function v6PlyHexThrough(): Design {
  const d = createDesign(PLY);
  const base = addPolygonPanel(d, 0, 0, regularPolygon(6, 60))!;
  const tray = addTray(d, base, 45)!;
  autoConnect(d);
  const wall = d.order.find((id) => id === `${tray}/e1`)!;
  const w = d.panels[wall];
  addDetail(d, wall, 'rect', 'cut', w.w / 2, w.h, 20, 16, undefined, true);
  addDetail(d, base, 'circle', 'cut', d.panels[base].w / 2, d.panels[base].h / 2, 24, 24);
  autoConnect(d);
  return d;
}

/** Corrugated 1.6 tray: through tabs on the corners and a fold-over with lock tabs. */
export function v6CorrFoldover(): Design {
  const d = createDesign(CORR16);
  const base = addRootPanel(d, 0, 0, 140, 90);
  const tray = addTray(d, base, 50)!;
  autoConnect(d);
  setTrayKinds(d, tray, { tabLen: 'through' });
  const front = `${tray}/e0`;
  const fo = addFoldOver(d, front)!;
  updateFoldOver(d, front, fo, { lock: 'tabs' });
  autoConnect(d);
  return d;
}

/** Card tray with a gable wall and a roof grown from its slope. */
export function v6CardGable(): Design {
  const d = createDesign(CARD);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, E(e), { height: 50, angle: 90, dir: 'up', kind: 'fold' })!.panelId);
  autoConnect(d);
  addWallInsert(d, walls[0], 'e2', 0.5, 30);
  growPanel(d, walls[0], 'e2', { height: 40, angle: 90, dir: 'up', kind: 'fold' });
  autoConnect(d);
  return d;
}

/** A box (tray) with a lid folded off its back wall's top edge with a radius (milestone 63): a band of `radius`, or the material's own (plywood: a living hinge). */
export function bandLidBox(m: (typeof MATERIALS)[number], radius?: number, pattern?: 'perf' | 'wave' | 'diamond'): Design {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 120, 80);
  addTray(d, base, 60);
  autoConnect(d);
  const back = Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === E(2))!.b.panelId;
  const g = growPanel(d, back, E(2), { height: 80, angle: 90, dir: 'up', kind: 'fold' })!;
  if (radius !== undefined) setConnection(d, g.connectionId, { radius });
  if (pattern) setConnection(d, g.connectionId, { bend: { pattern } });
  solve(d);
  return d;
}

/** A tray on a rounded rectangle (milestone 64): its corners curved walls, glued (card) or one strip keyed shut (plywood). */
export function roundedTray(m: (typeof MATERIALS)[number], r: number): Design {
  const d = createDesign(m);
  const base = addRoundedRect(d, 0, 0, 140, 90, r)!;
  addTray(d, base, 45);
  autoConnect(d);
  return d;
}

/** A round box (milestone 65): a base with a seam flat, one wall on it, its band all round. */
export function roundBoxDesign(m: (typeof MATERIALS)[number], shape: 'circle' | 'oval', w: number, h: number): Design {
  const d = createDesign(m);
  const base = addRoundPanel(d, 0, 0, w, h, { shape })!;
  addTray(d, base, 45);
  autoConnect(d);
  return d;
}

/** A tray with a lid folded off its back wall to the front wall's inside face (milestone 67): its closure in the given style. */
export function closedBox(m: (typeof MATERIALS)[number], style?: 'tuck' | 'tuckLock' | 'tab' | 'glued', thumb = false): Design {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 120, 80);
  addTray(d, base, 50);
  autoConnect(d);
  const back = Object.values(d.connections).find((c) => c.grown && c.a.panelId === base && c.a.edge === E(2))!.b.panelId;
  const g = growPanel(d, back, E(2), { height: 60, angle: 90, dir: 'up', kind: 'fold' })!;
  solve(d);
  const L = d.panels[g.panelId];
  for (const h of [70, 74, 76, 77, 78, 79, 80]) {
    L.h = h;
    const s = sealOf(d, g.panelId);
    if (s) {
      setPanelSize(d, g.panelId, undefined, s.yIn);
      break;
    }
  }
  autoConnect(d);
  if (style || thumb) setClosure(d, g.panelId, { ...(style ? { style } : {}), thumb });
  return d;
}

/** A carton (milestone 68): since milestone 96 the sentence's own builder (SENTENCE_BUILDER_PLAN.md S3), so the goldens prove it unchanged. */
export { cartonDesign } from '../src/templates/structures/carton';

/** A card tray with slit-lock corners (milestone 68). */
export function lockTray(): Design {
  const d = createDesign(MATERIALS[0]);
  const base = addRootPanel(d, 0, 0, 100, 70);
  addTray(d, base, 40, { cornerKind: 'lock' });
  autoConnect(d);
  return d;
}

/** A box with a lid of its own (milestone 79): a Flat lid (tabs through its slots), or a cap with a full rim. */
export function lidKindBox(m: (typeof MATERIALS)[number], style: 'flat' | 'capFull'): Design {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const tray = addTray(d, base, 50)!;
  autoConnect(d);
  setBoxLid(d, tray, 'liftoff', style === 'flat' ? 'flat' : 'cap');
  if (style === 'capFull') setCapRim(d, tray, 'full');
  return d;
}

/** A box with two dividers and a Drop-in lid resting on them (milestone 80). */
export function dropinBox(m: (typeof MATERIALS)[number]): Design {
  const d = createDesign(m);
  const base = addRootPanel(d, 0, 0, 160, 110);
  const tray = addTray(d, base, 45)!;
  autoConnect(d);
  addDividerLine(d, base, { x: 10, y: 55 }, { x: 150, y: 55 }, 35);
  addDividerLine(d, base, { x: 80, y: 10 }, { x: 80, y: 100 }, 35);
  autoConnect(d);
  setBoxLid(d, tray, 'liftoff', 'dropin');
  return d;
}

/** A plywood box with a Flat lid and two padlock hasps (milestone 82). */
export function haspBox(): Design {
  const d = lidKindBox(MATERIALS[3], 'flat');
  const L = d.order.map((id) => d.panels[id]).find((p) => p.lidOf)!;
  setLidHasps(d, L.id, 2);
  return d;
}

/** A card board with one line of each type, straight and arced (milestone 83). */
export function linesBoard(): Design {
  const d = createDesign(MATERIALS[0]);
  const p = addRootPanel(d, 0, 0, 120, 90);
  addLine(d, p, [{ x: 10, y: 10 }, { x: 50, y: 10 }], 'cut');
  addLine(d, p, [{ x: 10, y: 25, bulge: 0.4 }, { x: 110, y: 25 }], 'crease');
  addLine(d, p, [{ x: 10, y: 45 }, { x: 110, y: 45 }], 'perf');
  addLine(d, p, [{ x: 10, y: 60, bulge: -0.3 }, { x: 110, y: 60 }], 'cutcrease');
  addLine(d, p, [{ x: 10, y: 80 }, { x: 110, y: 80 }], 'guide');
  solve(d);
  return d;
}

/** A card board with two plain flaps made by hand (milestone 67), one 15 mm and one of the default length (milestone 111's golden, made before the edge-feature registry). */
export function plainFlapBoard(): Design {
  const d = createDesign(CARD);
  const p = addRootPanel(d, 0, 0, 80, 50);
  addEdgeFlap(d, p, 'e2', 15);
  addEdgeFlap(d, p, 'e1');
  return d;
}
