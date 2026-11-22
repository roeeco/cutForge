// Milestone 175 (BOXES_PLYWOOD_PLAN.md §4 E3, E4): a wrap that opens and a latch, and the *Flex-door box* (boxes.py's
// DoubleFlexDoorBox; FlexBox as its one-door variant). A wall of living hinge round two side plates, one strip of
// boards with a band at each rounded corner; its ends are doors joined to nothing but their bands, latched by a tab
// rising from each plate into a notch in the door's end. Plywood only; plywood too thick to bend is refused.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { recordOf } from '../src/templates/records';
import { censusBreaks } from '../src/templates/structures/boards';
import { flexLayout, TAB_PROUD } from '../src/templates/structures/boardFlex';
import { flexDoors } from '../src/model/stripTrim';
import { autoPose, posedDisplay, DOORS_OPEN } from '../src/views/pose';
import { panelRings } from '../src/model/outline';
import { toWorld } from '../src/model/frame';
import { frameMatrix } from '../src/views/three-geom';
import { makes, type Params } from '../src/templates/types';
import type { Design } from '../src/model/types';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const T = () => templateById('flexDoor')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const build = (m = P3, w: Params = {}) => generate(T(), m, { ...defaults(T()), ...w });
const KINDS: [string, string, number][] = [['two', 'flexDoor', 2], ['one', 'flexBox', 1]];

/** A board's outline points in the world. */
const world = (d: Design, id: string) => panelRings(d.panels[id])[0].map((e) => toWorld(d.panels[id].frame, e.a.x, e.a.y, 0));

describe('the flex-door box (milestone 175)', () => {
  it('builds clean on plywood 3 mm, is recognised as itself, and every board but the doors is held', () => {
    for (const [doors, v, n] of KINDS) {
      const d = build(P3, { doors });
      expect(problems(d), doors).toEqual([]);
      expect(censusBreaks(d), doors).toEqual([]);
      expect(recognise(d)?.v.id, doors).toBe(v);
      expect(recordOf(d), doors).toEqual({ body: 'ring', doors: n });
      // the doors hang on their bands alone (they open); every other board is joined by tabs in slots or a band
      const hang = new Set(flexDoors(d).map((c) => c.b.panelId));
      expect(hang.size, doors).toBe(n);
      for (const id of d.order) {
        const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
        if (hang.has(id)) expect(cs.map((c) => c.kind), id).toEqual(['fold']);
        else expect(cs.some((c) => c.kind === 'tabslot'), `${doors} ${id}`).toBe(true);
      }
      // one strip: the wall's boards chained by bands round the four corners
      expect(Object.values(d.connections).filter((c) => c.kind === 'fold' && c.radius! > 0)).toHaveLength(4);
    }
  }, 120_000);

  it('the latch: each plate’s tab stands in its door’s notch with the fit all round, a hair proud of the door', () => {
    for (const [doors] of KINDS) {
      const d = build(P3, { doors });
      const L = flexLayout(doors as never, 140, 70, 60, 25, 3, P3.clearance);
      if ('why' in L) throw new Error(L.why);
      for (const c of flexDoors(d)) {
        const door = d.panels[c.b.panelId];
        const notches = door.details.filter((x) => x.shape === 'rect' && x.op === 'cut');
        expect(notches, doors).toHaveLength(2);
        for (const plate of ['t:plate-1', 't:plate-2']) {
          // the plate's points inside the door's slab are its tab's, in the door's own coordinates
          const inv = new THREE.Matrix4().copy(frameMatrix(door.frame)).invert();
          const pts = world(d, plate).map((w) => new THREE.Vector3(...w).applyMatrix4(inv)).filter((q) => q.x > -1 && q.x < door.w + 1 && q.y > 0 && q.y < door.h + 1);
          const top = Math.min(...world(d, plate).map((w) => -w[1]));
          expect(-top, plate).toBeCloseTo(70 + TAB_PROUD, 6);
          const tab = pts.filter((q) => Math.abs(q.z) < 3 + TAB_PROUD + 0.01);
          expect(tab.length, `${doors} ${plate}`).toBeGreaterThan(0);
          const ys = tab.map((q) => q.y), xs = [...tab.map((q) => q.x)];
          const n = notches.find((x) => Math.abs(x.cx - (Math.min(...xs) + Math.max(...xs)) / 2) < 3)!;
          expect(n, `${doors} ${plate}`).toBeTruthy();
          // across: the plate's thickness in the notch's width, the fit each side
          expect(n.w - 3, `${doors} ${plate}`).toBeCloseTo(2 * L.fit, 6);
          // along: the tab inside the notch, the fit at its inner end
          expect(n.cy - n.h / 2, `${doors} ${plate}`).toBeLessThanOrEqual(Math.min(...ys) - L.fit + 1e-6);
          expect(n.cy + n.h / 2, `${doors} ${plate}`).toBeGreaterThan(door.h);
        }
      }
    }
  }, 60_000);

  it('its pictures show the doors swung open on their bands', () => {
    for (const [doors] of KINDS) {
      const d = build(P3, { doors });
      const pose = autoPose(d);
      expect(pose.doors, doors).toBe(DOORS_OPEN);
      const shown = posedDisplay(d, pose);
      for (const c of flexDoors(d)) {
        const b = shown.bands.find((x) => x.band.id === c.id)!;
        expect(b.k, doors).toBeCloseTo(1 - DOORS_OPEN / 90, 6);
        // the door moved up, away from the box
        const M = shown.xf.get(c.b.panelId)!;
        const P = d.panels[c.b.panelId];
        const end = new THREE.Vector3(...toWorld(P.frame, P.w / 2, P.h, 0)).applyMatrix4(M);
        expect(end.y, doors).toBeGreaterThan(70 + 10);
      }
    }
  });

  it('plywood only; too thick to bend is refused with a reason; the radius is limited', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) expect(makes(T(), m), m.id).toBe(false);
    expect(T().accepts!(P8, defaults(T()))).toBe('sen.why.flexThick');
    expect(T().accepts!(P3, defaults(T()))).toBeNull();
    const lim = T().limits!(P3, defaults(T())).radius;
    expect(lim.min).toBeGreaterThan(10);
    expect(lim.max).toBeLessThanOrEqual(30);
    expect(T().accepts!(P3, { ...defaults(T()), radius: lim.min! - 3 })).toBe('sen.why.rollRadius');
  }, 60_000);
});
