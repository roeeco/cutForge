// Cards built on parts (milestone 183, BOXES_PLYWOOD_PLAN.md E10), plywood only. Constructions read in boxes.py (a
// behaviour reference only: THIRD_PARTY.md) and written fresh over the box kit (boards.ts), free boards and the parts'
// outlines (`model/parts.ts`):
//   a gearbox     an open box of boards, two axles through its front and back, and gear stages on them (gearbox): each
//                 stage a pinion meshing a gear; a gear and the next stage's pinion on one axle are glued face to face
//                 through a spacer ring, so they turn together; the stages alternate between the axles, and the gears
//                 at either end each have a ring glued on, a spacer off the wall;
//   a game board  a box with a lid that lifts off, the Royal Game of Ur's twenty squares engraved on the lid, its
//                 rosettes marked, and in the box a tray for the tokens glued on its base: its fourteen round holes are
//                 where the tokens were cut out of it (royalgame).
import type { Design, P2 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { addDetail, addFreePanel, addPartShape, connectSeams, solve } from '../../model/ops';
import { toLocal } from '../../model/frame';
import { boxLid, setBoxLid } from '../../easy/lid';
import { circlePoly, gearCentres, gearCircles, gearOutline } from '../../model/parts';
import { boardBoxRect, plywoodOnly } from './boards';
import { cleanAll, mainTray } from './box';
import { nameAll, sheetLimits, wallsOf } from './shaped';
import { insideOf } from './boardBoxes';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'int', min, max, default: dflt });

const plywood: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'box',
};

// --- the gearbox ---

/** Room round the gears inside the box, and between the gear stacks and the front and back walls (mm). */
const GEAR_ROOM = 3, WALL_PLAY = 1;
/** How much further apart than standard a gear pair is set (mm): room for the laser's kerf and the plywood's roughness. */
export const MESH_PLAY = 0.3;
/** A gear's backlash at its pitch circle (mm). */
const BACKLASH = 0.2;
/** A bore's play round its axle, so a gear stack turns on it (mm); the walls hold the axles snug. */
const BORE_PLAY = 0.4;

/** A gearbox's sizes, from its words: the gears' circles, the axles' spacing, and the box's inside. */
export function gearboxSizes(p: Params, t: number) {
  const m = Number(p.module), z1 = Math.round(Number(p.pinion)), z2 = Math.round(Number(p.gear)), n = Math.round(Number(p.stages));
  const shaft = Number(p.shaft);
  const pin = gearCircles(m, z1), big = gearCircles(m, z2);
  const a = gearCentres(m, z1, z2) + MESH_PLAY;
  // a spacer ring: round the axle, inside the pinion's root (so the other axle's gears clear it)
  const ring = Math.min(shaft / 2 + 4, pin.rf - 1);
  const layers = 2 * n + 1;
  const inW = a + 2 * big.ra + 2 * GEAR_ROOM, inD = layers * t + 2 * WALL_PLAY, inH = 2 * big.ra + 2 * GEAR_ROOM;
  return { m, z1, z2, n, shaft, pin, big, a, ring, layers, inW, inD, inH };
}

/** Why a gearbox's words do not make one: the pinion too small for its axle and spacer, or the gear no bigger than the pinion. */
const gearboxWhy = (p: Params, t: number): MsgKey | null => {
  const s = gearboxSizes(p, t);
  if (s.z2 <= s.z1) return 'sen.why.gearSmall';
  if (s.ring < Number(p.shaft) / 2 + 1.5 || s.a - s.big.ra < s.ring + 1) return 'sen.why.pinionBore';
  return null;
};

function generateGearbox(d: Design, p: Params, role: Role) {
  const t = d.material.thickness;
  const s = gearboxSizes(p, t);
  if (gearboxWhy(p, t)) return;
  if (!boardBoxRect(d, s.inW + 2 * t, s.inD + 2 * t, s.inH + t)) return;
  const ins = insideOf(d);
  if (!ins) return;
  const w = wallsOf(d);
  const xs = [-s.a / 2, s.a / 2], y = ins.floor + GEAR_ROOM + s.big.ra;
  // the axles' holes through the front and back walls, snug
  for (const wall of [w.e0, w.e2]) {
    const P = wall ? d.panels[wall] : undefined;
    if (!P) continue;
    for (const x of xs) {
      const l = toLocal(P.frame, [x, y, wall === w.e0 ? ins.zF + t / 2 : ins.zB - t / 2]);
      addDetail(d, P.id, 'circle', 'cut', l.x, l.y, s.shaft, s.shaft);
    }
  }
  // the gear stacks, layer by layer from the back: each board in the x–y plane, its material towards the front
  const ids: string[] = [], names: string[] = [];
  const bore = circlePoly(0, 0, (s.shaft + BORE_PLAY) / 2, 32);
  const board = (layer: number, axle: number, outer: P2[], name: string) => {
    const z = ins.zB + WALL_PLAY + layer * t;
    const id = addFreePanel(d, { frame: { o: [xs[axle], y, z], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer, holes: [bore] });
    if (id) {
      ids.push(id);
      names.push(name);
    }
  };
  const turn = (q: P2[], a: number) => q.map((v) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) }));
  const pinion = gearOutline(s.m, s.z1, 20, BACKLASH), gear = gearOutline(s.m, s.z2, 20, BACKLASH), ring = circlePoly(0, 0, s.ring, 32);
  // the input pinion's ring, then each stage: its pinion on one axle meshing its gear on the other, a tooth of the
  // pinion into a space of the gear on the line between them
  board(0, 0, ring, 'ring-0');
  for (let k = 0; k < s.n; k++) {
    const pa = k % 2, ga = 1 - pa, layer = 2 * k + 1;
    const dir = ga > pa ? 0 : Math.PI;
    board(layer, pa, turn(pinion, dir), `pinion-${k + 1}`);
    board(layer, ga, turn(gear, dir + Math.PI + Math.PI / s.z2), `gear-${k + 1}`);
    // the ring that glues this gear to the next stage's pinion (or, after the last, a spacer off the wall)
    board(layer + 1, ga, ring, `ring-${k + 1}`);
  }
  solve(d);
  for (const id of ids) connectSeams(d, id);
  solve(d);
  const first: Record<string, string> = {};
  ids.forEach((id, i) => (first[names[i]] = id));
  nameAll(d, role, first);
}

