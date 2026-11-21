// Milestone 173 (BOXES_PLYWOOD_PLAN.md §4 E1, §2.1): the face-glued joint (`laminate`), and the box's lid and base
// words that need it or came with it: a plug lid (UniversalBox's *flat*), a brim lid (*flatbrim*), a handle on the lid
// and a base that overhangs the walls (BasedBox). Plywood only; each builds clean on plywood 3 and 8 mm.
import { describe, expect, it } from 'vitest';
import { profileById } from '../src/model/boards';
import { addFreePanel, autoConnect, createDesign, deleteConnection, solve } from '../src/model/ops';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { findOpenSeams } from '../src/model/seams';
import { serializeProject, parseProject } from '../src/model/serialize';
import { censusBreaks } from '../src/templates/structures/boards';
import type { Design, P2 } from '../src/model/types';
import { defaults, generate, templateById } from '../src/templates/registry';
import { recognise } from '../src/templates/catalogue';
import { boxLid } from '../src/easy/lid';
import { mainTray } from '../src/templates/structures/box';
import type { ParamDef, Params } from '../src/templates/types';
import { MATERIALS } from '../src/model/materials';
import { boxLidPutOn, PLUG_FIT } from '../src/model/lid';
import { toWorld } from '../src/model/frame';
import { trayWalls as trayWallsOf } from '../src/model/trays';
import { handleOf, overhangOf } from '../src/templates/structures/box';

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
const rect = (w: number, h: number): P2[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

/** Two boards lying level, the second on the first's top face, offset by (dx, dz). */
function stacked(m = P3, dx = 10, dz = 10, gap = 0): Design {
  const d = createDesign(m);
  const t = m.thickness;
  addFreePanel(d, { id: 'a', frame: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(100, 80) });
  addFreePanel(d, { id: 'b', frame: { o: [dx, t + gap, -dz], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(60, 40) });
  solve(d);
  return d;
}

describe('the face-glued joint (milestone 173, E1)', () => {
  it('two boards face to face are a laminate seam, joined and clean; before, they were *touching and not joined*', () => {
    const d = stacked();
    expect(findOpenSeams(d).map((s) => s.type)).toEqual(['laminate']);
    expect(problems(d)).toEqual(['val.notJoined.faceToFace']);
    autoConnect(d);
    const cs = Object.values(d.connections);
    expect(cs.map((c) => c.kind)).toEqual(['laminate']);
    expect(cs[0].broken).toBe(false);
    expect(problems(d)).toEqual([]);
    // nothing is cut for it; the glue's place on each board
    expect(cs[0].geom!.holes).toEqual([]);
    expect(cs[0].geom!.glueAt!.map((g) => g.panelId).sort()).toEqual(['a', 'b']);
    expect(censusBreaks(d)).toEqual([]);
  });

  it('boards apart, or side by side in one plane, are not glued', () => {
    const d = stacked(P3, 10, 10, 1);
    expect(findOpenSeams(d)).toEqual([]);
    const e = createDesign(P3);
    addFreePanel(e, { id: 'a', frame: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(100, 80) });
    addFreePanel(e, { id: 'b', frame: { o: [100, 0, 0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(60, 40) });
    solve(e);
    expect(findOpenSeams(e).some((s) => s.type === 'laminate')).toBe(false);
  });

  it('a board over another board’s hole shares only the material round it', () => {
    const d = createDesign(P8);
    // a frame of 100 × 80 with a 80 × 60 window, and a board of 70 × 50 lying in the window's place: no material shared
    addFreePanel(d, { id: 'a', frame: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(100, 80), holes: [[{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 70 }, { x: 10, y: 70 }]] });
    addFreePanel(d, { id: 'b', frame: { o: [15, 8, -15], u: [1, 0, 0], v: [0, 0, -1] }, side: 1, outer: rect(70, 50) });
    solve(d);
    expect(findOpenSeams(d)).toEqual([]);
  });

  it('a laminate joint survives a file round trip, and moving a board off breaks it', () => {
    const d = stacked();
    autoConnect(d);
    const e = parseProject(serializeProject(d));
    solve(e);
    expect(Object.values(e.connections).map((c) => [c.kind, c.broken])).toEqual([['laminate', false]]);
    e.panels.b.frame.o[1] += 2;
    solve(e);
    autoConnect(e);
    expect(Object.values(e.connections)).toEqual([]);
  });

  it('unjoined by hand, the pair is told it lies face to face', () => {
    const d = stacked();
    autoConnect(d);
    deleteConnection(d, Object.keys(d.connections)[0]);
    autoConnect(d);
    expect(problems(d)).toEqual(['val.notJoined.faceToFace']);
  });
});

/** Boards with no joint at all, or only stops (`slide`): every board should be held by something more. */
const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length === 0 || cs.every((c) => c.kind === 'slide');
  });

describe('the box’s lid and base words (milestone 173)', () => {
  const box = templateById('box')!;
  const CASES: [string, Params, string][] = [
    ['plug lid', { lid: 'plug' }, 'plugLid'],
    ['brim lid', { lid: 'brim' }, 'brimLid'],
    ['plug lid with a handle', { lid: 'plug', lidHandle: 'handle' }, 'plugLid'],
    ['brim lid with a handle', { lid: 'brim', lidHandle: 'handle' }, 'brimLid'],
    ['flat lid with a handle', { lid: 'liftoff', lidHandle: 'handle' }, 'trayLid'],
    ['base plate', { overhang: 'plate' }, 'box'],
    ['plug lid, base plate, spaces', { lid: 'plug', overhang: 'plate', spacesBy: 'count', nx: 2, ny: 2 }, 'plugLid'],
    ['hexagonal plug lid', { shape: 'poly', sides: 6, lid: 'plug' }, 'plugLid'],
  ];
  it('each builds clean on plywood 3 and 8 mm, is recognised, and every board is joined', () => {
    for (const m of [P3, P8])
      for (const [name, w, v] of CASES) {
        const d = generate(box, m, { ...defaults(box), ...w });
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(v);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
        expect(censusBreaks(d), `${name} ${m.id}`).toEqual([]);
      }
  }, 240_000);
});

describe('how the layered lids sit (milestone 173)', () => {
  const box = templateById('box')!;
  /** A board's corners in world space, moved by a column-major 4 × 4. */
  const cornersOn = (d: Design, id: string, M: number[]) => {
    const p = d.panels[id];
    const t = d.material.thickness;
    const pts = (p.sketch.kind === 'poly' ? p.sketch.pts : [{ x: 0, y: 0 }, { x: p.w, y: p.h }]).flatMap((q) => [0, t].map((z) => toWorld(p.frame, q.x, q.y, z)));
    return pts.map((w) => [0, 1, 2].map((r) => M[r] * w[0] + M[4 + r] * w[1] + M[8 + r] * w[2] + M[12 + r]));
  };
  const range = (pts: number[][], k: number) => [Math.min(...pts.map((q) => q[k])), Math.max(...pts.map((q) => q[k]))];

  it('a plug lid’s plug seats inside the walls within the play, under a top that rests on the walls', () => {
    for (const m of [P3, P8]) {
      const d = generate(box, m, { ...defaults(box), lid: 'plug' });
      const tr = mainTray(d)!;
      const lid = boxLid(d, tr);
      if (lid.kind !== 'liftoff') throw new Error('no lid');
      const plug = d.order.find((id) => d.panels[id].place?.host === lid.top)!;
      const lam = Object.values(d.connections).find((c) => c.kind === 'laminate')!;
      expect(lam.broken, m.id).toBe(false);
      const M = boxLidPutOn(d, tr)!;
      const t = m.thickness;
      const base = d.panels[d.trays[tr].baseId];
      const bx = range([0, base.w].map((x) => toWorld(base.frame, x, 0)), 0), bz = range([0, base.h].map((y) => toWorld(base.frame, 0, y)), 2);
      const px = range(cornersOn(d, plug, M), 0), pz = range(cornersOn(d, plug, M), 2), py = range(cornersOn(d, plug, M), 1);
      // inside the walls' inner faces (t in from the base's edge), by the play
      expect(px[0] - (bx[0] + t), m.id).toBeCloseTo(PLUG_FIT, 3);
      expect(bx[1] - t - px[1], m.id).toBeCloseTo(PLUG_FIT, 3);
      expect(pz[0] - (bz[0] + t), m.id).toBeCloseTo(PLUG_FIT, 3);
      // its underside one board below the walls' tops; the top on the walls
      const top = Math.max(...trayWallsOf(d, tr).map((w) => d.panels[w].frame.o[1] + d.panels[w].h));
      expect(py[0], m.id).toBeCloseTo(top - t, 3);
      expect(range(cornersOn(d, lid.top, M), 1)[0], m.id).toBeCloseTo(top, 3);
    }
  });

  it('a brim lid’s strips are held in slots in its top; a handle stands in slots on top', () => {
    for (const m of [P3, P8]) {
      const d = generate(box, m, { ...defaults(box), lid: 'brim', lidHandle: 'handle' });
      const lid = boxLid(d, mainTray(d)!);
      if (lid.kind !== 'liftoff') throw new Error('no lid');
      const on = d.order.filter((id) => d.panels[id].place?.host === lid.top);
      expect(on.length, m.id).toBe(5);
      for (const id of on) {
        const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
        expect(cs.map((c) => c.kind), `${id} ${m.id}`).toEqual(['tabslot']);
      }
      expect(handleOf(d), m.id).toBeTruthy();
    }
  });

  it('a base plate stands out past the walls all round, glued under the base', () => {
    for (const m of [P3, P8]) {
      const d = generate(box, m, { ...defaults(box), overhang: 'plate' });
      const tr = mainTray(d)!;
      const base = d.panels[d.trays[tr].baseId];
      const plate = d.order.find((id) => d.panels[id].place?.host === base.id)!;
      expect(d.panels[plate].w, m.id).toBeCloseTo(base.w + 2 * overhangOf(m.thickness), 3);
      expect(Object.values(d.connections).find((c) => c.kind === 'laminate')?.broken, m.id).toBe(false);
      // it stands on the floor
      expect(Math.min(...cornersOn(d, plate, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]).map((q) => q[1])), m.id).toBeCloseTo(0, 6);
    }
  });

  it('the new words are plywood only, with a reason elsewhere', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) {
      const p = defaults(box);
      for (const [key, v] of [['lid', 'plug'], ['lid', 'brim'], ['lidHandle', 'handle'], ['overhang', 'plate']] as const) {
        const def = box.params.find((x) => x.key === key) as ParamDef;
        const q = key === 'lidHandle' ? { ...p, lid: 'liftoff' } : p;
        expect(def.allowed!(v, q, m), `${key} ${m.id}`).toBe(false);
        expect(def.why!(v, q, m), `${key} ${m.id}`).toBe('sen.why.plyOnly');
      }
    }
  }, 60_000);

  it('a box saved before 173 builds as it did (no handle, no plate)', () => {
    const { lidHandle: _h, overhang: _o, ...old } = defaults(box);
    const a = generate(box, P3, { ...old, lid: 'liftoff' }), b = generate(box, P3, { ...defaults(box), lid: 'liftoff' });
    expect(a.order.length).toBe(b.order.length);
    expect(a.order.some((id) => a.panels[id].place?.host && !a.panels[id].divider)).toBe(false);
  });
});
