// Flat pieces (milestone C5, SENTENCE_STYLES_PLAN.md): an envelope (pointed
// flaps or a pocket), a presentation folder and a gift-card holder. All card:
// boards folded flat or nearly so, the envelope's flaps 112's shaped flaps
// turned over the board, the folder's pockets and the holder's second face
// boards grown at an angle (a grown board folds flat and exports clean at any
// angle: D7's first question, answered by this milestone's spike), slits as
// milestone 83's cut lines.
import type { Design, EdgeFlap, MaterialProfile } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { Limit, ParamDef, Params, TemplateDef } from '../types';
import { addEdgeFlap, addLine, addRootPanel, growPanel, setEdgeFlap, solve } from '../../model/ops';
import { findEdge, segLength } from '../../model/edges';
import { toWorld } from '../../model/frame';
import { FLAP_MIN_FAR } from '../../model/edgeFeatures';
import { cleanAll, cleanWith } from './box';
import { largestOk } from '../../sentence/resolve';
import { foldsAsCarton } from '../../model/materials';

// card that folds flat (milestone 116: not greyboard)
const cardOnly = (m: MaterialProfile) => m.kind === 'card' && foldsAsCarton(m, 0);

/** The slope (degrees) that leaves a flap's far edge `far` mm wide on an edge `L` long, `len` out. */
function pointTaper(L: number, len: number, far = FLAP_MIN_FAR + 2): number {
  return Math.max(0, Math.min(60, (Math.atan(Math.max(0, L - far) / (2 * Math.max(1, len))) * 180) / Math.PI));
}

/** A shaped flap with its slopes worked out for a pointed (rounded) tip, folded `angle` over the board. */
function pointed(d: Design, id: string, edge: string, shape: EdgeFlap['shape'], len: number, angle: number, r = 5) {
  const e = findEdge(d.panels[id], edge);
  if (!e) return;
  addEdgeFlap(d, id, edge, { shape, len });
  const tp = pointTaper(segLength(e), len);
  setEdgeFlap(d, id, edge, { taper: [tp, tp], r, angle });
}

/** Sizes' ends found by building, as the box's (the largest each way that cuts clean on one sheet). */
function sizeLimits(def: () => TemplateDef, keys: string[]) {
  return (m: MaterialProfile, p: Params): Record<string, Limit> => {
    const out: Record<string, Limit> = {};
    for (const key of keys)
      Object.defineProperty(out, key, {
        enumerable: true,
        get: () => {
          const own = def().params.find((x) => x.key === key) as Extract<ParamDef, { max: number }>;
          const ck = JSON.stringify([def().id, m, { ...p, [key]: null }, key]);
          const v = largestOk(ck, own.min, own.max, (x) => cleanWith(def(), m, { ...p, [key]: x }, key, x), 9, 0.5);
          return { max: Math.max(own.min, v), why: 'sen.why.sheet' as MsgKey };
        },
      });
    return out;
  };
}

const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });

// ---------------------------------------------------------------------------
// The envelope

function generateEnvelope(d: Design, p: Params, role: (name: string, id: string) => void) {
  // the card inside and 2 mm round it
  const W = Number(p.width) + 4, H = Number(p.height) + 4;
  const b = addRootPanel(d, -W / 2, H / 2, W, H);
  role('base', b);
  if (p.flaps === 'pocket') {
    // a portrait wallet: a pocket folded up over most of it, glued at its sides, and a closing flap with rounded corners
    addEdgeFlap(d, b, 'e0', { shape: 'glue', len: Math.round(H * 0.72) });
    setEdgeFlap(d, b, 'e0', { taper: [6, 6], r: 3, angle: 178 });
    for (const e of ['e1', 'e3']) {
      addEdgeFlap(d, b, e, { shape: 'glue', len: 14 });
      setEdgeFlap(d, b, e, { angle: 179 });
    }
    addEdgeFlap(d, b, 'e2', { shape: 'tuck', len: Math.round(Math.min(H * 0.3, W * 0.45)) });
    setEdgeFlap(d, b, 'e2', { r: 8, inset: [1, 1], angle: 176 });
  } else {
    // pointed flaps with rounded tips (a diamond or wedding envelope): the sides first, the bottom glued over them, the top closes
    pointed(d, b, 'e1', 'dust', Math.round(W * 0.42), 179);
    pointed(d, b, 'e3', 'dust', Math.round(W * 0.42), 179);
    pointed(d, b, 'e0', 'glue', Math.round(H * 0.6), 178);
    pointed(d, b, 'e2', 'tuck', Math.round(H * 0.62), 176, 8);
  }
  solve(d);
}

