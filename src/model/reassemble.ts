// Reassembly (milestones 125–127, SHAPES_TO_DIELINES_PLAN.md §4.5): a face graph and a
// Make spec into ordinary boards and joints, in the design itself, so every Workshop tool
// works on the result. *Fold it*: the unfolder picks the folds, each cut seam gets the
// chooser's flap or lock. *Build from boards*: a board on each face, material inward (the
// shape is the outside), corners found as for any box and given the chooser's joint.
// Pure and deterministic: ids come from keys, the unfolder's seed is the design's id.
import type { Connection, ConnectionKind, Design, MakeSpec, MaterialProfile, Panel, V3 } from './types';
import type { EdgeKey, FaceKey, PEdge, Polyhedron } from './polyhedron';
import { polyIssues, type PolyIssue } from './polyhedron';
import { addFreePanel, autoConnect, connectSeam, solve } from './ops';
import { addSeamNet, boardId, seamId } from './seamNet';
import { islandOrder, unfold, type Unfolding, type UnfoldIssue, type UnfoldSpec } from './unfold';
import { netGroups, netOverlaps } from './pieces';
import { chooseJoint, closingFace, type SeamCtx, type SeamRole } from './jointChoice';
import { cornerFit, MAX_CORNER, MIN_CORNER } from './seams';
import { boardReliefs } from './boardRelief';
import { FACE, findEdge, panelEdges } from './edges';
import { edgeWorld, matDir } from './frame';
import { tOf } from './materials';
import { v3dot, v3len, v3norm, v3sub } from '../geom/v3';
import type { MsgKey } from '../i18n';

export type MakeIssue = { kind: 'poly'; issue: PolyIssue } | { kind: 'unfold'; issue: UnfoldIssue } | { kind: 'corner'; edge: EdgeKey; dihedral: number } | { kind: 'empty' } | { kind: 'noLast' } | { kind: 'holeWall'; n: number } | { kind: 'overlap'; edges: EdgeKey[] };
/** What a remake could not keep (milestone 129): hand-added work on faces and choices on edges that no longer exist. */
export type Lost = { faces: FaceKey[]; edges: EdgeKey[] };
export type MakeResult = { unfolding?: Unfolding; issues: MakeIssue[]; changed?: number; lost?: Lost };

/** What the student added to a made model, by key, to carry across a remake. */
type Carry = {
  details: Record<FaceKey, Pick<Panel, 'details' | 'lines' | 'edgeFlaps' | 'foldOvers'>>;
  /** Which way each carried face looked (its outward normal), to find the face nearest it when it is gone. */
  normals: Record<FaceKey, [number, number, number]>;
  joints: Record<EdgeKey, ConnectionKind>;
  opts: Record<EdgeKey, Partial<Pick<Connection, 'fingers' | 'tabs' | 'crease' | 'flap' | 'tabLen' | 'lockDepth'>>>;
  cuts: Record<EdgeKey, 'fold' | 'cut'>;
};

/** Gather what the student did on the last made model (milestone 129, §4.5 step 3). */
function gather(d: Design): Carry {
  const c: Carry = { details: {}, normals: {}, joints: {}, opts: {}, cuts: {} };
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p?.src) continue;
    if (p.details.length || p.lines?.length || p.edgeFlaps?.length || p.foldOvers?.length)
    {
      c.details[p.src.face] = JSON.parse(JSON.stringify({ details: p.details, lines: p.lines, edgeFlaps: p.edgeFlaps, foldOvers: p.foldOvers }));
      c.normals[p.src.face] = normalOf(p);
    }
  }
  for (const x of Object.values(d.connections)) {
    if (!x.src) continue;
    if (x.picked) c.joints[x.src] = x.kind;
    // a seam kind the student picked keeps its edge cut, whatever net a remake finds
    if (x.picked && x.kind !== 'fold' && d.make?.as === 'fold') c.cuts[x.src] = 'cut';
    // a fold the student cut (or kept) in the cut plan (milestone 69)
    if (x.seam && x.cut) c.cuts[x.src] = x.cut === 'cut' ? 'cut' : 'fold';
    if (x.picked) {
      const o: Carry['opts'][string] = {};
      for (const k of ['fingers', 'tabs', 'crease', 'tabLen', 'lockDepth'] as const) if (x[k] !== undefined && x[k] !== null) (o as Record<string, unknown>)[k] = x[k];
      if (Object.keys(o).length) c.opts[x.src] = o;
    }
  }
  return c;
}

