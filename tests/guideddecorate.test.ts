// Decorate (milestone 108, GUIDED_MODE.md G5).
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FONTS } from '../src/text/fonts';
import { registerFont } from '../src/text/registerFont';
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { solve } from '../src/model/ops';
import { validate } from '../src/model/validate';
import { blocking } from '../src/easy/fix';
import { boxLid, setBoxLid } from '../src/easy/lid';
import { missionState } from '../src/easy/missions';
import { featureState, GUIDED } from '../src/easy/features';
import { translate } from '../src/i18n';
import { frontWall, mainTray } from '../src/templates/structures/box';
import { GUIDED_MISSIONS, PLAIN } from '../src/guided/things';
import { addName, addSticker, addWindow, canDecorate } from '../src/guided/decorate';
import { kindOf } from '../src/guided/box';
import type { Design } from '../src/model/types';

beforeAll(() => {
  const buf = (f: string) => {
    const b = readFileSync(`public/fonts/${f}`);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  for (const f of FONTS) registerFont(f.id, buf(`${f.file}-hebrew-400-normal.woff`), buf(`${f.file}-latin-400-normal.woff`));
});

const BUILT = MATERIALS.slice(0, 4);
const mat = (id: string) => MATERIALS.find((m) => m.id === id)!;
const clone = (d: Design): Design => JSON.parse(JSON.stringify(d));
const issues = (d: Design) => validate(d).filter(blocking).map((i) => i.key);

describe('decorations on every side', () => {
  it('a name, a sticker and a window in the middle of every side that can be decorated leave nothing blocking', { timeout: 120_000 }, () => {
    const bad: string[] = [];
    for (const th of [...GUIDED_MISSIONS, ...PLAIN])
      for (const m of BUILT) {
        if (!th.can(m)) continue;
        const d0 = th.start(m);
        if (kindOf(d0) !== 'box') continue;
        const before = issues(d0);
        for (const id of d0.order) {
          if (canDecorate(d0, id)) continue;
          for (const [what, fn] of [
            ['name', (x: Design) => addName(x, id, 'Maya')],
            ['sticker', (x: Design) => addSticker(x, id, 'star')],
            ['window', (x: Design) => addWindow(x, id, 'circle', 'cut')],
          ] as const) {
            const d = clone(d0);
            const r = fn(d);
            solve(d);
            if ('id' in r) {
              const now = issues(d).filter((k) => !before.includes(k));
              if (now.length) bad.push(`${th.id} ${m.id} ${id} ${what}: ${now.join(',')}`);
            }
          }
        }
      }
    expect(bad).toEqual([]);
  });

  it('the front wall of a plain box takes all three in every board', () => {
    for (const m of BUILT) {
      const d = PLAIN[0].start(m);
      const fw = frontWall(d, mainTray(d)!)!;
      expect(canDecorate(d, fw)).toBeNull();
      for (const r of [addName(d, fw, 'Maya'), addSticker(d, fw, 'heart'), addWindow(d, fw, 'roundrect', 'engrave')]) expect('id' in r, m.id).toBe(true);
    }
  });

  it('a divider, a curved side and a side too small say why and make nothing', () => {
    const pencil = GUIDED_MISSIONS[0].start(mat('ply-3'));
    const div = pencil.order.find((id) => pencil.panels[id].divider)!;
    expect(canDecorate(pencil, div)).toBe('g.deco.divider');
    const round = PLAIN.find((x) => x.id === 'round-box')!.start(mat('ply-3'));
    const band = round.order.find((id) => id !== round.trays[mainTray(round)!].baseId)!;
    expect(canDecorate(round, band)).toBe('g.deco.curved');
    const small = PLAIN[0].start(mat('ply-3'));
    const fw = frontWall(small, mainTray(small)!)!;
    small.panels[fw].h = 12;
    const n = small.panels[fw].details.length;
    expect(addName(small, fw, 'Maya')).toEqual({ why: 'g.deco.tooSmall' });
    expect(small.panels[fw].details.length).toBe(n);
  });
});

describe('the name goal', () => {
  it('a real name meets it; the placeholders do not', () => {
    for (const value of ['Maya', translate('en', 'g.deco.namePlaceholder'), translate('he', 'g.deco.namePlaceholder'), translate('en', 'text.default')]) {
      const d = GUIDED_MISSIONS[0].start(mat('ply-3'));
      addName(d, frontWall(d, mainTray(d)!)!, value);
      solve(d);
      expect(missionState(d)!.goals.find((g) => g.goal.id === 'name')!.ok, value).toBe(value === 'Maya');
    }
  });
});

describe('a decorated lid', () => {
  it('keeps its decorations when the lid changes kind', () => {
    const d = PLAIN.find((x) => x.id === 'box-lid')!.start(mat('card-0.5'));
    const tr = mainTray(d)!;
    const lid = boxLid(d, tr);
    expect(lid.kind).toBe('liftoff');
    const top = lid.kind === 'liftoff' ? lid.top : '';
    expect('id' in addName(d, top, 'Maya')).toBe(true);
    setBoxLid(d, tr, 'liftoff', 'flat');
    solve(d);
    const now = boxLid(d, tr);
    const t2 = now.kind === 'liftoff' ? now.top : '';
    expect(d.panels[t2]?.details.some((x) => x.text?.value === 'Maya')).toBe(true);
  });
});

it('the face-on view in Guided offers no outline editing, side handles, operations or arrays', () => {
  for (const f of ['edit2d', 'transform.sides', 'rail.ops', 'op.scoreAdd', 'arrays', 'align', 'copies'] as const) expect(featureState(f, 'guided'), f).toBe('hide');
  expect(GUIDED['solo.guard']).toBe('show');
});
