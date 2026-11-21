// An illustration of a design as SVG (prototype, 21 November; docs/welcome-ux-review-2026-11-20): the real
// geometry (each board's outline with its joints, posed as the stage shows it, lids opened back) projected
// isometrically, each face a flat tone of its material lit from the upper left, with crisp outlines, plies on
// plywood edges and flutes on corrugated ones, and props for what goes inside (pencils, dice, sweets). Same
// signature as renderThumbnail (a data URL), with no WebGL.
import * as THREE from 'three';
import type { Design, MaterialKind } from '../model/types';
import { frameMatrix, panelShape } from './three-geom';
import { bandGeometry } from './bandMesh';
import { matOf } from '../model/materials';
import { boxBases, compartments } from '../easy/objects';
import { trayRing } from '../model/cartons';
import { flapMatrix } from './foldView';
import { autoPose, boxOf, posedDisplay, sideOfFlaps, type Pose, type PoseProp, type Posed } from './pose';
import { edgeFeatures } from '../model/edgeFeatures';
import { allFoldOvers } from '../model/foldover';
import { segDir, segInward } from '../model/edges';
import { clippedLine } from '../model/lines';
import type { Flap3d, P2 } from '../model/types';

export type Prop = PoseProp;

type Face = {
  pts: THREE.Vector3[];
  /** Holes in the face (a top or bottom with cut-outs), drawn even-odd. */
  holes?: THREE.Vector3[][];
  normal: THREE.Vector3;
  fill: string;
  stroke: string;
  /** Lines drawn on the face after it (plies, flutes, pips' outlines). */
  lines?: THREE.Vector3[][];
  /** Drawn after anything it ties with (a pip on a die's face). */
  lift?: number;
  /** The board it belongs to (none for a prop). */
  board?: string;
  /** What of the design it draws (milestone 147: a board, band, flap, liner or line, for the coverage test). */
  part?: string;
  /** Lines drawn on the face in its material's outline colour (a board's cut and perforated lines, milestone 147). */
  marks?: { pts: THREE.Vector3[]; dashed: boolean }[];
};

/** Each material's look: its face, its cut edge, its outline, and what its edge shows. */
/** `contrast`: how much the light changes it (white card greys too fast at full contrast). */
const LOOK: Record<MaterialKind, { face: string; edge: string; line: string; detail: string; contrast: number }> = {
  plywood: { face: '#efd8b0', edge: '#82532e', line: '#6a4428', detail: '#c4925a', contrast: 1 },
  // milestone 147: card darker at its edges and outlines and lit with more contrast, so it reads at list size
  card: { face: '#fdfbf6', edge: '#d8cfbe', line: '#968b79', detail: '#c4b9a6', contrast: 0.8 },
  corrugated: { face: '#d9aa71', edge: '#a97b48', line: '#7a5532', detail: '#8a6136', contrast: 1 },
};

// the view: from the front right, above, orthographic; a little higher than the stage's thumbnails (about 41°)
// so more of a box's inside shows
/**
 * The views a picture is drawn from (milestone 151): the usual three-quarter view from the front right and above; a
 * higher one (an organiser's grid); and one from the side (a stand's lean). The light keeps to the upper left of
 * whichever.
 */
export type ViewName = 'front34' | 'high' | 'side34' | 'rear34';
const VIEWS: Record<ViewName, THREE.Vector3> = {
  front34: new THREE.Vector3(0.75, 1.08, 1).normalize(),
  high: new THREE.Vector3(0.55, 1.9, 1).normalize(),
  side34: new THREE.Vector3(1.3, 0.85, 0.45).normalize(),
  // milestone 171: from behind on the right, for a thing held up from behind (a desk sign's feet)
  rear34: new THREE.Vector3(1, 0.95, -0.8).normalize(),
};
let VIEW = VIEWS.front34.clone();
let RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), VIEW).normalize();
let UP = new THREE.Vector3().crossVectors(VIEW, RIGHT).normalize();
// light from the upper left, a little towards the viewer
let LIGHT = RIGHT.clone().multiplyScalar(-0.75).addScaledVector(UP, 1).addScaledVector(VIEW, 0.45).normalize();

/** Look from this view (every projection below reads it). */
function setView(name: ViewName) {
  VIEW = VIEWS[name].clone();
  RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), VIEW).normalize();
  UP = new THREE.Vector3().crossVectors(VIEW, RIGHT).normalize();
  LIGHT = RIGHT.clone().multiplyScalar(-0.75).addScaledVector(UP, 1).addScaledVector(VIEW, 0.45).normalize();
}

const sx = (p: THREE.Vector3) => p.dot(RIGHT);
const sy = (p: THREE.Vector3) => -p.dot(UP);
const depth = (p: THREE.Vector3) => p.dot(VIEW);

function shade(hex: string, n: THREE.Vector3, inner = false, contrast = 1): string {
  const lit = (0.66 + 0.42 * Math.max(0, n.dot(LIGHT)) - 0.08 * Math.max(0, -n.y)) * (inner ? 0.88 : 1);
  // the light's effect scaled about full light (1)
  const k = 1 + (lit - 1) * contrast;
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k);
  c.g = Math.min(1, c.g * k);
  c.b = Math.min(1, c.b * k);
  return '#' + c.getHexString();
}

const area2 = (r: { x: number; y: number }[]) => r.reduce((s, a, i) => s + a.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * a.y, 0);

/** A board's slab as faces: its two sides (with holes) and every cut edge, in world space. */
function boardFaces(d: Design, id: string, M: THREE.Matrix4, kind: MaterialKind, out: Face[], plain = false, drawn?: Set<string>) {
  const p = d.panels[id];
  // a box's floor without its joint slots: the walls' tabs fill them, and drawn they are only noise
  const s = panelShape(d, p, plain ? { joints: false } : {});
  const zs: [number, number] = s.side === 1 ? [0, s.t] : [-s.t, 0];
  const sides = slabFaces(s.rings, s.holes, zs, M, kind, id, `board:${id}`, out);
  // milestone 147: its cut and perforated lines (slits, tear lines), on both faces
  for (const ln of p.lines ?? []) {
    if (ln.type !== 'cut' && ln.type !== 'perf' && ln.type !== 'cutcrease') continue;
    for (const pl of clippedLine(p, ln)) {
      if (pl.length < 2) continue;
      drawn?.add(`line:${id}:${ln.id}`);
      zs.forEach((z, k) => {
        for (const f of k ? sides.atZ1 : sides.atZ0) (f.marks ??= []).push({ pts: pl.map((q) => new THREE.Vector3(q.x, q.y, z).applyMatrix4(M)), dashed: ln.type !== 'cut' });
      });
    }
  }
}

