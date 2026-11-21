// Things made of layers glued face to face (milestone 182, BOXES_PLYWOOD_PLAN.md §3.4), on the face-glued joint of
// milestone 173 (`laminate`, E1). Plywood only (`plywoodOnly`). Constructions read in boxes.py (a behaviour reference
// only: THIRD_PARTY.md) and written fresh over free boards:
//   a frame       a picture frame of layers leaning back on two feet slotted onto its back: *photo* (photoframe: a
//                 front with a window, a middle layer open at the top that makes a pocket the photo and its glass
//                 slide into, a back); *plaque* (engravingframe: a front with a window over a back to engrave); *shadow
//                 box* (shadowbox: spacer layers between the front and the back, for paper cut-outs standing apart).
import type { Design, P2, V3 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { addDetail, addFreePanel, connectSeams, solve } from '../../model/ops';
import { plywoodOnly } from './boards';
import { cleanAll } from './box';
import { sheetLimits } from './shaped';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });
const rad = (deg: number) => (deg * Math.PI) / 180;

/** How far a frame leans back from upright (degrees). */
const FRAME_LEAN = 15;
/** How far a photo frame's window covers the photo's edge, each side (mm): the photo does not fall through. */
const OVERLAP = 5;
/** The play round the photo in its pocket, each side (mm). */
const POCKET_PLAY = 1;
/** A shadow box's spacer layers between its front and its back. */
export const SPACERS = 3;

type FrameKind = 'photo' | 'plaque' | 'shadow';

const rect = (x0: number, y0: number, x1: number, y1: number): P2[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/**
 * The layers of a frame, front to back, each an outline and the windows through it, in the frame's own coordinates
 * (x across, y up, the outside W × H from (0, 0)).
 */
export function frameLayers(kind: FrameKind, Cw: number, Ch: number, b: number): { W: number; H: number; layers: { name: string; outer: P2[]; holes: P2[][] }[] } {
  const W = Cw + 2 * b, H = Ch + 2 * b;
  const out: { name: string; outer: P2[]; holes: P2[][] }[] = [];
  if (kind === 'photo') {
    // the front's window a little smaller than the photo; the middle a U open at the top: the photo's pocket
    out.push({ name: 'front', outer: rect(0, 0, W, H), holes: [rect(b + OVERLAP, b + OVERLAP, W - b - OVERLAP, H - b - OVERLAP)] });
    const p0 = b - POCKET_PLAY, p1 = W - b + POCKET_PLAY;
    out.push({ name: 'middle', outer: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: p1, y: H }, { x: p1, y: p0 }, { x: p0, y: p0 }, { x: p0, y: H }, { x: 0, y: H }], holes: [] });
  } else if (kind === 'plaque') {
    out.push({ name: 'front', outer: rect(0, 0, W, H), holes: [rect(b, b, W - b, H - b)] });
  } else {
    // spacers with the front's window: the depth for cut-outs standing apart, the feet's slots in the back hidden
    // behind every border (a wider window showed them)
    for (const name of ['front', ...Array.from({ length: SPACERS }, (_, k) => `spacer-${k + 1}`)]) out.push({ name, outer: rect(0, 0, W, H), holes: [rect(b, b, W - b, H - b)] });
  }
  out.push({ name: 'back', outer: rect(0, 0, W, H), holes: [] });
  return { W, H, layers: out };
}

function generateFrame(d: Design, p: Params, role: Role) {
  const kind = (['photo', 'plaque', 'shadow'].includes(String(p.kind)) ? p.kind : 'photo') as FrameKind;
  const b = Number(p.border), t = d.material.thickness;
  const { W, H, layers } = frameLayers(kind, Number(p.width), Number(p.height), b);
  const a = rad(90 - FRAME_LEAN);
  // the layers lean back, each behind the one before by a board; the stack stands on its back layer's lowest edge
  const v: V3 = [0, Math.sin(a), -Math.cos(a)];
  const n: V3 = [0, Math.cos(a), Math.sin(a)];
  const k = layers.length - 1;
  const O: V3 = [-W / 2, k * t * n[1], k * t * n[2]];
  const ids: string[] = [], names: string[] = [];
  layers.forEach((L, i) => {
    const o: V3 = [O[0], O[1] - i * t * n[1], O[2] - i * t * n[2]];
    const id = addFreePanel(d, { frame: { o, u: [1, 0, 0], v }, side: 1, outer: L.outer, holes: L.holes });
    if (id) {
      ids.push(id);
      names.push(L.name);
    }
  });
  // the back of a plaque: a field to engrave inside the window
  const back = ids[ids.length - 1];
  if (kind === 'plaque' && back) addDetail(d, back, 'roundrect', 'engrave', W / 2, H / 2, Math.max(10, W - 2 * b - 12), Math.max(10, H - 2 * b - 12));
  // two feet behind the back, under the side borders, triangles from the floor up its back face
  const zb = 0;
  const reach = H * 0.55, top = reach * Math.sin(a), run = reach * Math.cos(a);
  const foot: P2[] = [{ x: 0, y: 0 }, { x: run + top * 0.45, y: 0 }, { x: run, y: top }];
  for (const s of [-1, 1]) {
    const id = addFreePanel(d, { frame: { o: [s * (W / 2 - b / 2) - t / 2, 0, zb], u: [0, 0, -1], v: [0, 1, 0] }, side: 1, outer: foot });
    if (id) {
      ids.push(id);
      names.push(`foot-${s < 0 ? 1 : 2}`);
    }
  }
  solve(d);
  for (const id of ids) connectSeams(d, id);
  solve(d);
  ids.forEach((id, i) => role(names[i], id));
}

export const frame: TemplateDef = {
  id: 'frame',
  version: 1,
  status: 'beta',
  name: 'sen.frame',
  description: 'sen.frame.desc',
  word: 'sen.frame',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'deskSign',
  params: [
    num('width', 'sen.pictureWidth', 40, 400, 100),
    num('height', 'sen.pictureHeight', 60, 400, 150),
    num('border', 'sen.border', 15, 50, 20),
    { key: 'kind', label: 'sen.frameKind', type: 'choice', default: 'photo', options: (['photo', 'plaque', 'shadow'] as const).map((v) => ({ value: v, label: `sen.frameKind.${v}` as MsgKey })) },
  ],
  generate: generateFrame,
  sentence: { main: 'sen.s.frame' },
};
frame.limits = sheetLimits(frame, { width: 40, height: 60 });
frame.accepts = (m, p) => (cleanAll(frame, m, p) ? null : 'sen.why.engineSize');
