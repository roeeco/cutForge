// Milestone 174 (BOXES_PLYWOOD_PLAN.md §4 E2): the tambour door, and the *Roll-top box* (boxes.py's ShutterBox, over
// one or two rounded corners, and BreadBox). The door is a strip of boards joined by living-hinge bands, built on a
// path through its groove: shut, half open and open it stays in the groove, its straight boards slit as its bands are,
// and open its handle stands over the opening's edge. Plywood only; plywood too thick to bend is refused with a reason.
import { describe, expect, it } from 'vitest';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { censusBreaks } from '../src/templates/structures/boards';
import { allBands, bandPose, bandWorld } from '../src/model/bands';
import { panelRings } from '../src/model/outline';
import { toWorld } from '../src/model/frame';
import { pointInPolygon } from '../src/geom/vec';
import { makes, type Params } from '../src/templates/types';
import { isStripBand } from '../src/model/stripTrim';
import { rollLayout } from '../src/templates/structures/boardFlex';
import type { Design, P2 } from '../src/model/types';

const P3 = profileById('ply-3')!, P4 = profileById('ply-4')!, P8 = profileById('ply-8')!;
const T = () => templateById('rollTop')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const build = (m = P3, w: Params = {}) => generate(T(), m, { ...defaults(T()), ...w });
const ROLLS: [string, string][] = [['one', 'rollTop'], ['two', 'rollTopTwo'], ['bread', 'breadBox']];

/** The door: its boards and its handle (the strip joined to nothing but the handle). */
const doorOf = (d: Design) => d.order.filter((id) => /^t:(door-|handle)/.test(id));
/** Boards held by nothing but stops (`slide`), or by nothing at all, leaving out the door: it is loose, it slides. */
function loose(d: Design): string[] {
  const door = new Set(doorOf(d));
  return d.order.filter((id) => {
    if (door.has(id)) return false;
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return !cs.length || cs.every((c) => c.kind === 'slide');
  });
}

/** A world point in the side walls' plane: s from the back, y up. */
const sy = (d: Design, w: [number, number, number]): P2 => ({ x: w[2] + Number(d.template!.params.depth) / 2, y: w[1] });
/** A board's outline in the side walls' plane. */
const outlineSY = (d: Design, id: string): P2[] => panelRings(d.panels[id])[0].map((e) => sy(d, toWorld(d.panels[id].frame, e.a.x, e.a.y, 0)));

/** The door's bands, every face point of each in the side walls' plane. */
function doorArcs(d: Design): P2[] {
  const door = new Set(doorOf(d));
  const out: P2[] = [];
  for (const b of allBands(d)) {
    if (!door.has(b.parent)) continue;
    const p = bandPose(b, 1, 24);
    for (const q of [...p.outer, ...p.inner]) out.push(sy(d, bandWorld(b, q, 0)));
  }
  return out;
}

