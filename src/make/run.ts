// The one click (milestones 126, 127; SHAPES_TO_DIELINES_PLAN.md decision 0): the shapes'
// face graph, the unfolder (in a Worker for larger forms), the reassembler, one undo step,
// then the made model folding together in 3D. Every choice is made automatically; the
// Make card only refines it afterwards.
import { useStore } from '../store/store';
import type { Design, MakeSpec, MaterialProfile } from '../model/types';
import { kernelNow } from '../sculpt/kernel';
import { autoFacets, DEFAULT_FACETS, shapePolyhedron, splitPolyhedra, type Facets } from '../sculpt/polyhedron';
import { reassemble, unfoldFlaps, unfoldSpecOf, type Lost, type MakeIssue } from '../model/reassemble';
import { solidKey } from '../sculpt/build';
import { unfold, type Unfolding, type UnfoldSpec } from '../model/unfold';
import { MATERIALS, CARD_FOLD_MAX } from '../model/materials';
import { setMaterial } from '../model/ops';
import { mergePoly, movePoly, polyBounds, type Polyhedron } from '../model/polyhedron';
import { create } from 'zustand';
import { playAssembly } from '../easy/assemble';

/** What the last Make left for the card: its issues, and whether it is still working. */
/** `changedFor`: the design the material note is about; the next edit makes it old, and it is not shown (milestone 137). */
/**
 * `issuesFor`: the Make (`design.make`) the issues and the lost faces are about. An undo or redo to another Make, or
 * a Make of the other kind, leaves them unshown (exploratory test report, finding 3: board problems in the Fold it card).
 */
export const useMake = create<{ issues: MakeIssue[]; busy: boolean; changed: number | null; changedFor?: unknown; lost: Lost | null; issuesFor?: unknown }>(() => ({ issues: [], busy: false, changed: null, lost: null }));

/** The shapes changed since they were made: *Update from shape* (milestone 129). */
export const shapesChanged = (d: Design) => !!d.make && !!d.sculpt && d.make.shapeKey !== undefined && d.make.shapeKey !== solidKey(d.sculpt);

/** The material each design was last made with (not saved: a reload takes the material it opens with). */
export const madeWith = new Map<string, string>();
export const matKey = (d: Pick<Design, 'material'>) => `${d.material.id}:${d.material.thickness}`;

/** Can this material make it? Fold it: card that folds, or corrugated; boards: plywood or corrugated. */
export function canMake(as: 'fold' | 'boards', m: Pick<MaterialProfile, 'kind' | 'thickness'>): boolean {
  if (as === 'fold') return (m.kind === 'card' && m.thickness <= CARD_FOLD_MAX + 1e-9) || m.kind === 'corrugated';
  return m.kind === 'plywood' || m.kind === 'corrugated';
}
/** The material a one-click Make uses: the design's when it can, else card or plywood 3 mm. */
export function materialFor(as: 'fold' | 'boards', m: MaterialProfile): MaterialProfile | null {
  if (canMake(as, m)) return null;
  return as === 'fold' ? MATERIALS[0] : MATERIALS[3];
}

/**
 * Faces around a curve for this Make: the number set on the Make card for every curve, else
 * each curve's own from its size and the material (milestone 188, `autoFacets`). `set` is the
 * card's number, undefined while it is automatic.
 */
export function facetsFor(spec: Pick<MakeSpec, 'as' | 'facets'>, m: Pick<MaterialProfile, 'thickness'>): { n: Facets; set: number | undefined; byShape: Record<string, number> } {
  const set = spec.as === 'fold' ? spec.facets?.card : spec.facets?.boards;
  const dflt = spec.as === 'fold' ? DEFAULT_FACETS.card : DEFAULT_FACETS.boards;
  return { n: set ?? ((s) => autoFacets(s, spec.as, m) ?? dflt), set, byShape: spec.facets?.byShape ?? {} };
}

/** The counts the design's curved shapes get (automatic or set), each once, smallest first. */
export function facetCounts(d: Design, spec: Pick<MakeSpec, 'as' | 'facets'>, m: Pick<MaterialProfile, 'thickness'> = d.material): number[] {
  const f = facetsFor(spec, m);
  const out = new Set<number>();
  for (const [id, s] of Object.entries(d.sculpt?.shapes ?? {})) {
    if (autoFacets(s, spec.as, m) === undefined) continue;
    out.add(f.byShape[id] ?? s.facets ?? (typeof f.n === 'number' ? f.n : f.n(s)));
  }
  return [...out].sort((a, b) => a - b);
}

/** The face graph of the design's shapes for a Make spec (null before the kernel loads). With a lid by a cut, the box and the lid beside it, both open at the cut. */
export function polyOf(d: Design, spec: Pick<MakeSpec, 'as' | 'facets' | 'lid'>): Polyhedron | null {
  const k = kernelNow();
  if (!k || !d.sculpt) return null;
  const f = facetsFor(spec, d.material);
  const whole = shapePolyhedron(k, d.sculpt, f.n, f.byShape);
  if (!spec.lid) return whole;
  const b = polyBounds(whole);
  const cut = b.max[1] - spec.lid;
  if (!(cut > b.min[1] + 1)) return whole;
  const parts = splitPolyhedra(k, d.sculpt, cut, f.n, f.byShape);
  if (!parts) return whole;
  // the lid set down beside the box, 20 mm clear (ROADMAP.md §2 decision 1), its cut on the floor
  return mergePoly(parts.box, movePoly(parts.lid, [b.max[0] - b.min[0] + 20, -cut, 0]));
}
/** The faces a lid by a cut leaves open. */
export const LID_OPEN = ['cut', 'lid/cut'];