/**
 * A slab: rings (with holes) between two depths of a frame-matrix, as its two sides and every cut edge, in world
 * space (a board, a flap folded over, a fold-over's liner).
 */
function slabFaces(rings: { x: number; y: number }[][], holesIn: { x: number; y: number }[][], [z0, z1]: [number, number], M: THREE.Matrix4, kind: MaterialKind, id: string, part: string, out: Face[]): { atZ0: Face[]; atZ1: Face[] } {
  const sides = { atZ0: [] as Face[], atZ1: [] as Face[] };
  const s = { rings, holes: holesIn, t: z1 - z0 };
  const look = LOOK[kind];
  const at = (q: { x: number; y: number }, z: number) => new THREE.Vector3(q.x, q.y, z).applyMatrix4(M);
  const nTop = new THREE.Vector3(0, 0, 1).transformDirection(M);
  const ringsWithHoles = s.rings.map((r) => ({ r, holes: [] as { x: number; y: number }[][] }));
  for (const h of s.holes) {
    const inside = ringsWithHoles.find((x) => pointIn(h[0], x.r)) ?? ringsWithHoles[0];
    inside?.holes.push(h);
  }
  for (const { r, holes } of ringsWithHoles) {
    for (const [z, n] of [
      [z1, nTop],
      [z0, nTop.clone().negate()],
    ] as const) {
      const f: Face = { pts: r.map((q) => at(q, z)), holes: holes.map((h) => h.map((q) => at(q, z))), normal: n, fill: look.face, stroke: look.line, board: id, part };
      out.push(f);
      (z === z1 ? sides.atZ1 : sides.atZ0).push(f);
    }
    edgeFaces(r, false);
    for (const h of holes) edgeFaces(h, true);
  }
  function edgeFaces(ring: { x: number; y: number }[], hole: boolean) {
    const ccw = area2(ring) > 0;
    // outward from the material: right of a counter-clockwise ring, left of a counter-clockwise hole
    const out2 = (dx: number, dy: number) => ((ccw !== hole) ? { x: dy, y: -dx } : { x: -dy, y: dx });
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const o = out2(dx / len, dy / len);
      const normal = new THREE.Vector3(o.x, o.y, 0).transformDirection(M);
      const lines: THREE.Vector3[][] = [];
      // plies on plywood (two glue lines), a flute line on corrugated
      if (kind === 'plywood' && len > 4)
        for (const f of [1 / 3, 2 / 3]) lines.push([at(a, z0 + (z1 - z0) * f), at(b, z0 + (z1 - z0) * f)]);
      if (kind === 'corrugated' && len > 4) {
        const n = Math.max(2, Math.round(len / (s.t * 1.2)));
        const wave: THREE.Vector3[] = [];
        for (let k = 0; k <= n * 2; k++) {
          const f = k / (n * 2);
          const z = z0 + (z1 - z0) * (k % 2 ? 0.82 : 0.18);
          wave.push(at({ x: a.x + dx * f, y: a.y + dy * f }, z));
        }
        lines.push(wave);
      }
      out.push({ pts: [at(a, z0), at(b, z0), at(b, z1), at(a, z1)], normal, fill: look.edge, stroke: look.line, lines, board: id, part });
    }
  }
  return sides;
}

function pointIn(q: { x: number; y: number }, r: { x: number; y: number }[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if (r[i].y > q.y !== r[j].y > q.y && q.x < ((r[j].x - r[i].x) * (q.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) c = !c;
  return c;
}

/** A box between two corners along the given axes (world), as its six faces. */
function block(o: THREE.Vector3, ax: THREE.Vector3, ay: THREE.Vector3, az: THREE.Vector3, fill: string, stroke: string, out: Face[], top?: string): Face[] {
  const P = (i: number, j: number, k: number) => o.clone().addScaledVector(ax, i).addScaledVector(ay, j).addScaledVector(az, k);
  const faces: [THREE.Vector3[], THREE.Vector3][] = [
    [[P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)], az.clone().normalize()],
    [[P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)], az.clone().normalize().negate()],
    [[P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], ay.clone().normalize().negate()],
    [[P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)], ay.clone().normalize()],
    [[P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)], ax.clone().normalize().negate()],
    [[P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)], ax.clone().normalize()],
  ];
  const made = faces.map(([pts, normal], i) => ({ pts, normal, fill: i === 0 && top ? top : fill, stroke }));
  out.push(...made);
  return made;
}

