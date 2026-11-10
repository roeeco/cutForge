// Fuzz: offsetContour on random simple polygons (convex, star-shaped, thin, with arcs). A non-null
// result must be a correct offset: closed, finite, CCW, every point at distance |d| from the original
// boundary, on the right side.
import { describe, expect, it } from 'vitest';
import { rng, type R } from './gen';
import { chained, finiteContour } from './check';
import { offsetContour } from '../../src/export/offset';
import type { Contour } from '../../src/geom/types';
import { circleContour, contourArea, flattenContour, pointInPolygon, polygonContour, roundedRectContour, reverseContour } from '../../src/geom/vec';
import { isSimplePolygon } from '../../src/model/ops';

const N = Number(process.env.FUZZ_N ?? 3000);

function segDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const l2 = vx * vx + vy * vy || 1e-30;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
  return Math.hypot(p.x - a.x - vx * t, p.y - a.y - vy * t);
}

function shape(r: R): { c: Contour; kind: string } | null {
  const k = r.f();
  if (k < 0.1) return { c: circleContour(0, 0, r.num(0.05, 30)), kind: 'circle' };
  if (k < 0.25) {
    const w = r.num(0.2, 60), h = r.num(0.2, 60);
    return { c: roundedRectContour(0, 0, w, h, r.num(0, Math.min(w, h) / 2)), kind: 'roundrect' };
  }
  // star-shaped polygon around the origin (simple by construction), sometimes thin spikes
  const n = r.int(3, 40);
  const base = r.num(1, 50);
  const angs = Array.from({ length: n }, () => r.num(0, 2 * Math.PI)).sort((a, b) => a - b);
  const pts = angs.map((a) => {
    const rad = base * (r.chance(0.3) ? r.num(0.05, 1) : r.num(0.7, 1.3));
    return { x: rad * Math.cos(a), y: rad * Math.sin(a) };
  });
  if (!isSimplePolygon(pts)) return null;
  const c = polygonContour(pts);
  return { c: r.chance(0.3) ? reverseContour(c) : c, kind: `star${n}` };
}

describe('fuzz: offsetContour', () => {
  it(`random simple shapes (${N})`, () => {
    const r = rng(12345);
    const classes = new Map<string, string[]>();
    const add = (k: string, m: string) => classes.set(k, [...(classes.get(k) ?? []), m]);
    let nulls = 0, done = 0;
    for (let i = 0; i < N; i++) {
      const s = shape(r);
      if (!s) continue;
      const d = r.pick([0.05, 0.075, 0.1, 0.125, -0.05, -0.075, -0.1, -0.125, 0.5, -0.5]);
      const res = offsetContour(s.c, d);
      done++;
      if (!res) {
        nulls++;
        // a convex shape always has an outward offset
        const pts = flattenContour(s.c, 0.01);
        const sg = Math.sign(contourArea(s.c));
        let convex = true;
        for (let j = 0; j < pts.length; j++) {
          const a = pts[j], b = pts[(j + 1) % pts.length], c = pts[(j + 2) % pts.length];
          if (sg * ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) < -1e-12) convex = false;
        }
        if (convex && d > 0) add('convex shape refused an outward offset', `#${i} ${s.kind} d=${d}`);
        continue;
      }
      const tag = `#${i} ${s.kind} d=${d}`;
      if (!finiteContour(res)) add('non-finite result', tag);
      if (!chained(res, 1e-6)) add('result not chained/closed', tag);
      if (contourArea(res) <= 0) add('result not CCW', tag);
      const orig = flattenContour(s.c, 0.001);
      const a0 = Math.abs(contourArea(s.c)), a1 = contourArea(res);
      if (d > 0 ? a1 <= a0 : a1 >= a0) add('area moved the wrong way', `${tag} ${a0} -> ${a1}`);
      let worst = 0;
      for (const p of flattenContour(res, 0.001)) {
        let m = Infinity;
        for (let j = 0; j < orig.length; j++) m = Math.min(m, segDist(p, orig[j], orig[(j + 1) % orig.length]));
        worst = Math.max(worst, Math.abs(m - Math.abs(d)));
        const inside = pointInPolygon(p, orig);
        if (m > 1e-6 && inside !== d < 0) {
          add('result point on the wrong side', tag);
          break;
        }
      }
      if (worst > 2e-3) add('result not at distance |d| from the original', `${tag} worst error ${worst.toFixed(4)} mm`);
    }
    const summary = [...classes].map(([k, v]) => `${k}: ${v.length} e.g. ${v.slice(0, 5).join(' | ')}`).join('\n');
    console.log(`offset: ${done} shapes, ${nulls} refused (null)\n${summary}`);
    expect(summary).toBe('');
  }, 600_000);
});