export const envelope: TemplateDef = {
  id: 'envelope',
  version: 1,
  name: 'sen.envelope',
  description: 'sen.envelope.desc',
  word: 'sen.envelope',
  status: 'stable',
  materials: ['card'],
  canMake: cardOnly,
  fallback: () => 'box',
  params: [
    num('width', 'sen.cardWidth', 40, 300, 150),
    num('height', 'sen.cardHeight', 40, 300, 100),
    {
      key: 'flaps', label: 'sen.flaps', type: 'choice', default: 'pointed',
      options: [{ value: 'pointed', label: 'sen.flaps.pointed' }, { value: 'pocket', label: 'sen.flaps.pocket' }],
      allowed: (v, p, m) => cleanWith(envelope, m, p, 'flaps', v),
      why: () => 'sen.why.engine',
    },
  ],
  generate: generateEnvelope,
  sentence: { main: 'sen.s.envelope' },
};
envelope.limits = sizeLimits(() => envelope, ['width', 'height']);
envelope.accepts = (m, p) => (cleanAll(envelope, m, p) ? null : 'sen.why.engineSize');

// ---------------------------------------------------------------------------
// The presentation folder

/** Two short diagonal cut slits that hold a card's two lower corners, its middle at (cx, cy), the card w × h. */
function cardSlits(d: Design, id: string, cx: number, cy: number, w: number, h: number) {
  const s = 7;
  for (const sx of [-1, 1]) {
    const x = cx + (sx * w) / 2, y = cy - h / 2;
    addLine(d, id, [{ x: x - sx * s, y }, { x, y: y + s }], 'cut');
  }
}