/** What goes inside: on each compartment's floor, along its longer side. */
function propFaces(d: Design, xf: Map<string, THREE.Matrix4>, prop: Prop, out: Face[]) {
  if (prop === 'soap') return soapFaces(d, xf, out);
  if (prop === 'product') return productFaces(d, xf, out);
  if (prop === 'cup') return cupFaces(d, xf, out);
  if (prop === 'paper') return paperFaces(d, xf, out);
  if (prop === 'letter') return letterFaces(d, xf, out);
  if (prop === 'goods') return goodsFaces(d, xf, out);
  const baseId = boxBases(d)[0];
  if (!baseId) return;
  const base = d.panels[baseId];
  const M = (xf.get(baseId) ?? new THREE.Matrix4()).clone().multiply(frameMatrix(base.frame));
  const s = panelShape(d, base);
  const [z0, z1] = s.side === 1 ? [0, s.t] : [-s.t, 0];
  // the base's inside face: the one higher up in the world
  const zIn = new THREE.Vector3(0, 0, z1).applyMatrix4(M).y >= new THREE.Vector3(0, 0, z0).applyMatrix4(M).y ? z1 : z0;
  const at = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, zIn).applyMatrix4(M).add(new THREE.Vector3(0, z, 0));
  const ex = new THREE.Vector3(1, 0, 0).transformDirection(M), ey = new THREE.Vector3(0, 1, 0).transformDirection(M);
  const up = new THREE.Vector3(0, 1, 0);
  const comps = compartments(d, baseId);
  if (!comps.length) return;
  const PENCIL = ['#1fb8ac', '#f2b632', '#e4574b', '#3f7be0', '#f08a3c', '#7b5bd6'];
  const SWEET = ['#f28fb0', '#1fb8ac', '#f2c94c', '#7fb7f0'];
  // the floor's far side (away from the viewer), in the base's own coordinates
  const far2 = { x: -VIEW.dot(ex), y: -VIEW.dot(ey) };
  const fl = Math.hypot(far2.x, far2.y) || 1;
  far2.x /= fl;
  far2.y /= fl;
  if (prop === 'pencils') {
    // the longest compartment holds the pencils, side by side, each resting on the floor at the far end and
    // leaning up over the rim at the near end (lying flat they would be hidden by the walls)
    const c = comps.reduce((a, b) => (Math.max(b.x1 - b.x0, b.y1 - b.y0) > Math.max(a.x1 - a.x0, a.y1 - a.y0) ? b : a));
    const alongX = c.x1 - c.x0 >= c.y1 - c.y0;
    const span = alongX ? c.x1 - c.x0 : c.y1 - c.y0, W = alongX ? c.y1 - c.y0 : c.x1 - c.x0;
    const n = Math.max(1, Math.min(5, Math.floor((W * 0.85) / 7)));
    // along the compartment, pointing to the near end
    const flip = (alongX ? far2.x : far2.y) > 0;
    const along = (alongX ? ex : ey).clone().multiplyScalar(flip ? -1 : 1);
    const across = alongX ? ey : ex;
    const L = Math.min(175, span * 1.02), rise = Math.min(c.h + 14, L * 0.5);
    const dir = along.clone().multiplyScalar(Math.sqrt(L * L - rise * rise)).addScaledVector(up, rise).normalize();
    const lift = new THREE.Vector3().crossVectors(across, dir).normalize();
    if (lift.dot(up) < 0) lift.negate();
    for (let k = 0; k < n; k++) {
      const off = (W - n * 7) / 2 + k * 7 + 0.25;
      const start = flip ? (alongX ? c.x1 : c.y1) : alongX ? c.x0 : c.y0;
      const o = (alongX ? at(start, c.y0 + off, 0) : at(c.x0 + off, start, 0)).addScaledVector(along, 2);
      const body = L - 16;
      const col = PENCIL[k % PENCIL.length];
      block(o, dir.clone().multiplyScalar(body), across.clone().multiplyScalar(6.5), lift.clone().multiplyScalar(6.5), col, '#3a3530', out);
      // the sharpened end: bare wood to a lead point
      const tip = o.clone().addScaledVector(dir, body);
      const corner = (i: number) => tip.clone().addScaledVector(across, i === 1 || i === 2 ? 6.5 : 0).addScaledVector(lift, i >= 2 ? 6.5 : 0);
      const axisPt = (f: number) => tip.clone().addScaledVector(across, 3.25).addScaledVector(lift, 3.25).addScaledVector(dir, f);
      for (let i = 0; i < 4; i++) {
        const a = corner(i), b = corner((i + 1) % 4), apex = axisPt(16);
        const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), apex.clone().sub(a)).normalize();
        if (normal.dot(a.clone().sub(axisPt(0))) < 0) normal.negate();
        out.push({ pts: [a, b, apex], normal, fill: '#e8c79a', stroke: '#3a3530' });
        const lead = [a, b].map((q) => q.clone().lerp(apex, 0.62));
        out.push({ pts: [lead[0], lead[1], apex], normal: normal.clone(), fill: '#3a3530', stroke: '#3a3530', lift: 1 });
      }
    }
  } else if (prop === 'dice') {
    // six dice, three by two, on the largest compartment's floor, each turned a little
    const c = comps.reduce((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a));
    const cw = c.x1 - c.x0, ch = c.y1 - c.y0;
    const S = Math.min(16, cw / 3.6, ch / 2.5);
    for (let k = 0; k < 6; k++) {
      const turn = ((k * 37) % 50) / 100 - 0.25;
      const gx = c.x0 + cw * ((k % 3) + 0.5) / 3, gy = c.y0 + ch * (Math.floor(k / 3) + 0.5) / 2;
      const ax = ex.clone().multiplyScalar(Math.cos(turn)).addScaledVector(ey, Math.sin(turn)).multiplyScalar(S);
      const ay = ey.clone().multiplyScalar(Math.cos(turn)).addScaledVector(ex, -Math.sin(turn)).multiplyScalar(S);
      const o = at(gx, gy, 0).addScaledVector(ax, -0.5).addScaledVector(ay, -0.5);
      const faces = block(o, ax, ay, up.clone().multiplyScalar(S), '#fbfaf7', '#3a3530', out);
      // pips on the top: 1 to 6 by die
      const PIPS: [number, number][][] = [[[0.5, 0.5]], [[0.27, 0.27], [0.73, 0.73]], [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]], [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]], [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]]];
      const top = faces[0].pts[0];
      for (const [u, v] of PIPS[k]) {
        const ctr = top.clone().addScaledVector(ax, u).addScaledVector(ay, v).addScaledVector(up, 0.05);
        const ring: THREE.Vector3[] = [];
        for (let i = 0; i < 10; i++) {
          const t = (i / 10) * Math.PI * 2;
          ring.push(ctr.clone().addScaledVector(ax, Math.cos(t) * 0.09).addScaledVector(ay, Math.sin(t) * 0.09));
        }
        out.push({ pts: ring, normal: up.clone(), fill: k === 0 ? '#e4574b' : '#2b2622', stroke: 'none', lift: 1 });
      }
    }
  } else {
    // wrapped sweets scattered on the floor
    for (const c of comps) {
      const n = Math.max(2, Math.min(7, Math.floor(((c.x1 - c.x0) * (c.y1 - c.y0)) / 1400)));
      // spots over the compartment, the farthest from the viewer first (the near half is behind the front wall)
      const spots: { fx: number; fy: number }[] = [];
      for (let i = 0; i < 16; i++) spots.push({ fx: ((i * 0.618 + 0.13) % 1) * 0.7 + 0.15, fy: ((i * 0.382 + 0.31) % 1) * 0.7 + 0.15 });
      spots.sort((a, b) => (b.fx - 0.5) * far2.x * (c.x1 - c.x0) + (b.fy - 0.5) * far2.y * (c.y1 - c.y0) - ((a.fx - 0.5) * far2.x * (c.x1 - c.x0) + (a.fy - 0.5) * far2.y * (c.y1 - c.y0)));
      for (let k = 0; k < n; k++) {
        const { fx, fy } = spots[k];
        const turn = k * 1.1;
        const ax = ex.clone().multiplyScalar(Math.cos(turn)).addScaledVector(ey, Math.sin(turn));
        const ay = ey.clone().multiplyScalar(Math.cos(turn)).addScaledVector(ex, -Math.sin(turn));
        const o = at(c.x0 + (c.x1 - c.x0) * fx, c.y0 + (c.y1 - c.y0) * fy, 0).addScaledVector(ax, -8).addScaledVector(ay, -5);
        const col = SWEET[k % SWEET.length];
        block(o, ax.clone().multiplyScalar(16), ay.clone().multiplyScalar(10), up.clone().multiplyScalar(7), col, '#3a3530', out);
        // the twisted ends of the wrapper
        for (const end of [0, 1]) {
          const e0 = o.clone().addScaledVector(ax, end ? 16 : 0).addScaledVector(ay, 5).addScaledVector(up, 3.5);
          const dir = ax.clone().multiplyScalar(end ? 6 : -6);
          out.push({ pts: [e0, e0.clone().add(dir).addScaledVector(ay, 4), e0.clone().add(dir).addScaledVector(ay, -4)], normal: up.clone().add(ay.clone().multiplyScalar(0.001)), fill: col, stroke: '#3a3530', lift: 1 });
        }
      }
    }
  }
}

