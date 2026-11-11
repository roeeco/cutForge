// Seeded random-operation fuzzer for the modelling engine.
// Ops are recorded as data (choices are indices resolved at apply time), so a
// failing sequence replays deterministically in a fresh process.
import * as ops from '../../src/model/ops';
import { setArray } from '../../src/model/edit';
import { MATERIALS, matOf } from '../../src/model/materials';
import { validate } from '../../src/model/validate';
import { buildPieces, netOverlaps, netGroups } from '../../src/model/pieces';
import { parseProject, serializeProject } from '../../src/model/serialize';
import { panelNotches, panelOutline, panelExtras } from '../../src/model/geometry';
import { edgePieces, findEdge, panelEdges, segLength } from '../../src/model/edges';
import { flattenContour, polygonArea, pointInPolygon } from '../../src/geom/vec';
import { ownOutline } from '../../src/model/outline';
import type { ConnectionKind, Design, P2 } from '../../src/model/types';

export function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Op = { op: string; a: any[] };

const KINDS: ConnectionKind[] = ['finger', 'tabslot', 'slide', 'fold', 'glue', 'halflap', 'lean', 'butt'];
const ANGLES = [90, 90, 90, 45, 135, 60, 30, 15, 120, 0, 180, 10];

// ---------------------------------------------------------------------------
// Resolution helpers: an index → an id at apply time

const pick = <T,>(xs: T[], i: number): T | undefined => (xs.length ? xs[((i % xs.length) + xs.length) % xs.length] : undefined);
const panelAt = (d: Design, i: number) => pick(d.order, i);
const connAt = (d: Design, i: number) => pick(Object.keys(d.connections), i);
const trayAt = (d: Design, i: number) => pick(Object.keys(d.trays ?? {}), i);
const detailAt = (d: Design, i: number) => pick(d.order.flatMap((id) => d.panels[id]?.details.map((x) => x.id) ?? []), i);
const edgeAt = (d: Design, pid: string | undefined, i: number) => {
  const p = pid ? d.panels[pid] : undefined;
  return p ? pick(panelEdges(p).map((e) => e.key), i) : undefined;
};
const wallAt = (d: Design, i: number) => pick(d.order.filter((id) => d.panels[id]?.sketch.kind === 'wall'), i);
const rootAt = (d: Design, i: number) => pick(d.order.filter((id) => d.panels[id]?.sketch.kind === 'poly' && !ops.parentConnection(d, id)), i);

// ---------------------------------------------------------------------------
// Apply one recorded op

