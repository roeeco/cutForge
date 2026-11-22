// Boxes on pin hinges (milestone 176, BOXES_PLYWOOD_PLAN.md §3.6, engine step E5), plywood only, beta. Constructions
// read in boxes.py (a behaviour reference only: THIRD_PARTY.md) and written fresh over the box kit and the pin hinge
// (src/model/pinHinge.ts: knuckles on the box and the lid in turn behind the back wall, a dowel or a wire through them):
//   a dice box  a flat box whose lid is on pin hinges; inside it a plate a little under the walls' tops with a
//               hexagonal pocket for each die (seven: one in the middle, six round it), and a magnet hole at each
//               front corner of the plate and of the lid above it, so it stays shut (dicebox);
//   a chest     a box on pin hinges whose lid is built up into a crown: two ends standing on the lid, half a polygon
//               each, and a slat on each of the polygon's sides between them (piratechest).
import type { MsgKey } from '../../i18n';
import type { Limit, ParamDef, Params, TemplateDef } from '../types';
import type { Design, MaterialProfile, P2, V3 } from '../../model/types';
import { addDetail, addFreePanel, addPathShape, addPinLid, connectSeams, solve } from '../../model/ops';
import { toLocal, toWorld } from '../../model/frame';
import { knucklesOf, pinFor, pinRoom, pinSizes } from '../../model/pinHinge';
import { plywoodOnly } from './boards';
import { insideOf, levelPlate, sizeAsWord, sizedBox } from './boardBoxes';
import { cleanAll } from './box';
import { nameAll, sheetLimits } from './shaped';

type Role = (name: string, id: string) => void;
type D = Parameters<TemplateDef['generate']>[0];
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });

const plywood: Pick<TemplateDef, 'materials' | 'canMake' | 'fallback' | 'status' | 'version'> = {
  version: 1,
  status: 'beta',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'box',
};

/** The words' outside width and height (sizes said inside gain the walls and the base). */
const outside = (m: MaterialProfile, p: Params) => ({ w: Number(p.width) + (p.sizeAs === 'outside' ? 0 : 2 * m.thickness), h: Number(p.height) + (p.sizeAs === 'outside' ? 0 : m.thickness) });
/** Room for two pin hinges at these words. */
export const hingeRoom = (m: MaterialProfile, p: Params) => {
  const r = pinRoom(m.thickness, pinFor(m.thickness)), o = outside(m, p);
  return o.w >= r.width && o.h >= r.height;
};

/** The pin-hinged lid's boards named: the lid, then its knuckles left to right. */
function hingeRoles(d: D, lid: string | null): Record<string, string> {
  if (!lid) return {};
  const out: Record<string, string> = { lid };
  for (const K of knucklesOf(d, lid)) out[`knuckle-${K.knuckle!.k + 1}`] = K.id;
  return out;
}

/** A structure's limits: as large as one sheet takes, and never so small that two hinges do not fit. */
function hingeLimits(def: TemplateDef, lows: Record<string, number>): NonNullable<TemplateDef['limits']> {
  const sheet = sheetLimits(def, lows);
  return (m, p) => {
    const out = sheet(m, p);
    const r = pinRoom(m.thickness, pinFor(m.thickness));
    const inside = p.sizeAs !== 'outside';
    const res: Record<string, Limit> = {};
    for (const key of Object.keys(out))
      Object.defineProperty(res, key, {
        enumerable: true,
        get: () => {
          const least = key === 'width' ? r.width - (inside ? 2 * m.thickness : 0) : key === 'height' ? r.height - (inside ? m.thickness : 0) : 0;
          // milestone 185: the sheet's largest stays lazy (copying it with a spread worked it out on every read)
          const sh = out[key];
          return { get max() { return sh.max; }, why: sh.why, holds: sh.holds, min: Math.max(lows[key], Math.ceil(least)) };
        },
      });
    return res;
  };
}

// --- the dice box ---

/** How far under the walls' tops the dice plate's top is (mm): a web over its slots in the walls. */
const PLATE_DOWN = 3;

/** A regular hexagon with rounded corners (circumradius r, corners rounded by cr), its flats top and bottom: points about its centre. */
function roundedHex(r: number, cr: number): P2[] {
  const out: P2[] = [];
  const c = Math.min(cr, r * 0.4);
  for (let i = 0; i < 6; i++) {
    // corner i at angle 60i; its rounding's centre moved in along the bisector so the arc meets both sides
    const a = (Math.PI / 3) * i;
    const k = r - c / Math.cos(Math.PI / 6);
    for (let j = 0; j <= 4; j++) {
      const b = a - Math.PI / 6 + ((Math.PI / 3) * j) / 4;
      out.push({ x: k * Math.cos(a) + c * Math.cos(b), y: k * Math.sin(a) + c * Math.sin(b) });
    }
  }
  return out;
}

