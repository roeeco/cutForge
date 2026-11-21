// Milestones 161–170 (BOXES_PRESETS_PLAN.md): presets built from boards, for plywood 3 and corrugated 4 only. Each
// builds clean on both at its defaults and at every size's ends (or the sentence refuses those words with a reason),
// keeps the joint census (nothing folded or fingered on 4 mm board, no flaps on plywood), is recognised as its own
// card, keeps a shape drawn on one of its boards through a change of size, and is not offered on thinner stock.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { TEMPLATES, defaults, generate, regenerate, templateById } from '../src/templates/registry';
import { cardOfDesign, recognise, sentenceCandidates } from '../src/templates/catalogue';
import { boardStock, censusBreaks, plywoodOnly } from '../src/templates/structures/boards';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { addDetail } from '../src/model/ops';
import { makes, type ParamDef, type Params, type TemplateDef } from '../src/templates/types';
import type { Design, MaterialProfile } from '../src/model/types';

const M = (id: string) => MATERIALS.find((m) => m.id === id)!;
const STOCK = [M('ply-3'), M('corr-4')];
const THIN = [M('card-0.5'), M('corr-1.6')];
const LANE: TemplateDef[] = TEMPLATES.filter((t) => t.canMake === boardStock || t.canMake === plywoodOnly);
/** The boards each is made of: both, or plywood alone (`plywoodOnly`, DECISIONS.md). */
const stockOf = (t: TemplateDef) => STOCK.filter((m) => makes(t, m));
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const own = (t: TemplateDef) => cardOfDesign({ template: { id: t.id, version: t.version, params: defaults(t) } });

describe('presets built from boards (milestones 161–170)', () => {
  it('there are some, each on a card of its own', () => {
    expect(LANE.length).toBeGreaterThan(0);
    for (const t of LANE) expect(own(t), t.id).not.toBeNull();
  });

  it('plywood 3 and 4 mm board make them; card and thinner corrugated do not, and their lists leave them out', () => {
    for (const t of LANE) {
      expect(makes(t, STOCK[0]), `${t.id} plywood`).toBe(true);
      expect(makes(t, STOCK[1]), `${t.id} 4 mm board`).toBe(t.canMake === boardStock);
      for (const m of THIN) expect(makes(t, m), `${t.id} ${m.id}`).toBe(false);
    }
    const ids = new Set(LANE.map((t) => t.id));
    for (const m of THIN) for (const c of sentenceCandidates(m, defaults(templateById('box')!), 'box')) expect(ids.has(c.choice.id), `${c.value} on ${m.id}`).toBe(false);
   }, 120_000);

  it('each builds clean at its defaults, keeps the joint census and is recognised as its card', () => {
    for (const t of LANE)
      for (const m of stockOf(t)) {
        const d = generate(t, m, defaults(t));
        expect(problems(d), `${t.id} ${m.id}`).toEqual([]);
        expect(censusBreaks(d), `${t.id} ${m.id}`).toEqual([]);
        expect(recognise(d)?.card.id, `${t.id} ${m.id}`).toBe(own(t)!.card.id);
      }
  }, 120_000);

  it('at every size’s ends it builds clean, or the sentence refuses the words with a reason', () => {
    for (const t of LANE)
      for (const m of stockOf(t))
        for (const p of t.params.filter((x): x is Extract<ParamDef, { min: number }> => x.type === 'number' || x.type === 'int'))
          for (const v of [p.min, p.max]) {
            const lim = t.limits?.(m, defaults(t))[p.key];
            const x = Math.max(lim?.min ?? p.min, Math.min(lim?.max ?? p.max, v));
            const words: Params = { ...defaults(t), [p.key]: x };
            const why = t.accepts?.(m, words) ?? null;
            if (why) continue;
            const d = generate(t, m, words);
            expect(problems(d), `${t.id} ${m.id} ${p.key}=${x}`).toEqual([]);
            expect(censusBreaks(d), `${t.id} ${m.id} ${p.key}=${x}`).toEqual([]);
          }
  }, 300_000);

  it('a shape drawn on one of its boards stays through a change of size', () => {
    for (const t of LANE) {
      const m: MaterialProfile = STOCK[0];
      const d = generate(t, m, defaults(t));
      // the board with the most room on it
      const id = [...d.order].sort((a, b) => d.panels[b].w * d.panels[b].h - d.panels[a].w * d.panels[a].h)[0];
      const mine = addDetail(d, id, 'circle', 'engrave', d.panels[id].w / 2, d.panels[id].h / 2, 10, 10);
      const w = t.params.find((x) => x.key === 'width') as Extract<ParamDef, { min: number }> | undefined;
      const next = { ...d.template!.params, ...(w ? { width: Number(d.template!.params.width) + 10 } : {}) };
      const r = regenerate(d, next);
      expect(r.design.panels[id]?.details.some((x) => x.id === mine), t.id).toBe(true);
    }
  }, 120_000);
});

describe('angled tabs on 4 mm board (milestone 163)', () => {
  it('the stand’s supports lean in angled slots on 4 mm board and plywood, and are glued on thinner board', () => {
    const st = templateById('stand')!;
    for (const m of [...STOCK, ...THIN]) {
      const d = generate(st, m, { ...defaults(st), angle: 45 });
      const supports = Object.values(d.connections).filter((c) => c.grown && c.a.panelId === 't:base' && c.b.panelId.startsWith('t:support'));
      expect(supports.length, m.id).toBe(3);
      const rigid = m.kind === 'plywood' || m.thickness >= 3;
      for (const c of supports) expect(c.kind, m.id).toBe(rigid ? 'lean' : 'glue');
      expect(problems(d), m.id).toEqual([]);
      if (rigid) for (const s of supports) expect(Object.values(d.connections).filter((c) => !c.grown && c.a.panelId === s.b.panelId && c.kind === 'tabslot').length, m.id).toBe(2);
    }
  }, 60_000);
});
