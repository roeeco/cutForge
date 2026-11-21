// Milestone 182 (BOXES_PLYWOOD_PLAN.md §3.4): layered things on the face-glued joint (E1, milestone 173). The *Frame*
// (boxes.py's PhotoFrame), its *Plaque* (EngravingFrame) and *Shadow box* (Shadowbox): each builds clean on plywood 3 and
// 8 mm, is recognised as itself, and every board is glued face to face or held by tabs in slots.
import { describe, expect, it } from 'vitest';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { recordOf } from '../src/templates/records';
import { styleById } from '../src/templates/styles';
import { censusBreaks } from '../src/templates/structures/boards';
import { SPACERS } from '../src/templates/structures/boardLayers';
import { makes, type Params } from '../src/templates/types';
import type { Design } from '../src/model/types';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length === 0 || cs.every((c) => c.kind === 'slide');
  });
const words = (st: string): Params => ({ ...styleById(st)!.words, ...(styleById(st)!.sizes ?? {}) });

const CASES: [string, string, Params, string][] = [
  ['photo frame', 'frame', {}, 'frame'],
  ['photo frame, small, wide border', 'frame', { width: 40, height: 60, border: 40 }, 'frame'],
  ['plaque', 'frame', words('plaque'), 'plaque'],
  ['shadow box', 'frame', words('shadowBox'), 'shadowBox'],
];

describe('layered things (milestone 182)', () => {
  it('each builds clean on plywood 3 and 8 mm, is recognised as itself, and every board is held', () => {
    for (const m of [P3, P8])
      for (const [name, id, w, v] of CASES) {
        const t = templateById(id)!;
        const d = generate(t, m, { ...defaults(t), ...w });
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(v);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
        expect(censusBreaks(d), `${name} ${m.id}`).toEqual([]);
      }
  }, 240_000);

  it('a frame’s layers are glued face to face; its feet are held in slots in its back', () => {
    const t = templateById('frame')!;
    const cases: [Params, number][] = [[{}, 3], [words('plaque'), 2], [words('shadowBox'), 2 + SPACERS]];
    for (const [w, n] of cases) {
      const d = generate(t, P3, { ...defaults(t), ...w });
      const cs = Object.values(d.connections);
      expect(cs.filter((c) => c.kind === 'laminate' && !c.broken)).toHaveLength(n - 1);
      expect(cs.filter((c) => c.kind === 'tabslot' && [c.a.panelId, c.b.panelId].includes('t:back'))).toHaveLength(2);
      expect(recordOf(d).layers).toBe(n);
    }
  });

  it('the photo frame’s middle layer leaves a pocket open at the top; the plaque’s back has a field to engrave', () => {
    const t = templateById('frame')!;
    const d = generate(t, P3, defaults(t));
    const mid = d.panels['t:middle'];
    expect(mid.sketch.kind === 'poly' && mid.sketch.pts.length).toBe(8);
    const q = generate(t, P3, { ...defaults(t), ...words('plaque') });
    expect(q.panels['t:back'].details.some((x) => x.op === 'engrave')).toBe(true);
  });

  it('the frame is plywood only', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) expect(makes(templateById('frame')!, m), m.id).toBe(false);
  });
});