/**
 * The dice pockets and magnet holes for a plate W × D (inside): seven hexagons (one in the middle, six round it, a web
 * apart), as large as fit with a web to the plate's edge, shrunk until a magnet `mag` across fits in each front
 * corner a web clear of them. Centres in the plate's coordinates (y from the front).
 */
export function diceLayout(W: number, D: number, t: number, mag: number): { r: number; apothem: number; dice: P2[]; magnets: P2[] } {
  const web = Math.max(3, t);
  const c = { x: W / 2, y: D / 2 };
  const corner = web + 1 + mag / 2;
  const magnets = mag > 0 ? [{ x: corner, y: corner }, { x: W - corner, y: corner }] : [];
  let apothem = (Math.min(W, D) - 4 * web) / 6;
  for (; apothem > 4; apothem -= 0.5) {
    const r = (2 * apothem) / Math.sqrt(3), polar = 2 * apothem + web;
    const dice = [c, ...Array.from({ length: 6 }, (_, i) => ({ x: c.x + polar * Math.cos((Math.PI / 3) * i + Math.PI / 6), y: c.y + polar * Math.sin((Math.PI / 3) * i + Math.PI / 6) }))];
    const clear = magnets.every((q) => dice.every((p) => Math.hypot(p.x - q.x, p.y - q.y) >= r + mag / 2 + web));
    const inside = dice.every((p) => p.x - r >= web && p.x + r <= W - web && p.y - r >= web && p.y + r <= D - web);
    if (clear && inside) return { r, apothem, dice, magnets };
  }
  return { r: 0, apothem: 0, dice: [], magnets };
}

function generateDiceBox(d: D, p: Params, role: Role) {
  const tr = sizedBox(d, p);
  if (!tr) return;
  const ins = insideOf(d);
  if (!ins) return;
  const t = d.material.thickness;
  // the plate: its top a web under the walls' tops, dice standing in its pockets on the base
  const H = d.trays[tr].height;
  const plate = levelPlate(d, H - PLATE_DOWN - t);
  solve(d);
  const mag = p.magnet === 'none' ? 0 : Number(p.magnet);
  const magnetsAt: V3[] = [];
  if (plate) {
    connectSeams(d, plate);
    const P = d.panels[plate];
    const lay = diceLayout(ins.xR - ins.xL, ins.zF - ins.zB, t, mag);
    if (lay.r > 0) {
      const hex = roundedHex(lay.r, Math.min(5, lay.r / 3));
      const xs = hex.map((q) => q.x), ys = hex.map((q) => q.y);
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      const unit = [hex.map((q) => ({ x: q.x / w, y: q.y / h }))];
      for (const c of lay.dice) addPathShape(d, P.id, unit, c.x, c.y, w, h, 'cut');
    }
    for (const q of lay.magnets) {
      addDetail(d, P.id, 'circle', 'cut', q.x, q.y, mag, mag);
      magnetsAt.push(toWorld(P.frame, q.x, q.y, 0));
    }
  }
  solve(d);
  const lid = addPinLid(d, tr);
  // a magnet over each of the plate's, pressed into the lid from below
  if (lid) {
    const L = d.panels[lid];
    for (const w of magnetsAt) {
      const q = toLocal(L.frame, w);
      addDetail(d, lid, 'circle', 'cut', q.x, q.y, mag, mag);
    }
    solve(d);
  }
  nameAll(d, role, { ...(plate ? { plate } : {}), ...hingeRoles(d, lid) });
}

export const diceBox: TemplateDef = {
  ...plywood,
  id: 'diceBox',
  name: 'sen.diceBox',
  description: 'sen.diceBox.desc',
  word: 'sen.diceBox',
  params: [
    num('width', 'sen.width', 60, 300, 110),
    num('depth', 'sen.depth', 60, 300, 110),
    num('height', 'sen.height', 18, 120, 25),
    sizeAsWord(() => diceBox),
    { key: 'magnet', label: 'sen.magnet', type: 'choice', default: 6, options: (['none', 6, 8, 10] as const).map((v) => ({ value: v, label: `sen.magnet.${v}` as MsgKey })) },
  ],
  generate: generateDiceBox,
  sentence: { main: 'sen.s.diceBox' },
};
diceBox.limits = hingeLimits(diceBox, { width: 60, depth: 60, height: 18 });
diceBox.accepts = (m, p) => (!hingeRoom(m, p) ? 'sen.why.pinRoom' : cleanAll(diceBox, m, p) ? null : 'sen.why.engineSize');

// --- the chest ---