const mid = (e: { a: { x: number; y: number }; b: { x: number; y: number } }) => ({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
/** How far a board's point (its own coordinates) is from a point in the world. */
function distTo(d: Design, id: string, q: { x: number; y: number }, w: [number, number, number] | number[]): number {
  const p = toWorld(d.panels[id].frame, q.x, q.y);
  return Math.hypot(p[0] - w[0], p[1] - w[1], p[2] - w[2]);
}

/** Of a grown board's two sides (e1, e3), the one along the root board's bottom edge (e0). */
function bottomEdge(d: Design, id: string, root: string): string {
  const R = d.panels[root], P = d.panels[id];
  const e0 = findEdge(R, 'e0')!;
  const ref = toWorld(R.frame, (e0.a.x + e0.b.x) / 2, (e0.a.y + e0.b.y) / 2);
  const dist = (k: string) => {
    const e = findEdge(P, k)!;
    const w = toWorld(P.frame, (e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2);
    return Math.hypot(w[0] - ref[0], w[1] - ref[1], w[2] - ref[2]);
  };
  return dist('e1') <= dist('e3') ? 'e1' : 'e3';
}

function generateFolder(d: Design, p: Params, role: (name: string, id: string) => void) {
  const W = Number(p.width), H = Number(p.height), P = Math.min(Number(p.pocket), H * 0.6);
  const left = addRootPanel(d, -W, H / 2, W, H);
  role('cover-left', left);
  // the spine: the right cover folded off the left one's right edge, open a little
  const se = findEdge(d.panels[left], 'e1')!;
  const spine = toWorld(d.panels[left].frame, (se.a.x + se.b.x) / 2, (se.a.y + se.b.y) / 2);
  // (open flat: half open, its right cover would meet the left pocket at the spine)
  const right = growPanel(d, left, 'e1', { height: W, angle: 180, dir: 'up', kind: 'fold' });
  if (right) role('cover-right', right.panelId);
  for (const [name, cover] of [['pocket-left', left], ['pocket-right', right?.panelId]] as const) {
    if (!cover) continue;
    // a pocket folded up onto the cover from its bottom edge (the right cover's bottom is one of its sides), its sides glued to it
    const edge = cover === left ? 'e0' : bottomEdge(d, cover, left);
    // short of the spine (the two pockets would meet there in the flat), glued on their outer side only
    const ce = findEdge(d.panels[cover], edge)!;
    const L = segLength(ce);
    const spineAtEnd = distTo(d, cover, ce.b, spine) < distTo(d, cover, ce.a, spine);
    const gap = 6;
    const g = growPanel(d, cover, edge, { height: P, angle: 3, dir: 'up', kind: 'fold', span: spineAtEnd ? [0, L - gap] : [gap, L] });
    if (!g) continue;
    role(name, g.panelId);
    const pk0 = d.panels[g.panelId];
    const outer = (['e1', 'e3'] as const).map((e) => ({ e, at: findEdge(pk0, e)! })).sort((a, b) => distTo(d, g.panelId, mid(b.at), spine) - distTo(d, g.panelId, mid(a.at), spine))[0].e;
    addEdgeFlap(d, g.panelId, outer, { shape: 'glue', len: 12 });
    setEdgeFlap(d, g.panelId, outer, { angle: 178 });
    // slits for a business card (90 × 50) on the right pocket
    const pk = d.panels[g.panelId];
    if (name === 'pocket-right' && pk.w > 110 && pk.h > 45) cardSlits(d, g.panelId, pk.w / 2, pk.h * 0.55, 90, 50);
  }
  solve(d);
}

export const folder: TemplateDef = {
  id: 'folder',
  version: 1,
  name: 'sen.folder',
  description: 'sen.folder.desc',
  word: 'sen.folder',
  status: 'stable',
  materials: ['card'],
  canMake: cardOnly,
  fallback: () => 'box',
  params: [num('width', 'sen.coverWidth', 80, 240, 140), num('height', 'sen.coverHeight', 100, 300, 200), num('pocket', 'sen.pocket', 30, 150, 70)],
  generate: generateFolder,
  sentence: { main: 'sen.s.folder' },
};
folder.limits = sizeLimits(() => folder, ['width', 'height', 'pocket']);
folder.accepts = (m, p) => (cleanAll(folder, m, p) ? null : 'sen.why.engineSize');

// ---------------------------------------------------------------------------
// The gift-card holder

function generateHolder(d: Design, p: Params, role: (name: string, id: string) => void) {
  // a gift card (86 × 54 by default) and 5 mm round it on each face
  const cw = Number(p.width), ch = Number(p.height);
  const W = cw + 10, H = ch + 10;
  const left = addRootPanel(d, -W, H / 2, W, H);
  role('face-left', left);
  const right = growPanel(d, left, 'e1', { height: W, angle: 110, dir: 'up', kind: 'fold' });
  if (right) {
    role('face-right', right.panelId);
    // four corner slits the card's corners tuck into (the face is grown off the other's side: its x runs along that side, the card's height)
    const s = 8;
    const P = d.panels[right.panelId];
    const x0 = (P.w - ch) / 2, y0 = (P.h - cw) / 2, x1 = x0 + ch, y1 = y0 + cw;
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) addLine(d, right.panelId, [{ x: x + dx * s, y }, { x, y: y + dy * s }], 'cut');
  }
  solve(d);
}

export const cardHolder: TemplateDef = {
  id: 'cardHolder',
  version: 1,
  name: 'sen.cardHolder',
  description: 'sen.cardHolder.desc',
  word: 'sen.cardHolder',
  status: 'stable',
  materials: ['card'],
  canMake: cardOnly,
  fallback: () => 'box',
  params: [num('width', 'sen.cardWidth', 40, 200, 86), num('height', 'sen.cardHeight', 30, 200, 54)],
  generate: generateHolder,
  sentence: { main: 'sen.s.cardHolder' },
};
cardHolder.limits = sizeLimits(() => cardHolder, ['width', 'height']);
cardHolder.accepts = (m, p) => (cleanAll(cardHolder, m, p) ? null : 'sen.why.engineSize');
