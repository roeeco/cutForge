// Milestone 176 (BOXES_PLYWOOD_PLAN.md §4 E5, §3.6): pin hinges. A box's lid on two hinges behind the back wall,
// knuckles on the box and on the lid in turn along the hinge line, a pin through them all; the lid turns about the
// line without touching anything until it lands on the stop at its open angle. The box's lid word *pins*, the
// hinged box's *Pin-hinge box* variant and the cards built on the hinge. Plywood only, beta.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { defaults, generate, templateById } from '../src/templates/registry';
import { profileById } from '../src/model/boards';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { recognise } from '../src/templates/catalogue';
import { styleById } from '../src/templates/styles';
import { makes, type ParamDef, type Params } from '../src/templates/types';
import { boxLid, lidParts } from '../src/easy/lid';
import { mainTray } from '../src/templates/structures/box';
import { panelContacts, TOUCH_EPS } from '../src/model/contact';
import { toLocal, toWorld } from '../src/model/frame';
import { holeAt, knucklesOf, lidFront, PIN_PLAY, pinAxis, pinFor, pinHole, turnAbout, turnedFrame } from '../src/model/pinHinge';
import { foldDisplay } from '../src/views/foldView';
import { applyLidPoses } from '../src/views/lidPose';
import { parseProject, serializeProject } from '../src/model/serialize';
import { censusBreaks } from '../src/templates/structures/boards';
import type { Design, P2, Panel, V3 } from '../src/model/types';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length === 0 || cs.every((c) => c.kind === 'slide');
  });
const words = (st: string): Params => ({ ...styleById(st)!.words, ...(styleById(st)!.sizes ?? {}) });
const build = (id: string, m = P3, w: Params = {}) => {
  const t = templateById(id)!;
  return generate(t, m, { ...defaults(t), ...w });
};
/** The pin-hinged lid of a design. */
const lidOf = (d: Design): Panel => d.order.map((id) => d.panels[id]).find((p) => p.pinLid)!;

export const CASES: [string, string, Params, string][] = [
  ['pin-hinge box', 'box', words('pinHinge'), 'pinHinge'],
  ['pin-hinge box, 4 mm pins, tall', 'box', { ...words('pinHinge'), pin: 4, height: 80 }, 'pinHinge'],
  ['pin-hinge box with spaces', 'box', { ...words('pinHinge'), spacesBy: 'count' }, 'pinHinge'],
];

/** A board's outline in another board's plane (local coordinates there), moved by `turn` first. */
function section(p: Panel, onto: Panel, turn?: (q: V3) => V3): [number, number][] {
  const s = p.sketch.kind === 'poly' ? p.sketch.pts : [];
  return s.map((q) => {
    const w = toWorld(p.frame, q.x, q.y, 0);
    const l = toLocal(onto.frame, turn ? turn(w) : w);
    return [l.x, l.y] as [number, number];
  });
}
/** A board's cross-section square to the hinge line (a lid or a wall lying along it), in a knuckle's plane: its four corners at its middle. */
function crossSection(p: Panel, along: 'u' | 'v', onto: Panel, t: number, turn?: (q: V3) => V3): [number, number][] {
  const pts: V3[] = along === 'u' ? [toWorld(p.frame, p.w / 2, 0, 0), toWorld(p.frame, p.w / 2, p.h, 0), toWorld(p.frame, p.w / 2, p.h, t), toWorld(p.frame, p.w / 2, 0, t)] : [];
  return pts.map((w) => {
    const l = toLocal(onto.frame, turn ? turn(w) : w);
    return [l.x, l.y] as [number, number];
  });
}
const area = (a: [number, number][], b: [number, number][]) => {
  const r = polygonClipping.intersection([a] as never, [b] as never);
  return r.reduce((s, poly) => s + poly.reduce((t, ring, i) => {
    let x = 0;
    for (let k = 0; k < ring.length; k++) x += ring[k][0] * ring[(k + 1) % ring.length][1] - ring[(k + 1) % ring.length][0] * ring[k][1];
    return t + (i ? -1 : 1) * Math.abs(x / 2);
  }, 0), 0);
};