describe('the roll-top box (milestone 174)', () => {
  it('each kind builds clean on plywood 3 mm at its defaults, is recognised as itself, and no board but the door is loose', () => {
    for (const [roll, v] of ROLLS) {
      const d = build(P3, { roll });
      expect(problems(d), roll).toEqual([]);
      expect(censusBreaks(d), roll).toEqual([]);
      expect(recognise(d)?.v.id, roll).toBe(v);
      expect(loose(d), roll).toEqual([]);
      // the door is a strip of boards on living-hinge bands with a handle tabbed on, and nothing else holds it
      const door = new Set(doorOf(d));
      const out = Object.values(d.connections).filter((c) => door.has(c.a.panelId) !== door.has(c.b.panelId));
      expect(out, roll).toEqual([]);
      expect(Object.values(d.connections).filter((c) => door.has(c.a.panelId) && c.kind === 'fold').every((c) => isStripBand(d, c)), roll).toBe(true);
    }
  }, 120_000);

  it('shut, half open and open the door stays in its groove, and the box is clean', () => {
    for (const [roll] of ROLLS)
      for (const doorAt of ['shut', 'half', 'open']) {
        const d = build(P3, { roll, doorAt });
        expect(problems(d), `${roll} ${doorAt}`).toEqual([]);
        // every point of its bends clear of the guides glued on the side walls (and of the walls' corners' fillers)
        const guides = d.order.filter((id) => /^t:guide-/.test(id)).map((id) => outlineSY(d, id));
        const arcs = doorArcs(d);
        expect(arcs.length, `${roll} ${doorAt}`).toBeGreaterThan(0);
        for (const q of arcs) for (const g of guides) expect(pointInPolygon(q, g), `${roll} ${doorAt} (${q.x.toFixed(1)}, ${q.y.toFixed(1)})`).toBe(false);
        // and inside the side wall's outline
        const side = outlineSY(d, 't:wall-e3');
        for (const q of arcs) expect(pointInPolygon(q, side), `${roll} ${doorAt}`).toBe(true);
      }
  }, 120_000);

  it('the door is the same strip in every pose: as long, as many bands as it has corners on, slit at its bands’ spacing', () => {
    for (const [roll] of ROLLS) {
      const L = rollLayout(roll as never, 100, 150, 100, 30, 3, P3.clearance);
      if ('why' in L) throw new Error(L.why);
      for (const doorAt of ['shut', 'half', 'open']) {
        const d = build(P3, { roll, doorAt });
        const bands = allBands(d).filter((b) => /^t:door-/.test(b.parent));
        expect(bands.length, `${roll} ${doorAt}`).toBeGreaterThan(0);
        // its slits: on the straight boards, at most its bands' spacing apart (denser only where a column is added to keep them alternating)
        const sp = Math.min(...bands.map((b) => b.pattern.spacing));
        expect(bands.every((b) => b.pattern.id === 'slits' && !b.pattern.why), `${roll} ${doorAt}`).toBe(true);
        for (const id of d.order.filter((x) => /^t:door-/.test(x))) {
          const ys = [...new Set((d.panels[id].lines ?? []).filter((l) => l.type === 'cut').map((l) => Math.round(l.pts[0].y * 1000) / 1000))].sort((a, b) => a - b);
          for (let i = 1; i < ys.length; i++) {
            expect(ys[i] - ys[i - 1], `${roll} ${doorAt} ${id}`).toBeLessThanOrEqual(sp + 1e-6);
            expect(ys[i] - ys[i - 1], `${roll} ${doorAt} ${id}`).toBeGreaterThan(0.6 * sp);
          }
        }
      }
    }
  }, 120_000);

  it('open, the handle stands just over the opening’s edge (it is the door’s stop)', () => {
    for (const [roll] of ROLLS) {
      const d = build(P3, { roll, doorAt: 'open' });
      const h = d.panels['t:handle'];
      const pts = panelRings(h)[0].map((e) => sy(d, toWorld(h.frame, e.a.x, e.a.y, 0)));
      const L = rollLayout(roll as never, 100, 150, 100, 30, 3, P3.clearance);
      if ('why' in L) throw new Error(L.why);
      if (roll === 'bread') {
        // in front of the fixed top's front edge
        expect(Math.min(...pts.map((q) => q.x)), roll).toBeGreaterThan(L.stop);
        expect(Math.min(...pts.map((q) => q.x)), roll).toBeLessThan(L.stop + 3 * 3 + 4);
      } else {
        // over the front wall's top
        expect(Math.min(...pts.map((q) => q.y)), roll).toBeGreaterThan(L.stop);
        expect(Math.min(...pts.map((q) => q.y)), roll).toBeLessThan(L.stop + 3 * 3 + 4);
      }
    }
  }, 60_000);

  it('plywood only; plywood too thick to bend is refused with a reason, and 4 mm asks for a rounder corner', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) expect(makes(T(), m), m.id).toBe(false);
    expect(T().accepts!(P8, defaults(T())), 'ply-8').toBe('sen.why.flexThick');
    expect(T().accepts!(P4, defaults(T())), 'ply-4').toBe('sen.why.rollRadius');
    const big: Params = { ...defaults(T()), height: 160, radius: 50 };
    expect(T().accepts!(P4, big), 'ply-4, taller and rounder').toBeNull();
    expect(problems(build(P4, big)), 'ply-4').toEqual([]);
  }, 120_000);

  it('the radius is limited to what the plywood bends and the box holds', () => {
    const lim = T().limits!(P3, defaults(T())).radius;
    expect(lim.min).toBeGreaterThanOrEqual(22);
    expect(lim.max).toBeLessThanOrEqual(35);
    expect(T().accepts!(P3, { ...defaults(T()), radius: lim.max! + 5 })).not.toBeNull();
  }, 60_000);
});
