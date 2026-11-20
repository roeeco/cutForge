// Guided's box (milestone 107, GUIDED_MODE.md G4).
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FONTS } from '../src/text/fonts';
import { registerFont } from '../src/text/registerFont';
// the registry before a structure file (the structures and the registry import each other)
import '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { addText, growPanel, solve } from '../src/model/ops';
import { boxLid, setBoxLid } from '../src/easy/lid';
import { frontWall, mainTray } from '../src/templates/structures/box';
import { dividerRow, dividersOn } from '../src/model/dividers';
import { canSplit, insideSize, kindOf, largestSpace, lidOf, moveDivider, removeDivider, setInsideSize, setLid, spaces, splitDirFor, splitSpace } from '../src/guided/box';
import { PLAIN, GUIDED_MISSIONS } from '../src/guided/things';
import { validate } from '../src/model/validate';
import { blocking } from '../src/easy/fix';
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
const box = (id = 'box', m = 'ply-3') => PLAIN.find((x) => x.id === id)!.start(mat(m));
const pencil = (m = 'ply-3') => GUIDED_MISSIONS.find((x) => x.id === 'pencil-box')!.start(mat(m));
const r1 = (x: number) => Math.round(x * 10) / 10;
const clone = (d: Design): Design => JSON.parse(JSON.stringify(d));
const posOf = (d: Design, id: string) => d.panels[id].divider!.at;

describe('the inside', () => {
  it('a size set is the size read, in every board', () => {
    for (const m of BUILT) {
      const d = box('box', m.id);
      setInsideSize(d, { w: 150, d: 95, h: 52 });
      solve(d);
      const s = insideSize(d)!;
      expect([r1(s.w), r1(s.d), r1(s.h)], m.id).toEqual([150, 95, 52]);
    }
  });

  it('a name on the front wall stays through a resize', () => {
    const d = box();
    const tr = mainTray(d)!;
    const fw = frontWall(d, tr)!;
    addText(d, fw, d.panels[fw].w / 2, d.panels[fw].h / 2, 'Maya', 'engrave', 'rubik', 8);
    setInsideSize(d, { w: 160 });
    solve(d);
    expect(d.panels[frontWall(d, tr)!].details.some((x) => x.text?.value === 'Maya')).toBe(true);
  });

  it('dividers keep their distance from the left and the front', () => {
    const d = pencil();
    const ids = dividersOn(d, d.trays[mainTray(d)!].baseId);
    const before = ids.map((id) => ({ ...posOf(d, id) }));
    setInsideSize(d, { w: 200, d: 80 });
    solve(d);
    ids.forEach((id, i) => {
      expect(posOf(d, id).x).toBeCloseTo(before[i].x, 3);
      expect(posOf(d, id).y).toBeCloseTo(before[i].y, 3);
    });
  });
});

describe('spaces and dividers', () => {
  it('a split goes through the middle of one space, ends on its sides, and adds one space', () => {
    for (const m of BUILT) {
      const d = pencil(m.id);
      const n = spaces(d).length;
      const k = spaces(d)[0];
      const others = dividersOn(d, k.baseId).map((id) => ({ id, at: { ...posOf(d, id) } }));
      const id = splitSpace(d, k, 'frontToBack')!;
      solve(d);
      expect(id, m.id).toBeTruthy();
      expect(spaces(d).length).toBe(n + 1);
      // the new divider stays within the space it split
      const p = d.panels[id];
      expect(p.divider!.at.x).toBeCloseTo((k.x0 + k.x1) / 2, 0);
      expect(p.w).toBeLessThanOrEqual(k.y1 - k.y0 + 2 * m.thickness + 1);
      for (const o of others) expect(posOf(d, o.id)).toEqual(o.at);
      expect(validate(d).filter(blocking).map((i) => i.key), m.id).toEqual([]);
    }
  });

  it('a split that would leave a half under 20 mm is refused', () => {
    const d = pencil();
    const k = spaces(d)[0]; // about 18 mm front to back
    expect(canSplit(d, k, 'sideToSide')).toBe(false);
    expect(splitSpace(d, k, 'sideToSide')).toBeNull();
    expect(canSplit(d, k, 'frontToBack')).toBe(true);
  });

  it('*Divider* with nothing selected splits the largest space across its longer side', () => {
    const d = box();
    const k = largestSpace(d)!;
    expect(splitDirFor(k)).toBe('frontToBack');
    splitSpace(d, k, splitDirFor(k));
    solve(d);
    expect(spaces(d).length).toBe(2);
  });

  it('moving or removing a divider leaves the others where they were', () => {
    const d = pencil();
    const [a, b] = dividersOn(d, d.trays[mainTray(d)!].baseId);
    const bAt = { ...posOf(d, b) };
    moveDivider(d, a, dividerRow(d, a)!.pos - 3);
    expect(posOf(d, b)).toEqual(bAt);
    removeDivider(d, a);
    solve(d);
    expect(d.panels[a]).toBeUndefined();
    expect(posOf(d, b)).toEqual(bAt);
    expect(spaces(d).length).toBe(2);
    // only a divider can be removed
    const walls = d.order.length;
    removeDivider(d, d.trays[mainTray(d)!].baseId);
    expect(d.order.length).toBe(walls);
  });
});