/** The sheet the unfolder lays a net on: the material's, less the design's margins. */
export const sheetOf = (d: Pick<Design, 'sheetMargin'>, m: MaterialProfile) => ({ w: m.sheetW - 2 * (d.sheetMargin ?? 5), h: m.sheetH - 2 * (d.sheetMargin ?? 5) });

/** How far a face reaches back from one of its edges, on average: its area over the edge's length. */
const span = (P: Polyhedron, f: FaceKey, e: PEdge) => Math.abs(P.faces[f].area) / Math.max(1e-6, e.len);

/** The unfolder's spec for a Make (all but the flap depths, which `unfoldFlaps` gives): the same here and in the Worker. */
export function unfoldSpecOf(d: Pick<Design, 'id' | 'sheetMargin'>, mat: MaterialProfile, spec: MakeSpec): Omit<UnfoldSpec, 'flap'> {
  return { sheet: sheetOf(d, mat), prefer: spec.prefer, fixed: spec.edges, open: spec.open, seed: d.id, clearance: mat.thickness, foldAllowance: mat.foldAllowance };
}

/** How many times Make re-unfolds after finding folds the engine could not lay (each try cuts them). */
const REPAIRS = 6;

/**
 * The net as the engine laid it, checked (papercraft's lesson: the pieces are what the laid
 * net is, not what the unfolder planned): seam folds it could not lay, and boards of one
 * piece that overlap. Returns the folds to cut so each problem goes: a fold that could not
 * be laid, and for an overlap the fold between the two boards whose cut frees the fewest boards.
 */
function netProblems(d: Design): EdgeKey[] {
  const out = new Set<EdgeKey>();
  const folds = Object.values(d.connections).filter((c) => c.seam && c.kind === 'fold' && c.src && d.panels[c.a.panelId]?.src && d.panels[c.b.panelId]?.src);
  for (const c of folds) if (c.broken) out.add(c.src!);
  if (out.size) return [...out];
  const adj = new Map<string, { to: string; edge: EdgeKey }[]>();
  for (const c of folds) {
    adj.set(c.a.panelId, [...(adj.get(c.a.panelId) ?? []), { to: c.b.panelId, edge: c.src! }]);
    adj.set(c.b.panelId, [...(adj.get(c.b.panelId) ?? []), { to: c.a.panelId, edge: c.src! }]);
  }
  // the boards reached from `from` without crossing `cut`
  const reach = (from: string, cut?: EdgeKey) => {
    const seen = new Set([from]);
    const q = [from];
    while (q.length) for (const n of adj.get(q.shift()!) ?? []) if (n.edge !== cut && !seen.has(n.to)) seen.add(n.to), q.push(n.to);
    return seen;
  };
  for (const o of netOverlaps(d, 0.5, (g) => g.some((n) => d.panels[n.panelId]?.src))) {
    // the folds on the way from one board to the other
    const back = new Map<string, { from: string; edge: EdgeKey }>([[o.a, { from: '', edge: '' }]]);
    const q = [o.a];
    while (q.length && !back.has(o.b)) {
      const f = q.shift()!;
      for (const n of adj.get(f) ?? []) if (!back.has(n.to)) back.set(n.to, { from: f, edge: n.edge }), q.push(n.to);
    }
    if (!back.has(o.b)) continue;
    const path: EdgeKey[] = [];
    for (let at = o.b; at !== o.a; at = back.get(at)!.from) path.push(back.get(at)!.edge);
    if ([...path].some((e) => out.has(e))) continue;
    const all = reach(o.a).size;
    let best: EdgeKey | null = null, bestN = Infinity;
    for (const e of path.sort()) {
      const side = reach(o.a, e).size;
      const n = Math.min(side, all - side);
      if (n < bestN) (bestN = n), (best = e);
    }
    if (best) out.add(best);
  }
  return [...out].sort();
}

