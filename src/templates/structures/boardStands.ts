// Boards that stand at a slant (milestone 166, BOXES_PRESETS_PLAN.md §3): boards of their own held by tabs in angled
// slots, for plywood and 4 mm corrugated only (`boardStock`). Constructions read in boxes.py (a behaviour reference
// only) and written fresh over free boards, as the dice tower's baffles are (milestone 157).
//   a desk sign       a plate leaning back on two triangular feet slotted onto its back (desksign);
//   a slanted shelf   two sides with shelves tilted back between them, a lip at each shelf's front (displayshelf,
//                     cardholder).
import type { Design, P2, V3 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { addFreePanel, connectSeams, solve } from '../../model/ops';
import { boardStock } from './boards';
import { cleanAll } from './box';
import { sheetLimits } from './shaped';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'int', min, max, default: dflt });
const rad = (deg: number) => (deg * Math.PI) / 180;

const boards: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood', 'corrugated'],
  canMake: boardStock,
  fallback: () => 'stand',
};

/** Join every board to the boards it meets, then name them. */
function joinAll(d: Design, ids: (string | null)[], role: Role, names: string[]) {
  solve(d);
  for (const id of ids) if (id) connectSeams(d, id);
  solve(d);
  ids.forEach((id, i) => id && role(names[i] ?? `part-${i + 1}`, id));
}

// --- the desk sign ---

function generateDeskSign(d: Design, p: Params, role: Role) {
  const W = Number(p.width), H = Number(p.height), a = rad(90 - Number(p.lean));
  const t = d.material.thickness;
  // the plate: its foot on the floor at the front (z = 0), leaning back at `lean` from upright, its back face the one
  // the feet stand on; v runs up the plate and back
  const v: V3 = [0, Math.sin(a), -Math.cos(a)];
  const plate = addFreePanel(d, { frame: { o: [-W / 2, 0, 0], u: [1, 0, 0], v }, side: 1, outer: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }] });
  // the feet: triangles standing front to back behind the plate, a quarter in from each end. The plate lies on the
  // front side of its plane (along u × v), so its back face is the plane itself: each foot's edge from the floor at
  // the front up to `reach` along the plate lies in it, and its floor edge runs on behind, past that edge's top
  const reach = H * 0.8;
  const top = reach * Math.sin(a), back = reach * Math.cos(a);
  const foot: P2[] = [{ x: 0, y: 0 }, { x: back + top * 0.35, y: 0 }, { x: back, y: top }];
  const feet = [-1, 1].map((s) => addFreePanel(d, { frame: { o: [s * (W / 4) - t / 2, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: foot }));
  joinAll(d, [plate, ...feet], role, ['plate', 'foot-1', 'foot-2']);
}

export const deskSign: TemplateDef = {
  ...boards,
  id: 'deskSign',
  name: 'sen.deskSign',
  description: 'sen.deskSign.desc',
  word: 'sen.deskSign',
  params: [
    num('width', 'sen.width', 80, 300, 200),
    num('height', 'sen.height', 40, 150, 70),
    { key: 'lean', label: 'sen.leanBack', type: 'choice', options: ([15, 20, 30] as const).map((x) => ({ value: x, label: `sen.lean${x}` as MsgKey })), default: 20 },
  ],
  generate: generateDeskSign,
  sentence: { main: 'sen.s.deskSign' },
};
deskSign.limits = sheetLimits(deskSign, { width: 80, height: 40 });
deskSign.accepts = (m, p) => (cleanAll(deskSign, m, p) ? null : 'sen.why.engineSize');

// --- the slanted shelf ---

function generateSlantedShelf(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height), t = d.material.thickness;
  const n = Math.round(Number(p.tiers)), tilt = rad(Number(p.tilt));
  const ids: (string | null)[] = [], names: string[] = [];
  // the sides, front to back, their inner faces W apart
  const side: P2[] = [{ x: 0, y: 0 }, { x: D, y: 0 }, { x: D, y: H }, { x: 0, y: H }];
  ids.push(addFreePanel(d, { frame: { o: [-W / 2 - t, 0, D / 2], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: side }));
  ids.push(addFreePanel(d, { frame: { o: [W / 2, 0, D / 2], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: side }));
  names.push('side-1', 'side-2');
  // the tiers: tilted back, each its front a web in from the sides' front edge, the lowest a little above the floor,
  // the highest a web below their tops; each run as far back as the sides reach, less a web
  const web = Math.max(3 * t, 6);
  const run = D - 2 * web;
  const len = run / Math.cos(tilt), drop = run * Math.tan(tilt);
  const lowest = 15, highest = H - web - drop - t;
  for (let k = 0; k < n; k++) {
    const yFront = n === 1 ? lowest : lowest + ((highest - lowest) * k) / (n - 1);
    // v runs from the front edge back and up
    const v: V3 = [0, Math.sin(tilt), -Math.cos(tilt)];
    ids.push(addFreePanel(d, { frame: { o: [-W / 2, yFront, D / 2 - web], u: [1, 0, 0], v }, side: 1, outer: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: len }, { x: 0, y: len }] }));
    names.push(`tier-${k + 1}`);
  }
  joinAll(d, ids, role, names);
}

export const slantedShelf: TemplateDef = {
  ...boards,
  id: 'slantedShelf',
  name: 'sen.slantedShelf',
  description: 'sen.slantedShelf.desc',
  word: 'sen.slantedShelf',
  params: [
    num('width', 'sen.width', 60, 300, 160),
    num('depth', 'sen.depth', 60, 250, 120),
    num('height', 'sen.height', 80, 300, 200),
    int('tiers', 'sen.tiers', 2, 5, 3),
    { key: 'tilt', label: 'sen.tilt', type: 'choice', options: ([10, 15, 20, 25] as const).map((x) => ({ value: x, label: `sen.tilt${x}` as MsgKey })), default: 15 },
  ],
  generate: generateSlantedShelf,
  sentence: { main: 'sen.s.slantedShelf' },
};
slantedShelf.limits = sheetLimits(slantedShelf, { width: 60, depth: 60, height: 80 });
slantedShelf.accepts = (m, p) => (cleanAll(slantedShelf, m, p) ? null : 'sen.why.engineSize');
