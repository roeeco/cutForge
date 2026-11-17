// Derived data kept outside the design (PACKAGING_PLAN.md §4.7, milestone 61).
//
// A design that has left the store is frozen (Immer freezes what `produce`
// returns, and `settle` below freezes what it makes), so anything worked out
// from it can be cached against the design object itself and is never stale.
// A design that is still being edited (a draft, or a plain object a test
// mutates) is not frozen: it is never cached, and every call works it out
// afresh, as before.
import { freeze } from 'immer';
import type { Design } from './types';

const caches = new WeakMap<object, Map<string, unknown>>();

/** `fn(d)`, cached per frozen design under `key`; worked out every time for a design that can still change. */
export function memo<T>(d: object, key: string, fn: () => T): T {
  if (!Object.isFrozen(d)) return fn();
  let m = caches.get(d);
  if (!m) caches.set(d, (m = new Map()));
  if (m.has(key)) return m.get(key) as T;
  const v = fn();
  m.set(key, v);
  return v;
}

/**
 * `next` with every part that equals the same part of `base` replaced by
 * `base`'s object, so what did not change keeps its identity (React memos
 * and the caches above keep working). Plain JSON-like data only.
 */
export function reconcile<T>(base: T, next: T): T {
  if (base === next) return base;
  if (typeof base !== 'object' || typeof next !== 'object' || base === null || next === null) return Object.is(base, next) ? base : next;
  const arr = Array.isArray(next);
  if (arr !== Array.isArray(base)) return next;
  const b = base as Record<string, unknown>, n = next as Record<string, unknown>;
  const keys = Object.keys(n);
  let same = keys.length === Object.keys(b).length;
  const out: Record<string, unknown> = arr ? ([] as unknown as Record<string, unknown>) : {};
  for (const k of keys) {
    const v = reconcile(b[k], n[k]);
    out[k] = v;
    if (v !== b[k] || !(k in b)) same = false;
  }
  return same ? base : (out as T);
}

/**
 * Run `fn` (solve, connect, guard) on a plain copy of `edited`, outside
 * Immer's proxies, and give back the result frozen, sharing every unchanged
 * part with `edited`. Solving reads the whole design many times over, which
 * costs about three times as much through a draft.
 */
export function settle(edited: Design, fn: (d: Design) => void): Design {
  const plain = structuredClone(edited) as Design;
  fn(plain);
  return freeze(reconcile(edited, plain), true);
}
