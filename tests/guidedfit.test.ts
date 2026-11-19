// *Make it fit* (milestone 107, GUIDED_MODE.md G4).
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { missionById, missionState, startMission } from '../src/easy/missions';
import { contentFit } from '../src/easy/objects';
import { fitContent } from '../src/guided/fit';
import { insideSize, spaces } from '../src/guided/box';
import { validate } from '../src/model/validate';
import { blocking } from '../src/easy/fix';

const mat = (id: string) => MATERIALS.find((m) => m.id === id)!;
const area = (k: { x0: number; x1: number; y0: number; y1: number }) => [k.x1 - k.x0, k.y1 - k.y0];

describe('Make it fit', () => {
  it('Pencil box: the pencils fit, the box is 14.2 mm deeper, the other spaces keep their sizes, a second call changes nothing', () => {
    const d = startMission(missionById('pencil-box')!, mat('ply-3'));
    const c = d.contents![0];
    const need = contentFit(d, c).need;
    expect(need.d).toBeCloseTo(14.2, 1);
    const before = spaces(d);
    const cell = contentFit(d, c).cell!;
    const others = before.filter((k) => Math.abs(k.y0 - cell.y0) > 1e-6).map(area);
    const r = fitContent(d, c.id)!;
    expect(r).not.toBeNull();
    expect(missionState(r)!.goals.find((g) => g.goal.id === 'fits-pencil')!.ok).toBe(true);
    expect(insideSize(r)!.d - insideSize(d)!.d).toBeCloseTo(14.2, 1);
    const cellAfter = contentFit(r, r.contents![0]).cell!;
    const othersAfter = spaces(r).filter((k) => Math.abs(k.y0 - cellAfter.y0) > 1e-6).map(area);
    expect(othersAfter.length).toBe(others.length);
    othersAfter.forEach((a, i) => {
      expect(a[0]).toBeCloseTo(others[i][0], 1);
      expect(a[1]).toBeCloseTo(others[i][1], 1);
    });
    expect(validate(r).filter(blocking)).toEqual([]);
    const again = fitContent(r, r.contents![0].id)!;
    expect(JSON.stringify(again)).toBe(JSON.stringify(r));
  });

  it('in every board, each mission lot fits after Make it fit and nothing blocks', () => {
    for (const m of MATERIALS.slice(0, 4))
      for (const id of ['pencil-box', 'dice-tray', 'game-organiser']) {
        const ms = missionById(id)!;
        if (!ms.materials.includes(m.kind)) continue;
        let d = startMission(ms, m);
        for (const c of d.contents ?? []) {
          const r = fitContent(d, c.id);
          expect(r, `${id} ${m.id} ${c.object}`).not.toBeNull();
          d = r!;
          expect(contentFit(d, d.contents!.find((x) => x.id === c.id)!).ok, `${id} ${m.id}`).toBe(true);
        }
        expect(validate(d).filter(blocking).map((i) => i.key), `${id} ${m.id}`).toEqual([]);
      }
  });

  it('the dice tray (not a rectangle) grows until the six dice fit', () => {
    const d = startMission(missionById('dice-tray')!, mat('ply-3'));
    const c = d.contents![0];
    expect(contentFit(d, c).ok).toBe(false);
    const r = fitContent(d, c.id)!;
    expect(contentFit(r, r.contents![0]).ok).toBe(true);
    expect(insideSize(r)!.w).toBeGreaterThan(insideSize(d)!.w);
  });

  it('a lot too big for the sheet: null', () => {
    const d = startMission(missionById('pencil-box')!, mat('ply-3'));
    d.contents![0] = { ...d.contents![0], count: 2000 };
    expect(fitContent(d, d.contents![0].id)).toBeNull();
  });
});

describe('Make it fit after a split', () => {
  it('a divider across a space beyond the grown one moves with it: no new space appears', async () => {
    const { splitSpace, spaces: sp } = await import('../src/guided/box');
    const d = startMission(missionById('pencil-box')!, mat('ply-3'));
    const back = [...sp(d)].sort((a, b) => b.y0 - a.y0)[0];
    splitSpace(d, back, 'frontToBack');
    const n = sp(d).length;
    const c = d.contents![0];
    const r = fitContent(d, c.id)!;
    expect(sp(r).length).toBe(n);
    expect(contentFit(r, r.contents![0]).ok).toBe(true);
  });
});