/** The depth the unfolder fits each cut edge's flap to (a slit lock's with its tongue), for a Worker that cannot take a function. */
export function unfoldFlaps(P: Polyhedron, mat: MaterialProfile, spec: MakeSpec): Record<EdgeKey, number> {
  const open = new Set(spec.open ?? []);
  const last = closingFace(Object.values(P.faces).filter((f) => !open.has(f.key)).map((f) => ({ key: f.key, n: f.n, area: f.area })));
  const out: Record<EdgeKey, number> = {};
  for (const e of Object.values(P.edges)) {
    const ch = seamChoice(P, e, mat, last, spec.seams);
    out[e.key] = ch.kind === 'glue' || ch.kind === 'lock' ? (ch.params.flap ?? 0) + (ch.kind === 'lock' ? lockTongue(mat) : 0) : 0;
  }
  return out;
}

/** How far a slit lock's tongue reaches past its flap's far edge (as `slitLock` cuts it). */
export const lockTongue = (m: MaterialProfile) => (m.kind === 'card' ? 5 : m.thickness + 4);

/** The chooser's choice for a cut seam in a net, with the Make card's *Seams* setting over it where the seam allows. */
function seamChoice(P: Polyhedron, e: PEdge, mat: MaterialProfile, last: FaceKey | null, seams: MakeSpec['seams']) {
  const ch = chooseJoint(seamCtx(P, e, mat, 'seam', last));
  if (!seams || seams === ch.kind) return ch;
  const flap = (ch.params.flap ?? chooseJoint(seamCtx(P, e, mat, 'seam', null)).params.flap) || undefined;
  if (seams === 'tabslot') return e.dihedral >= 30 && e.dihedral <= 150 && e.len >= 18 ? { kind: 'tabslot' as const, params: {}, why: 'joint.why.asked' as MsgKey } : { kind: 'glue' as const, params: { flap }, why: 'joint.why.outsideAngle' as MsgKey };
  if (seams === 'lock' && e.len < 25) return { kind: 'glue' as const, params: { flap }, why: 'joint.why.short' as MsgKey };
  return { kind: seams, params: { flap }, why: 'joint.why.asked' as MsgKey };
}

/** The chooser's context for one edge. */
export function seamCtx(P: Polyhedron, e: PEdge, mat: MaterialProfile, role: SeamRole, last: FaceKey | null): SeamCtx {
  return { mat, role, len: e.len, dihedral: e.dihedral, spanA: span(P, e.a, e), spanB: span(P, e.b, e), closesLast: !!last && (e.a === last || e.b === last) };
}

/** Remove what an earlier Make made: boards with a face key and every joint touching them. */
export function clearMade(d: Design) {
  const made = new Set(d.order.filter((id) => d.panels[id]?.src));
  for (const c of Object.values(d.connections)) if (made.has(c.a.panelId) || made.has(c.b.panelId)) delete d.connections[c.id];
  for (const id of made) {
    delete d.panels[id];
    delete d.pieces[id];
  }
  d.order = d.order.filter((id) => !made.has(id));
}

/** The chooser's choice applied to a joint (unless the student picked it, or Make's spec names one). */
function applyChoice(c: Connection, kind: ConnectionKind, params: Partial<Connection>, why: MsgKey) {
  c.kind = kind;
  c.pref = kind;
  Object.assign(c, params);
  c.why = why;
}

/**
 * Make the design's shapes into boards and joints (its `make` spec). `P` is the face graph
 * (with Make's facets); `unfolding` an unfolder result already worked out (a Worker's), else
 * it is worked out here. The design is solved.
 */