/** A bar of soap in a sleeve (milestone 148): along its tube, half again as long, out of its end towards the viewer. */
function soapFaces(d: Design, xf: Map<string, THREE.Matrix4>, out: Face[]) {
  const t = Object.values(d.trays ?? {}).find((x) => !x.lidOf);
  if (!t) return;
  const walls = trayRing(d, t).map((r) => r.wall);
  if (!walls.length) return;
  const b = boxOf(d, walls, xf);
  const th = matOf(d, walls[0]).thickness + 0.6;
  // the tube's axis: its walls' height, as shown
  const w0 = d.panels[walls[0]];
  const ax = new THREE.Vector3(...w0.frame.v).transformDirection(xf.get(w0.id) ?? new THREE.Matrix4());
  const k = [Math.abs(ax.x), Math.abs(ax.y), Math.abs(ax.z)].indexOf(Math.max(Math.abs(ax.x), Math.abs(ax.y), Math.abs(ax.z)));
  const lo = b.min.clone(), hi = b.max.clone();
  for (let i = 0; i < 3; i++) {
    if (i === k) continue;
    lo.setComponent(i, lo.getComponent(i) + th);
    hi.setComponent(i, hi.getComponent(i) - th);
  }
  const len = hi.getComponent(k) - lo.getComponent(k);
  // out of the end nearer the viewer
  if (VIEW.getComponent(k) >= 0) hi.setComponent(k, hi.getComponent(k) + 0.45 * len);
  else lo.setComponent(k, lo.getComponent(k) - 0.45 * len);
  if (hi.x <= lo.x || hi.y <= lo.y || hi.z <= lo.z) return;
  block(lo, new THREE.Vector3(hi.x - lo.x, 0, 0), new THREE.Vector3(0, 0, hi.z - lo.z), new THREE.Vector3(0, hi.y - lo.y, 0), '#cdb9e6', '#5d4a78', out, '#dccdf0');
}

/** What a window carton holds (milestone 155): a coloured block filling most of its inside, seen through the window. */
function productFaces(d: Design, xf: Map<string, THREE.Matrix4>, out: Face[]) {
  const t = Object.values(d.trays ?? {}).find((x) => !x.lidOf);
  if (!t) return;
  const walls = trayRing(d, t).map((r) => r.wall);
  if (!walls.length) return;
  const b = boxOf(d, walls, xf);
  const th = matOf(d, walls[0]).thickness * 2 + 1;
  const lo = new THREE.Vector3(b.min.x + th, b.min.y + 1, b.min.z + th), hi = new THREE.Vector3(b.max.x - th, b.min.y + (b.max.y - b.min.y) * 0.86, b.max.z - th);
  if (hi.x <= lo.x || hi.y <= lo.y || hi.z <= lo.z) return;
  block(lo, new THREE.Vector3(hi.x - lo.x, 0, 0), new THREE.Vector3(0, 0, hi.z - lo.z), new THREE.Vector3(0, hi.y - lo.y, 0), '#e2725b', '#6b2f22', out, '#ee8f78');
}

/**
 * A stack of paper in an open-front box (milestone 162): three pads, each a little off the one under it, filling most
 * of the inside to about half the walls' height, white with a grey edge, so the open front shows what it is for.
 */
function paperFaces(d: Design, xf: Map<string, THREE.Matrix4>, out: Face[]) {
  const t = Object.values(d.trays ?? {}).find((x) => !x.lidOf);
  if (!t) return;
  const walls = trayRing(d, t).map((r) => r.wall);
  if (!walls.length) return;
  const b = boxOf(d, [t.baseId, ...walls], xf);
  const th = matOf(d, walls[0]).thickness * 2 + 2;
  const W = b.max.x - b.min.x - 2 * th, D = b.max.z - b.min.z - 2 * th, H = (b.max.y - b.min.y) * 0.16;
  if (W <= 4 || D <= 4 || H <= 0) return;
  for (let k = 0; k < 3; k++) {
    const off = (k % 2 ? 1 : -1) * Math.min(4, W * 0.03);
    const lo = new THREE.Vector3(b.min.x + th + off + W * 0.04, b.min.y + 1 + k * H, b.min.z + th + D * 0.04);
    block(lo, new THREE.Vector3(W * 0.92, 0, 0), new THREE.Vector3(0, 0, D * 0.92), new THREE.Vector3(0, H * 0.94, 0), '#f4f1e8', '#7d776b', out, '#fffdf7');
  }
}

/**
 * Things on a shelf's boards (milestone 171): on each level shelf (`t:shelf-n`) a few small boxes standing, on each
 * tilted tier (`t:tier-n`) a stack of cards lying on it, so a shelf reads as a shelf and not as a box at list size.
 */
