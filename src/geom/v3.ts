import type { V3 } from '../model/types';

export const v3add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const v3sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const v3mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const v3dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const v3cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const v3len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const v3norm = (a: V3): V3 => {
  const l = v3len(a);
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};
/** Round tiny float noise so frames stay clean after many operations. */
export const v3clean = (a: V3): V3 => a.map((x) => (Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : x)) as V3;