export function reassemble(d: Design, P: Polyhedron, spec0: MakeSpec, unfolding?: Unfolding): MakeResult {
  // the student's work on the last made model, carried across by key (milestone 129)
  const carry = gather(d);
  const spec: MakeSpec = { ...spec0, joints: { ...carry.joints, ...(spec0.joints ?? {}) }, edges: { ...carry.cuts, ...(spec0.edges ?? {}) } };
  if (!Object.keys(spec.joints!).length) delete spec.joints;
  if (!Object.keys(spec.edges!).length) delete spec.edges;
  const r = build(d, P, spec, unfolding);
  r.lost = applyCarry(d, P, carry, spec);
  if (r.lost.faces.length || r.lost.edges.length) solve(d);
  return r;
}

/** Put the carried work back on the boards and joints that still exist; the rest is lost and listed. */
function applyCarry(d: Design, P: Polyhedron, carry: Carry, spec: MakeSpec): Lost {
  const lost: Lost = { faces: [], edges: [] };
  const byFace = new Map(d.order.filter((id) => d.panels[id]?.src).map((id) => [d.panels[id].src!.face, d.panels[id]]));
  const taken = new Set<string>();
  for (const [face, w] of Object.entries(carry.details)) {
    let p = byFace.get(face);
    // a ready shape's face that is gone (Guided's pyramid or diamond with fewer sides): its shapes go to the face that
    // looks most nearly the same way and has none of its own, centred on it (milestone 139, REPORT.md B8: a name was
    // dropped with no note); a face the student's own shape lost is listed as lost (milestone 129)
    if (!p && spec.solid && w.details.length && carry.normals[face]) {
      const n = carry.normals[face];
      const near = [...byFace.entries()]
        .filter(([k, q]) => !carry.details[k] && !taken.has(q.id) && !q.details.length)
        .map(([, q]) => ({ q, dot: normalOf(q).reduce((a, x, i) => a + x * n[i], 0) }))
        .sort((a, b) => b.dot - a.dot)[0];
      if (near && near.dot > 0.3) {
        p = near.q;
        const cx = w.details.reduce((a, x) => a + x.cx, 0) / w.details.length, cy = w.details.reduce((a, x) => a + x.cy, 0) / w.details.length;
        w.details = w.details.map((x) => ({ ...x, cx: x.cx - cx + p!.w / 2, cy: x.cy - cy + p!.h / 2 }));
        // lines and flaps belong to the old face's edges: not moved
        w.lines = undefined;
        w.edgeFlaps = undefined;
        w.foldOvers = undefined;
      }
    }
    if (!p) {
      lost.faces.push(face);
      continue;
    }
    taken.add(p.id);
    p.details = w.details;
    if (w.lines) p.lines = w.lines;
    if (w.edgeFlaps) p.edgeFlaps = w.edgeFlaps;
    if (w.foldOvers) p.foldOvers = w.foldOvers;
  }
  const byEdge = new Map(Object.values(d.connections).filter((c) => c.src).map((c) => [c.src!, c]));
  for (const [edge, o] of Object.entries(carry.opts)) {
    const c = byEdge.get(edge);
    if (c) Object.assign(c, o);
  }
  // a choice on an edge that is gone: dropped from the spec and listed
  for (const k of [...Object.keys(spec.joints ?? {}), ...Object.keys(spec.edges ?? {})])
    if (!P.edges[k]) {
      if (!lost.edges.includes(k)) lost.edges.push(k);
      if (spec.joints) delete spec.joints[k];
      if (spec.edges) delete spec.edges[k];
    }
  if (Object.keys(carry.details).length) solve(d);
  return lost;
}