function goodsFaces(d: Design, xf: Map<string, THREE.Matrix4>, out: Face[]) {
  const COLS = ['#1fb8ac', '#f2b632', '#e4574b', '#3f7be0', '#7b5bd6'];
  // milestone 172: a bin rack's floors (`t:bottom`, `t:floor-n`) hold parts too
  const ids = d.order.filter((id) => /^t:(shelf-\d+|tier-\d+|floor-\d+|bottom)$/.test(id) && d.panels[id]);
  // the room above a board ends at the next board up, a rack's rails and a bin rack's top included (milestone 172)
  const levelsAt = d.order.filter((id) => /^t:(shelf|tier|rail|floor)-[\d-]+$|^t:(bottom|top)$/.test(id) && d.panels[id]);
  const yOf = (id: string) => new THREE.Vector3().applyMatrix4((xf.get(id) ?? new THREE.Matrix4()).clone().multiply(frameMatrix(d.panels[id].frame))).y;
  const ys = ids.map(yOf), all = levelsAt.map(yOf);
  ids.forEach((id, k) => {
    const p = d.panels[id];
    const M = (xf.get(id) ?? new THREE.Matrix4()).clone().multiply(frameMatrix(p.frame));
    const s = panelShape(d, p);
    const [z0, z1] = s.side === 1 ? [0, s.t] : [-s.t, 0];
    const up0 = new THREE.Vector3(0, 0, 1).transformDirection(M);
    // its upper face, and that face's normal pointing up
    const zUp = new THREE.Vector3(0, 0, z1).applyMatrix4(M).y >= new THREE.Vector3(0, 0, z0).applyMatrix4(M).y ? z1 : z0;
    const n = up0.y >= 0 ? up0 : up0.clone().negate();
    const at = (x: number, y: number) => new THREE.Vector3(x, y, zUp).applyMatrix4(M);
    const ex = new THREE.Vector3(1, 0, 0).transformDirection(M), ey = new THREE.Vector3(0, 1, 0).transformDirection(M);
    const tier = id.startsWith('t:tier');
    // the room above it: to the next board up, or a third of its depth
    const above = all.filter((y) => y > ys[k] + 1).sort((a, b) => a - b)[0];
    const room = above !== undefined ? above - ys[k] - s.t : p.h / 2;
    const n0 = Math.max(2, Math.min(4, Math.floor(p.w / 45)));
    for (let i = 0; i < n0; i++) {
      const col = COLS[(i + k * 2) % COLS.length];
      const cw = (p.w / n0) * 0.62, x = (p.w / n0) * (i + 0.19);
      if (tier) {
        // cards: a thin stack lying on the tier, towards its front
        const dep = Math.min(p.h * 0.62, cw * 1.35), hgt = Math.max(3, Math.min(10, room * 0.2));
        block(at(x, p.h * 0.08), ex.clone().multiplyScalar(cw), ey.clone().multiplyScalar(dep), n.clone().multiplyScalar(hgt), '#f4f1e8', '#7d776b', out, col);
      } else {
        const dep = Math.min(p.h * 0.55, cw), hgt = Math.max(8, room * (0.45 + 0.2 * ((i * 37 + k) % 3) / 2));
        block(at(x, p.h * 0.3), ex.clone().multiplyScalar(cw), ey.clone().multiplyScalar(dep), new THREE.Vector3(0, hgt, 0), col, '#3a3530', out);
      }
    }
  });
}

/** Pencils standing in a pen cup (milestone 155): a handful upright in its middle, each leaning a little, a third taller than it. */
function cupFaces(d: Design, xf: Map<string, THREE.Matrix4>, out: Face[]) {
  const baseId = boxBases(d)[0];
  const t = Object.values(d.trays ?? {}).find((x) => !x.lidOf && x.baseId === baseId);
  if (!baseId || !t) return;
  const walls = trayRing(d, t).map((r) => r.wall);
  const b = boxOf(d, [baseId, ...walls], xf);
  const c = b.getCenter(new THREE.Vector3());
  const H = (b.max.y - b.min.y) * 1.35, r = Math.min(b.max.x - b.min.x, b.max.z - b.min.z) * 0.18;
  const COLS = ['#1fb8ac', '#f2b632', '#e4574b', '#3f7be0', '#7b5bd6'];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    const foot = new THREE.Vector3(c.x + Math.cos(a) * r, b.min.y + 1, c.z + Math.sin(a) * r);
    const lean = new THREE.Vector3(Math.cos(a) * 0.12, 1, Math.sin(a) * 0.12).normalize();
    const ax = new THREE.Vector3().crossVectors(lean, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(6.5);
    const az = new THREE.Vector3().crossVectors(ax, lean).normalize().multiplyScalar(6.5);
    const len = H * (0.92 + 0.08 * ((k * 37) % 5) / 4);
    block(foot.clone().addScaledVector(ax, -0.5).addScaledVector(az, -0.5), ax, az, lean.clone().multiplyScalar(len - 14), COLS[k], '#3a3530', out);
    // the sharpened end: bare wood to a lead point
    const top = foot.clone().addScaledVector(lean, len - 14);
    const apex = foot.clone().addScaledVector(lean, len);
    const ring = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([i, j]) => top.clone().addScaledVector(ax, i).addScaledVector(az, j));
    for (let i = 0; i < 4; i++) {
      const p0 = ring[i], p1 = ring[(i + 1) % 4];
      const n = new THREE.Vector3().crossVectors(p1.clone().sub(p0), apex.clone().sub(p0)).normalize();
      if (n.dot(p0.clone().sub(top.clone().addScaledVector(lean, 0))) < 0) n.negate();
      out.push({ pts: [p0, p1, apex], normal: n, fill: '#e8c79a', stroke: '#3a3530' });
    }
  }
}

/** A letter in an envelope (milestone 148): a sheet under its flaps, out past the opened back flap. */
function letterFaces(d: Design, xf: Map<string, THREE.Matrix4>, out: Face[]) {
  const p = d.panels[d.order[0]];
  if (!p) return;
  const M = (xf.get(p.id) ?? new THREE.Matrix4()).clone().multiply(frameMatrix(p.frame));
  const side = sideOfFlaps(d, p, xf);
  const t = matOf(d, p.id).thickness;
  const z = side > 0 ? (p.frame.side === 1 ? t : 0) + 0.25 : (p.frame.side === 1 ? 0 : -t) - 0.75;
  const at = (x: number, y: number, zz = z) => new THREE.Vector3(x, y, zz).applyMatrix4(M);
  // the board's edge farthest from the viewer: the letter comes out over it
  const mids = [{ x: p.w / 2, y: 0 }, { x: p.w, y: p.h / 2 }, { x: p.w / 2, y: p.h }, { x: 0, y: p.h / 2 }];
  const far = mids.reduce((a, b2) => (at(b2.x, b2.y).dot(VIEW) < at(a.x, a.y).dot(VIEW) ? b2 : a));
  const cx = p.w / 2 + (far.x - p.w / 2) * 0.55, cy = p.h / 2 + (far.y - p.h / 2) * 0.55;
  const lw = p.w * 0.82, lh = p.h * 0.78;
  const o = at(cx - lw / 2, cy - lh / 2);
  const ax = at(cx + lw / 2, cy - lh / 2).sub(o), ay = at(cx - lw / 2, cy + lh / 2).sub(o), az = at(cx - lw / 2, cy - lh / 2, z + 0.5).sub(o);
  const faces = block(o, ax, ay, az, '#eef3fb', '#7f93b0', out);
  // three lines of writing on its face
  faces.slice(0, 2).forEach((f, i) => {
    const b0 = i === 0 ? o.clone().add(az) : o.clone();
    f.marks = [0.3, 0.45, 0.6].map((k) => ({ pts: [0.15, 0.7].map((u) => b0.clone().addScaledVector(ax, u).addScaledVector(ay, k)), dashed: false }));
  });
}

/**
 * The design as the pictures draw it: a box's floor joins its walls plainly (no fingers or slots between them:
 * from above, the walls' tabs going down into the floor only made a zigzag along it), while the walls keep the
 * finger joints at their corners. A shallow copy; the design is not changed.
 */
