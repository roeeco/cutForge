// Reassembly (milestones 125–127, SHAPES_TO_DIELINES_PLAN.md §4.5): a face graph and a
// Make spec into ordinary boards and joints, in the design itself, so every Workshop tool
// works on the result. *Fold it*: the unfolder picks the folds, each cut seam gets the
// chooser's flap or lock. *Build from boards*: a board on each face, material inward (the
// shape is the outside), corners found as for any box and given the chooser's joint.
// Pure and deterministic: ids come from keys, the unfolder's seed is the design's id.
import type { Connection, ConnectionKind, Design, MakeSpec, MaterialProfile } from './types';
import type { EdgeKey, FaceKey, PEdge, Polyhedron } from './polyhedron';
import { polyIssues, type PolyIssue } from './polyhedron';
import { addFreePanel, autoConnect, solve } from './ops';
import { addSeamNet, boardId, seamId } from './seamNet';
import { islandOrder, unfold, type Unfolding, type UnfoldIssue } from './unfold';
import { chooseJoint, closingFace, type SeamCtx, type SeamRole } from './jointChoice';
import { cornerFit } from './seams';
import { findEdge } from './edges';
import type { MsgKey } from '../i18n';

export type MakeIssue = { kind: 'poly'; issue: PolyIssue } | { kind: 'unfold'; issue: UnfoldIssue } | { kind: 'corner'; edge: EdgeKey; dihedral: number } | { kind: 'empty' };
export type MakeResult = { unfolding?: Unfolding; issues: MakeIssue[]; changed?: number };

/** The sheet the unfolder lays a net on: the material's, less the design's margins. */
export const sheetOf = (d: Pick<Design, 'sheetMargin'>, m: MaterialProfile) => ({ w: m.sheetW - 2 * (d.sheetMargin ?? 5), h: m.sheetH - 2 * (d.sheetMargin ?? 5) });

/** How far a face reaches back from one of its edges, on average: its area over the edge's length. */
const span = (P: Polyhedron, f: FaceKey, e: PEdge) => Math.abs(P.faces[f].area) / Math.max(1e-6, e.len);

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
export function reassemble(d: Design, P: Polyhedron, spec: MakeSpec, unfolding?: Unfolding): MakeResult {
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
      const ch = chooseJoint(seamCtx(P, e, mat, 'seam', last));
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
      seam: (e) => chooseJoint(seamCtx(P, e, mat, 'seam', last)).kind,
    });
    for (const e of Object.values(P.edges)) {
      const c = d.connections[seamId(e.key)];
      if (!c) continue;
      const role: SeamRole = c.kind === 'fold' ? 'fold' : 'seam';
      const ch = chooseJoint(seamCtx(P, e, mat, role, last));
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
    solve(d);
    return { unfolding: u, issues };
  }
  // boards: one on each face, material inward; corners joined as for any box, then chosen
  const ids: Record<FaceKey, string> = {};
  const order = faces.map((f) => f.key).sort((a, b) => (a === last ? 1 : b === last ? -1 : Math.abs(P.faces[b].area) - Math.abs(P.faces[a].area) || (a < b ? -1 : 1)));
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

export { cornerFit };
