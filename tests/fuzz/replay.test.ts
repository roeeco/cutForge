// Replay a shrunk sequence from a fuzz report: REPLAY_FILE, REPLAY_CLS (prefix).
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runSeq, mulberry32 } from './fuzz';
import { panelEdges } from '../../src/model/edges';
// a tool, not a check: runs only with REPLAY_FILE set
it.skipIf(!process.env.REPLAY_FILE)('replay', () => {
  const agg = JSON.parse(readFileSync(process.env.REPLAY_FILE!, 'utf8'));
  for (const [cls, e] of Object.entries<any>(agg)) {
    if (!cls.startsWith(process.env.REPLAY_CLS ?? '')) continue;
    const old = Math.random;
    Math.random = mulberry32(e.seed);
    const r = runSeq(e.shrunk ?? [], e.mat, { stopAtFirst: true, only: (c) => c === cls });
    Math.random = old;
    console.log('##', cls, 'mat', e.mat, JSON.stringify(e.shrunk));
    for (const f of r.failures) console.log('  step', f.step, f.op, f.msg.slice(0, 400));
    if (process.env.REPLAY_DUMP) {
      const d = r.d;
      for (const id of d.order) { const p = d.panels[id]; console.log('  P', id, p.w.toFixed(2), p.h.toFixed(2), p.sketch.kind, JSON.stringify(p.sketch).slice(0, 300), 'details', JSON.stringify(p.details).slice(0, 300)); }
      for (const c of Object.values(d.connections)) console.log('  C', c.id, c.kind, c.grown, c.a.panelId + '.' + c.a.edge, c.b.panelId + '.' + c.b.edge, 'ang', c.angle, 'off', c.offset, c.broken ? 'BROKEN' : '', c.trayId ?? '');
      for (const t of Object.values(d.trays)) console.log('  T', JSON.stringify(t));
    }
  }
});