describe('the lid', () => {
  it('each choice is what the Lid section makes, its kind left automatic', () => {
    for (const m of BUILT)
      for (const choice of ['none', 'liftoff', 'hinged'] as const) {
        const a = box('box', m.id), b = clone(a);
        const ok = setLid(a, choice);
        setBoxLid(b, mainTray(b)!, choice);
        // new boards get new ids: compare what the lid is
        const sig = (x: Design) => ({ lid: boxLid(x, mainTray(x)!), boards: x.order.length, trays: Object.keys(x.trays).length });
        const strip = (o: ReturnType<typeof sig>) => ({ ...o, lid: { kind: o.lid.kind, style: (o.lid as { style?: string }).style } });
        expect(strip(sig(a)), `${m.id} ${choice}`).toEqual(strip(sig(b)));
        if (ok) expect(lidOf(a)).toBe(choice);
      }
  });

  it('a lid follows the box through a resize (a flat lid on plywood, a cap on card)', () => {
    for (const m of ['ply-3', 'card-0.5']) {
      const d = box('box-lid', m);
      const tr = mainTray(d)!;
      const before = boxLid(d, tr);
      setInsideSize(d, { w: 150, d: 100 });
      solve(d);
      const after = boxLid(d, tr);
      expect(after.kind).toBe('liftoff');
      expect(after.kind === 'liftoff' && before.kind === 'liftoff' && after.style).toBe(before.kind === 'liftoff' && before.style);
      expect(validate(d).filter(blocking).map((i) => i.key), m).toEqual([]);
    }
  });
});

describe('what Build can change', () => {
  it('a plain thing and a mission box are a box; the stand is a template; a box with a wall added is more', () => {
    for (const th of PLAIN) for (const m of BUILT) if (th.can(m)) expect(kindOf(th.start(m)), `${th.id} ${m.id}`).toBe('box');
    for (const id of ['pencil-box', 'dice-tray', 'game-organiser']) expect(kindOf(GUIDED_MISSIONS.find((x) => x.id === id)!.start(mat('ply-3'))), id).toBe('box');
    expect(kindOf(GUIDED_MISSIONS.find((x) => x.id === 'card-stand')!.start(mat('ply-3')))).toBe('template');
    const more = box();
    const fw = frontWall(more, mainTray(more)!)!;
    growPanel(more, fw, 2, { height: 30, angle: 90, dir: 'up', kind: 'finger' });
    expect(kindOf(more)).toBe('more');
    expect(kindOf(box('box-lid', 'card-0.5'))).toBe('box');
  });
});

describe("Guided's rule: nothing that cannot be cut", () => {
  it('an action bringing a new blocking problem is not made, leaves no undo step, and says why; a good one is kept', async () => {
    const { useStore } = await import('../src/store/store');
    const { guidedApply } = await import('../src/guided/apply');
    const d = box();
    useStore.getState().replaceDesign(d);
    // a box shrunk to nothing would be refused by the checks: shrink it under its smallest size
    const ok = guidedApply((x) => setInsideSize(x as Design, { w: 150 }));
    expect(ok).toBe(true);
    expect(useStore.getState().past.length).toBe(1);
    const before = useStore.getState().design;
    const bad = guidedApply((x) => {
      // a cut-out across the whole base cannot be cut
      const b = x.panels[x.trays[mainTray(x as Design)!].baseId];
      b.details.push({ id: 'cut-all', shape: 'rect', op: 'cut', cx: b.w / 2, cy: b.h / 2, w: b.w * 3, h: b.h * 3, rot: 0 } as never);
    });
    expect(bad).toBe(false);
    expect(useStore.getState().design).toBe(before);
    expect(useStore.getState().past.length).toBe(1);
    // milestone 142: the note names the problem the change would have made
    expect(useStore.getState().guidedNote?.key).toBe('g.refusedWhy');
    expect(useStore.getState().guidedNote?.why?.key).toMatch(/^val\./);
  });
});