/** Forms with more faces than this unfold in a Worker. */
const WORKER_FACES = 40;

function unfoldSpec(d: Design, P: Polyhedron, spec: MakeSpec): { spec: Omit<UnfoldSpec, 'flap'>; flaps: Record<string, number> } {
  return { spec: unfoldSpecOf(d, d.material, spec), flaps: unfoldFlaps(P, d.material, spec) };
}

/** Unfold off the main thread when the form is large and Workers exist; else here. */
async function unfoldFor(d: Design, P: Polyhedron, spec: MakeSpec): Promise<Unfolding | undefined> {
  if (spec.as !== 'fold') return undefined;
  const { spec: us, flaps } = unfoldSpec(d, P, spec);
  if (Object.keys(P.faces).length <= WORKER_FACES || typeof Worker === 'undefined') return unfold(P, { ...us, flap: (e) => flaps[e.key] ?? 0 });
  return new Promise((resolve) => {
    const w = new Worker(new URL('./unfold.worker.ts', import.meta.url), { type: 'module' });
    const done = (u: Unfolding | undefined) => (w.terminate(), resolve(u));
    w.onmessage = (ev) => done({ ...ev.data, folds: new Set(ev.data.folds) });
    // a Worker that cannot start: unfold here instead
    w.onerror = () => done(unfold(P, { ...us, flap: (e) => flaps[e.key] ?? 0 }));
    w.postMessage({ P, spec: us, flaps });
  });
}

/** Play the made model folding together (the fold slider 0 → 1 over about 1.5 s). */
function playFold() {
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 1500);
    // eased: slow at both ends
    useStore.getState().set({ foldT: k < 1 ? 0.5 - Math.cos(k * Math.PI) / 2 : 1 });
    if (k < 1) requestAnimationFrame(step);
  };
  useStore.getState().set({ foldT: 0 });
  requestAnimationFrame(step);
}

/**
 * Make the design's shapes into `as` with its spec (the last one, or the defaults): one undo
 * step, then the made model on the 3D stage folding together. Resolves to false when the
 * kernel is not ready or there is nothing to make.
 */
export async function makeNow(as: 'fold' | 'boards', over: Partial<MakeSpec> = {}, opts: { play?: boolean } = {}): Promise<boolean> {
  // a shape just placed, its height still open (✓ not pressed): the click on Make takes it as it stands, so the
  // shape is kept (it used to be made, then thrown away with the ghost, leaving a model of a shape that was gone)
  // one Make at a time: a click while one is still working is not started over it (exploratory test report, finding 5)
  if (useMake.getState().busy) return false;
  if (useStore.getState().pending) useStore.getState().confirmPending();
  const st = useStore.getState();
  const view0 = st.view;
  const d0 = st.design;
  if (!d0.sculpt?.order.length || !kernelNow()) return false;
  const prev = d0.make?.as === as ? d0.make : undefined;
  // the shapes' key when made (milestone 129): Update from shape shows when it changes
  const spec: MakeSpec = { ...(prev ?? {}), ...over, as, shapeKey: solidKey(d0.sculpt) };
  // a lid by a cut leaves both cut faces open
  const open = new Set([...(spec.open ?? []).filter((k) => !LID_OPEN.includes(k)), ...(spec.lid ? LID_OPEN : [])]);
  if (open.size) spec.open = [...open];
  else delete spec.open;
  // the material: the design's when it can make this, else card or plywood 3 mm (decision 0)
  const swap = materialFor(as, d0.material);
  const d1: Design = swap ? { ...JSON.parse(JSON.stringify(d0)), material: { ...swap } } : d0;
  const P = polyOf(d1, spec);
  if (!P || !Object.keys(P.faces).length) return false;
  useMake.setState({ busy: true });
  const u = await unfoldFor(d1, P, spec);
  // another design opened while it worked: this Make is not for it
  if (useStore.getState().design.id !== d0.id) return (useMake.setState({ busy: false }), false);
  let issues: MakeIssue[] = [];
  let lost: Lost | undefined;
  st.apply((d) => {
    if (swap) setMaterial(d as Design, swap);
    const r = reassemble(d as Design, P, spec, u);
    issues = r.issues;
    lost = r.lost;
  });
  useMake.setState({ lost: lost && (lost.faces.length || lost.edges.length) ? lost : null });
  madeWith.set(useStore.getState().design.id, matKey(useStore.getState().design));
  useMake.setState({ busy: false, issues, changed: null, issuesFor: useStore.getState().design.make });
  useStore.getState().setSculpt({ stage: 'make' });
  // the made model on the 3D stage, unless the student went to another view while it worked
  if (useStore.getState().view === view0) useStore.getState().setView('3d');
  useStore.getState().select(null);
  // folds fold up; boards come in one after another, the one that closes last last (milestone 40's animation)
  if (opts.play !== false) as === 'fold' ? playFold() : playAssembly();
  return true;
}