describe('pin hinges (milestone 176, E5)', () => {
  it('each builds clean on plywood 3 and 8 mm, is recognised as itself, and no board only rests', () => {
    for (const m of [P3, P8])
      for (const [name, id, w, v] of CASES) {
        const d = build(id, m, w);
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(v);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
        expect(censusBreaks(d), `${name} ${m.id}`).toEqual([]);
        const l = boxLid(d, mainTray(d)!);
        expect(l.kind === 'hinged' && l.pins, name).toBe(true);
      }
  }, 240_000);

  it('the knuckles interleave along the pin, a play apart; every pin hole is on the hinge line and the pin’s size and play', () => {
    for (const m of [P3, P8]) {
      const d = build('box', m, words('pinHinge'));
      const L = lidOf(d);
      const ax = pinAxis(d, L.id)!;
      const ks = knucklesOf(d, L.id);
      expect(ks.length).toBe(6);
      const t = m.thickness;
      // along the line: wall, lid, wall in each hinge, each a board thick, `play` between
      const at = ks.map((K) => {
        const o = toWorld(K.frame, 0, 0, 0), o2 = toWorld(K.frame, 0, 0, t);
        const s = (p: V3) => (p[0] - ax.o[0]) * ax.dir[0] + (p[1] - ax.o[1]) * ax.dir[1] + (p[2] - ax.o[2]) * ax.dir[2];
        return { on: K.knuckle!.on, a: Math.min(s(o), s(o2)), b: Math.max(s(o), s(o2)) };
      }).sort((x, y) => x.a - y.a);
      expect(at.map((x) => x.on)).toEqual(['wall', 'lid', 'wall', 'wall', 'lid', 'wall']);
      for (const [i, j] of [[0, 1], [1, 2], [3, 4], [4, 5]]) expect(at[j].a - at[i].b).toBeCloseTo(L.pinLid!.play, 6);
      for (const K of ks) {
        const c = holeAt(K)!;
        const v = [c[0] - ax.o[0], c[1] - ax.o[1], c[2] - ax.o[2]];
        const along = v[0] * ax.dir[0] + v[1] * ax.dir[1] + v[2] * ax.dir[2];
        expect(Math.hypot(v[0] - along * ax.dir[0], v[1] - along * ax.dir[1], v[2] - along * ax.dir[2])).toBeLessThan(1e-6);
        const h = pinHole(K)!;
        expect(h.w).toBeCloseTo(pinFor(t) + PIN_PLAY, 9);
      }
      // the interleaved knuckles touch nothing they are not joined to: no contact between a knuckle of the lid and one of the box
      const lidK = new Set(knucklesOf(d, L.id, 'lid').map((p) => p.id)), wallK = new Set(knucklesOf(d, L.id, 'wall').map((p) => p.id));
      expect(panelContacts(d, true).filter((c) => (lidK.has(c.a) && wallK.has(c.b)) || (lidK.has(c.b) && wallK.has(c.a)))).toEqual([]);
    }
  });

  it('the lid turns about the hinge line to its open angle touching nothing, and the stop holds it there', () => {
    for (const m of [P3, P8])
      for (const [name, id, w] of CASES) {
        const d = build(id, m, w);
        const L = lidOf(d), t = m.thickness;
        const ax = pinAxis(d, L.id)!;
        const box = d.trays[mainTray(d)!];
        const back = d.panels[Object.values(d.connections).find((c) => c.trayId === box.id && c.grown && c.a.edge === 'e2')!.b.panelId];
        const lidKs = knucklesOf(d, L.id, 'lid'), wallKs = knucklesOf(d, L.id, 'wall');
        const H = toWorld(back.frame, 0, back.h)[1];
        for (let deg = 0; deg <= ax.open + 4; deg += 1) {
          const turn = turnAbout(ax, lidFront(L), deg);
          // the lid's section against each of the box's knuckles: clear until the open angle, blocked past it
          const a = Math.max(...wallKs.map((K) => area(crossSection(L, 'u', K, t, turn), section(K, K))));
          if (deg <= ax.open - 0.5) expect(a, `${name} ${m.id} ${deg}°`).toBeLessThan(1e-6);
          if (deg >= ax.open + 2) expect(a, `${name} ${m.id} ${deg}°`).toBeGreaterThan(1e-3);
          if (deg > ax.open) continue;
          // the lid's knuckles against the back wall's section
          for (const K of lidKs) expect(area(section(K, K, turn), crossSection(back, 'u', K, t)), `${name} ${m.id} ${deg}° ${K.id}`).toBeLessThan(1e-6);
          // the lid never sinks below the walls' tops (it only rises)
          for (const [x, y] of [[0, 0], [L.w, 0], [0, L.h], [L.w, L.h]]) expect(turn(toWorld(L.frame, x, y, 0))[1], `${name} ${deg}°`).toBeGreaterThan(H - 1e-6);
        }
        // and the engine's own check of the posed boards at a few angles: nothing runs into anything
        for (const deg of [30, 60, 90, ax.open - 1]) {
          const turn = turnAbout(ax, lidFront(L), deg);
          const e = structuredClone(d) as Design;
          for (const id of [L.id, ...lidKs.map((p) => p.id)]) e.panels[id].frame = turnedFrame(e.panels[id].frame, turn);
          const moving = new Set([L.id, ...lidKs.map((p) => p.id)]);
          const hits = panelContacts(e, true).filter((c) => moving.has(c.a) !== moving.has(c.b) && c.depth > TOUCH_EPS);
          expect(hits, `${name} ${m.id} ${deg}°`).toEqual([]);
        }
      }
  }, 240_000);

  it('on the stage the lid stands open on its stop, its knuckles with it; picked or closed it is shut; in pictures it is ajar', () => {
    const d = build('box', P3, words('pinHinge'));
    const L = lidOf(d), tray = mainTray(d)!;
    const ax = pinAxis(d, L.id)!;
    const r = foldDisplay(d, 1);
    const away = applyLidPoses(d, r, { shut: {}, selected: [], foldT: 1, assembling: false });
    const turn = turnAbout(ax, lidFront(L), ax.open);
    for (const K of [L, ...knucklesOf(d, L.id, 'lid')]) {
      expect(away.has(K.id)).toBe(true);
      const p = toWorld(K.frame, 3, 2, 0);
      const shown = new THREE.Vector3(...p).applyMatrix4(r.xf.get(K.id) ?? new THREE.Matrix4());
      shown.toArray().forEach((x, i) => expect(x).toBeCloseTo(turn(p)[i], 6));
    }
    for (const K of knucklesOf(d, L.id, 'wall')) expect(away.has(K.id)).toBe(false);
    expect(applyLidPoses(d, foldDisplay(d, 1), { shut: { [tray]: true }, selected: [], foldT: 1, assembling: false }).size).toBe(0);
    expect(applyLidPoses(d, foldDisplay(d, 1), { shut: {}, selected: [L.id], foldT: 1, assembling: false }).size).toBe(0);
    // the pictures open it about halfway (as a folded lid)
    const q = foldDisplay(d, 1);
    applyLidPoses(d, q, { shut: {}, selected: [], foldT: 1, assembling: false, openPast: -35 });
    const p = lidFront(L), half = turnAbout(ax, p, 55)(p);
    new THREE.Vector3(...p).applyMatrix4(q.xf.get(L.id)!).toArray().forEach((x, i) => expect(x).toBeCloseTo(half[i], 6));
    // the lid's parts are the lid and every knuckle
    expect(new Set(lidParts(d, boxLid(d, tray)))).toEqual(new Set([L.id, ...knucklesOf(d, L.id).map((k) => k.id)]));
  });

  it('a pin-hinged lid survives saving; a bad record is dropped on loading', () => {
    const d = build('box', P3, words('pinHinge'));
    const back = parseProject(serializeProject(d));
    const L = lidOf(d);
    expect(back.panels[L.id].pinLid).toEqual(L.pinLid);
    expect(knucklesOf(back, L.id).length).toBe(6);
    const raw = JSON.parse(serializeProject(d));
    const doc = raw.design ?? raw;
    doc.panels[L.id].pinLid = { tray: 3 };
    doc.panels[knucklesOf(d, L.id)[0].id].knuckle = { on: 'x' };
    const bad = parseProject(JSON.stringify(raw));
    expect(bad.panels[L.id].pinLid).toBeUndefined();
    expect(bad.panels[knucklesOf(d, L.id)[0].id].knuckle).toBeUndefined();
  });

  it('the word is plywood only, on a square box with room for two hinges; the living hinge is unchanged', () => {
    const box = templateById('box')!;
    const lid = box.params.find((x) => x.key === 'lid') as ParamDef;
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) {
      expect(lid.allowed!('pins', defaults(box), m), m.id).toBe(false);
      expect(lid.why!('pins', defaults(box), m), m.id).toBe('sen.why.plyOnly');
    }
    expect(lid.allowed!('pins', defaults(box), P3)).toBe(true);
    expect(lid.allowed!('pins', { ...defaults(box), shape: 'poly' }, P3)).toBe(false);
    expect(lid.why!('pins', { ...defaults(box), shape: 'poly' }, P3)).toBe('sen.why.pinShape');
    expect(lid.allowed!('pins', { ...defaults(box), width: 40 }, P3)).toBe(false);
    expect(lid.why!('pins', { ...defaults(box), width: 40 }, P3)).toBe('sen.why.pinRoom');
    // a hinged lid on plywood is still the living hinge, and is not a pin-hinge box
    const h = build('box', P3, words('hingedTray'));
    const l = boxLid(h, mainTray(h)!);
    expect(l.kind === 'hinged' && l.living && !l.pins).toBe(true);
    expect(recognise(h)?.v.id).toBe('hingedTray');
    expect(makes(box, P8)).toBe(true);
  }, 60_000);
});
