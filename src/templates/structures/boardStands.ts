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
import { cleanAll, cleanWith } from './box';
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

/**
 * A word on the slanted shelf from milestone 172, offered on plywood only, off at its first value (an add-on). `room`
 * says why a value has no room (null when it has).
 */
function plyWord(key: string, label: MsgKey, values: readonly (string | number)[], room: (v: string | number, p: Params) => MsgKey | null): ParamDef {
  return {
    key, label, type: 'choice', default: values[0], addon: { off: values[0] },
    options: values.map((v) => ({ value: v, label: `${label}.${v}` as MsgKey })),
    allowed: (v, p, m) => v === values[0] || (m.kind === 'plywood' && !room(v, p) && cleanWith(slantedShelf, m, p, key, v)),
    why: (v, p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : room(v, p) ?? 'sen.why.engine'),
  };
}

/** A tier's lip heights on offer (mm above its top face). */
const LIPS = [10, 20, 30] as const;

function generateSlantedShelf(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height), t = d.material.thickness;
  const n = Math.round(Number(p.tiers)), tilt = rad(Number(p.tilt));
  // milestone 172 (DisplayShelf's words, plywood): a lip at each tier's front, spaces across each tier, a back, sides
  // cut back along the tiers; a design saved before has none of them
  const lip = p.lip && p.lip !== 'none' ? Number(p.lip) : 0;
  const spaces = Math.max(1, Math.round(Number(p.spaces ?? 1)));
  const back = p.back === 'back', sloped = p.slope === 'sloped';
  const ids: (string | null)[] = [], names: string[] = [];
  // the tiers: tilted back, each its front a web in from the sides' front edge, the lowest a little above the floor,
  // the highest a web below their tops; each run as far back as the sides reach, less a web (and the back's board)
  const web = Math.max(3 * t, 6);
  const run = D - 2 * web - (back ? t : 0);
  const len = run / Math.cos(tilt), drop = run * Math.tan(tilt);
  const lowest = 15, highest = H - web - drop - t;
  const fronts: number[] = [];
  for (let k = 0; k < n; k++) fronts.push(n === 1 ? lowest : lowest + ((highest - lowest) * k) / (n - 1));
  // the sides, front to back, their inner faces W apart; sloped, their front cut back from just above the top tier's
  // lip along the tiers' slant
  let side: P2[] = [{ x: 0, y: 0 }, { x: D, y: 0 }, { x: D, y: H }, { x: 0, y: H }];
  if (sloped) {
    const yf = fronts[n - 1] + t + Math.max(lip, 10) + web;
    const xs = Math.min(D - web, (H - yf) / Math.tan(Math.max(tilt, rad(10))));
    if (yf < H - 5 && xs > 5) side = [{ x: 0, y: 0 }, { x: D, y: 0 }, { x: D, y: H }, { x: xs, y: H }, { x: 0, y: yf }];
  }
  ids.push(addFreePanel(d, { frame: { o: [-W / 2 - t, 0, D / 2], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: side }));
  ids.push(addFreePanel(d, { frame: { o: [W / 2, 0, D / 2], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: side }));
  names.push('side-1', 'side-2');
  // v runs from a tier's front edge back and up; n, its upper face's normal, up and forward
  const v: V3 = [0, Math.sin(tilt), -Math.cos(tilt)];
  const nUp: V3 = [0, Math.cos(tilt), Math.sin(tilt)];
  const sw = (W - (spaces - 1) * t) / spaces;
  for (let k = 0; k < n; k++) {
    const o: V3 = [-W / 2, fronts[k], D / 2 - web];
    ids.push(addFreePanel(d, { frame: { o, u: [1, 0, 0], v }, side: 1, outer: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: len }, { x: 0, y: len }] }));
    names.push(`tier-${k + 1}`);
    if (lip) {
      // standing square to the tier at its front, over its front end, as tall as the tier and the lip, and a skirt
      // below the tier so the tier's slots in it have board round them
      const sk = Math.max(3, t) + 1;
      const lo: V3 = [o[0], o[1] - nUp[1] * sk, o[2] - nUp[2] * sk];
      ids.push(addFreePanel(d, { frame: { o: lo, u: [1, 0, 0], v: nUp }, side: 1, outer: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: sk + t + lip }, { x: 0, y: sk + t + lip }] }));
      names.push(`lip-${k + 1}`);
    }
    // dividers standing square on the tier, front to back, as tall as the lip (or 20 mm)
    const dh = Math.max(lip, 20);
    for (let i = 1; i < spaces; i++) {
      const x = -W / 2 + i * sw + (i - 1) * t;
      const base: V3 = [x, o[1] + nUp[1] * t, o[2] + nUp[2] * t];
      ids.push(addFreePanel(d, { frame: { o: base, u: v, v: nUp }, side: 1, outer: [{ x: 0, y: 0 }, { x: len, y: 0 }, { x: len, y: dh }, { x: 0, y: dh }] }));
      names.push(`divider-${k + 1}-${i}`);
    }
  }
  if (back) {
    // between the sides, the tiers' back ends against its front face, a web in from the sides' back edges
    ids.push(addFreePanel(d, { frame: { o: [-W / 2, 0, -D / 2 + web], u: [1, 0, 0], v: [0, 1, 0] }, side: -1, outer: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }] }));
    names.push('back');
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
    // milestone 171: tall enough that its tiers read as a shelf, not a box
    num('height', 'sen.height', 120, 300, 200),
    int('tiers', 'sen.tiers', 2, 5, 3),
    { key: 'tilt', label: 'sen.tilt', type: 'choice', options: ([10, 15, 20, 25, 30, 35] as const).map((x) => ({ value: x, label: `sen.tilt${x}` as MsgKey })), default: 15 },
    // milestone 172 (BOXES_PLYWOOD_PLAN.md §2.3, boxes.py's DisplayShelf), plywood only
    plyWord('lip', 'sen.lip', ['none', ...LIPS], (v, p) => (v === 'none' ? null : Number(v) + 25 > (Number(p.height) - 30) / Math.max(1, Number(p.tiers)) ? 'sen.why.lipRoom' : null)),
    plyWord('spaces', 'sen.tierSpaces', [1, 2, 3, 4], (v, p) => ((Number(p.width) - (Number(v) - 1) * 8) / Number(v) < 30 ? 'sen.why.spaceSmall' : null)),
    plyWord('back', 'sen.back', ['none', 'back'], () => null),
    plyWord('slope', 'sen.slopeSides', ['none', 'sloped'], () => null),
  ],
  generate: generateSlantedShelf,
  sentence: { main: 'sen.s.slantedShelf' },
};
slantedShelf.limits = sheetLimits(slantedShelf, { width: 60, depth: 60, height: 120 });
slantedShelf.accepts = (m, p) => (cleanAll(slantedShelf, m, p) ? null : 'sen.why.engineSize');
