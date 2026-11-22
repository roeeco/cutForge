// Milestone 184 (BOXES_PLYWOOD_PLAN.md E9 and §3.8): bigger than 600 × 400, and enclosures. The size limits read the
// board's own sheet, so on the largest sheet (787 × 488) the ones the sheet bounds open up, under the sentence's own
// 300 mm; the challenges larger than 600 × 400 start on 787 × 488 and lie on one sheet there; a board larger than its
// sheet is cut into pieces that fit, joined by puzzle keys, when the student asks; the box has a top screwed on corner
// blocks, a rack's front panel and Eurorack rails, and five challenges are built on them.
import { describe, expect, it } from 'vitest';
import type { Design, MaterialProfile } from '../src/model/types';
import { PLY_SHEETS, profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { defaults, generate, regenerate, templateById } from '../src/templates/registry';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { optionsNow } from '../src/sentence/resolve';
import { sheetUse } from '../src/easy/sheet';
import { MISSIONS, missionById, startMission } from '../src/easy/missions';
import { addDetail, addRootPanel, createDesign, setMaterial, solve } from '../src/model/ops';
import { pieceCopies } from '../src/model/pack';
import { canKeySplit, keySplit } from '../src/easy/fix';
import { checkDesign } from '../src/model/check';
import { mainTray } from '../src/templates/structures/box';
import { boxLid } from '../src/easy/lid';
import { dropinOnFrame, flatLidsOf } from '../src/model/lid';
import { toWorld } from '../src/model/frame';
import { EURO, RACKS, RACK_U, RACK_SHORT, rackFits } from '../src/templates/structures/enclosure';
import { flattenContour, polygonArea } from '../src/geom/vec';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
/** A plywood profile on the largest sheet, as the drawer's one click (or a challenge that needs it) makes it. */
const big = (m: MaterialProfile): MaterialProfile => ({ ...m, id: `${m.id}-custom`, sheetW: 787, sheetH: 488 });
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => `${x.key} ${JSON.stringify(x.vars)}`);
/** Boards held only by a stop (`slide`): every board should be held by tabs in slots, fingers or glue face to face. */
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length > 0 && cs.every((c) => c.kind === 'slide');
  });
const joinsOf = (d: Design, id: string) => Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
const box = templateById('box')!;
const build = (m: MaterialProfile, p: Record<string, string | number>) => generate(box, m, { ...defaults(box), ...p });

const SCREWED = { width: 120, depth: 80, height: 45, sizeAs: 'inside', lid: 'screwed' };
const RACK19 = { width: 448, depth: 100, height: 88.11, sizeAs: 'outside', lid: 'screwed', rack: '19' };
const RACK10 = { width: 219, depth: 120, height: 88.11, sizeAs: 'outside', lid: 'screwed', rack: '10' };
const EUROCASE = { width: 84 * 5.08, depth: 130.5, height: 60, sizeAs: 'inside', rack: 'euro' };

describe('E9: bigger than 600 × 400', () => {
  it('the limits the sheet bounds open up on 787 × 488, refused with the sheet reason; the sentence’s 300 mm stays', () => {
    const small = P3, large = big(P3);
    const cases: [string, string][] = [['box', 'width'], ['box', 'height'], ['frame', 'height'], ['flexDoor', 'width'], ['uBox', 'height'], ['wallRack', 'spacing']];
    for (const [id, key] of cases) {
      const t = templateById(id)!;
      const a = t.limits!(small, defaults(t))[key], b = t.limits!(large, defaults(t))[key];
      expect(a.why, `${id}.${key}`).toBe('sen.why.sheet');
      expect(b.max!, `${id}.${key}`).toBeGreaterThan(a.max! + 5);
    }
    // where the sentence's own range ends first (the owner's 300 mm), the sheet changes nothing
    const shelf = templateById('shelf')!;
    expect(shelf.limits!(large, defaults(shelf)).width.max).toBe(shelf.limits!(small, defaults(shelf)).width.max);
  }, 120_000);

  it('the 19-inch rack box and the Eurorack case are wider than 600 × 400 lets a box be, and not 787 × 488', () => {
    for (const [p, w] of [[RACK19, 448], [EUROCASE, 84 * 5.08]] as const) {
      const words = { ...defaults(box), ...p };
      const a = box.limits!(P3, words).width, b = box.limits!(big(P3), words).width;
      expect(a.max!).toBeLessThan(w);
      expect(a.why).toBe('sen.why.sheet');
      expect(b.max!).toBeGreaterThanOrEqual(w);
    }
  }, 120_000);

  it('the rack box starts on 787 × 488 and lies on one sheet there, on two of 600 × 400; the Eurorack case lies on one of 600 × 400', () => {
    expect(missionById('euro-skiff')!.sheet).toBeUndefined();
    expect(sheetUse(startMission(missionById('euro-skiff')!, P3)).sheets).toBe(1);
    for (const id of ['rack-box']) {
      const m = missionById(id)!;
      expect(m.sheet).toEqual({ w: 787, h: 488 });
      const d = startMission(m, P3);
      expect([d.material.sheetW, d.material.sheetH]).toEqual([787, 488]);
      expect(sheetUse(d).sheets, id).toBe(1);
      const small = generate(box, P3, { ...defaults(box), ...m.template!.params });
      expect(sheetUse(small).sheets, id).toBeGreaterThan(1);
    }
    // a material already on the large sheet keeps its own profile
    const already = startMission(missionById('rack-box')!, big(P3));
    expect(already.material.id).toBe('ply-3-custom');
  }, 120_000);

  it('the drawer’s sheets are the owner’s two', () => {
    expect(PLY_SHEETS.map((s) => [s.w, s.h])).toEqual([[600, 400], [787, 488]]);
  });
});

