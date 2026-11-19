import { it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addRootPanel, addTray, autoConnect, createDesign, solve } from '../src/model/ops';
import { clearSpans } from '../src/model/measure';
import { toWorld } from '../src/model/frame';
import { tOf } from '../src/model/materials';
import { boxRecipe } from '../src/easy/recipes';
it('p', () => {
  for (const m of MATERIALS) for (const kind of ['open', 'carton'] as const) {
    if (kind === 'carton' && m.kind === 'plywood') continue;
    const d = createDesign(m);
    let base = '';
    if (kind === 'open') { base = addRootPanel(d, 0, 0, 100, 60); addTray(d, base, 40); autoConnect(d); solve(d); }
    else { const r = boxRecipe(d, { kind: 'rect', x0: 0, z0: 0, x1: 100, z1: 60 } as any, 40, 'carton'); base = typeof r === 'string' ? r : (r as any)?.baseId ?? (r as any)?.base ?? d.order[0]; }
    const pts: number[][] = [];
    for (const id of d.order) { const p = d.panels[id]; const t = tOf(d, id); for (const [x, y] of [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]) for (const z of [0, t]) pts.push(toWorld(p.frame, x, y, z)); }
    const ext = [0, 1, 2].map((k) => Math.max(...pts.map((q) => q[k])) - Math.min(...pts.map((q) => q[k])));
    const tr = Object.values(d.trays ?? {})[0];
    const b = d.panels[tr.baseId];
    process.stdout.write(`${m.id} ${kind} base ${b.w}x${b.h} trayH ${tr.height} ext ${ext.map((v) => v.toFixed(2)).join('x')} clear ${JSON.stringify(clearSpans(d, tr.baseId))} sketch ${b.sketch.kind}\n`);
  }
});
