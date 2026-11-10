// Fuzz: Quick build sessions (recipes + guard), then validate / fixes / missions / export.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts, rng, seedMath, type R } from './gen';
import type { Design } from '../../src/model/types';
import { MATERIALS } from '../../src/model/materials';
import { createDesign, solve } from '../../src/model/ops';
import { boxRecipe, dividerLine, holeRecipe, isBoxBase, planDividerLine, quickWallHeight, stickerRecipe, textRecipe, wallRecipe } from '../../src/easy/recipes';
import { quickGuard, shapeAllowed } from '../../src/easy/guard';
import { canFix, fixIssue } from '../../src/easy/fix';
import { MISSIONS, missionState, startMission } from '../../src/easy/missions';
import { STICKERS, stickerSize } from '../../src/easy/stickers';
import { sheetUse } from '../../src/easy/sheet';
import { validate } from '../../src/model/validate';
import { prepareExport } from '../../src/export/prepare';
import { panelEdges } from '../../src/model/edges';
import { compartments, boxBases } from '../../src/easy/objects';

const N = Number(process.env.FUZZ_N ?? 60);
const SEED0 = Number(process.env.FUZZ_SEED ?? 1);
const STEPS = Number(process.env.FUZZ_STEPS ?? 8);

beforeAll(loadFonts);

type Fail = { cls: string; seed: number; msg: string };
const clone = (d: Design): Design => JSON.parse(JSON.stringify(d));

function footprint(r: R) {
  const kind = r.chance(0.6) ? ('rect' as const) : ('regular' as const);
  const cx = r.num(-200, 200), cz = r.num(-200, 200);
  const sz = r.pick([r.num(0, 10), r.num(10, 120), r.num(100, 400), r.num(400, 900)]);
  const sz2 = r.chance(0.3) ? sz : r.pick([r.num(0, 10), r.num(10, 120), r.num(100, 400)]);
  const flipX = r.chance(0.3) ? -1 : 1, flipZ = r.chance(0.3) ? -1 : 1;
  return { kind, x0: cx, z0: cz, x1: cx + flipX * sz, z1: cz + flipZ * sz2, sides: r.int(3, 12) } as const;
}

