// Reassembly (milestones 125–127, SHAPES_TO_DIELINES_PLAN.md §4.5): a face graph and a
// Make spec into ordinary boards and joints, in the design itself, so every Workshop tool
// works on the result. *Fold it*: the unfolder picks the folds, each cut seam gets the
// chooser's flap or lock. *Build from boards*: a board on each face, material inward (the
// shape is the outside), corners found as for any box and given the chooser's joint.
// Pure and deterministic: ids come from keys, the unfolder's seed is the design's id.
import type { Connection, ConnectionKind, Design, MakeSpec, MaterialProfile, Panel } from './types';
import type { EdgeKey, FaceKey, PEdge, Polyhedron } from './polyhedron';
import { polyIssues, type PolyIssue } from './polyhedron';
import { addFreePanel, autoConnect, solve } from './ops';
import { addSeamNet, boardId, seamId } from './seamNet';
import { islandOrder, unfold, type Unfolding, type UnfoldIssue } from './unfold';
import { chooseJoint, closingFace, type SeamCtx, type SeamRole } from './jointChoice';
import { cornerFit } from './seams';
import { findEdge } from './edges';
import type { MsgKey } from '../i18n';

export type MakeIssue = { kind: 'poly'; issue: PolyIssue } | { kind: 'unfold'; issue: UnfoldIssue } | { kind: 'corner'; edge: EdgeKey; dihedral: number } | { kind: 'empty' } | { kind: 'noLast' } | { kind: 'holeWall'; n: number };
/** What a remake could not keep (milestone 129): hand-added work on faces and choices on edges that no longer exist. */
export type Lost = { faces: FaceKey[]; edges: EdgeKey[] };
export type MakeResult = { unfolding?: Unfolding; issues: MakeIssue[]; changed?: number; lost?: Lost };

/** What the student added to a made model, by key, to carry across a remake. */
type Carry = {
  details: Record<FaceKey, Pick<Panel, 'details' | 'lines' | 'edgeFlaps' | 'foldOvers'>>;
  joints: Record<EdgeKey, ConnectionKind>;
  opts: Record<EdgeKey, Partial<Pick<Connection, 'fingers' | 'tabs' | 'crease' | 'flap' | 'tabLen' | 'lockDepth'>>>;
  cuts: Record<EdgeKey, 'fold' | 'cut'>;
};

/** Gather what the student did on the last made model (milestone 129, §4.5 step 3). */
function gather(d: Design): Carry {
  const c: Carry = { details: {}, joints: {}, opts: {}, cuts: {} };
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p?.src) continue;
    if (p.details.length || p.lines?.length || p.edgeFlaps?.length || p.foldOvers?.length)
      c.details[p.src.face] = JSON.parse(JSON.stringify({ details: p.details, lines: p.lines, edgeFlaps: p.edgeFlaps, foldOvers: p.foldOvers }));
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
  for (const [face, w] of Object.entries(carry.details)) {
    const p = byFace.get(face);
    if (!p) {
      lost.faces.push(face);
      continue;
    }
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
    const flapOf = (e: PEdge) => {
      const ch = seamChoice(P, e, mat, last, spec.seams);
      return ch.kind === 'glue' || ch.kind === 'lock' ? (ch.params.flap ?? 0) : 0;
    };
    const u = unfolding ?? unfold(P, { sheet: sheetOf(d, mat), flap: flapOf, prefer: spec.prefer, fixed: spec.edges, open: spec.open, seed: d.id, clearance: mat.thickness });
    for (const issue of u.issues) issues.push({ kind: 'unfold', issue });
    addSeamNet(d, P, {
      folds: u.folds,
      flapOn: u.flapOn,
      flapDepth: u.flapDepth,
      flapTaper: u.flapTaper,
      open,
      order: islandOrder(P, u),
      seam: (e) => seamChoice(P, e, mat, last, spec.seams).kind,
    });
    for (const e of Object.values(P.edges)) {
      const c = d.connections[seamId(e.key)];
      if (!c) continue;
      const role: SeamRole = c.kind === 'fold' ? 'fold' : 'seam';
      const ch = role === 'fold' ? chooseJoint(seamCtx(P, e, mat, role, last)) : seamChoice(P, e, mat, last, spec.seams);
      // the unfolder's flap size (it fitted the net with it) wins over the chooser's
      const params = { ...ch.params, ...(c.flap !== null ? { flap: c.flap } : {}) };
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
    solve(d);
    return { unfolding: u, issues };
  }
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
  for (const k of order) {
    const f = P.faces[k];
    const id = addFreePanel(d, { id: boardId(k), name: k, frame: f.frame, side: -1, outer: f.outer, holes: f.holes, src: k });
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
    joined.add(e.key);
    c.src = e.key;
    const picked = spec.joints?.[e.key];
    const ch = chooseJoint(seamCtx(P, e, mat, 'corner', last));
    applyChoice(c, picked ?? ch.kind, picked ? {} : ch.params, ch.why);
    if (picked) c.picked = true;
    // the board that closes last carries the tabs, so it drops in from outside
    if (c.kind === 'tabslot' && last && ids[last] === c.b.panelId) [c.a, c.b] = [c.b, c.a];
    c.auto = false;
  }
  for (const e of Object.values(P.edges))
    if (ids[e.a] && ids[e.b] && !joined.has(e.key) && e.ea.ring === 0 && e.eb.ring === 0) issues.push({ kind: 'corner', edge: e.key, dihedral: e.dihedral });
  solve(d);
  return { issues };
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
    if (!c.src || c.picked) continue;
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