function forPicture(d: Design): Design {
  const floors = new Set(boxBases(d));
  if (!floors.size) return d;
  const connections = Object.fromEntries(
    Object.entries(d.connections).map(([k, c]) => [k, c.geom && (floors.has(c.a.panelId) || floors.has(c.b.panelId)) ? { ...c, geom: { ...c.geom, edges: [] } } : c]),
  );
  return { ...d, connections };
}

/**
 * Whether two boards are joined to each other (any connection between them). Milestone 173: for a board standing on a
 * board that is not a box's base (a lid's handle, a brim's strips), how deep its tabs reach into it (mm), so their
 * faces are ordered by their planes all the same; 0 otherwise.
 */
function joinedIn(d: Design): ((a: string, b: string) => boolean) & { reach?: (a: string, b: string) => number } {
  const pairs = new Set<string>();
  for (const c of Object.values(d.connections)) {
    pairs.add(`${c.a.panelId}|${c.b.panelId}`);
    pairs.add(`${c.b.panelId}|${c.a.panelId}`);
  }
  const floors = new Set(boxBases(d));
  const stand = new Map<string, number>();
  for (const id of d.order) {
    const pl = d.panels[id]?.place;
    if (pl?.pose !== 'standing' || !pl.host || floors.has(pl.host) || !d.panels[pl.host]) continue;
    const r = matOf(d, pl.host).thickness + 0.5;
    stand.set(`${id}|${pl.host}`, r);
    stand.set(`${pl.host}|${id}`, r);
  }
  const f = (a: string, b: string) => pairs.has(`${a}|${b}`);
  return Object.assign(f, { reach: (a: string, b: string) => stand.get(`${a}|${b}`) ?? 0 });
}

/** The faces and their paint order, for tests. */
export function facesForTest(design: Design, prop?: Prop) {
  const d = forPicture(design);
  const shown = posedDisplay(d);
  const faces = designFaces(d, shown);
  const nBoard = faces.length;
  if (prop) propFaces(d, shown.xf, prop, faces);
  const visible = faces.filter((f) => f.normal.dot(VIEW) > 1e-4);
  return { faces, nBoard, order: paintOrder(visible, joinedIn(d)), visible };
}

/** How often the last ordering had to break a cycle (for tests). */
export const stuck = { count: 0 };

type Pt = [number, number];
/** Whether two polygons on screen overlap inside (touching along an edge or at a corner does not count). */
function overlaps(a: Pt[], b: Pt[]): boolean {
  const cross = (o: Pt, p: Pt, q: Pt) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const e = 1e-6;
  for (let i = 0; i < a.length; i++) {
    const p1 = a[i], p2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const q1 = b[j], q2 = b[(j + 1) % b.length];
      const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2), d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
      // a proper crossing of two edges
      if (((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))) return true;
    }
  }
  // one inside the other: a point just inside one polygon's corner, in the other
  const inside = (q: Pt, r: Pt[]) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if (r[i][1] > q[1] !== r[j][1] > q[1] && q[0] < ((r[j][0] - r[i][0]) * (q[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    return c;
  };
  const nudged = (r: Pt[]) => {
    const cx = r.reduce((s, p) => s + p[0], 0) / r.length, cy = r.reduce((s, p) => s + p[1], 0) / r.length;
    return r.map((p): Pt => [p[0] + (cx - p[0]) * 0.02, p[1] + (cy - p[1]) * 0.02]);
  };
  return nudged(a).some((q) => inside(q, b)) || nudged(b).some((q) => inside(q, a));
}

/** Faces in the order to paint them: a face entirely behind another's plane goes first; otherwise the farther. */
function paintOrder(faces: Face[], joined: ((a: string, b: string) => boolean) & { reach?: (a: string, b: string) => number } = () => false): Face[] {
  stuck.count = 0;
  const n = faces.length;
  const P = faces.map((f) => f.pts);
  const box = P.map((pts) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      const x = sx(p), y = sy(p);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { x0, x1, y0, y1 };
  });
  const cen = P.map((pts) => pts.reduce((s, p) => s + depth(p), 0) / pts.length + 0);
  const flat2 = P.map((pts) => pts.map((p): Pt => [sx(p), sy(p)]));
  // where a's points lie against b's plane (b faces the viewer): -1 all on or behind it, 1 all on or in front, 0 both
  const side = (a: number, b: number, tol = 0.01) => {
    const nb = faces[b].normal, pb = P[b][0];
    let back = false, front = false;
    for (const p of P[a]) {
      const s = p.clone().sub(pb).dot(nb);
      if (s < -tol) back = true;
      else if (s > 0.01) front = true;
    }
    return back && !front ? -1 : front && !back ? 1 : 0;
  };
  const after: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const A = box[i], B = box[j];
      if (A.x1 <= B.x0 + 0.01 || B.x1 <= A.x0 + 0.01 || A.y1 <= B.y0 + 0.01 || B.y1 <= A.y0 + 0.01) continue;
      // two joined boards' faces cross at their joints (a wall's tabs through the base's slots): their plane tests
      // contradict each other and make cycles, so the nearer centre decides between them
      const bi = faces[i].board, bj = faces[j].board;
      // milestone 173: a board standing on a lid (a handle) is ordered by the planes, its tabs in the lid let pass
      const reach = bi && bj && bi !== bj ? joined.reach?.(bi, bj) ?? 0 : 0;
      if (bi && bj && bi !== bj && joined(bi, bj) && !reach) continue;
      // only faces that really overlap on screen are ordered against each other (boxes overlapping is not enough:
      // a die and the base's front edge strip are not in each other's way, and ordering them made cycles)
      if (!overlaps(flat2[i], flat2[j])) continue;
      let first: number, second: number;
      // i first when it is behind j's plane or j is in front of i's; the other way round likewise
      const ij = side(i, j, reach || 0.01), ji = side(j, i, reach || 0.01);
      const iFirst = ij === -1 || ji === 1, jFirst = ij === 1 || ji === -1;
      if (iFirst && !jFirst) [first, second] = [i, j];
      else if (jFirst && !iFirst) [first, second] = [j, i];
      else if ((faces[i].lift ?? 0) !== (faces[j].lift ?? 0)) [first, second] = (faces[i].lift ?? 0) < (faces[j].lift ?? 0) ? [i, j] : [j, i];
      else continue;
      after[first].push(second);
      indeg[second]++;
    }
  // Kahn's order, the farthest ready face first; a cycle is broken at its farthest face
  const done = new Array(n).fill(false);
  const order: number[] = [];
  const ready = () => {
    let best = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (best < 0 || cen[i] < cen[best])) best = i;
    if (best >= 0) return best;
    // a cycle: the face held back by the fewest others, the farthest of those
    for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || indeg[i] < indeg[best] || (indeg[i] === indeg[best] && cen[i] < cen[best]))) best = i;
    return best;
  };
  for (let k = 0; k < n; k++) {
    const i = ready();
    if (indeg[i] > 0) stuck.count++;
    done[i] = true;
    order.push(i);
    for (const j of after[i]) indeg[j]--;
  }
  return order.map((i) => faces[i]);
}