export function applyOp(d: Design, o: Op): void {
  const A = o.a;
  switch (o.op) {
    case 'addRootPanel':
      ops.addRootPanel(d, A[0], A[1], A[2], A[3]);
      break;
    case 'addPolygonPanel':
      ops.addPolygonPanel(d, A[0], A[1], A[2]);
      break;
    case 'growPanel': {
      const p = panelAt(d, A[0]);
      const e = edgeAt(d, p, A[1]);
      if (p && e) ops.growPanel(d, p, e, A[2]);
      break;
    }
    case 'addTray': {
      const p = panelAt(d, A[0]);
      if (p) ops.addTray(d, p, A[1], A[2]);
      break;
    }
    case 'setTrayHeight': {
      const t = trayAt(d, A[0]);
      if (t) ops.setTrayHeight(d, t, A[1]);
      break;
    }
    case 'setTrayKinds': {
      const t = trayAt(d, A[0]);
      if (t) ops.setTrayKinds(d, t, A[1]);
      break;
    }
    case 'wallIt': {
      const t = trayAt(d, A[0]);
      const tr = t ? d.trays[t] : undefined;
      const e = tr ? pick(tr.openEdges, A[1]) : undefined;
      if (t && e) ops.wallIt(d, t, e);
      break;
    }
    case 'setCustomHeight': {
      const w = wallAt(d, A[0]);
      if (w) ops.setCustomHeight(d, w, A[1]);
      break;
    }
    case 'addDivider': {
      const p = panelAt(d, A[0]);
      const e = edgeAt(d, p, A[1]);
      if (p && e) ops.addDivider(d, p, e, A[2], A[3]);
      break;
    }
    case 'addDividerFor': {
      const a = panelAt(d, A[0]), b = panelAt(d, A[1]);
      if (a && b) ops.addDividerFor(d, a, b);
      break;
    }
    case 'setDividerOffset': {
      const p = panelAt(d, A[0]);
      if (p) ops.setDividerOffset(d, p, A[1]);
      break;
    }
    case 'addSideWalls': {
      const p = panelAt(d, A[0]);
      const e = edgeAt(d, p, A[1]);
      if (p && e) ops.addSideWalls(d, p, e, A[2], A[3], A[4]);
      break;
    }
    case 'setPanelSize': {
      const p = panelAt(d, A[0]);
      if (p) ops.setPanelSize(d, p, A[1] ?? undefined, A[2] ?? undefined);
      break;
    }
    case 'setEdgeLength': {
      const p = rootAt(d, A[0]);
      const e = edgeAt(d, p, A[1]);
      if (p && e) ops.setEdgeLength(d, p, e, A[2]);
      break;
    }
    case 'moveVertex': {
      const p = rootAt(d, A[0]);
      const s = p ? d.panels[p].sketch : undefined;
      if (p && s?.kind === 'poly') {
        const i = ((A[1] % s.pts.length) + s.pts.length) % s.pts.length;
        const q = s.pts[i];
        ops.moveVertex(d, p, i, { x: q.x + A[2], y: q.y + A[3] });
      }
      break;
    }
    case 'insertVertex': {
      const p = rootAt(d, A[0]);
      const s = p ? d.panels[p].sketch : undefined;
      if (p && s?.kind === 'poly') ops.insertVertex(d, p, ((A[1] % s.pts.length) + s.pts.length) % s.pts.length, A[2]);
      break;
    }
    case 'deleteVertex': {
      const p = rootAt(d, A[0]);
      const s = p ? d.panels[p].sketch : undefined;
      if (p && s?.kind === 'poly') ops.deleteVertex(d, p, ((A[1] % s.pts.length) + s.pts.length) % s.pts.length);
      break;
    }
    case 'setWallCorner': {
      const w = wallAt(d, A[0]);
      if (w) ops.setWallCorner(d, w, A[1], { dx: A[2], dy: A[3] });
      break;
    }
    case 'addWallInsert': {
      const w = wallAt(d, A[0]);
      if (w) ops.addWallInsert(d, w, A[1], A[2], A[3]);
      break;
    }
    case 'moveWallInsert': {
      const w = wallAt(d, A[0]);
      const s = w ? d.panels[w].sketch : undefined;
      const ins = s?.kind === 'wall' ? pick(s.inserts ?? [], A[1]) : undefined;
      if (w && ins) ops.moveWallInsert(d, w, ins.id, A[2]);
      break;
    }
    case 'deleteWallInsert': {
      const w = wallAt(d, A[0]);
      const s = w ? d.panels[w].sketch : undefined;
      const ins = s?.kind === 'wall' ? pick(s.inserts ?? [], A[1]) : undefined;
      if (w && ins) ops.deleteWallInsert(d, w, ins.id);
      break;
    }
    case 'setPointCurve': {
      const p = panelAt(d, A[0]);
      if (!p) break;
      const s = d.panels[p].sketch;
      let pt: ops.OutlinePoint;
      if (s.kind === 'poly') pt = ((A[1] % s.pts.length) + s.pts.length) % s.pts.length;
      else {
        const cands: string[] = ['tl', 'tr', ...(s.inserts ?? []).map((x) => x.id)];
        pt = pick(cands, A[1])!;
      }
      ops.setPointCurve(d, p, pt, A[2]);
      break;
    }
    case 'addFoldOver': {
      const w = wallAt(d, A[0]);
      if (w) ops.addFoldOver(d, w, A[1]);
      break;
    }
    case 'updateFoldOver': {
      const w = pick(d.order.filter((id) => d.panels[id]?.foldOvers?.length), A[0]);
      const f = w ? pick(d.panels[w].foldOvers!, A[1]) : undefined;
      if (w && f) ops.updateFoldOver(d, w, f.id, A[2]);
      break;
    }
    case 'removeFoldOver': {
      const w = pick(d.order.filter((id) => d.panels[id]?.foldOvers?.length), A[0]);
      const f = w ? pick(d.panels[w].foldOvers!, A[1]) : undefined;
      if (w && f) ops.removeFoldOver(d, w, f.id);
      break;
    }
    case 'deletePanel': {
      const p = panelAt(d, A[0]);
      if (p) ops.deletePanel(d, p);
      break;
    }
    case 'addDetail': {
      const p = panelAt(d, A[0]);
      if (!p) break;
      const P = d.panels[p];
      ops.addDetail(d, p, A[1], A[2], P.w * A[3], P.h * A[4], A[5], A[6], undefined, A[7]);
      break;
    }
    case 'addPolygonShape': {
      const p = panelAt(d, A[0]);
      if (!p) break;
      const P = d.panels[p];
      const pts = (A[1] as P2[]).map((q) => ({ x: q.x * P.w, y: q.y * P.h }));
      ops.addPolygonShape(d, p, pts, A[2], A[3], undefined, A[4]);
      break;
    }
    case 'updateDetail': {
      const x = detailAt(d, A[0]);
      if (x) ops.updateDetail(d, x, A[1]);
      break;
    }
    case 'setArray': {
      const x = detailAt(d, A[0]);
      if (x) setArray(d, x, A[1]);
      break;
    }
    case 'rotateDetails': {
      const x = detailAt(d, A[0]), y = detailAt(d, A[1]);
      const ids = [x, y].filter((q): q is string => !!q);
      if (ids.length) ops.rotateDetails(d, [...new Set(ids)], A[2]);
      break;
    }
    case 'deleteDetail': {
      const x = detailAt(d, A[0]);
      if (x) ops.deleteDetail(d, x);
      break;
    }
    case 'setMaterial':
      ops.setMaterial(d, MATERIALS[A[0]]);
      break;
    case 'setPanelMaterial': {
      const p = panelAt(d, A[0]);
      if (p) ops.setPanelMaterial(d, [p], A[1] === null ? null : MATERIALS[A[1]]);
      break;
    }
    case 'editMaterial': {
      const ids = [d.material.id, ...Object.keys(d.materials ?? {})];
      const id = pick(ids, A[0])!;
      ops.editMaterial(d, id, A[1]);
      break;
    }
    case 'setConnection': {
      const c = connAt(d, A[0]);
      if (c) ops.setConnection(d, c, A[1]);
      break;
    }
    case 'setAllJoints':
      ops.setAllJoints(d, A[0], A[1]);
      break;
    case 'setDefaultFlap':
      ops.setDefaultFlap(d, A[0]);
      break;
    case 'setTrayFlat': {
      const t = trayAt(d, A[0]);
      if (t) ops.setTrayFlat(d, t, A[1]);
      break;
    }
    case 'setTrayPin': {
      const t = trayAt(d, A[0]);
      if (!t) break;
      const base = d.panels[d.trays[t].baseId];
      const e = edgeAt(d, base?.id, A[1]);
      if (e) ops.setTrayPin(d, t, e, A[2]);
      break;
    }
    case 'rotatePanel': {
      const p = panelAt(d, A[0]);
      if (p) ops.rotatePanel(d, p, A[1]);
      break;
    }
    case 'movePanel': {
      const p = panelAt(d, A[0]);
      if (p) ops.movePanel(d, p, A[1], A[2]);
      break;
    }
    case 'addPlacedPanel': {
      const host = A[0] === null ? null : panelAt(d, A[0]) ?? null;
      ops.addPlacedPanel(d, { host, face: A[1], x: A[2], y: A[3], rot: A[4], pose: A[5], ...(A[5] === 'standing' ? { side: A[6] } : {}) }, A[7], A[8], { construction: A[9] });
      break;
    }
    case 'rehost': {
      const p = pick(d.order.filter((id) => d.panels[id]?.place), A[0]);
      const host = A[1] === null ? null : panelAt(d, A[1]) ?? null;
      if (p) {
        const pl = d.panels[p].place!;
        ops.rehost(d, p, { ...pl, host, face: A[2] });
      }
      break;
    }
    case 'movePlaced': {
      const p = pick(d.order.filter((id) => d.panels[id]?.place), A[0]);
      if (p) ops.movePlaced(d, p, A[1], A[2]);
      break;
    }
    case 'setPlacedPose': {
      const p = pick(d.order.filter((id) => d.panels[id]?.place), A[0]);
      if (p) ops.setPlacedPose(d, p, A[1]);
      break;
    }
    case 'setConstruction': {
      const p = panelAt(d, A[0]);
      if (p) ops.setConstruction(d, p, A[1]);
      break;
    }
    case 'deleteConnection': {
      const c = connAt(d, A[0]);
      if (c) ops.deleteConnection(d, c);
      break;
    }
    default:
      throw new Error('unknown op ' + o.op);
  }
}