function build(d: Design, P: Polyhedron, spec: MakeSpec, unfolding?: Unfolding): MakeResult {
  clearMade(d);
  d.make = spec;
  d.outcome = spec.as;
  const issues: MakeIssue[] = polyIssues(P, d.material.thickness).map((issue) => ({ kind: 'poly' as const, issue }));
  const open = new Set(spec.open ?? []);
  if (!Object.keys(P.faces).some((k) => !open.has(k))) {
    solve(d);
    return { issues: [{ kind: 'empty' }] };
  }
  const mat = d.material;
  const faces = Object.values(P.faces).filter((f) => !open.has(f.key));
  const last = closingFace(faces.map((f) => ({ key: f.key, n: f.n, area: f.area })));
  if (spec.as === 'fold') {
    // a slit lock's tongues reach past its flap (as slitLock lays them): the unfolder fits the flap and its tongue
    const tongue = lockTongue(mat);
    const flapOf = (e: PEdge) => {
      const ch = seamChoice(P, e, mat, last, spec.seams);
      return ch.kind === 'glue' || ch.kind === 'lock' ? (ch.params.flap ?? 0) + (ch.kind === 'lock' ? tongue : 0) : 0;
    };
    const base = unfoldSpecOf(d, mat, spec);
    let u = unfolding ?? unfold(P, { ...base, flap: flapOf });
    // lay the net, check it as laid, and cut what the engine could not lay (then unfold again)
    const avoid: EdgeKey[] = [];
    for (let k = 0; ; k++) {
      if (k) clearMade(d);
      layFold(d, P, spec, u, mat, last, tongue, open);
      solve(d);
      const bad = k < REPAIRS ? netProblems(d).filter((e) => !avoid.includes(e)) : [];
      if (!bad.length) break;
      avoid.push(...bad);
      u = unfold(P, { ...base, flap: flapOf, avoid: [...avoid] });
    }
    // repairs run out with the net still overlapping itself: said, with the folds to cut (milestone 189; only the
    // export check said it before)
    const left = netProblems(d);
    if (left.length) issues.push({ kind: 'overlap', edges: left });
    // the pieces are the net as laid: a split is told by its real count
    const pieces = netGroups(d).filter((g) => d.panels[g[0].panelId]?.src).length;
    for (const issue of u.issues) {
      if (issue.kind === 'split') continue;
      issues.push({ kind: 'unfold', issue });
    }
    const split = u.issues.find((i) => i.kind === 'split');
    // a lid by a cut is a second body, not a split of the first (milestone 137: "lies flat in 2 pieces" was the box
    // and its lid)
    const bodies = spec.lid ? 2 : 1;
    if (pieces > bodies) issues.push({ kind: 'unfold', issue: { kind: 'split', n: pieces, why: split?.kind === 'split' ? split.why : 'overlap' } });
    return { unfolding: u, issues };
  }
  return buildBoards(d, P, spec, mat, faces, last, issues);
}

/** Lay a fold net: its boards, folds and seams from an unfolding, each joint chosen (the design is not solved). */
function layFold(d: Design, P: Polyhedron, spec: MakeSpec, u: Unfolding, mat: MaterialProfile, last: FaceKey | null, tongue: number, open: Set<FaceKey>) {
  addSeamNet(d, P, {
    folds: u.folds,
    flapOn: u.flapOn,
    flapDepth: u.flapDepth,
    flapTaper: u.flapTaper,
    flapTaperB: u.flapTaperB,
    open,
    order: islandOrder(P, u),
    seam: (e) => seamChoice(P, e, mat, last, spec.seams).kind,
  });
  for (const e of Object.values(P.edges)) {
    const c = d.connections[seamId(e.key)];
    if (!c) continue;
    // a hole's wall glued round its rim: a glue flap, as the unfolder fitted it (milestone 186)
    if (c.b.edge === FACE) {
      applyChoice(c, 'glue', {}, 'joint.why.rim');
      continue;
    }
    const role: SeamRole = c.kind === 'fold' ? 'fold' : 'seam';
    const ch = role === 'fold' ? chooseJoint(seamCtx(P, e, mat, role, last)) : seamChoice(P, e, mat, last, spec.seams);
    // the unfolder's flap size (it fitted the net with it) wins over the chooser's; a lock's less its tongue
    // a lock squeezed below the room its tongue needs is glued with the flap the net has room for
    const squeezed = ch.kind === 'lock' && !spec.joints?.[e.key] && c.flap !== null && c.flap - tongue < 3;
    const fitted = c.flap !== null ? (ch.kind === 'lock' && !spec.joints?.[e.key] && !squeezed ? c.flap - tongue : c.flap) : null;
    const params = { ...ch.params, ...(fitted !== null ? { flap: fitted } : {}) };
    if (squeezed) {
      applyChoice(c, 'glue', params, 'joint.why.short');
      continue;
    }
    if (role === 'fold') applyChoice(c, ch.kind === 'fold' ? 'fold' : 'fold', ch.kind === 'fold' ? params : {}, ch.why);
    else {
      const picked = spec.joints?.[e.key];
      applyChoice(c, picked ?? ch.kind, picked ? {} : params, ch.why);
      if (picked) c.picked = true;
    }
    // a flap that found no room in the net: the seam is left plain and listed
    if (role === 'seam' && (c.kind === 'glue' || c.kind === 'lock') && u.issues.some((i) => i.kind === 'flapDropped' && i.edge === e.key)) c.kind = 'butt';
  }
  // a lid by a cut on card (milestone 130): a hem round the lid's rim, so it keeps its shape
  if (mat.kind === 'card')
    for (const e of Object.values(P.edges)) {
      const rim = e.a === 'lid/cut' ? e.b : e.b === 'lid/cut' ? e.a : null;
      if (!rim || !open.has('lid/cut')) continue;
      const p = d.panels[boardId(rim)];
      const ref = e.a === rim ? e.ea : e.eb;
      if (!p || ref.ring !== 0) continue;
      (p.edgeFlaps ??= []).push({ id: `hem-${ref.i}`, edge: `e${ref.i}`, len: Math.min(10, Math.max(6, e.len / 6)), angle: 180, dir: 'in' });
    }

}

