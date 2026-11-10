// Fuzz: every template with random (in-range and extreme) parameters, regeneration and material
// changes; the result must be an exportable design (pipeline invariants) and validate must not throw.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts, rng, seedMath, type R } from './gen';
import { checkPipeline, type Fail } from './pipecheck';
import { MATERIALS } from '../../src/model/materials';
import { TEMPLATES, changeMaterial, generate, regenerate } from '../../src/templates/registry';
import type { ParamDef, Params } from '../../src/templates/types';
import { validate } from '../../src/model/validate';
import { addDetail } from '../../src/model/ops';
import { blocking } from '../../src/easy/fix';

const N = Number(process.env.FUZZ_N ?? 120);
const SEED0 = Number(process.env.FUZZ_SEED ?? 1);

beforeAll(loadFonts);

function value(r: R, p: ParamDef): number | string {
  if (p.type === 'choice') return r.pick(p.options).value;
  const v = r.pick([p.min, p.max, r.num(p.min, p.max), r.num(p.min, p.max)]);
  return p.type === 'int' ? Math.round(v) : Math.round(v * 10) / 10;
}

describe('fuzz: templates', () => {
  it(`random parameters (${N})`, () => {
    const fails: Fail[] = [];
    const stats: Record<string, number> = {};
    const issueKinds: Record<string, number> = {};
    for (let s = SEED0; s < SEED0 + N; s++) {
      const r = rng(s);
      seedMath(s);
      const t = r.pick(TEMPLATES);
      const mat = r.pick(MATERIALS.filter((m) => t.materials.includes(m.kind)));
      const params: Params = Object.fromEntries(t.params.map((p) => [p.key, value(r, p)]));
      const log = [`${t.id} ${mat.id} ${JSON.stringify(params)}`];
      const fail = (cls: string, msg: string) => fails.push({ cls, seed: s, msg: msg + '\n  log: ' + log.join('; ') });
      let d;
      try {
        d = generate(t, mat, params);
      } catch (e) {
        fail('generate throws', String(e));
        continue;
      }
      // a user shape on the base, then a regeneration with other parameters and maybe another material
      if (d.panels['t:base']) addDetail(d, 't:base', 'circle', 'cut', d.panels['t:base'].w / 2, d.panels['t:base'].h / 2, 8, 8);
      try {
        const iss = validate(d);
        for (const i of iss.filter(blocking)) issueKinds[i.key] = (issueKinds[i.key] ?? 0) + 1;
      } catch (e) {
        fail('validate throws', String(e));
      }
      checkPipeline(d, s, log, fails, stats);
      if (r.chance(0.5)) {
        const p2: Params = { ...params };
        const k = r.pick(t.params);
        p2[k.key] = value(r, k);
        log.push(`regenerate ${k.key}=${p2[k.key]}`);
        try {
          const res = regenerate(d, p2);
          d = res.design;
          if (!d.panels['t:base']?.details.some((x) => x.shape === 'circle')) fail('user shape lost on regenerate', '');
        } catch (e) {
          fail('regenerate throws', String(e));
          continue;
        }
        checkPipeline(d, s, log, fails, stats);
      }
      if (r.chance(0.4)) {
        const m2 = r.pick(MATERIALS);
        log.push(`changeMaterial ${m2.id}`);
        try {
          d = changeMaterial(d, m2).design;
        } catch (e) {
          fail('changeMaterial throws', String(e));
          continue;
        }
        checkPipeline(d, s, log, fails, stats);
      }
    }
    const byCls = new Map<string, Fail[]>();
    for (const f of fails) byCls.set(f.cls, [...(byCls.get(f.cls) ?? []), f]);
    const summary = [...byCls].map(([k, v]) => `${k}: ${v.length} (seeds ${[...new Set(v.map((x) => x.seed))].slice(0, 10).join(',')})\n    e.g. ${v[0].msg.slice(0, 900)}`).join('\n');
    console.log('stats', JSON.stringify(stats), '\nblocking issue kinds', JSON.stringify(issueKinds), '\n' + summary);
    expect(summary).toBe('');
  }, 1_200_000);
});