// ---------------------------------------------------------------------------
// Random op generation

export function genOp(r: () => number, mode: { edge: boolean } = { edge: true }): Op {
  const ri = (n: number) => Math.floor(r() * n);
  const idx = () => ri(1000);
  const ch = <T,>(xs: readonly T[]): T => xs[ri(xs.length)];
  const edgy = () => mode.edge && r() < 0.12;
  const size = () => (edgy() ? ch([0, 1, 4.9, 5, -20, 2000, 0.01]) : Math.round(20 + r() * 230));
  const height = () => (edgy() ? ch([0, 1, 5, 6, -5, 900]) : Math.round(15 + r() * 120));
  const angle = () => ch(ANGLES);
  const OPS: [string, number, () => any[]][] = [
    ['addRootPanel', 6, () => [Math.round((r() - 0.5) * 400), Math.round((r() - 0.5) * 400), size(), size()]],
    ['addPolygonPanel', 3, () => {
      if (r() < 0.6) return [0, 0, ops.regularPolygon(3 + ri(8), 30 + r() * 80, r() < 0.5 ? 0 : r() * 6)];
      const n = 3 + ri(6);
      const pts = Array.from({ length: n }, (_, k) => {
        const a = (2 * Math.PI * k) / n, rr = 30 + r() * 80;
        return { x: Math.round(rr * Math.cos(a)), y: Math.round(rr * Math.sin(a)) };
      });
      return [0, 0, r() < 0.1 ? pts.reverse() : pts];
    }],
    ['growPanel', 10, () => {
      const kind = ch(KINDS);
      const opts: any = { height: height(), angle: angle(), dir: r() < 0.8 ? 'up' : 'down', kind };
      if (r() < 0.2) opts.offset = ch([0, 1, 3, 10, 30, -2]);
      if (r() < 0.2) opts.span = [Math.round(r() * 60), Math.round(20 + r() * 150)];
      if (r() < 0.1) opts.sketch = { kind: 'wall', corners: { tl: { dx: Math.round((r() - 0.5) * 30), dy: Math.round((r() - 0.5) * 30) } } };
      return [idx(), idx(), opts];
    }],
    ['addTray', 7, () => {
      const k: any = r() < 0.3 ? { wallKind: ch(KINDS), cornerKind: ch(KINDS) } : undefined;
      return [idx(), height(), k];
    }],
    ['setTrayHeight', 3, () => [idx(), height()]],
    ['setTrayKinds', 3, () => [idx(), r() < 0.5 ? { wallKind: ch(KINDS) } : r() < 0.5 ? { cornerKind: ch(KINDS) } : { tabLen: ch(['flush', 'through', 'snap', 'bolt']) }]],
    ['wallIt', 2, () => [idx(), idx()]],
    ['setCustomHeight', 1, () => [idx(), r() < 0.5]],
    ['addDivider', 4, () => [idx(), idx(), edgy() ? ch([0, 0.5, -3, 1000]) : Math.round(5 + r() * 100), height()]],
    ['addDividerFor', 3, () => [idx(), idx()]],
    ['setDividerOffset', 2, () => [idx(), edgy() ? ch([0, -5, 2000]) : Math.round(r() * 120)]],
    ['addSideWalls', 1, () => [idx(), idx(), ch([30, 45, 60, 75, 90]), height(), r() < 0.8 ? 'up' : 'down']],
    ['setPanelSize', 5, () => [idx(), r() < 0.6 ? size() : null, r() < 0.6 ? size() : null]],
    ['setEdgeLength', 2, () => [idx(), idx(), size()]],
    ['moveVertex', 3, () => [idx(), idx(), Math.round((r() - 0.5) * 80), Math.round((r() - 0.5) * 80)]],
    ['insertVertex', 2, () => [idx(), idx(), ch([0.5, 0.25, 0.01, 0.99])]],
    ['deleteVertex', 2, () => [idx(), idx()]],
    ['setWallCorner', 3, () => [idx(), ch(['tl', 'tr', 'bl', 'br']), Math.round((r() - 0.5) * 60), Math.round((r() - 0.5) * 60)]],
    ['addWallInsert', 2, () => [idx(), ch(['e1', 'e2', 'e3']), r(), Math.round((r() - 0.3) * 50)]],
    ['moveWallInsert', 1, () => [idx(), idx(), { t: r(), off: Math.round((r() - 0.3) * 60) }]],
    ['deleteWallInsert', 1, () => [idx(), idx()]],
    ['setPointCurve', 2, () => [idx(), idx(), r() < 0.8]],
    ['addFoldOver', 2, () => [idx(), ch(['e1', 'e2', 'e3', 'e2'])]],
    ['updateFoldOver', 1, () => [idx(), idx(), ch([{ depth: Math.round(r() * 40) }, { depth: null }, { lock: 'tabs' }, { lock: 'glue' }, { locks: ri(6) }, { lockDepth: Math.round(r() * 20) }])]],
    ['removeFoldOver', 1, () => [idx(), idx()]],
    ['deletePanel', 3, () => [idx()]],
    ['addDetail', 6, () => [idx(), ch(['rect', 'circle', 'roundrect'] as const), ch(['cut', 'cut', 'add', 'engrave', 'score'] as const), r() * 1.2 - 0.1, r() * 1.2 - 0.1, edgy() ? ch([0, 0.1, 500]) : Math.round(3 + r() * 40), edgy() ? ch([0, 0.1, 500]) : Math.round(3 + r() * 40), r() < 0.3]],
    ['addPolygonShape', 2, () => {
      const n = 3 + ri(5);
      const cx = 0.2 + r() * 0.6, cy = 0.2 + r() * 0.6, rr = 0.05 + r() * 0.3;
      const pts = Array.from({ length: n }, (_, k) => ({ x: cx + rr * Math.cos((2 * Math.PI * k) / n), y: cy + rr * Math.sin((2 * Math.PI * k) / n) }));
      return [idx(), pts, ch(['cut', 'add', 'engrave']), r() < 0.3 ? n : undefined, r() < 0.3];
    }],
    ['updateDetail', 3, () => [idx(), ch([{ cx: Math.round(r() * 200) }, { cy: Math.round(r() * 200) }, { w: Math.round(r() * 60) }, { h: Math.round(r() * 60) }, { op: ch(['cut', 'add', 'engrave', 'score']) }, { through: r() < 0.5 }, { rot: ch([0, 45, 90, 30, 180]) }, { r: Math.round(r() * 20) }])]],
    ['setArray', 1, () => [idx(), r() < 0.2 ? null : { nx: 1 + ri(4), ny: 1 + ri(3), dx: Math.round(5 + r() * 30), dy: Math.round(5 + r() * 30) }]],
    ['rotateDetails', 1, () => [idx(), idx(), ch([45, 90, 30, -90, 180])]],
    ['deleteDetail', 1, () => [idx()]],
    ['setMaterial', 2, () => [ri(MATERIALS.length)]],
    ['setPanelMaterial', 2, () => [idx(), r() < 0.25 ? null : ri(MATERIALS.length)]],
    ['editMaterial', 1, () => [idx(), ch([{ thickness: ch([0.3, 1, 3, 6, 12]) }, { clearance: ch([0, 0.1, 0.5]) }, { kerf: ch([0, 0.2]) }, { foldAllowance: ch([0, 1, 5]) }])]],
    ['setConnection', 6, () => [idx(), ch([{ kind: ch(KINDS) }, { fingers: ch([null, 3, 5, 7, 2, 20]) }, { tabs: ch([null, 1, 2, 5, 0]) }, { flap: ch([null, 3, 10, 50]) }, { angle: angle() }, { offset: ch([0, 3, 10, 40, -1]) }, { dir: ch(['up', 'down']) }, { tabLen: ch(['flush', 'through', 'snap', 'bolt']) }, { lockDepth: ch([null, 2, 10]) }, { foldDir: ch(['valley', 'mountain']) }])]],
    ['setAllJoints', 1, () => [ch(['base', 'corner'] as const), ch(KINDS)]],
    ['setDefaultFlap', 1, () => [ch([null, 3, 8, 15, 100])]],
    ['setTrayFlat', 1, () => [idx(), ch(['auto', 'off'] as const)]],
    ['setTrayPin', 1, () => [idx(), idx(), ch(['hinge', 'own', 'other', null] as const)]],
    ['rotatePanel', 2, () => [idx(), ch([90, 45, 30, -90, 180, 15])]],
    ['movePanel', 3, () => [idx(), Math.round((r() - 0.5) * 300), Math.round((r() - 0.5) * 300)]],
    ['addPlacedPanel', 3, () => [r() < 0.4 ? null : idx(), ch([1, -1] as const), Math.round(r() * 120), Math.round(r() * 120), ch([0, 0, 90, 45, 180]), ch(['flat', 'standing'] as const), ch([1, -1] as const), size(), size(), r() < 0.15]],
    ['rehost', 1, () => [idx(), r() < 0.3 ? null : idx(), ch([1, -1] as const)]],
    ['movePlaced', 2, () => [idx(), Math.round((r() - 0.5) * 100), Math.round((r() - 0.5) * 100)]],
    ['setPlacedPose', 1, () => [idx(), ch(['flat', 'standing'] as const)]],
    ['setConstruction', 1, () => [idx(), r() < 0.5]],
    ['deleteConnection', 2, () => [idx()]],
  ];
  const total = OPS.reduce((s, o) => s + o[1], 0);
  let x = r() * total;
  for (const [name, w, gen] of OPS) {
    if ((x -= w) < 0) return { op: name, a: gen() };
  }
  return { op: 'addRootPanel', a: [0, 0, 100, 100] };
}

