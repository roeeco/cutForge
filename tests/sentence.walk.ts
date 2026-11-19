// Random walks through a structure's words (milestones 95–96, SENTENCE_BUILDER_PLAN.md S2–S3): shared by the tests.
import { MATERIALS } from '../src/model/materials';
import { choose, resolve, type Value } from '../src/sentence/resolve';
import { defaults, generate } from '../src/templates/registry';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/fix';
import type { Params, TemplateDef } from '../src/templates/types';
import type { MaterialProfile } from '../src/model/types';

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return { next, pick: <T,>(a: T[]) => a[Math.floor(next() * a.length)], chance: (p: number) => next() < p };
}

export type WalkFail = { seed: number; step: number; why: string; params: Params };

/** One walk: random words changed (any word, before or after the last one), built after each step, checked. */
export function walk(def: TemplateDef, m: MaterialProfile, seed: number, steps: number): WalkFail[] {
  const r = rng(seed);
  let p: Params = defaults(def);
  const fails: WalkFail[] = [];
  for (let k = 0; k < steps; k++) {
    const ws = resolve(def, m, p).filter((w) => w.shown);
    const w = r.pick(ws);
    let v: Value;
    if (w.options) {
      if (!w.options.length) continue;
      v = r.pick(w.options);
    } else {
      const lo = w.min ?? 0, hi = w.max ?? lo;
      // sometimes past the end: it must be refused
      if (r.chance(0.1)) {
        const res = choose(def, m, p, w.key, hi + 10);
        if (!('refused' in res) && hi + 10 <= (w.max ?? Infinity)) continue;
        if (!('refused' in res)) fails.push({ seed, step: k, why: `number past its limit accepted: ${w.key}`, params: p });
        continue;
      }
      const isInt = def.params.find((x) => x.key === w.key)?.type === 'int';
      v = lo + r.next() * (hi - lo);
      v = isInt ? Math.round(v) : Math.round(v * 10) / 10;
    }
    const res = choose(def, m, p, w.key, v);
    if ('refused' in res) {
      // the engine may refuse a size inside the range (it would not cut clean): that is the rule, not a fault
      if (res.refused.why === 'sen.why.engineSize') continue;
      fails.push({ seed, step: k, why: `in-range value refused: ${w.key}=${v} (${JSON.stringify(res.refused)})`, params: p });
      continue;
    }
    p = res.params;
    // every word is allowed after the change
    for (const s of resolve(def, m, p))
      if (s.shown && s.options && s.options.length && !s.options.includes(p[s.key] ?? '')) fails.push({ seed, step: k, why: `word left on a value not offered: ${s.key}=${p[s.key]}`, params: p });
    let d;
    try {
      d = generate(def, m, p);
    } catch (e) {
      fails.push({ seed, step: k, why: `generate throws: ${(e as Error).message}`, params: p });
      continue;
    }
    const issues = validate(d).filter((i) => !NOTE_KEYS.has(i.key));
    if (issues.length) fails.push({ seed, step: k, why: `blocking issues: ${[...new Set(issues.map((i) => i.key))].join(',')}`, params: p });
  }
  return fails;
}

export const MATS = MATERIALS;