/** Build from boards: a board on each face, corners joined and chosen. */
function buildBoards(d: Design, P: Polyhedron, spec: MakeSpec, mat: MaterialProfile, faces: Polyhedron['faces'][string][], last: FaceKey | null, issues: MakeIssue[]): MakeResult {
  // boards: one on each face, material inward; corners joined as for any box, then chosen.
  // A through-hole's walls meet the boards round it along their holes' rims, where no
  // corner joint can be cut: they are left out and listed (the hole stays a cut-out).
  const rimWall = (k: FaceKey) => Object.values(P.edges).some((e) => (e.a === k && e.eb.ring > 0) || (e.b === k && e.ea.ring > 0));
  const walls = faces.filter((f) => rimWall(f.key)).map((f) => f.key);
  if (walls.length) issues.push({ kind: 'holeWall', n: walls.length });
  // no face faces up: no board can go in last from outside
  if (!last) issues.push({ kind: 'noLast' });
  const ids: Record<FaceKey, string> = {};
  const order = faces.filter((f) => !walls.includes(f.key)).map((f) => f.key).sort((a, b) => (a === last ? 1 : b === last ? -1 : Math.abs(P.faces[b].area) - Math.abs(P.faces[a].area) || (a < b ? -1 : 1)));
  // boards that meet at a point, or at an edge too sharp or too flat for a joint: the smaller is trimmed where it
  // would run into the other (milestone 187); an edge that takes a joint is cut back by its joint
  const relief = boardReliefs(P, order, mat.thickness, jointable);
  for (const k of order) {
    const f = P.faces[k];
    const r = relief[k];
    const base = { id: boardId(k), name: `${d.order.length + 1}`, frame: f.frame, side: -1 as const, holes: f.holes, src: k };
    // a trimmed outline the board refuses (not simple): the face as it is, never a lost board
    const id = (r && addFreePanel(d, { ...base, outer: r.outer, edgeIds: r.edgeIds })) || addFreePanel(d, { ...base, outer: f.outer });
    if (id) ids[k] = id;
  }
  solve(d);
  autoConnect(d);
  // each corner: which face-graph edge it is, then the chooser's joint
  const edgeOfPair = new Map<string, PEdge[]>();
  for (const e of Object.values(P.edges)) {
    const pa = ids[e.a], pb = ids[e.b];
    if (!pa || !pb) continue;
    const key = pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
    edgeOfPair.set(key, [...(edgeOfPair.get(key) ?? []), e]);
  }
  const joined = new Set<EdgeKey>();
  for (const c of Object.values(d.connections)) {
    if (c.grown) continue;
    const key = c.a.panelId < c.b.panelId ? `${c.a.panelId}|${c.b.panelId}` : `${c.b.panelId}|${c.a.panelId}`;
    const es = edgeOfPair.get(key);
    if (!es) continue;
    // the face-graph edge this corner runs along (the panels share one line per edge)
    const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
    const e = es.find((x) => {
      const ea = x.a === A.src?.face ? x.ea : x.eb, eb = x.a === A.src?.face ? x.eb : x.ea;
      return `e${ea.i}` === (findEdge(A, c.a.edge)?.key ?? c.a.edge) || `e${eb.i}` === (findEdge(B, c.b.edge)?.key ?? c.b.edge);
    }) ?? es[0];
    // an edge on a face at an angle no corner joint takes (the general joiner found where a trimmed board stands on
    // the other): left to the glued butt below, never an ordinary joint, which would be broken there (milestone 189)
    if ((c.a.edge === FACE || c.b.edge === FACE) && !jointable(e) && Object.values(relief).some((r) => r.butts.some((b) => b.edge === e.key))) {
      delete d.connections[c.id];
      continue;
    }
    joined.add(e.key);
    c.src = e.key;
    const picked = spec.joints?.[e.key];
    const ch = chooseJoint(seamCtx(P, e, mat, 'corner', last));
    applyChoice(c, picked ?? ch.kind, picked ? {} : ch.params, ch.why);
    if (picked) c.picked = true;
    // an edge glued on a face (an inside corner past a joint's range, twin spheres' waist): the glued edge-to-face
    // seam, which cuts nothing and so never breaks; as a plain corner butt it had no geometry off the square
    // (milestone 189)
    if (c.kind === 'butt' && (c.a.edge === FACE || c.b.edge === FACE)) {
      if (c.a.edge === FACE) [c.a, c.b] = [c.b, c.a];
      c.seam = true;
    }
    // the board that closes last carries the tabs, so it drops in from outside
    if (c.kind === 'tabslot' && last && ids[last] === c.b.panelId) [c.a, c.b] = [c.b, c.a];
    c.auto = false;
  }
  // an edge that takes a joint which the general search did not find (both its boards trimmed where they meet others,
  // their edges no longer the same length): joined from the face graph, which knows it is a corner (milestone 189)
  for (const e of Object.values(P.edges)) {
    const pa = ids[e.a], pb = ids[e.b];
    if (!pa || !pb || joined.has(e.key) || e.ea.ring || e.eb.ring || !jointable(e)) continue;
    const ka = `e${e.ea.i}`, kb = `e${e.eb.i}`;
    if (!findEdge(d.panels[pa], ka) || !findEdge(d.panels[pb], kb)) continue;
    const cid = connectSeam(d, { type: 'corner', a: { panelId: pa, edge: ka }, b: { panelId: pb, edge: kb }, overlapping: false }, undefined, false);
    const c = cid ? d.connections[cid] : undefined;
    if (!c) continue;
    if (c.broken) {
      delete d.connections[c.id];
      continue;
    }
    c.src = e.key;
    const picked = spec.joints?.[e.key];
    const ch = chooseJoint(seamCtx(P, e, mat, 'corner', last));
    applyChoice(c, picked ?? ch.kind, picked ? {} : ch.params, ch.why);
    if (picked) c.picked = true;
    c.auto = false;
    joined.add(e.key);
  }
  // an edge too sharp or too flat for a joint, where one board was trimmed to stand on the other's inside face: glued
  // there edge to face (milestone 187)
  for (const [k, r] of Object.entries(relief))
    for (const b of r.butts) {
      const e = P.edges[b.edge];
      const A = d.panels[ids[k]], B = d.panels[ids[b.on]];
      if (!e || !A || !B || joined.has(e.key)) continue;
      const edge = buttEdge(A, B, e, tOf(d, B.id));
      if (!edge) continue;
      const id = `s:${e.key}`;
      d.connections[id] = { id, kind: 'butt', pref: 'butt', a: { panelId: A.id, edge }, b: { panelId: B.id, edge: FACE }, grown: false, angle: e.dihedral, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto: false, seam: true, src: e.key, why: 'joint.why.outsideAngle' };
      joined.add(e.key);
    }
  for (const e of Object.values(P.edges))
    if (ids[e.a] && ids[e.b] && !joined.has(e.key) && e.ea.ring === 0 && e.eb.ring === 0) issues.push({ kind: 'corner', edge: e.key, dihedral: e.dihedral });
  solve(d);
  return { issues };
}