describe('E9: a board larger than its sheet, split with puzzle keys', () => {
  const longBoard = () => {
    const d = createDesign();
    setMaterial(d, P3);
    const b = addRootPanel(d, 0, 0, 900, 200);
    addDetail(d, b, 'circle', 'cut', 450, 100, 30, 30);
    solve(d);
    return { d, b };
  };
  it('is offered beside Fix, cuts it into pieces that fit clear of its hole, and says so in a note', () => {
    const { d, b } = longBoard();
    const issue = validate(d).find((x) => x.key === 'val.tooBig')!;
    expect(issue.target.id).toBe(b);
    expect(canKeySplit(d, issue)).toBe(true);
    // nothing is changed by asking
    expect(d.panels[b].keyed).toBeUndefined();
    expect(keySplit(d, issue)).toBe(true);
    expect(d.panels[b].keyed).toBe(true);
    expect(problems(d)).toEqual([]);
    expect(validate(d).find((x) => x.key === 'val.keyed')?.vars).toEqual({ panel: d.panels[b].name, n: 2 });
    const copies = pieceCopies(d);
    expect(copies).toHaveLength(2);
    const W = P3.sheetW - 2 * d.sheetMargin, H = P3.sheetH - 2 * d.sheetMargin;
    for (const c of copies) expect(c.w <= W && c.h <= H, `${c.w} × ${c.h}`).toBe(true);
    // the hole is cut whole in one piece, and the pieces are the board less the keys' clearance
    const holes = copies.flatMap((c) => c.contours.filter((x) => x.role === 'hole'));
    expect(holes).toHaveLength(1);
    const area = copies.reduce((s, c) => s + Math.abs(polygonArea(flattenContour(c.contours.find((x) => x.role === 'outer')!.contour, 0.05))), 0);
    expect(area).toBeLessThan(900 * 200);
    expect(area).toBeGreaterThan(900 * 200 - 60);
    // each piece's outline has the key or its socket: more points than a rectangle
    for (const c of copies) expect(flattenContour(c.contours.find((x) => x.role === 'outer')!.contour, 0.05).length).toBeGreaterThan(4);
  });

  it('a box too wide for the sheet: its base and long walls split, every piece fits, the box is unchanged', () => {
    const d = build(P3, { width: 700, depth: 150, height: 60, sizeAs: 'outside' });
    const before = JSON.stringify(Object.values(d.panels).map((p) => [p.id, p.w, p.h]));
    for (let k = 0; k < 5; k++) {
      const i = validate(d).find((x) => x.key === 'val.tooBig');
      if (!i) break;
      expect(keySplit(d, i)).toBe(true);
    }
    expect(problems(d)).toEqual([]);
    expect(pieceCopies(d)).toHaveLength(8);
    expect(JSON.stringify(Object.values(d.panels).map((p) => [p.id, p.w, p.h]))).toBe(before);
    // and the ask is kept when the words change
    const r = regenerate(d, { ...d.template!.params, height: 70 }).design;
    expect(r.order.filter((id) => r.panels[id].keyed).sort()).toEqual(['t:base', 't:wall-e0', 't:wall-e2']);
    expect(problems(r)).toEqual([]);
  }, 60_000);

  it('a board that fits, or card, is not offered; a file with a bad mark loads without it', () => {
    const { d, b } = longBoard();
    setMaterial(d, MATERIALS.find((m) => m.kind === 'card')!);
    solve(d);
    const i = validate(d).find((x) => x.key === 'val.tooBig');
    if (i) expect(canKeySplit(d, i)).toBe(false);
    const raw = JSON.parse(JSON.stringify(d));
    raw.panels[b].keyed = 'yes';
    raw.panels[b].fitting = 'shelf';
    checkDesign(raw);
    expect(raw.panels[b].keyed).toBeUndefined();
    expect(raw.panels[b].fitting).toBeUndefined();
  });
});

