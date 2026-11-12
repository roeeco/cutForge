// Waffle settings edits (WAFFLE_MODE.md §6.1): pure functions on a design,
// given the derived model of the design they edit (for defaults and positions).
import type { Design, WaffleFamily, WaffleSpec } from '../model/types';
import { newId } from '../model/ops';
import type { Fam, WaffleModel } from './derive';

/** The design's settings, made from the defaults in force the first time they change. */
export function ensureSpec(d: Design, m: WaffleModel): WaffleSpec {
  d.waffle ??= JSON.parse(JSON.stringify(m.spec)) as WaffleSpec;
  return d.waffle;
}
/** A family's slices as stored positions (from here on the student places them). */
function materialize(d: Design, m: WaffleModel, fam: Fam): { id: string; at: number }[] {
  const f = ensureSpec(d, m)[fam];
  f.slices ??= m.slices.filter((s) => s.fam === fam).map((s) => ({ id: s.id, at: s.at }));
  return f.slices;
}

export function setSpacing(d: Design, m: WaffleModel, fam: Fam, spacing: WaffleFamily['spacing']) {
  ensureSpec(d, m)[fam] = { spacing };
}
export function setTurn(d: Design, m: WaffleModel, turn: number) {
  ensureSpec(d, m).turn = Math.max(0, Math.min(90, Math.round(turn * 10) / 10));
}
export function setClearance(d: Design, m: WaffleModel, c: number | undefined) {
  const s = ensureSpec(d, m);
  if (c === undefined) delete s.clearance;
  else s.clearance = Math.max(-1, Math.min(2, c));
}
/** Slices of one family stay at least t + 2 mm apart. */
export const minGap = (m: WaffleModel) => m.t + 2;

/** Move a slice along its family's normal; it stops t + 2 mm from its neighbours. */
export function moveSlice(d: Design, m: WaffleModel, fam: Fam, id: string, at: number) {
  const list = materialize(d, m, fam);
  const me = list.find((s) => s.id === id);
  if (!me) return;
  const others = list.filter((s) => s.id !== id).map((s) => s.at).sort((a, b) => a - b);
  const below = others.filter((x) => x <= me.at).pop(), above = others.find((x) => x > me.at);
  let v = at;
  if (below !== undefined) v = Math.max(v, below + minGap(m));
  if (above !== undefined) v = Math.min(v, above - minGap(m));
  me.at = Math.round(v * 1000) / 1000;
}
/** + Slice: one more, halfway into its family's widest gap (the ends of the solid count). Returns its id. */
export function addSlice(d: Design, m: WaffleModel, fam: Fam): string | null {
  const list = materialize(d, m, fam);
  const [lo, hi] = m.ext[fam];
  const xs = [lo, ...list.map((s) => s.at).sort((a, b) => a - b), hi];
  let best = -1, at = (lo + hi) / 2;
  for (let i = 0; i + 1 < xs.length; i++)
    if (xs[i + 1] - xs[i] > best) {
      best = xs[i + 1] - xs[i];
      at = (xs[i] + xs[i + 1]) / 2;
    }
  if (best < 2 * minGap(m)) return null;
  const id = newId('sl');
  list.push({ id, at: Math.round(at * 1000) / 1000 });
  return id;
}
export function deleteSlice(d: Design, m: WaffleModel, fam: Fam, id: string) {
  const list = materialize(d, m, fam);
  const i = list.findIndex((s) => s.id === id);
  if (i >= 0) list.splice(i, 1);
}
/** Equal spacing: hand-placed positions are dropped (both families). */
export function equalSpacing(d: Design, m: WaffleModel) {
  const s = ensureSpec(d, m);
  delete s.a.slices;
  delete s.b.slices;
}

/** The base plate: on (with its defaults), changed, or off. */
export function setBase(d: Design, m: WaffleModel, base: Partial<NonNullable<WaffleSpec['base']>> | null) {
  const s = ensureSpec(d, m);
  if (base === null) delete s.base;
  else s.base = { shape: 'rect', margin: 10, flat: 0, ...s.base, ...base };
}