/** Does a board corner along e take a joint (30–150°; an inside corner, past 180°, read from its other side): its boards are not trimmed. */
const jointable = (e: PEdge) => {
  const a = e.dihedral > 180 ? 360 - e.dihedral : e.dihedral;
  return a >= MIN_CORNER - 1e-6 && a <= MAX_CORNER + 1e-6;
};

/** The edge of trimmed board A that stands on board B's inside face along face-graph edge e (its longest such), or null. */
function buttEdge(A: Panel, B: Panel, e: PEdge, tB: number): string | null {
  const m = matDir(B.frame);
  const dir = v3norm(v3sub(e.q, e.p));
  let best: string | null = null, bl = 1;
  for (const x of panelEdges(A)) {
    const [w0, w1] = edgeWorld(A, x.key);
    const L = v3len(v3sub(w1, w0));
    if (L <= bl || Math.abs(v3dot(v3sub(w1, w0), dir)) / L < 0.99) continue;
    // its outer corners lie within B's thickness of B's inside face (the trim stops it there, at any angle)
    const depth = (w: V3) => v3dot(v3sub(w, B.frame.o), m);
    if ([w0, w1].every((w) => depth(w) > -0.05 && depth(w) < 2 * tB + 0.05)) (best = x.key), (bl = L);
  }
  return best;
}