export const gearbox: TemplateDef = {
  ...plywood,
  id: 'gearbox',
  name: 'sen.gearbox',
  description: 'sen.gearbox.desc',
  word: 'sen.gearbox',
  params: [
    int('stages', 'sen.stages', 1, 3, 2),
    int('pinion', 'sen.pinionTeeth', 10, 20, 10),
    int('gear', 'sen.gearTeeth', 16, 48, 24),
    num('module', 'sen.gearModule', 1.5, 4, 2.5),
    num('shaft', 'sen.shaft', 3, 8, 6),
  ],
  generate: generateGearbox,
  sentence: { main: 'sen.s.gearbox' },
};
gearbox.limits = (m, p) => {
  const out = sheetLimits(gearbox, { gear: 16, module: 1.5 })(m, p);
  // the pinion smaller than the gear
  Object.defineProperty(out, 'pinion', { enumerable: true, value: { max: Math.max(10, Math.min(20, Math.round(Number(p.gear)) - 1)), why: 'sen.why.gearSmall' as MsgKey } });
  return out;
};
gearbox.accepts = (m, p) => gearboxWhy(p, m.thickness) ?? (cleanAll(gearbox, m, p) ? null : 'sen.why.engineSize');

// --- the game board ---

/** The Royal Game of Ur's board: 3 rows of 8, the outer rows without their 5th and 6th squares; its five rosettes. */
export const UR_SQUARES: [number, number][] = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if (r === 1 || c < 4 || c > 5) UR_SQUARES.push([c, r]);
const ROSETTES = new Set(['0,0', '0,2', '3,1', '6,0', '6,2']);
/** Tokens: seven a player. */
export const TOKENS = 14;

function generateGameBoard(d: Design, p: Params, role: Role) {
  const S = Number(p.square), H = Number(p.height), t = d.material.thickness;
  const tr = boardBoxRect(d, 8 * S + 2 * t, 3 * S + 2 * t, H);
  if (!tr) return;
  setBoxLid(d, tr, 'liftoff');
  solve(d);
  // the board on the lid's top: each square engraved a little inside its cell, a rosette a ring in its square
  const lid = boxLid(d, mainTray(d)!);
  const top = lid.kind === 'liftoff' ? d.panels[lid.top] : undefined;
  if (top) {
    const x0 = top.w / 2 - 4 * S, y0 = top.h / 2 - 1.5 * S;
    for (const [c, r] of UR_SQUARES) {
      const cx = x0 + (c + 0.5) * S, cy = y0 + (r + 0.5) * S;
      addDetail(d, top.id, 'rect', 'engrave', cx, cy, S - 3, S - 3);
      if (ROSETTES.has(`${c},${r}`)) addPartShape(d, top.id, { kind: 'knob', p: { style: 'wavy', diameter: S * 0.6, bites: 8, depth: S * 0.08, bore: 0 } }, cx, cy, 'score');
    }
  }
  // the tokens' tray, glued on the base inside the walls: two rows of seven holes, the tokens cut out of them
  const ins = insideOf(d);
  if (ins) {
    const w = ins.xR - ins.xL - 2, dd = ins.zF - ins.zB - 2;
    const tray = addFreePanel(d, { frame: { o: [ins.xL + 1, ins.floor, ins.zF - 1], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: dd }, { x: 0, y: dd }] });
    if (tray) {
      const tok = tokenSize(S);
      const pitch = w / 7;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 7; c++) addDetail(d, tray, 'circle', 'cut', (c + 0.5) * pitch, dd / 2 + (r - 0.5) * (tok + 3), tok, tok);
      solve(d);
      connectSeams(d, tray);
      solve(d);
      nameAll(d, role, { tokens: tray });
      return;
    }
  }
  nameAll(d, role);
}

/** A token's diameter on a board of `S` mm squares. */
export const tokenSize = (S: number) => Math.round(S * 0.75);

export const gameBoard: TemplateDef = {
  ...plywood,
  id: 'gameBoard',
  name: 'sen.gameBoard',
  description: 'sen.gameBoard.desc',
  word: 'sen.gameBoard',
  params: [
    num('square', 'sen.square', 25, 50, 30),
    num('height', 'sen.height', 35, 80, 40),
  ],
  generate: generateGameBoard,
  sentence: { main: 'sen.s.gameBoard' },
};
gameBoard.limits = sheetLimits(gameBoard, { square: 25, height: 35 });
gameBoard.accepts = (m, p) => (cleanAll(gameBoard, m, p) ? null : 'sen.why.engineSize');