const f1 = (v: number) => Math.round(v * 10) / 10;
const pathOf = (rings: THREE.Vector3[][], close = true) => rings.map((r) => 'M' + r.map((p) => `${f1(sx(p))} ${f1(sy(p))}`).join('L') + (close ? 'Z' : '')).join('');

/**
 * The design as an SVG illustration, as a data URL (`w` × `h` is its shape; it scales). `prop` puts things
 * inside its box. Null when there is nothing to draw.
 */
export function illustrateDesign(d: Design, w: number, h: number, opts: PictureOpts = {}): string | null {
  const svg = illustrationSvg(d, w, h, opts);
  return svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : null;
}

/**
 * Every board's faces, and every bent strip's (a living hinge, a round wall), posed for the picture; milestone 147:
 * every flap folded as the 3D view folds it (a joint's glue flaps and a carton's end flaps, a board's shaped edge
 * flaps), every fold-over's liner, and a board's cut lines. `drawn` collects what was drawn, for the coverage test.
 */
function designFaces(d: Design, shown: Posed, drawn = new Set<string>()): Face[] {
  const faces: Face[] = [];
  const IDM = new THREE.Matrix4();
  const floors = new Set(boxBases(d));
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    const M = (shown.xf.get(id) ?? IDM).clone().multiply(frameMatrix(p.frame));
    boardFaces(d, id, M, matOf(d, id).kind, faces, floors.has(id), drawn);
    drawn.add(`board:${id}`);
  }
  const flap = (f: Flap3d, key: string) => {
    const on = d.panels[f.panelId];
    if (!on || f.poly.length < 3) return;
    const owner = f.owner && d.panels[f.owner] ? f.owner : f.panelId;
    const side = (f.frame ?? on.frame).side;
    const zs: [number, number] = side === 1 ? [f.z0, f.z1] : [-f.z1, -f.z0];
    slabFaces([f.poly], [], zs, flapMatrix(d, f, shown.xf, shown.flapT.get(key) ?? 1), matOf(d, owner).kind, owner, `flap:${key}`, faces);
    drawn.add(`flap:${key}`);
  };
  for (const c of Object.values(d.connections)) c.geom?.flaps3d.forEach((f, i) => flap(f, `${c.id}:${i}`));
  for (const h of edgeFeatures(d)) h.out.hinged.forEach((f, i) => flap(f, `${h.panelId}:${h.key}:${i}`));
  // a fold-over's liner (and its lock tabs) on the wall's inner face, as the 3D view shows it folded
  for (const fo of allFoldOvers(d)) {
    const p = d.panels[fo.panelId];
    if (!p) continue;
    const t = matOf(d, p.id).thickness;
    const { e, x0, x1, q0, q1 } = fo.g.liner;
    const dir = segDir(e), inw = segInward(e);
    const at = (u: number, q: number): P2 => ({ x: e.a.x + dir.x * u + inw.x * q, y: e.a.y + dir.y * u + inw.y * q });
    const polys = [[at(x0, q0), at(x1, q0), at(x1, q1), at(x0, q1)], ...fo.g.tabs.map((tb) => [at(tb.x0, q1), at(tb.x1, q1), at(tb.x1 - 0.18 * (tb.x1 - tb.x0), q1 + t + tb.depth), at(tb.x0 + 0.18 * (tb.x1 - tb.x0), q1 + t + tb.depth)])];
    const zs: [number, number] = p.frame.side === 1 ? [t, 2 * t] : [-2 * t, -t];
    const M = (shown.xf.get(p.id) ?? IDM).clone().multiply(frameMatrix(p.frame));
    polys.forEach((poly, i) => slabFaces([poly], [], zs, M, matOf(d, p.id).kind, p.id, `liner:${fo.f.id}:${i}`, faces));
    drawn.add(`liner:${fo.f.id}`);
  }
  for (const b of shown.bands) {
    const parent = b.band.parent;
    if (!d.panels[parent]) continue;
    const look = LOOK[matOf(d, parent).kind];
    const m = shown.xf.get(parent) ?? IDM;
    const M = b.pre ? m.clone().multiply(b.pre) : m;
    const g = bandGeometry(b);
    const pos = g.getAttribute('position');
    const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(M);
    // six corners a quad (a b c, a c d): outer face, inner face, then its two ends, for each step round the bend
    for (let q = 0; q * 6 < pos.count; q++) {
      const a = v(q * 6), bb = v(q * 6 + 1), c = v(q * 6 + 2), dd = v(q * 6 + 5);
      const normal = new THREE.Vector3().crossVectors(bb.clone().sub(a), c.clone().sub(a));
      if (normal.lengthSq() < 1e-12) continue;
      normal.normalize();
      const end = q % 4 >= 2;
      faces.push({ pts: [a, bb, c, dd], normal, fill: end ? look.edge : look.face, stroke: end ? look.line : 'none', board: parent, part: `band:${b.band.id}` });
    }
    drawn.add(`band:${b.band.id}`);
    g.dispose();
  }
  return faces;
}

/**
 * What a design has that its picture must draw (milestone 147, PRESETS_OVERHAUL.md §5.2), and what the picture drew:
 * every board, band, folded flap, fold-over and cut line (5 mm or longer).
 */
export function pictureCoverage(design: Design): { want: string[]; drawn: string[] } {
  const d = forPicture(design);
  const shown = posedDisplay(d);
  const drawn = new Set<string>();
  designFaces(d, shown, drawn);
  const want: string[] = [];
  for (const id of d.order) if (d.panels[id]) want.push(`board:${id}`);
  for (const b of shown.bands) if (d.panels[b.band.parent]) want.push(`band:${b.band.id}`);
  for (const c of Object.values(d.connections)) c.geom?.flaps3d.forEach((f, i) => f.poly.length >= 3 && d.panels[f.panelId] && want.push(`flap:${c.id}:${i}`));
  for (const h of edgeFeatures(d)) h.out.hinged.forEach((_, i) => want.push(`flap:${h.panelId}:${h.key}:${i}`));
  for (const fo of allFoldOvers(d)) if (d.panels[fo.panelId]) want.push(`liner:${fo.f.id}`);
  for (const p of Object.values(d.panels))
    for (const ln of p.lines ?? []) {
      if (ln.type !== 'cut' && ln.type !== 'perf' && ln.type !== 'cutcrease') continue;
      const long = clippedLine(p, ln).some((pl) => pl.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - pl[i].x, q.y - pl[i].y), 0) >= 5);
      if (long) want.push(`line:${p.id}:${ln.id}`);
    }
  return { want, drawn: [...drawn] };
}