/**
 * The material or thickness changed (R6): every made joint the student did not pick is
 * chosen again for the new material. Returns how many changed kind.
 */
export function rechooseJoints(d: Design, P: Polyhedron): number {
  if (!d.make) return 0;
  const mat = d.material;
  const open = new Set(d.make.open ?? []);
  const last = closingFace(Object.values(P.faces).filter((f) => !open.has(f.key)).map((f) => ({ key: f.key, n: f.n, area: f.area })));
  let changed = 0;
  for (const c of Object.values(d.connections)) {
    // a hole's wall stays glued round its rim
    if (!c.src || c.picked || c.b.edge === FACE) continue;
    const e = P.edges[c.src];
    if (!e) continue;
    const role: SeamRole = d.make.as === 'boards' ? 'corner' : c.kind === 'fold' && c.seam ? 'fold' : 'seam';
    const ch = chooseJoint(seamCtx(P, e, mat, role, last));
    // a fold stays a fold (the net is not re-cut by a change of board); its crease may change
    const kind = role === 'fold' ? 'fold' : ch.kind;
    if (kind !== c.kind) changed++;
    for (const k of ['fingers', 'tabs', 'crease'] as const) delete c[k];
    if (role === 'fold') applyChoice(c, 'fold', ch.kind === 'fold' ? ch.params : {}, ch.why);
    else applyChoice(c, kind, { ...ch.params, ...(c.seam && c.flap !== null && (kind === 'glue' || kind === 'lock') ? { flap: Math.min(c.flap, ch.params.flap ?? c.flap) } : {}) }, ch.why);
  }
  solve(d);
  return changed;
}

/**
 * Detach (milestone 129, one way): the made model becomes a plain box design. The shapes,
 * the Make spec and every key go; the boards and joints stay as they are (a seam keeps
 * laying out as a seam). Its undo restores the link.
 */
export function detach(d: Design) {
  delete d.make;
  delete d.outcome;
  delete d.kind;
  delete d.sculpt;
  for (const id of d.order) delete d.panels[id]?.src;
  for (const c of Object.values(d.connections)) {
    delete c.src;
    delete c.why;
    delete c.picked;
  }
}

export { cornerFit };

/** A board's outward normal (its frame's u × v). */
function normalOf(p: Panel): [number, number, number] {
  const { u, v } = p.frame;
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}
