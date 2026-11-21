// Milestone 171 (BOXES_PLYWOOD_PLAN.md): the owner's picks on today's engine. Plywood 5 and 8 mm; the half box
// (boxes.py's HalfBox) with its triangular sides, keyholes and clamp holes; the box's new words from UniversalBox and
// TwoPiece (a top fixed on, a lid as deep as the box, raised grips), plywood only; each builds clean on plywood 3 and
// 8 mm and is recognised as its own variant.
import { describe, expect, it } from 'vitest';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { styleById } from '../src/templates/styles';
import { keyholeShape } from '../src/templates/structures/boards';
import { boxLid, capRimOf } from '../src/easy/lid';
import { mainTray } from '../src/templates/structures/box';
import type { Design, MaterialProfile } from '../src/model/types';
import type { ParamDef, Params } from '../src/templates/types';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const words = (st: string): Params => ({ ...styleById(st)!.words, ...(styleById(st)!.sizes ?? {}) });
const allowed = (id: string, key: string, v: string, p: Params, m: MaterialProfile) => {
  const def = templateById(id)!.params.find((x) => x.key === key) as ParamDef;
  return def.allowed ? def.allowed(v, p, m) : true;
};

describe('plywood 3 to 8 mm (milestone 171)', () => {
  it('plywood 5 and 8 mm are grades, scaled from 3 mm', () => {
    for (const [id, t] of [['ply-5', 5], ['ply-8', 8]] as const) {
      const m = profileById(id)!;
      expect(m.kind).toBe('plywood');
      expect(m.thickness).toBe(t);
      expect(m.kerf).toBeGreaterThan(MATERIALS[3].kerf);
    }
  });
});

describe('the half box (milestone 171, boxes.py HalfBox)', () => {
  const t = templateById('bookend')!;
  const cases: [string, Params][] = [
    ['bookend', {}],
    ['wallShelf', words('wallShelf')],
    ['clampSquare', words('clampSquare')],
    ['sturdyBookend', words('sturdyBookend')],
  ];

  it('each variant builds clean on plywood 3 mm and is recognised as itself', () => {
    for (const [id, w] of cases) {
      const d = generate(t, P3, { ...defaults(t), ...w });
      expect(problems(d), id).toEqual([]);
      expect(recognise(d)?.v.id, id).toBe(id);
    }
  }, 60_000);

  it('on 8 mm the triangles and keyholes build clean; clamp holes are refused where they do not fit, with a reason', () => {
    for (const [id, w] of cases) {
      const p = { ...defaults(t), ...w };
      const d = generate(t, P8, p);
      expect(problems(d), id).toEqual([]);
      if (id === 'clampSquare' && !allowed('bookend', 'clamp', 'holes', p, P8)) expect(recognise(d)?.v.id).toBe('bookend');
      else expect(recognise(d)?.v.id, id).toBe(id);
    }
  }, 60_000);

  it('its sides are triangles: each lowered at the front to a short edge', () => {
    const d = generate(t, P3, defaults(t));
    for (const id of ['t:wall-e1', 't:wall-e3']) {
      const s = d.panels[id].sketch;
      expect(s.kind).toBe('wall');
      const c = s.kind === 'wall' ? Object.values(s.corners ?? {}) : [];
      expect(c.some((x) => x.dy < -100), id).toBe(true);
    }
    expect(d.panels['t:wall-e0']).toBeUndefined();
  });

  it('a half box saved before 171 (no `ends`) keeps its one square side', () => {
    const { ends: _e, hang: _h, clamp: _c, ...old } = defaults(t);
    const d = generate(t, P3, old);
    expect(recognise(d)?.v.id).toBe('sturdyBookend');
  });

  it('keyholes: two, marked to hang by, slot up, inside the back', () => {
    const d = generate(t, P3, { ...defaults(t), ...words('wallShelf') });
    const back = d.panels['t:wall-e2'];
    const k = back.details.filter((x) => x.mount === 'keyhole');
    expect(k).toHaveLength(2);
    for (const x of k) {
      expect(x.cy + x.h / 2).toBeLessThan(back.h - 5);
      expect(x.cx - x.w / 2).toBeGreaterThan(0);
    }
    const s = keyholeShape(9, 4.5, 10);
    expect(s.w).toBeCloseTo(9, 6);
    // the head's centre lies below the shape's middle: the slot rises above it
    expect(s.head.y).toBeLessThan(0);
  });
});

describe('box words from UniversalBox and TwoPiece (milestone 171)', () => {
  const box = templateById('box')!;
  const cases: [string, Params, string][] = [
    ['closed', { lid: 'closed' }, 'closedBox'],
    ['two-piece', { lid: 'liftoff', rim: 'full' }, 'twoPiece'],
    ['grips', { handles: 'grips' }, 'box'],
  ];

  it('each builds clean on plywood 3 and 8 mm and is recognised', () => {
    for (const m of [P3, P8])
      for (const [name, w, v] of cases) {
        const p = { ...defaults(box), ...w };
        const d = generate(box, m, p);
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(v);
        for (const [k, x] of Object.entries(w)) expect(allowed('box', k, String(x), p, m), `${name} ${k} ${m.id}`).toBe(true);
      }
  }, 120_000);

  it('a top fixed on is the engine’s fixed lid; a full rim is a cap as deep as the box', () => {
    const c = generate(box, P3, { ...defaults(box), lid: 'closed' });
    expect(boxLid(c, mainTray(c)!).kind).toBe('fixed');
    const r = generate(box, P3, { ...defaults(box), lid: 'liftoff', rim: 'full' });
    expect(capRimOf(r, mainTray(r)!)).toBe('full');
  }, 60_000);

  it('the new words are plywood only: card and corrugated are refused them', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) {
      const p = defaults(box);
      expect(allowed('box', 'lid', 'closed', p, m), m.id).toBe(false);
      expect(allowed('box', 'rim', 'full', { ...p, lid: 'liftoff' }, m), m.id).toBe(false);
      expect(allowed('box', 'handles', 'grips', p, m), m.id).toBe(false);
    }
  }, 60_000);

  it('grips stand above the walls, so they are refused with a lid', () => {
    expect(allowed('box', 'handles', 'grips', { ...defaults(box), lid: 'liftoff' }, P3)).toBe(false);
  });
});