function session(seed: number, fails: Fail[], stats: Record<string, number>) {
  const r = rng(seed);
  seedMath(seed);
  const mat = r.pick(MATERIALS);
  const fromMission = process.env.MISSIONS ? r.chance(0.6) : false;
  const ms = fromMission ? r.pick(MISSIONS) : null;
  let d = ms ? startMission(ms, mat) : createDesign(mat);
  const log: string[] = [`mat ${mat.id}${ms ? ' mission ' + ms.id : ''}`];
  const fail = (cls: string, msg: string) => fails.push({ cls, seed, msg: msg + '\n  log: ' + log.join('; ') });
  const tryRun = <T,>(cls: string, f: () => T): T | undefined => {
    try {
      return f();
    } catch (e) {
      fail(cls, String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | '));
      return undefined;
    }
  };
  for (let step = 0; step < STEPS; step++) {
    const base = clone(d);
    const roots = d.order.filter((id) => d.panels[id]);
    const act = roots.length === 0 ? 'box' : r.pick(['box', 'wall', 'wall', 'hole', 'hole', 'text', 'sticker', 'divider', 'divider'] as const);
    let newDetail: string | null = null;
    if (act === 'box') {
      const f = footprint(r);
      const h = r.pick([r.num(1, 10), r.num(10, 80), r.num(80, 400)]);
      const res = tryRun('boxRecipe throws', () => boxRecipe(d, f, h));
      log.push(`box(${JSON.stringify(f)},h=${h.toFixed(2)}) -> ${res?.baseId ?? null}`);
      if (res === undefined) return;
    } else if (act === 'wall') {
      const pid = r.pick(roots);
      const edges = panelEdges(d.panels[pid]);
      const e = r.pick(edges).key;
      const h = tryRun('quickWallHeight throws', () => quickWallHeight(d, pid, e, 40));
      if (h === undefined) return;
      if (!Number.isFinite(h) || h <= 0) fail('quickWallHeight not positive/finite', `${pid} ${e} ${h}`);
      const id = tryRun('wallRecipe throws', () => wallRecipe(d, pid, e, h));
      log.push(`wall(${pid},${e},h=${h}) -> ${id}`);
      if (id === undefined) return;
    } else if (act === 'hole' || act === 'text' || act === 'sticker') {
      const pid = r.pick(roots);
      const p = d.panels[pid];
      const cx = r.num(-0.3 * p.w, 1.3 * p.w), cy = r.num(-0.3 * p.h, 1.3 * p.h);
      if (act === 'hole') {
        const shape = r.pick(['circle', 'rect', 'roundrect'] as const);
        const w = r.num(0.5, Math.max(1, p.w)), h = r.num(0.5, Math.max(1, p.h));
        const op = r.chance(0.8) ? ('cut' as const) : ('engrave' as const);
        newDetail = tryRun('holeRecipe throws', () => holeRecipe(d, pid, shape, cx, cy, w, h, op)) ?? null;
        log.push(`hole(${pid},${shape},${op},${cx.toFixed(2)},${cy.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)})`);
      } else if (act === 'text') {
        const v = r.pick(['Noa', 'A', 'Hello box', 'שלום', '123', ' ', 'WWWWWWWWWWWWWWWWW']);
        const op = r.chance(0.7) ? ('engrave' as const) : ('cut' as const);
        newDetail = tryRun('textRecipe throws', () => textRecipe(d, pid, cx, cy, v, op)) ?? null;
        log.push(`text(${pid},${JSON.stringify(v)},${op},${cx.toFixed(2)},${cy.toFixed(2)})`);
      } else {
        const s = r.pick(STICKERS);
        const op = r.chance(0.7) ? ('engrave' as const) : ('cut' as const);
        newDetail = tryRun('stickerRecipe throws', () => stickerRecipe(d, pid, s.polys, Math.round(cx), Math.round(cy), stickerSize(p.w, p.h), op)) ?? null;
        log.push(`sticker(${pid},${s.id},${op},${Math.round(cx)},${Math.round(cy)})`);
      }
    } else if (act === 'divider') {
      const bases = roots.filter((id) => isBoxBase(d, id));
      if (!bases.length) continue;
      const b = r.pick(bases);
      const p = d.panels[b];
      const pt = () => (r.chance(0.15) ? { x: r.num(-100, p.w + 100), y: r.num(-100, p.h + 100) } : { x: r.num(0, p.w), y: r.num(0, p.h) });
      let a = pt(), c = pt();
      const mode = r.f();
      if (mode < 0.15) c = { ...a };
      else if (mode < 0.45) c = { x: r.chance(0.5) ? a.x : c.x, y: r.chance(0.5) ? c.y : a.y }; // axis-aligned
      if (mode >= 0.15 && mode < 0.45 && Math.abs(a.x - c.x) > 1e-9 && Math.abs(a.y - c.y) > 1e-9) c.y = a.y;
      const fh = r.num(5, 120);
      const plan = tryRun('planDividerLine throws', () => planDividerLine(d, b, a, c, fh));
      const made = tryRun('dividerLine throws', () => dividerLine(d, b, a, c, fh));
      log.push(`divider(${b},${JSON.stringify(a)},${JSON.stringify(c)},${fh.toFixed(2)}) plan=${plan?.kind ?? null} made=${made?.kind ?? null}`);
      if (plan && !made) fail('divider plan shown but nothing made', `${plan.kind}`);
      if (plan && made && plan.kind !== made.kind) fail('divider plan kind differs from made', `${plan.kind} vs ${made.kind}`);
      if (plan && plan.kind === 'standing' && (!Number.isFinite(plan.height) || plan.height < 5)) fail('standing plan height', `${plan.height}`);
    }
    const note = tryRun('quickGuard throws', () => quickGuard(base, d));
    if (note === undefined) return;
    if (newDetail) {
      const still = d.order.some((id) => d.panels[id]?.details.some((x) => x.id === newDetail));
      if (still) {
        const ok = tryRun('shapeAllowed throws', () => shapeAllowed(d, newDetail!));
        if (ok === false) fail(`guard left new ${act} where it may not be cut`, `${newDetail}`);
        stats.kept = (stats.kept ?? 0) + 1;
      } else stats.dropped = (stats.dropped ?? 0) + 1;
    }
  }
  stats.panels = (stats.panels ?? 0) + d.order.length;
  // checks on the session's result
  const issues = tryRun('validate throws', () => validate(d));
  if (!issues) return;
  for (const m of MISSIONS) {
    const dm = { ...d, mission: { id: m.id, version: m.version } };
    const st = tryRun(`missionState(${m.id}) throws`, () => missionState(dm));
    if (!st) continue;
    const met = st.goals.filter((g) => g.ok).length;
    if (met > st.goals.length || st.stars > 3 || st.stars < 0) fail('mission counts', `${m.id} ${met}/${st.goals.length} stars ${st.stars}`);
    if (st.done !== (met === st.goals.length)) fail('mission done mismatch', m.id);
    for (const g of st.goals) if (g.target && !d.panels[g.target] && !g.target.startsWith('t:')) fail('goal target not a panel', `${m.id}/${g.goal.id} -> ${g.target}`);
  }
  tryRun('sheetUse throws', () => sheetUse(d));
  for (const b of boxBases(d)) tryRun('compartments throws', () => compartments(d, b));
  tryRun('prepareExport throws', () => prepareExport(d, 'compensated'));
  // fixes resolve what they say
  const seen = new Set<string>();
  for (const i of issues) {
    if (!canFix(i)) continue;
    const k = `${i.key}|${i.target.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const dd = clone(d);
    const ok = tryRun(`fixIssue(${i.key}) throws`, () => fixIssue(dd, i));
    if (ok === undefined) continue;
    stats[`fix ${i.key}`] = (stats[`fix ${i.key}`] ?? 0) + 1;
    const after = tryRun('validate after fix throws', () => validate(dd));
    if (!after) continue;
    const still = after.some((x) => x.key === i.key && x.target.id === i.target.id);
    const KNOWN = (process.env.SKIP_KNOWN ?? '').split(',');
    if (ok && still && !KNOWN.includes(i.key)) fail(`fix reports success but ${i.key} remains`, `target ${i.target.kind}:${i.target.id}`);
    if (!ok) stats[`fix failed ${i.key}`] = (stats[`fix failed ${i.key}`] ?? 0) + 1;
    // a fix must not add new blocking issues of another kind on top (soft check)
    const before = new Set(issues.map((x) => x.key));
    const added = [...new Set(after.map((x) => x.key))].filter((x) => !before.has(x));
    if (added.length && !KNOWN.includes('added')) fail(`fix ${i.key} introduces new issue kinds`, added.join(','));
  }
}

describe('fuzz: Quick build', () => {
  it(`sessions hold invariants (${N} sessions × ${STEPS} steps)`, () => {
    const fails: Fail[] = [];
    const stats: Record<string, number> = {};
    for (let s = SEED0; s < SEED0 + N; s++) session(s, fails, stats);
    const byCls = new Map<string, Fail[]>();
    for (const f of fails) byCls.set(f.cls, [...(byCls.get(f.cls) ?? []), f]);
    const summary = [...byCls].map(([k, v]) => `${k}: ${v.length} (seeds ${[...new Set(v.map((x) => x.seed))].slice(0, 10).join(',')})\n    e.g. ${v[0].msg.slice(0, 1500)}`).join('\n');
    console.log('stats', JSON.stringify(stats), '\n' + summary);
    expect(summary).toBe('');
  }, 1_200_000);
});
