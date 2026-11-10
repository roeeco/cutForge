// Joint complementarity: random plywood/corrugated trays and boxes, random finger
// and tab counts, thickness edits; no two manufactured solids may overlap.
import { it } from 'vitest';
import * as ops from '../../src/model/ops';
import { MATERIALS } from '../../src/model/materials';
import { trayWalls } from '../../src/model/trays';
import { solidCounter } from '../solid';
import { mulberry32 } from './fuzz';
import type { V3 } from '../../src/model/types';
import { toWorld } from '../../src/model/frame';
import { tOf } from '../../src/model/materials';

const N = Number(process.env.OV_N ?? 30), FROM = Number(process.env.OV_FROM ?? 1);
it('no overlapping solids', () => {
  const bad: string[] = [];
  for (let s = FROM; s < FROM + N; s++) {
    const r = mulberry32(s * 31 + 7);
    Math.random = mulberry32(s);
    const ch = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const mi = ch([3, 3, 1, 2, 0]);
    const d = ops.createDesign(MATERIALS[mi]);
    const W = Math.round(30 + r() * 120), D = Math.round(30 + r() * 90), H = Math.round(20 + r() * 60);
    const b = ops.addRootPanel(d, 0, 0, W, D);
    const t = ops.addTray(d, b, H)!;
    ops.solve(d); ops.autoConnect(d);
    const log: string[] = [`mat=${MATERIALS[mi].id} W=${W} D=${D} H=${H}`];
    if (r() < 0.4) { const k = ch(['finger', 'tabslot', 'butt', 'glue', 'slide']) as any; ops.setTrayKinds(d, t, { cornerKind: k }); log.push('corner=' + k); }
    if (r() < 0.3) { const k = ch(['finger', 'tabslot', 'butt', 'fold', 'glue']) as any; ops.setTrayKinds(d, t, { wallKind: k }); log.push('wall=' + k); }
    for (const c of Object.values(d.connections)) {
      if (r() < 0.3 && !process.env.OV_NOFINGERS) { const f = ch([3, 5, 7, 9, 15, 21]); ops.setConnection(d, c.id, { fingers: f }); log.push(`fingers ${c.id.slice(-4)}=${f}`); }
      if (r() < 0.2) { const f = ch([1, 2, 3, 6]); ops.setConnection(d, c.id, { tabs: f }); log.push(`tabs ${c.id.slice(-4)}=${f}`); }
    }
    if (r() < 0.3) { const th = ch([1.5, 4, 6, 9]); ops.editMaterial(d, d.material.id, { thickness: th }); log.push('t=' + th); }
    if (r() < 0.25) { const w = trayWalls(d, t); const dv = ops.addDividerFor(d, w[1], w[3]); log.push('divider ' + !!dv); }
    ops.solve(d); ops.autoConnect(d);
    // whole box, coarse grid
    const T = Math.max(...d.order.map((id) => tOf(d, id)));
    const lo: V3 = [-T - 1, -1, -D - T - 1], hi: V3 = [W + T + 1, H + T + 1, T + 1];
    const count = solidCounter(d);
    let worst = 0, at: V3 | null = null;
    const step = 0.45;
    for (let x = lo[0] + step / 3; x < hi[0]; x += step) for (let y = lo[1] + step / 3; y < hi[1]; y += step) for (let z = lo[2] + step / 3; z < hi[2]; z += step) {
      // only near the box's edges (joints live there)
      const nearX = x < 2 * T + 1 || x > W - 2 * T - 1, nearZ = z > -2 * T - 1 || z < -D + 2 * T + 1, nearY = y < 2 * T + 1;
      if ([nearX, nearZ, nearY].filter(Boolean).length < 2 && !(nearX && nearZ)) continue;
      const n = count([x, y, z]);
      if (n > worst) { worst = n; at = [x, y, z]; }
    }
    if (worst > 1) bad.push(`seed ${s}: overlap ${worst} at ${at?.map((v) => v.toFixed(2))} :: ${log.join('; ')} :: kinds ${Object.values(d.connections).map((c) => c.kind + (c.broken ? '!' : '')).join(',')}`);
  }
  console.log(`checked ${N} designs; ${bad.length} with overlapping solids`);
  for (const b of bad) console.log(b);
}, 3_600_000);