export type PictureOpts = { prop?: Prop; pose?: Pose; view?: ViewName; /** A tube's bottom flaps opened this far (milestone 151: a carton's bottom shows, hanging out below it). */ bottomOpen?: number };

export function illustrationSvg(design: Design, w: number, h: number, opts: PictureOpts = {}): string | null {
  const d = forPicture(design);
  // milestone 148: posed as the design shows best (pose.ts), unless the caller asks for a pose of its own
  const pose = { ...(opts.pose ?? autoPose(d)), ...(opts.bottomOpen !== undefined ? { bottomEnds: opts.bottomOpen } : {}) };
  const shown = posedDisplay(d, pose);
  const faces = designFaces(d, shown);
  if (!faces.length) return null;
  const prop = opts.prop ?? pose.prop;
  if (prop) propFaces(d, shown.xf, prop, faces);
  const main = scene(d, shown, faces, w, h, opts.view ?? 'front34', true);
  const [vx, vy, vw, vh] = main.box;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f1(vx)} ${f1(vy)} ${f1(vw)} ${f1(vh)}" width="${w}" height="${h}"><defs><radialGradient id="cf-shadow"><stop offset="0" stop-color="#232b38" stop-opacity="0.22"/><stop offset="1" stop-color="#232b38" stop-opacity="0"/></radialGradient></defs>${main.body}</svg>`;
}

/** Posed faces seen from one view: the painted paths and the view box that frames them in `w` × `h`. */
function scene(d: Design, shown: Posed, faces: Face[], w: number, h: number, view: ViewName, withShadow: boolean): { body: string; box: [number, number, number, number] } {
  setView(view);
  try {
    const visible = faces.filter((f) => f.normal.dot(VIEW) > 1e-4);
    // the frame: every point, with room around it, in the asked proportion
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, low = Infinity;
    for (const f of faces)
      for (const p of f.pts) {
        x0 = Math.min(x0, sx(p));
        x1 = Math.max(x1, sx(p));
        y0 = Math.min(y0, sy(p));
        y1 = Math.max(y1, sy(p));
        low = Math.min(low, p.y);
      }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.08;
    let vw = x1 - x0 + 2 * pad, vh = y1 - y0 + 2 * pad;
    const want = w / h;
    if (vw / vh < want) vw = vh * want;
    else vh = vw / want;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const vx = cx - vw / 2, vy = cy - vh / 2;
    // a stroke about one pixel at the size shown
    const px = vw / w;
    // the contact shadow: the footprint's centre on the floor, under everything
    let shadow = '';
    if (withShadow) {
      let fx = 0, fz = 0, fn = 0;
      for (const f of faces) for (const p of f.pts) if (p.y < low + 1) (fx += p.x), (fz += p.z), fn++;
      const foot = new THREE.Vector3(fx / Math.max(1, fn), low, fz / Math.max(1, fn));
      shadow = `<ellipse cx="${f1(sx(foot))}" cy="${f1(sy(foot) + (y1 - y0) * 0.02)}" rx="${f1((x1 - x0) * 0.5)}" ry="${f1((x1 - x0) * 0.12)}" fill="url(#cf-shadow)"/>`;
    }
    // the design's middle, to tell a wall's inner face (turned towards it) from its outer one
    let mx = 0, mz = 0, mn = 0;
    for (const f of faces) for (const p of f.pts) (mx += p.x), (mz += p.z), mn++;
    mx /= mn;
    mz /= mn;
    const inner = (f: Face) => {
      if (!f.board || Math.abs(f.normal.y) > 0.5) return false;
      const c = f.pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(f.pts.length);
      return f.normal.x * (mx - c.x) + f.normal.z * (mz - c.z) > 0;
    };
    const body = paintOrder(visible, joinedIn(d))
      .map((f) => {
        const look = (Object.values(LOOK) as (typeof LOOK)[MaterialKind][]).find((l) => l.face === f.fill || l.edge === f.fill);
        const fill = f.fill.startsWith('#') ? shade(f.fill, f.normal, inner(f), look?.contrast ?? 1) : f.fill;
        // big faces outlined in their material's line; cut edges (thin strips) lighter, so joints do not turn to noise
        const edge = !!f.lines || (f.board && f.pts.length === 4 && Math.abs(f.normal.y) < 0.99 && f.fill === LOOK[kindOfEdge(f.fill)].edge);
        const ghost = f.board && shown.ghost.has(f.board) ? ' opacity="0.28"' : '';
        const shape = `<path d="${pathOf([f.pts, ...(f.holes ?? [])])}" fill="${fill}"${ghost} fill-rule="evenodd" stroke="${f.stroke}" stroke-opacity="${edge ? 0.45 : 0.85}" stroke-width="${f1(px * (edge ? 0.7 : 1.05) * 10) / 10}" stroke-linejoin="round"/>`;
        const lines = f.lines?.length ? `<path d="${pathOf(f.lines, false)}" fill="none" stroke="${detailFor(f.fill)}" stroke-width="${f1(px * 0.8 * 10) / 10}" opacity="0.8"/>` : '';
        // a board's slits and tear lines (milestone 147): its outline colour, perforations dashed
        const marks = (f.marks ?? []).map((mk) => `<path d="${pathOf([mk.pts], false)}" fill="none" stroke="${f.stroke}" stroke-width="${f1(px * 1.1 * 10) / 10}"${mk.dashed ? ` stroke-dasharray="${f1(px * 3)} ${f1(px * 2)}"` : ''} stroke-linecap="round"/>`).join('');
        return shape + lines + marks;
      })
      .join('');
    return { body: shadow + body, box: [vx, vy, vw, vh] };
  } finally {
    setView('front34');
  }
}

/** The material whose edge colour this is (plywood when none). */
function kindOfEdge(edge: string): MaterialKind {
  for (const k of Object.keys(LOOK) as MaterialKind[]) if (LOOK[k].edge === edge) return k;
  return 'plywood';
}

/** The detail colour (plies, flutes) of a material by its edge colour. */
function detailFor(edge: string): string {
  for (const k of Object.keys(LOOK) as MaterialKind[]) if (LOOK[k].edge === edge) return LOOK[k].detail;
  return '#00000033';
}
