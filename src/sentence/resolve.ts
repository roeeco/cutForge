// The sentence's resolver (milestone 94, SENTENCE_BUILDER_PLAN.md §3.3):
// pure, no React. A sentence is a template's parameters in order; every
// list and every range is asked of the template's own rules, so the words
// cannot drift away from what the engine can build.
//
// Rules: a change re-checks every word after it, and only those. A word no
// longer allowed takes its fallback, a number moves to the nearest end of
// its new range; each is a `Change` the sentence shows. A typed number
// outside its own range is refused (no silent correction).
import type { MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import { makes, type Limit, type ParamDef, type Params, type TemplateDef } from '../templates/types';

export type Value = string | number;
export type WordState = {
  key: string;
  value: Value;
  shown: boolean;
  /** A choice's options that are allowed now, in list order. */
  options?: Value[];
  min?: number;
  max?: number;
  limitWhy?: MsgKey;
};
export type Change = { key: string; from: Value; to: Value; why: MsgKey };
export type Refused = { refused: { min: number; max: number; why?: MsgKey } };

const isNum = (p: ParamDef) => p.type === 'number' || p.type === 'int';

/** Is the word in the sentence now? */
export function shownNow(p: ParamDef, params: Params, m: MaterialProfile): boolean {
  if (p.only && !p.only.includes(m.kind)) return false;
  return p.when ? p.when(params, m) : true;
}

/** A choice's allowed options now. */
export function optionsNow(p: ParamDef, params: Params, m: MaterialProfile): Value[] {
  if (p.type !== 'choice') return [];
  return p.options.map((o) => o.value).filter((v) => (p.allowed ? p.allowed(v, params, m) : true));
}

/** A number's range now: its own bounds narrowed by the template's limits. */
export function rangeNow(def: TemplateDef, p: ParamDef, params: Params, m: MaterialProfile): Required<Pick<Limit, 'min' | 'max'>> & { why?: MsgKey } {
  if (!isNum(p)) return { min: -Infinity, max: Infinity };
  const own = p as Extract<ParamDef, { min: number }>;
  const l = def.limits?.(m, params)[p.key];
  let min = own.min, max = own.max;
  let why: MsgKey | undefined;
  if (l?.min !== undefined && l.min > min) min = l.min;
  if (l?.max !== undefined && l.max < max) {
    max = l.max;
    why = l.why;
  }
  // a range that closed up keeps its lower end
  if (max < min) max = min;
  return { min, max, why };
}

/**
 * Every word's state, in sentence order. `lists: false` leaves out the
 * options of each list (they can take a build each to work out); the
 * sentence asks for one list with `listOf` when it is opened.
 */
export function resolve(def: TemplateDef, m: MaterialProfile, params: Params, o: { lists?: boolean } = {}): WordState[] {
  return def.params.map((p) => {
    const value = params[p.key] ?? p.default;
    const shown = shownNow(p, params, m);
    if (p.type === 'choice') return { key: p.key, value, shown, ...(o.lists === false ? {} : { options: optionsNow(p, params, m) }) };
    const r = rangeNow(def, p, params, m);
    return { key: p.key, value, shown, min: r.min, max: r.max, limitWhy: r.why };
  });
}

/** One list's allowed options now (for a list being opened). */
export function listOf(def: TemplateDef, m: MaterialProfile, params: Params, key: string): Value[] {
  const p = def.params.find((x) => x.key === key);
  return p ? optionsNow(p, params, m) : [];
}

/** One word checked against the words before it: its new value and the change, or nothing to change. */
function check(def: TemplateDef, p: ParamDef, params: Params, m: MaterialProfile): Change | null {
  const cur = params[p.key] ?? p.default;
  // a word not in the sentence keeps its value (it comes back as it was)
  if (!shownNow(p, params, m)) return null;
  if (p.type === 'choice') {
    // the current value first: the whole list is only worked out when it is not allowed any more
    if (p.options.some((o) => o.value === cur) && (!p.allowed || p.allowed(cur, params, m))) return null;
    const opts = optionsNow(p, params, m);
    if (!opts.length) return null;
    const fb = p.fallback?.(params, m);
    const to = fb !== undefined && opts.includes(fb) ? fb : opts[0];
    return { key: p.key, from: cur, to, why: p.why?.(cur, params, m) ?? 'sen.why.notHere' };
  }
  const r = rangeNow(def, p, params, m);
  const v = Number(cur);
  if (v >= r.min - 1e-9 && v <= r.max + 1e-9) return null;
  const to = p.type === 'int' ? Math.round(Math.min(Math.max(v, r.min), r.max)) : Math.min(Math.max(v, r.min), r.max);
  return { key: p.key, from: cur, to, why: r.why ?? 'sen.why.range' };
}

/** Check the words from index `from` on, in order; each change is applied before the next word is checked. */
function settleFrom(def: TemplateDef, m: MaterialProfile, params: Params, from: number): { params: Params; changes: Change[] } {
  const p = { ...params };
  const changes: Change[] = [];
  for (let i = from; i < def.params.length; i++) {
    const c = check(def, def.params[i], p, m);
    if (c) {
      p[c.key] = c.to;
      changes.push(c);
    }
  }
  return { params: p, changes };
}

/** Change one word (a pick or a typed number); every later word is checked in order. */
export function choose(def: TemplateDef, m: MaterialProfile, params: Params, key: string, value: Value): { params: Params; changes: Change[] } | Refused {
  const i = def.params.findIndex((p) => p.key === key);
  if (i < 0) return { params, changes: [] };
  const p = def.params[i];
  if (isNum(p)) {
    const r = rangeNow(def, p, params, m);
    const v = Number(value);
    if (!Number.isFinite(v) || v < r.min - 1e-9 || v > r.max + 1e-9) return { refused: { min: r.min, max: r.max, why: r.why } };
    value = p.type === 'int' ? Math.round(v) : v;
  } else if (p.type === 'choice' && !optionsNow(p, params, m).includes(value)) {
    // a list only offers what is allowed; anything else changes nothing
    return { params, changes: [] };
  }
  const r = settleFrom(def, m, { ...params, [key]: value }, i + 1);
  // a number inside its range can still make something the engine will not cut clean (a size where the
  // net fits only against the grain): refused, with the range and the reason (milestone 95)
  if (isNum(p) && def.accepts) {
    const why = def.accepts(m, r.params);
    if (why) {
      const rg = rangeNow(def, p, params, m);
      return { refused: { min: rg.min, max: rg.max, why } };
    }
  }
  return r;
}

/** The words of one structure carried to another: shared keys keep their values, the rest start at their defaults. */
export function carry(to: TemplateDef, params: Params): Params {
  const out: Params = {};
  for (const p of to.params) out[p.key] = p.key in params ? params[p.key] : p.default;
  return out;
}

/** Choose a structure: the words it shares are kept, then every word is checked; a kept word that changed is reported. */
export function chooseStructure(to: TemplateDef, m: MaterialProfile, params: Params): { params: Params; changes: Change[] } {
  return settleFrom(to, m, carry(to, params), 0);
}

/** Step 1 changed: the structure (its fallback when this material cannot make it), then every word. */
export function chooseMaterial(def: TemplateDef, m: MaterialProfile, params: Params, byId: (id: string) => TemplateDef | undefined): { def: TemplateDef; params: Params; changes: Change[] } {
  if (makes(def, m)) return { def, ...settleFrom(def, m, params, 0) };
  const seen = new Set<string>([def.id]);
  let to: TemplateDef | undefined = def;
  while (to && !makes(to, m)) {
    const id = to.fallback?.(m);
    if (!id || seen.has(id)) {
      to = undefined;
      break;
    }
    seen.add(id);
    to = byId(id);
  }
  if (!to) return { def, ...settleFrom(def, m, params, 0) };
  const r = chooseStructure(to, m, params);
  return { def: to, params: r.params, changes: [{ key: 'structure', from: def.id, to: to.id, why: 'sen.why.structure' }, ...r.changes] };
}

/**
 * The largest value of one number (between `lo` and `hi`) for which `ok`
 * holds, by bisection: at most `steps` builds, cached by `cacheKey`. For
 * limits with no formula, such as the tallest box whose net lies on one
 * sheet. Assumes `ok` holds below some value and fails above it.
 */
const bisectCache = new Map<string, number>();
export function largestOk(cacheKey: string, lo: number, hi: number, ok: (v: number) => boolean, steps = 8, step = 1): number {
  const hit = bisectCache.get(cacheKey);
  if (hit !== undefined) return hit;
  let res: number;
  if (ok(hi)) res = hi;
  else if (!ok(lo)) res = lo;
  else {
    let a = lo, b = hi;
    for (let k = 0; k < steps - 2 && b - a > step; k++) {
      const mid = (a + b) / 2;
      if (ok(mid)) a = mid;
      else b = mid;
    }
    res = Math.floor(a / step) * step;
  }
  if (bisectCache.size > 500) bisectCache.clear();
  bisectCache.set(cacheKey, res);
  return res;
}