// ---------------------------------------------------------------------------
// Invariants

export type Failure = { cls: string; msg: string };
const frames = (e: any): string[] => String(e?.stack ?? '').split('\n').slice(1).map((l) => /src\/[^)]*/.exec(l)?.[0]).filter((x): x is string => !!x).map((x) => x.replace(/:\d+$/, ''));
export const where = (e: any) => frames(e)[0] ?? '?';
const norm = (m: string) => m.replace(/no edge \S+/, 'no edge K');
export const short = (e: any) => `${e?.message} @ ${frames(e).slice(0, 6).join(' < ')}`;

const round = (x: any): any => {
  if (typeof x === 'number') return Number.isFinite(x) ? Math.round(x * 1e5) / 1e5 + 0 : String(x);
  if (Array.isArray(x)) return x.map(round);
  if (x && typeof x === 'object') {
    const o: any = {};
    for (const k of Object.keys(x).sort()) if (x[k] !== undefined) o[k] = round(x[k]);
    return o;
  }
  return x;
};
export const canon = (d: Design) => JSON.stringify(round(d));

function firstDiff(a: any, b: any, path = ''): string | null {
  if (typeof a !== typeof b) return `${path}: ${JSON.stringify(a)?.slice(0, 120)} vs ${JSON.stringify(b)?.slice(0, 120)}`;
  if (a && typeof a === 'object') {
    const ks = new Set([...Object.keys(a), ...Object.keys(b ?? {})]);
    for (const k of ks) {
      const r = firstDiff(a[k], b?.[k], path + '.' + k);
      if (r) return r;
    }
    return null;
  }
  return a === b ? null : `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}
export const diff = (a: Design, b: Design) => firstDiff(round(a), round(b));

function findNonFinite(x: any, path: string, out: string[]) {
  if (out.length > 3) return;
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) out.push(`${path}=${x}`);
  } else if (Array.isArray(x)) x.forEach((v, i) => findNonFinite(v, `${path}[${i}]`, out));
  else if (x && typeof x === 'object') for (const k of Object.keys(x)) findNonFinite(x[k], `${path}.${k}`, out);
}

const segsCross = (p1: P2, p2: P2, q1: P2, q2: P2) => {
  const cr = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = cr(q1, q2, p1), d2 = cr(q1, q2, p2), d3 = cr(p1, p2, q1), d4 = cr(p1, p2, q2);
  const e = 1e-7;
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
};
/** Proper crossings only (touching allowed): a laser outline that crosses itself. */
export function selfCrossing(pts: P2[]): [number, number] | null {
  const n = pts.length;
  if (n > 600) return null;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return [i, j];
    }
  return null;
}

export type CheckOpts = { idem?: boolean; roundtrip?: boolean; pieces?: boolean; overlaps?: boolean; autoIdem?: boolean };

export function check(d: Design, o: CheckOpts = {}): Failure[] {
  const out: Failure[] = [];
  const f = (cls: string, msg: string) => out.push({ cls, msg });
  // 1. finite numbers everywhere
  const nf: string[] = [];
  findNonFinite(d, 'd', nf);
  if (nf.length) f('nonfinite:' + nf[0].replace(/\[\d+\]/g, '[]').replace(/\.(p|c|tr|x|f|i)_[a-z0-9]+/g, '.$1_ID').replace(/\/(e\d+|c\/e\d+)/g, '/E').split('=')[0].slice(0, 80), nf.join(' '));
  // 2. references
  const ids = new Set(Object.keys(d.panels));
  if (d.order.length !== ids.size || d.order.some((id) => !ids.has(id)) || new Set(d.order).size !== d.order.length) f('ref:order', `order ${d.order.length} vs panels ${ids.size}`);
  // every placed panel's host exists (BUGFIX_PLAN B22)
  for (const p of Object.values(d.panels)) if (p.place && p.place.host !== null && !ids.has(p.place.host)) f('ref:danglingHost', `${p.id} on ${p.place.host}`);
  for (const c of Object.values(d.connections)) {
    if (!ids.has(c.a.panelId) || !ids.has(c.b.panelId)) f('ref:connection', `${c.id} ${c.kind} grown=${c.grown} → ${c.a.panelId}/${c.b.panelId}`);
    for (const g of [...(c.geom?.edges ?? []), ...(c.geom?.holes ?? []), ...(c.geom?.adds ?? [])]) if (!ids.has(g.panelId)) f('ref:geom', `${c.id} geom refers to ${g.panelId}`);
  }
  for (const t of Object.values(d.trays ?? {})) if (!ids.has(t.baseId)) f('ref:tray', `tray ${t.id} base ${t.baseId}`);
  for (const p of Object.values(d.panels)) {
    if (p.place?.host && !ids.has(p.place.host)) f('ref:place', `${p.id} host ${p.place.host}`);
    if (!d.pieces[p.id]) f('ref:pieces', `no piece settings for ${p.id}`);
  }
  // parents: at most one grown parent per panel; no grown cycles
  const parents = new Map<string, number>();
  for (const c of Object.values(d.connections)) if (c.grown) parents.set(c.b.panelId, (parents.get(c.b.panelId) ?? 0) + 1);
  for (const [k, n] of parents) if (n > 1) f('ref:twoParents', `${k} has ${n} grown parents`);
  // a joint that is not flagged broken names edges its panels have
  for (const c of Object.values(d.connections)) {
    if (c.broken) continue;
    for (const r of [c.a, c.b]) {
      const p = d.panels[r.panelId];
      if (p && r.edge !== 'face' && !findEdge(p, r.edge) && !edgePieces(p, r.edge).length) f('ref:edgeGoneNotBroken', `${c.id} ${c.kind} grown=${c.grown} ${r.panelId}.${r.edge}`);
    }
  }
  // every real panel is in exactly one net
  try {
    const seen = new Map<string, number>();
    for (const g of netGroups(d)) for (const n of g) seen.set(n.panelId, (seen.get(n.panelId) ?? 0) + 1);
    for (const [k, n] of seen) if (n > 1) f('nets:twice', `${k} in ${n} nets`);
  } catch {}
  // 3. per-panel geometry
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    try {
      const notches = panelNotches(d, p);
      const ring = panelEdges(p);
      for (const e of ring) {
        const L = segLength(e);
        for (const n of notches[e.key] ?? []) {
          if (n.s0 < -1e-6 || n.s1 > L + 1e-6 || n.s1 < n.s0 - 1e-9) f('joint:notchRange', `${id} ${e.key} L=${L.toFixed(3)} notch ${n.s0.toFixed(3)}..${n.s1.toFixed(3)}`);
          if (!Number.isFinite(n.depth)) f('joint:notchDepth', `${id} ${e.key}`);
        }
      }
      const own = ownOutline(p);
      for (const r of own.rings) {
        const outl = panelOutline(p, notches, r);
        if (outl.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) f('outline:nonfinite', id);
        const sc = selfCrossing(outl);
        const tiny = p.w < 8 || p.h < 8;
        const knownWall = p.sketch.kind === 'wall' && (!!p.sketch.corners || !!p.sketch.inserts);
        const mixed = Object.values(d.connections).some((c) => (c.a.panelId === id || c.b.panelId === id) && matOf(d, c.a.panelId).kind !== matOf(d, c.b.panelId).kind);
        const withCut = p.details.some((x) => x.op === 'cut' || x.op === 'add');
        if (sc && !p.construction) f(knownWall ? 'outline:selfCross:wallCorners' : tiny ? 'outline:selfCross:tiny' : mixed ? 'outline:selfCross:mixed' : withCut ? 'outline:selfCross:withShape' : 'outline:selfCross', `${id} (${p.sketch.kind}) segs ${sc} w=${p.w.toFixed(1)} h=${p.h.toFixed(1)}`);
      }
    } catch (e: any) {
      f(`throw:${norm(String(e?.message)).slice(0, 50)}@${where(e)}`, `panelGeom ${id} ` + short(e));
    }
  }
  // tab-and-slot holes inside their panel
  for (const c of Object.values(d.connections)) {
    if (!c.geom || c.broken) continue;
    for (const h of c.geom.holes) {
      const p = d.panels[h.panelId];
      if (!p) continue;
      try {
        const outl = panelOutline(p, panelNotches(d, p));
        const rings = ownOutline(p).rings.map((r) => panelOutline(p, panelNotches(d, p), r));
        if (!h.poly.every((q) => rings.some((rr) => pointInPolygon(q, rr))) && !rings.length) void outl;
        if (rings.length && !h.poly.some((q) => rings.some((rr) => pointInPolygon(q, rr)))) f('joint:holeOutside', `${c.id} ${c.kind} hole entirely outside ${h.panelId}`);
      } catch {}
    }
  }
  // 4. validate
  try {
    validate(d);
  } catch (e: any) {
    f(`throw:${norm(String(e?.message)).slice(0, 50)}@${where(e)}`, 'validate: ' + short(e));
  }
  // 5. pieces
  if (o.pieces !== false) {
    try {
      const ps = buildPieces(d);
      for (const pc of ps) {
        if (!pc.contours.length) f('pieces:empty', pc.key);
        const outers = pc.contours.filter((c) => c.role === 'outer');
        if (!outers.length) f('pieces:noOuter', pc.key);
        for (const c of pc.contours) {
          const pts = flattenContour(c.contour, 0.05);
          if (pts.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) {
            f('pieces:nonfinite', `${pc.key} ${c.role}`);
            continue;
          }
          if (c.contour.closed) {
            if (pts.length < 3) f('pieces:fewPoints', `${pc.key} ${c.role} ${c.op} n=${pts.length}`);
            else if (Math.abs(polygonArea(pts)) < 1e-6) f('pieces:zeroArea:' + c.role + ':' + c.op, `${pc.key} ${c.role}`);
            if (c.role === 'outer') {
              const sc = selfCrossing(pts);
              if (sc) f('pieces:outerSelfCross', `${pc.key} segs ${sc}`);
            }
          }
        }
      }
    } catch (e: any) {
      f(`throw:${norm(String(e?.message)).slice(0, 50)}@${where(e)}`, 'buildPieces: ' + short(e));
    }
  }
  // 6. tray nets that say they lie flat
  if (o.overlaps !== false) {
    try {
      const autoTrays = Object.values(d.trays ?? {}).filter((t) => t.flat !== 'off');
      if (autoTrays.length) {
        const ov = netOverlaps(d, 1);
        const groups = netGroups(d);
        for (const t of autoTrays) {
          const g = groups.find((gg) => gg.some((n) => n.panelId === t.baseId));
          if (!g) continue;
          const own = new Set([t.baseId, ...Object.values(d.connections).filter((c) => c.grown && c.trayId === t.id).map((c) => c.b.panelId)]);
          const mine = ov.filter((x) => g.some((n) => n.panelId === x.a) && own.has(x.a) && own.has(x.b));
          const other = ov.filter((x) => g.some((n) => n.panelId === x.a) && !(own.has(x.a) && own.has(x.b)));
          if (other.length && !mine.length) f('flat:autoTrayOverlapsOther', `tray ${t.id} overlaps involving non-wall panels ${other.length}`);
          if (mine.length) f('flat:autoTrayOverlaps', `tray ${t.id} fixes=${JSON.stringify(t.fixes ?? {})} overlaps ${mine.map((m) => `${m.a.slice(-6)}~${m.b.slice(-6)}:${m.area.toFixed(1)}`).join(',')}`);
        }
      }
    } catch (e: any) {
      f(`throw:${norm(String(e?.message)).slice(0, 50)}@${where(e)}`, 'netOverlaps: ' + short(e));
    }
  }
  // 7. solve idempotent
  if (o.idem !== false) {
    try {
      const c = JSON.parse(JSON.stringify(d));
      ops.solve(c);
      const df = diff(d, c);
      if (df) f('idem:solve', df);
    } catch (e: any) {
      f(`throw:${norm(String(e?.message)).slice(0, 50)}@${where(e)}`, 'solve: ' + short(e));
    }
  }
  if (o.autoIdem) {
    try {
      const c = JSON.parse(JSON.stringify(d));
      ops.solve(c);
      ops.autoConnect(c);
      const df = diff(d, c);
      if (df) f('idem:autoConnect', df);
    } catch (e: any) {
      f(`throw:${norm(String(e?.message)).slice(0, 50)}@${where(e)}`, 'autoConnect: ' + short(e));
    }
  }
  // 8. round trip
  if (o.roundtrip !== false) {
    try {
      const back = parseProject(serializeProject(d));
      const df = diff(d, back);
      if (df) f('roundtrip', df);
    } catch (e: any) {
      f(`throw:${norm(String(e?.message)).slice(0, 50)}@${where(e)}`, 'roundtrip: ' + short(e));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Run a sequence as the store does (op, then solve + autoConnect)

export type RunResult = { failures: (Failure & { step: number; op: string })[]; d: Design };

export function runSeq(seq: Op[], material = 3, opts: CheckOpts & { every?: number; stopAtFirst?: boolean; only?: (cls: string) => boolean } = {}): RunResult {
  const d = ops.createDesign(MATERIALS[material]);
  const failures: RunResult['failures'] = [];
  const every = opts.every ?? 1;
  for (let i = 0; i < seq.length; i++) {
    const o = seq[i];
    try {
      applyOp(d, o);
      ops.solve(d);
      ops.autoConnect(d);
    } catch (e: any) {
      const fl = { cls: `throw:${norm(String(e?.message)).slice(0, 50)}@${where(e)}`, msg: `op ${o.op}: ` + short(e), step: i, op: o.op };
      if (!opts.only || opts.only(fl.cls)) {
        failures.push(fl);
        if (opts.stopAtFirst) return { failures, d };
      }
      // the store would discard the edit: keep going on whatever is left
      continue;
    }
    if ((i + 1) % every === 0 || i === seq.length - 1) {
      const fs = check(d, opts).filter((x) => !opts.only || opts.only(x.cls));
      for (const x of fs) failures.push({ ...x, step: i, op: o.op });
      if (fs.length && opts.stopAtFirst) return { failures, d };
    }
  }
  return { failures, d };
}

/** Shrink a failing sequence: delta-debug ops away while `fails` stays true. */
export function shrink(seq: Op[], fails: (s: Op[]) => boolean): Op[] {
  let cur = seq;
  let n = 2;
  while (cur.length >= 2) {
    const chunk = Math.ceil(cur.length / n);
    let reduced = false;
    for (let i = 0; i < cur.length; i += chunk) {
      const cand = [...cur.slice(0, i), ...cur.slice(i + chunk)];
      if (cand.length && fails(cand)) {
        cur = cand;
        n = Math.max(n - 1, 2);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (n >= cur.length) break;
      n = Math.min(cur.length, n * 2);
    }
  }
  // single removals
  for (let i = cur.length - 1; i >= 0; i--) {
    const cand = [...cur.slice(0, i), ...cur.slice(i + 1)];
    if (cand.length && fails(cand)) cur = cand;
  }
  return cur;
}