/**
 * A crown on a pin-hinged lid (boxes.py's pirate chest): two ends standing on the lid near its sides, each half a
 * polygon of 2n sides over the lid's depth (clear of the hinge's leaves at the back, as far in at the front), and n
 * slats between them on the polygon's sides, each a web inside the ends' edges so its slots have board round them,
 * stopping short of its neighbours at the corners (free boards meet only edge to face: the slats are glued where they
 * nearly meet). Returns the boards made.
 */
export function addCrown(d: D, lidId: string, n: number): string[] {
  const L = d.panels[lidId];
  if (!L?.pinLid) return [];
  const t = d.material.thickness;
  const leaf = pinSizes(t, L.pinLid.pin).leaf;
  const a = leaf + 3, b = L.h - leaf - 3;
  if (b - a < 30) return [];
  const rc = (b - a) / 2, yc = (a + b) / 2;
  const verts: P2[] = Array.from({ length: n + 1 }, (_, k) => {
    const th = Math.PI - (Math.PI * k) / n;
    return { x: yc + rc * Math.cos(th), y: rc * Math.sin(th) };
  });
  const up: V3 = [0, 1, 0];
  const top = toWorld(L.frame, 0, 0, t);
  const at = (U: number, V: number, x: number): V3 => [0, 1, 2].map((i) => top[i] + L.frame.v[i] * U + up[i] * V + L.frame.u[i] * x) as V3;
  const dirOf = (U: number, V: number): V3 => [0, 1, 2].map((i) => L.frame.v[i] * U + up[i] * V) as V3;
  const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const out: string[] = [];
  // the ends: their material towards +u, the one at the right side standing a board in from it
  const inset = 3;
  const xs = [inset, L.w - inset - t];
  const eu = dirOf(1, 0);
  const sideE = (dot(cross(eu, up), L.frame.u) >= 0 ? 1 : -1) as 1 | -1;
  for (const x of xs) {
    const id = addFreePanel(d, { frame: { o: at(0, 0, x), u: eu, v: up }, side: sideE, outer: verts.map((q) => ({ ...q })) });
    if (id) out.push(id);
  }
  // the slats: on each side of the polygon, a web in from the ends' edges, between the ends' inner faces
  const sIn = 3, x0 = inset + t, x1 = L.w - inset - t;
  const g = (sIn + t) * Math.tan(Math.PI / (2 * n)) + 0.5;
  for (let k = 0; k < n; k++) {
    const A = verts[k], B = verts[k + 1];
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    const du = { x: (B.x - A.x) / len, y: (B.y - A.y) / len };
    // the inward normal: towards the polygon's centre (yc, 0)
    let nin = { x: -du.y, y: du.x };
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    if (nin.x * (yc - mid.x) + nin.y * (0 - mid.y) < 0) nin = { x: -nin.x, y: -nin.y };
    const S = { x: A.x + du.x * g + nin.x * sIn, y: A.y + du.y * g + nin.y * sIn };
    const le = len - 2 * g;
    if (le < 8) continue;
    const v = dirOf(du.x, du.y), u = L.frame.u as V3;
    const side = (dot(cross(u, v), dirOf(nin.x, nin.y)) >= 0 ? 1 : -1) as 1 | -1;
    const id = addFreePanel(d, { frame: { o: at(S.x, S.y, x0), u, v }, side, outer: [{ x: 0, y: 0 }, { x: x1 - x0, y: 0 }, { x: x1 - x0, y: le }, { x: 0, y: le }] });
    if (id) out.push(id);
  }
  solve(d);
  for (const id of out) connectSeams(d, id);
  solve(d);
  return out;
}

function generateChest(d: D, p: Params, role: Role) {
  const tr = sizedBox(d, p);
  if (!tr) return;
  const lid = addPinLid(d, tr);
  const crown = lid ? addCrown(d, lid, Number(p.slats)) : [];
  nameAll(d, role, { ...hingeRoles(d, lid), ...Object.fromEntries(crown.map((id, i) => [i < 2 ? `end-${i + 1}` : `slat-${i - 1}`, id])) });
}

export const chest: TemplateDef = {
  ...plywood,
  id: 'chest',
  name: 'sen.chest',
  description: 'sen.chest.desc',
  word: 'sen.chest',
  params: [
    num('width', 'sen.width', 80, 300, 200),
    num('depth', 'sen.depth', 70, 300, 110),
    num('height', 'sen.height', 40, 200, 80),
    sizeAsWord(() => chest),
    { key: 'slats', label: 'sen.slats', type: 'choice', default: 5, options: [3, 4, 5, 6].map((v) => ({ value: v, label: `sen.slats.${v}` as MsgKey })) },
  ],
  generate: generateChest,
  sentence: { main: 'sen.s.chest' },
};
chest.limits = hingeLimits(chest, { width: 80, depth: 70, height: 40 });
chest.accepts = (m, p) => (!hingeRoom(m, p) ? 'sen.why.pinRoom' : cleanAll(chest, m, p) ? null : 'sen.why.engineSize');
