// Milestone 183 (BOXES_PLYWOOD_PLAN.md E10): parts in the Shapes tool, and the cards built on them. A part's outline
// is drawn from its sizes: a gear has its teeth on its pitch circle, every outline is one closed simple polygon, a
// part survives save and load and exports clean, on a board or as a board of its own.
import { describe, expect, it } from 'vitest';
import { PARTS, defaultPart, gearCircles, gearOutline, partOutline, partParams, pulleyDiameter, puzzleLines, type PartSpec } from '../src/model/parts';
import type { P2 } from '../src/model/types';

/** No two edges of a closed outline cross or touch (but neighbours at their shared corner). */
function isSimplePolygon(q: P2[]): boolean {
  const n = q.length;
  if (n < 3) return false;
  const cr = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const a = q[i], b = q[(i + 1) % n], c = q[j], d = q[(j + 1) % n];
      const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
      if (d1 * d2 <= 0 && d3 * d4 <= 0 && Math.max(a.x, b.x) >= Math.min(c.x, d.x) && Math.max(c.x, d.x) >= Math.min(a.x, b.x) && Math.max(a.y, b.y) >= Math.min(c.y, d.y) && Math.max(c.y, d.y) >= Math.min(a.y, b.y)) return false;
    }
  return true;
}
const area = (q: P2[]) => q.reduce((s, p, i) => s + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0) / 2;
/** Local peaks of the distance from the centre, round a closed outline: the teeth. */
function peaks(q: P2[]): number {
  const r = q.map((p) => Math.hypot(p.x, p.y));
  const top = Math.max(...r), low = Math.min(...r), mid = (top + low) / 2;
  let n = 0;
  for (let i = 0; i < r.length; i++) if (r[i] > mid && r[(i + r.length - 1) % r.length] <= mid) n++;
  return n;
}

describe('parts (milestone 183): outlines', () => {
  it('a gear has its teeth, its tips on the addendum circle and its roots on the dedendum circle; its outline is simple', () => {
    for (const [m, z] of [[1, 8], [2, 12], [2, 20], [3, 24], [1.5, 60], [1, 120]] as const) {
      const g = gearOutline(m, z, 20, 0.2);
      const c = gearCircles(m, z);
      expect(c.r * 2, `${m} ${z}`).toBeCloseTo(m * z, 9);
      expect(peaks(g), `${m} ${z}`).toBe(z);
      const r = g.map((p) => Math.hypot(p.x, p.y));
      expect(Math.max(...r), `${m} ${z}`).toBeLessThanOrEqual(c.ra + 1e-6);
      expect(Math.max(...r), `${m} ${z}`).toBeGreaterThan(c.ra - 0.2 * m);
      expect(Math.min(...r), `${m} ${z}`).toBeCloseTo(c.rf, 3);
      expect(isSimplePolygon(g), `${m} ${z}`).toBe(true);
      expect(area(g), `${m} ${z}`).toBeGreaterThan(0);
    }
  });

  it('a gear tooth is half the circular pitch thick at the pitch circle, less the backlash', () => {
    const m = 2, z = 20, b = 0.2;
    const g = gearOutline(m, z, 20, b);
    // the tooth centred on +x: where its flanks cross the pitch circle
    const r = (m * z) / 2;
    const cross: number[] = [];
    for (let i = 0; i < g.length; i++) {
      const a = g[i], c = g[(i + 1) % g.length];
      const ra = Math.hypot(a.x, a.y), rc = Math.hypot(c.x, c.y);
      if ((ra - r) * (rc - r) < 0) {
        const t = (r - ra) / (rc - ra);
        const ang = Math.atan2(a.y + (c.y - a.y) * t, a.x + (c.x - a.x) * t);
        if (Math.abs(ang) < Math.PI / z) cross.push(ang);
      }
    }
    expect(cross).toHaveLength(2);
    expect(Math.abs(cross[1] - cross[0]) * r).toBeCloseTo((Math.PI * m) / 2 - b, 1);
  });

  it('every part at its defaults, and at its smallest and largest, is closed simple outlines that do not cross each other', () => {
    for (const def of PARTS) {
      const specs: PartSpec[] = [defaultPart(def.kind)];
      for (const end of ['min', 'max'] as const) {
        const p: Record<string, number | string> = {};
        for (const q of def.params) if (q.type !== 'choice') p[q.key] = end === 'min' ? q.min! : q.max!;
        specs.push({ kind: def.kind, p: partParams({ kind: def.kind, p }) });
      }
      for (const q of def.params) if (q.type === 'choice') for (const o of q.options!) specs.push({ kind: def.kind, p: { ...defaultPart(def.kind).p, [q.key]: o.value } });
      for (const s of specs) {
        if (s.kind === 'holes' && Number(s.p.width) * Number(s.p.height) / Number(s.p.pitch) ** 2 > 3000) continue;
        const o = partOutline(s);
        expect(o.polys.length, `${def.kind} ${JSON.stringify(s.p)}`).toBeGreaterThan(0);
        for (const poly of o.polys) expect(isSimplePolygon(poly), `${def.kind} ${JSON.stringify(s.p)}`).toBe(true);
      }
    }
  });

  it('a timing pulley’s outer diameter is its pitch circle less the belt’s pitch line offset', () => {
    expect(pulleyDiameter('gt2', 20)).toBeCloseTo(40 / Math.PI - 0.508, 6);
    const o = partOutline({ kind: 'pulley', p: { profile: 'gt2', teeth: 20 } }).polys[0];
    expect(peaks(o)).toBe(20);
  });

  it('a puzzle cut has a line between each row and each column, a tab on every edge between two pieces', () => {
    const ls = puzzleLines(200, 150, 4, 3);
    expect(ls).toHaveLength(3 + 2);
    expect(ls.every((l) => l.filter((q) => q.bulge).length === (l[0].x === 0 ? 4 : 3))).toBe(true);
  });
});