describe('enclosures (§3.8)', () => {
  const CASES: [string, Record<string, string | number>, string, boolean][] = [
    ['screwed top', SCREWED, 'trayLid', false],
    ['screwed top with spaces', { ...SCREWED, width: 160, depth: 110, spacesBy: 'count', nx: 3, ny: 2 }, 'trayLid', false],
    ['19-inch rack box', RACK19, 'trayLid', true],
    ['10-inch rack box', RACK10, 'trayLid', true],
    ['Eurorack case', EUROCASE, 'box', true],
  ];
  it('each builds clean on plywood 3 and 8 mm, is recognised as its box, and every fitting is held', () => {
    for (const m0 of [P3, P8])
      for (const [name, p, v, large] of CASES) {
        const m = large ? big(m0) : m0;
        const d = build(m, p);
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(v);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
        const fittings = d.order.filter((id) => d.panels[id].fitting);
        expect(fittings.length, `${name} ${m.id}`).toBeGreaterThan(0);
        for (const id of fittings) {
          const kinds = joinsOf(d, id).map((c) => c.kind);
          expect(kinds.length, `${name} ${id}`).toBeGreaterThan(0);
          expect(kinds.every((k) => k === 'tabslot' || k === 'laminate' || k === 'butt'), `${name} ${id} ${kinds}`).toBe(true);
          expect(joinsOf(d, id).some((c) => c.broken), `${name} ${id}`).toBe(false);
        }
        // each word is offered for its own words
        for (const key of ['lid', 'rack'] as const) {
          const def = box.params.find((x) => x.key === key)!;
          if (p[key]) expect(optionsNow(def, { ...defaults(box), ...p }, m), `${name} ${key} ${m.id}`).toContain(p[key]);
        }
      }
  }, 300_000);

  it('a screwed top rests on four blocks flush with the walls, a clearance hole over each block’s pilot hole', () => {
    for (const m of [P3, P8]) {
      const d = build(m, SCREWED);
      const tr = mainTray(d)!;
      const lid = boxLid(d, tr);
      expect(lid.kind === 'liftoff' && lid.style).toBe('dropin');
      const top = flatLidsOf(d, tr)[0];
      const t = m.thickness;
      // every block's upper layer in two walls' slots; on 3 mm a second layer glued under it
      const blocks = d.order.filter((id) => d.panels[id].fitting === 'block');
      expect(blocks).toHaveLength(m.thickness < 5 ? 8 : 4);
      const slotted = blocks.filter((id) => joinsOf(d, id).filter((c) => c.kind === 'tabslot').length === 2);
      expect(slotted).toHaveLength(4);
      const walls = d.order.filter((id) => /^t:wall-/.test(id)).map((id) => d.panels[id]);
      const wallTop = Math.max(...walls.map((w) => w.frame.o[1] + w.h));
      const on = dropinOnFrame(d, top, d.trays[tr])!;
      expect(on.o[1] + t).toBeCloseTo(wallTop, 6);
      for (const id of slotted) expect(d.panels[id].frame.o[1] + t).toBeCloseTo(wallTop - t, 6);
      // no finger hole; four 3 mm holes, each straight over a block's 2 mm pilot hole
      const holes = top.details.filter((x) => x.op === 'cut');
      expect(holes.map((x) => x.w)).toEqual([3, 3, 3, 3]);
      const pilots = slotted.map((id) => {
        const P = d.panels[id];
        const h = P.details.find((x) => x.w === 2)!;
        return toWorld(P.frame, h.cx, h.cy, 0);
      });
      for (const h of holes) {
        const w = toWorld(on, h.cx, h.cy, 0);
        expect(pilots.some((q) => Math.hypot(q[0] - w[0], q[2] - w[2]) < 1e-6), `${m.id}`).toBe(true);
      }
    }
  }, 60_000);

  it('a rack’s front panel: the rack’s width, whole units tall, ear holes on the rack’s lines, glued on the front', () => {
    for (const [p, kind] of [[RACK19, '19'], [RACK10, '10']] as const) {
      const d = build(big(P3), p);
      const f = d.order.find((id) => d.panels[id].fitting === 'front')!;
      const F = d.panels[f];
      expect(F.w).toBeCloseTo(RACKS[kind].panel, 6);
      expect(F.h).toBeCloseTo(2 * RACK_U - RACK_SHORT, 6);
      const xs = [...new Set(F.details.map((x) => Math.round(x.cx * 100) / 100))].sort((a, b) => a - b);
      expect(xs[1] - xs[0]).toBeCloseTo(RACKS[kind].holes, 6);
      expect(F.details).toHaveLength(4);
      expect(joinsOf(d, f).some((c) => c.kind === 'laminate' && (c.a.panelId === 't:wall-e0' || c.b.panelId === 't:wall-e0'))).toBe(true);
    }
    expect(rackFits('19', { w: 448, h: 88 })).toBe(true);
    expect(rackFits('19', { w: 452, h: 88 })).toBe(false);
    expect(rackFits('19', { w: 448, h: 40 })).toBe(false);
    // refused without a top screwed or fixed on, and off plywood
    const def = box.params.find((x) => x.key === 'rack')!;
    expect(optionsNow(def, { ...defaults(box), ...RACK19, lid: 'liftoff' }, big(P3))).not.toContain('19');
    expect(def.why!('19', { ...defaults(box), ...RACK19, lid: 'liftoff' }, big(P3))).toBe('sen.why.rackLid');
    expect(def.why!('19', { ...defaults(box), ...RACK19 }, MATERIALS.find((m) => m.kind === 'card')!)).toBe('sen.why.plyOnly');
  }, 120_000);

  it('Eurorack rails: a hole every HP on two lines 122.5 mm apart', () => {
    const d = build(big(P3), EUROCASE);
    const rails = d.order.filter((id) => d.panels[id].fitting === 'rail');
    expect(rails).toHaveLength(2);
    const pts = rails.map((id) => d.panels[id].details.map((x) => toWorld(d.panels[id].frame, x.cx, x.cy, 0)));
    for (const row of pts) {
      expect(row.length).toBeGreaterThanOrEqual(82);
      const xs = row.map((q) => q[0]).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(EURO.hp, 6);
    }
    expect(Math.abs(pts[0][0][2] - pts[1][0][2])).toBeCloseTo(EURO.lines, 6);
    const def = box.params.find((x) => x.key === 'rack')!;
    expect(def.why!('euro', { ...defaults(box), ...EUROCASE, depth: 100 }, big(P3))).toBe('sen.why.euroDepth');
  }, 60_000);

  it('designs saved before 184 build as they did (no word, no fitting)', () => {
    const d = build(P3, { width: 160, depth: 110, height: 45, lid: 'liftoff' });
    expect(d.order.some((id) => d.panels[id].fitting || d.panels[id].keyed)).toBe(false);
  });
});

describe('enclosure challenges', () => {
  it('five, plywood only, in Quick build and Workshop (the clock’s digits are a Workshop part)', () => {
    const ids = ['electronics-box', 'rack-box', 'euro-skiff', 'led-matrix', 'segment-clock'];
    expect(MISSIONS.slice(-5).map((m) => m.id)).toEqual(ids);
    for (const id of ids) {
      const m = missionById(id)!;
      expect(m.materials).toEqual(['plywood']);
      expect(m.levels).toEqual(id === 'segment-clock' ? ['workshop'] : ['quick', 'workshop']);
    }
  });
  it('each starts clean on plywood 3 and 8 mm', () => {
    for (const mat of [P3, P8])
      for (const m of MISSIONS.slice(-5)) {
        const d = startMission(m, mat);
        expect(problems(d), `${m.id} ${mat.id}`).toEqual([]);
      }
  }, 300_000);
});
