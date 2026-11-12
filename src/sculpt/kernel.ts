// The shape kernel (WAFFLE_MODE.md §3.2): manifold-3d 3.5.4 (Apache-2.0),
// loaded with a dynamic import only when a waffle design opens, so box designs
// never download it. Once `kernel()` has resolved, every call is synchronous.
//
// Every Manifold and CrossSection lives in WASM memory and must be freed with
// `.delete()`. After setup, the classes' methods are wrapped so that every
// object they return is recorded: `scope(fn)` frees everything made inside it
// except what it returns, and `liveCount()` says how many are still alive.
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';

export type Kernel = ManifoldToplevel;
export type { CrossSection, Manifold };

let loading: Promise<Kernel> | null = null;
let ready: Kernel | null = null;
const listeners = new Set<() => void>();

const inNode = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node;

/** Load the kernel (once); the promise resolves with it ready to use. */
export function kernel(): Promise<Kernel> {
  loading ??= (async () => {
    const { default: Module } = await import('manifold-3d');
    let wasm: Kernel;
    if (inNode) {
      // tests: the package finds its WASM next to itself
      wasm = await Module();
    } else {
      const { default: wasmUrl } = await import('manifold-3d/manifold.wasm?url');
      wasm = await Module({ locateFile: () => wasmUrl });
    }
    wasm.setup();
    instrument(wasm);
    ready = wasm;
    for (const f of listeners) f();
    return wasm;
  })();
  loading.catch(() => (loading = null));
  return loading;
}

/** The loaded kernel, or null while it loads. */
export function kernelNow(): Kernel | null {
  return ready;
}

/** Called once when the kernel has loaded (at once if it already has). */
export function onKernel(f: () => void): () => void {
  if (ready) f();
  else listeners.add(f);
  return () => listeners.delete(f);
}

// ---- object tracking -------------------------------------------------------

type Obj = { delete(): void };
const live = new Set<Obj>();
const scopes: Set<Obj>[] = [];
let isKernelObj: (x: unknown) => x is Obj = (_x): _x is Obj => false;

function record(x: unknown) {
  if (Array.isArray(x)) return x.forEach(record);
  if (!isKernelObj(x) || live.has(x)) return;
  live.add(x);
  scopes[scopes.length - 1]?.add(x);
}

function instrument(k: Kernel) {
  const classes = [k.Manifold, k.CrossSection] as unknown as (Function & Record<string, unknown>)[];
  isKernelObj = (x): x is Obj => !!x && typeof x === 'object' && classes.some((c) => x instanceof c);
  const skip = new Set(['constructor', 'delete', 'prototype', 'length', 'name', 'arguments', 'caller']);
  const wrap = (owner: Record<string, unknown>, key: string) => {
    const f = owner[key];
    if (typeof f !== 'function' || skip.has(key)) return;
    owner[key] = function (this: unknown, ...args: unknown[]) {
      const r = (f as Function).apply(this, args);
      record(r);
      return r;
    };
  };
  const done = new Set<object>();
  for (const C of classes) {
    // methods live on the classes and on the embind classes they extend
    for (let o: object | null = C; o && o !== Function.prototype; o = Object.getPrototypeOf(o)) {
      if (done.has(o)) continue;
      done.add(o);
      for (const key of Object.getOwnPropertyNames(o)) wrap(o as Record<string, unknown>, key);
    }
    for (let o: object | null = C.prototype; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      if (done.has(o)) continue;
      done.add(o);
      for (const key of Object.getOwnPropertyNames(o)) wrap(o as Record<string, unknown>, key);
    }
  }
  // instances' prototypes are the embind classes: free through every `delete` along the chains
  const delDone = new Set<object>();
  for (const C of classes)
    for (let o: object | null = C.prototype; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      const P = o as Record<string, unknown>;
      if (delDone.has(o) || !Object.prototype.hasOwnProperty.call(P, 'delete') || typeof P.delete !== 'function') continue;
      delDone.add(o);
      const del = P.delete as Function;
      P.delete = function (this: Obj) {
        if (live.has(this)) {
          live.delete(this);
          for (const s of scopes) s.delete(this);
        }
        del.call(this);
      };
    }
}

/** How many kernel objects are alive (made through the kernel's methods and not yet freed). */
export function liveCount(): number {
  return live.size;
}

/** Kernel objects inside a returned value: itself, an array's items, or an object's fields (one level). */
function keptIn(v: unknown, out = new Set<Obj>(), depth = 0): Set<Obj> {
  if (isKernelObj(v)) out.add(v);
  else if (Array.isArray(v)) for (const x of v) keptIn(x, out, depth);
  else if (v && typeof v === 'object' && depth < 1) for (const x of Object.values(v)) keptIn(x, out, depth + 1);
  return out;
}

/**
 * Run `fn`; every kernel object made inside it is freed when it returns, except
 * those it returns (directly, in an array, or as a field of a returned object),
 * which move to the enclosing scope.
 */
export function scope<T>(fn: () => T): T {
  const mine = new Set<Obj>();
  scopes.push(mine);
  let result: T;
  try {
    result = fn();
  } catch (e) {
    scopes.pop();
    for (const o of mine) o.delete();
    throw e;
  }
  scopes.pop();
  const keep = keptIn(result);
  for (const o of mine) if (!keep.has(o)) o.delete();
  const parent = scopes[scopes.length - 1];
  if (parent) for (const o of keep) if (live.has(o)) parent.add(o);
  return result;
}

/** Keep an object out of every open scope (a cache owns it now; it is freed when evicted). */
export function own<T>(x: T): T {
  for (const o of keptIn(x)) for (const s of scopes) s.delete(o);
  return x;
}

// ---- smoothness ------------------------------------------------------------

/** Largest distance of a circle's chord from the circle (mm). */
export const CHORD_TOL = 0.02;

/** Segments around a full circle of radius r so the chord error stays within CHORD_TOL (at most 360). */
export function circleSegments(r: number): number {
  if (!(r > CHORD_TOL)) return 8;
  const n = Math.ceil(Math.PI / Math.acos(1 - CHORD_TOL / r));
  return Math.max(8, Math.min(360, n));
}
