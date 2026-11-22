// Milestone 183 (BOXES_PLYWOOD_PLAN.md E10): parts in the Shapes tool, and the cards built on them. A part's outline
// is drawn from its sizes: a gear has its teeth on its pitch circle, every outline is one closed simple polygon, a
// part survives save and load and exports clean, on a board or as a board of its own.
import { describe, expect, it } from 'vitest';
import { PARTS, defaultPart, gearCircles, gearOutline, partOutline, partParams, pulleyDiameter, puzzleLines, type PartSpec } from '../src/model/parts';
import type { Design, P2 } from '../src/model/types';
import { addPartBoard, addPartShape, addPuzzle, addRootPanel, createDesign, deleteDetail, partToArray, updateDetail, updatePart } from '../src/model/ops';
import { profileById } from '../src/model/boards';
import { validate } from '../src/model/validate';
import { NOTE_KEYS } from '../src/easy/notes';
import { parseProject, serializeProject } from '../src/model/serialize';
import { prepareExport } from '../src/export/prepare';
import { flattenContour } from '../src/geom/vec';
import { crossesItself } from '../src/model/geometry';
import { loadFonts } from './fuzz/gen';
import { defaults, generate, templateById } from '../src/templates/registry';
import { MATERIALS } from '../src/model/materials';
import { recognise } from '../src/templates/catalogue';
import { recordOf, toothed } from '../src/templates/records';
import { censusBreaks } from '../src/templates/structures/boards';
import { gearboxSizes, MESH_PLAY, TOKENS, UR_SQUARES } from '../src/templates/structures/boardGears';
import { gearCentres } from '../src/model/parts';
import { makes, type Params } from '../src/templates/types';

/** No two edges of a closed outline cross or touch (but neighbours at their shared corner). */
function isSimplePolygon(q: P2[]): boolean {
  const n = q.length;
  if (n < 3) return false;
  const cr = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const a = q[i], b = q[(i + 1) % n], c = q[j], d = q[(j + 1) % n];
      const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
      if (d1 * d2 <= 0 && d3 * d4 <= 0 && Math.max(a.x, b.x) >= Math.min(c.x, d.x) && Math.max(c.x, d.x) >= Math.min(a.x, b.x) && Math.max(a.y, b.y) >= Math.min(c.y, d.y) && Math.max(c.y, d.y) >= Math.min(a.y, b.y)) return false;
    }
  return true;
}
const area = (q: P2[]) => q.reduce((s, p, i) => s + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0) / 2;
/** Local peaks of the distance from the centre, round a closed outline: the teeth. */
function peaks(q: P2[]): number {
  const r = q.map((p) => Math.hypot(p.x, p.y));
  const top = Math.max(...r), low = Math.min(...r), mid = (top + low) / 2;
  let n = 0;
  for (let i = 0; i < r.length; i++) if (r[i] > mid && r[(i + r.length - 1) % r.length] <= mid) n++;
  return n;
}

const P3 = profileById('ply-3')!, P8 = profileById('ply-8')!;
const problems = (d: Design) => validate(d).filter((x) => !NOTE_KEYS.has(x.key)).map((x) => x.key);
/** Every contour the export cuts or engraves is closed and does not cross itself; nothing failed to place. */
function exportsClean(d: Design): string[] {
  const out: string[] = [];
  const prep = prepareExport(d);
  if (prep.errors.length) out.push(`errors ${prep.errors.length}`);
  for (const sh of prep.sheets) for (const c of sh.contours) if ((c.role === 'outer' || c.role === 'hole') && crossesItself(flattenContour(c.contour, 0.05))) out.push(`crosses ${c.role}`);
  return out;
}
const roundTrip = (d: Design) => parseProject(serializeProject(d));

describe('parts (milestone 183): outlines', () => {
  it('a gear has its teeth, its tips on the addendum circle and its roots on the dedendum circle; its outline is simple', () => {
    for (const [m, z] of [[1, 8], [2, 12], [2, 20], [3, 24], [1.5, 60], [1, 120]] as const) {
      const g = gearOutline(m, z, 20, 0.2);
      const c = gearCircles(m, z);
      expect(c.r * 2, `${m} ${z}`).toBeCloseTo(m * z, 9);
      expect(peaks(g), `${m} ${z}`).toBe(z);
      const r = g.map((p) => Math.hypot(p.x, p.y));
      expect(Math.max(...r), `${m} ${z}`).toBeLessThanOrEqual(c.ra + 1e-6);
      expect(Math.max(...r), `${m} ${z}`).toBeGreaterThan(c.ra - 0.2 * m);
      expect(Math.min(...r), `${m} ${z}`).toBeCloseTo(c.rf, 3);
      expect(isSimplePolygon(g), `${m} ${z}`).toBe(true);
      expect(area(g), `${m} ${z}`).toBeGreaterThan(0);
    }
  });

  it('a gear tooth is half the circular pitch thick at the pitch circle, less the backlash', () => {
    const m = 2, z = 20, b = 0.2;
    const g = gearOutline(m, z, 20, b);
    // the tooth centred on +x: where its flanks cross the pitch circle
    const r = (m * z) / 2;
    const cross: number[] = [];
    for (let i = 0; i < g.length; i++) {
      const a = g[i], c = g[(i + 1) % g.length];
      const ra = Math.hypot(a.x, a.y), rc = Math.hypot(c.x, c.y);
      if ((ra - r) * (rc - r) < 0) {
        const t = (r - ra) / (rc - ra);
        const ang = Math.atan2(a.y + (c.y - a.y) * t, a.x + (c.x - a.x) * t);
        if (Math.abs(ang) < Math.PI / z) cross.push(ang);
      }
    }
    expect(cross).toHaveLength(2);
    expect(Math.abs(cross[1] - cross[0]) * r).toBeCloseTo((Math.PI * m) / 2 - b, 1);
  });

  it('every part at its defaults, and at its smallest and largest, is closed simple outlines that do not cross each other', () => {
    for (const def of PARTS) {
      const specs: PartSpec[] = [defaultPart(def.kind)];
      for (const end of ['min', 'max'] as const) {
        const p: Record<string, number | string> = {};
        for (const q of def.params) if (q.type !== 'choice') p[q.key] = end === 'min' ? q.min! : q.max!;
        specs.push({ kind: def.kind, p: partParams({ kind: def.kind, p }) });
      }
      for (const q of def.params) if (q.type === 'choice') for (const o of q.options!) specs.push({ kind: def.kind, p: { ...defaultPart(def.kind).p, [q.key]: o.value } });
      for (const s of specs) {
        if (s.kind === 'holes' && Number(s.p.width) * Number(s.p.height) / Number(s.p.pitch) ** 2 > 3000) continue;
        const o = partOutline(s);
        expect(o.polys.length, `${def.kind} ${JSON.stringify(s.p)}`).toBeGreaterThan(0);
        for (const poly of o.polys) expect(isSimplePolygon(poly), `${def.kind} ${JSON.stringify(s.p)}`).toBe(true);
      }
    }
  });

  it('a timing pulley’s outer diameter is its pitch circle less the belt’s pitch line offset', () => {
    expect(pulleyDiameter('gt2', 20)).toBeCloseTo(40 / Math.PI - 0.508, 6);
    const o = partOutline({ kind: 'pulley', p: { profile: 'gt2', teeth: 20 } }).polys[0];
    expect(peaks(o)).toBe(20);
  });

  it('a puzzle cut has a line between each row and each column, a tab on every edge between two pieces', () => {
    const ls = puzzleLines(200, 150, 4, 3);
    expect(ls).toHaveLength(3 + 2);
    expect(ls.every((l) => l.filter((q) => q.bulge).length === (l[0].x === 0 ? 4 : 3))).toBe(true);
  });
});

describe('parts (milestone 183): on a board, as a board, saved and exported', () => {
  it('each part, cut or engraved on a board, is clean, survives save and load with its sizes, and exports clean', () => {
    loadFonts();
    for (const m of [P3, P8])
      for (const def of PARTS)
        for (const op of ['cut', 'engrave'] as const) {
          const d = createDesign(m);
          const b = addRootPanel(d, 0, 0, 300, 250);
          const id = addPartShape(d, b, defaultPart(def.kind), 150, 125, op)!;
          expect(problems(d), `${def.kind} ${op} ${m.id}`).toEqual([]);
          const back = roundTrip(d);
          expect(back.panels[b].details, `${def.kind} ${op}`).toEqual(d.panels[b].details);
          expect(back.panels[b].details.find((x) => x.id === id)!.part!.kind).toBe(def.kind);
          expect(exportsClean(d), `${def.kind} ${op} ${m.id}`).toEqual([]);
        }
  }, 120_000);

  it('each part made a board of its own is clean and exports clean: a piece is its outline with its bore cut, a pattern is cut in a plate', () => {
    loadFonts();
    for (const m of [P3, P8])
      for (const def of PARTS) {
        const d = createDesign(m);
        const id = addPartBoard(d, defaultPart(def.kind), 0, 0)!;
        expect(id, def.kind).toBeTruthy();
        expect(problems(d), `${def.kind} ${m.id}`).toEqual([]);
        expect(exportsClean(d), `${def.kind} ${m.id}`).toEqual([]);
        const p = d.panels[id];
        if (def.piece) expect(p.details.filter((x) => x.op === 'cut'), def.kind).toHaveLength(1);
        else expect(p.details.find((x) => x.part)?.part?.kind, def.kind).toBe(def.kind);
        expect(roundTrip(d).panels[id]).toEqual(d.panels[id]);
      }
  }, 120_000);

  it('a gear made a board has its teeth round its pitch circle', () => {
    const d = createDesign(P3);
    const id = addPartBoard(d, { kind: 'gear', p: { module: 2, teeth: 24 } }, 0, 0)!;
    const s = d.panels[id].sketch;
    expect(s.kind).toBe('poly');
    const pts = s.kind === 'poly' ? s.pts : [];
    const cx = (Math.min(...pts.map((q) => q.x)) + Math.max(...pts.map((q) => q.x))) / 2, cy = (Math.min(...pts.map((q) => q.y)) + Math.max(...pts.map((q) => q.y))) / 2;
    expect(peaks(pts.map((q) => ({ x: q.x - cx, y: q.y - cy })))).toBe(24);
    expect(Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x))).toBeCloseTo(2 * 24 + 2 * 2, 0);
  });

  it('a part keeps its sizes: a change draws it again; stretching its box makes it a plain shape', () => {
    const d = createDesign(P3);
    const b = addRootPanel(d, 0, 0, 300, 250);
    const id = addPartShape(d, b, { kind: 'gear', p: { module: 2, teeth: 20 } }, 150, 125, 'cut')!;
    const dt = () => d.panels[b].details.find((x) => x.id === id)!;
    expect(dt().w).toBeCloseTo(44, 0);
    updatePart(d, id, { teeth: 30 });
    expect(dt().w).toBeCloseTo(64, 0);
    expect(dt().part!.p.teeth).toBe(30);
    updateDetail(d, id, { cx: 160 });
    expect(dt().part).toBeTruthy();
    updateDetail(d, id, { w: 80 });
    expect(dt().part).toBeUndefined();
  });

  it('a drill gauge’s sizes are engraved under its holes, follow it and go with it', () => {
    loadFonts();
    const d = createDesign(P3);
    const b = addRootPanel(d, 0, 0, 300, 250);
    const id = addPartShape(d, b, { kind: 'gauge', p: { from: 2, to: 6, step: 1 } }, 150, 125, 'cut')!;
    const labels = () => d.panels[b].details.filter((x) => x.labelOf === id);
    expect(labels().map((x) => x.text!.value)).toEqual(['2', '3', '4', '5', '6']);
    updatePart(d, id, { to: 8 });
    expect(labels()).toHaveLength(7);
    const x0 = labels()[0].cx;
    updateDetail(d, id, { cx: 160 });
    expect(labels()[0].cx).toBeCloseTo(x0 + 10, 9);
    expect(problems(d)).toEqual([]);
    deleteDetail(d, id);
    expect(d.panels[b].details).toEqual([]);
  });

  it('a square hole pattern in a rectangle becomes a live array of one hole', () => {
    const d = createDesign(P3);
    const b = addRootPanel(d, 0, 0, 300, 250);
    const id = addPartShape(d, b, { kind: 'holes', p: { grid: 'square', area: 'rect', width: 80, height: 60, hole: 5, pitch: 10 } }, 150, 125, 'cut')!;
    const n = d.panels[b].details[0].path!.polys.length;
    expect(partToArray(d, id)).toBe(id);
    const dt = d.panels[b].details[0];
    expect(dt.shape).toBe('circle');
    expect(dt.array!.nx * dt.array!.ny).toBe(n);
    expect(problems(d)).toEqual([]);
  });

  it('a puzzle cut cuts a board into pieces on purpose: no warning, kept on save and load, exported', () => {
    for (const m of [P3, P8]) {
      const d = createDesign(m);
      const b = addRootPanel(d, 0, 0, 200, 150);
      const ids = addPuzzle(d, b, 50);
      expect(ids).toHaveLength(3 + 2);
      expect(problems(d), m.id).toEqual([]);
      expect(roundTrip(d).panels[b].lines).toEqual(d.panels[b].lines);
      expect(exportsClean(d), m.id).toEqual([]);
    }
  });
});

const onlyResting = (d: Design) =>
  d.order.filter((id) => {
    const cs = Object.values(d.connections).filter((c) => c.a.panelId === id || c.b.panelId === id);
    return cs.length === 0 || cs.every((c) => c.kind === 'slide');
  });

describe('cards on parts (milestone 183): the gearbox and the game board', () => {
  const CASES: [string, string, Params][] = [
    ['gearbox', 'gearbox', {}],
    ['gearbox, one stage', 'gearbox', { stages: 1 }],
    ['gearbox, three stages, fine teeth', 'gearbox', { stages: 3, module: 1.5, pinion: 12, gear: 30 }],
    ['game board', 'gameBoard', {}],
    ['game board, large squares', 'gameBoard', { square: 45, height: 60 }],
  ];

  it('each builds clean on plywood 3 and 8 mm, is recognised as itself, and every board is held', () => {
    loadFonts();
    for (const m of [P3, P8])
      for (const [name, id, w] of CASES) {
        const t = templateById(id)!;
        const d = generate(t, m, { ...defaults(t), ...w });
        expect(problems(d), `${name} ${m.id}`).toEqual([]);
        expect(recognise(d)?.v.id, `${name} ${m.id}`).toBe(id);
        expect(onlyResting(d), `${name} ${m.id}`).toEqual([]);
        expect(censusBreaks(d), `${name} ${m.id}`).toEqual([]);
        expect(t.accepts!(m, { ...defaults(t), ...w }), `${name} ${m.id}`).toBeNull();
      }
  }, 240_000);

  it('a gearbox’s stages: a pinion and a gear on each, glued through a ring to the next stage on its axle, meshing on the line between the axles', () => {
    const t = templateById('gearbox')!;
    for (const n of [1, 2, 3]) {
      const p = { ...defaults(t), stages: n };
      const d = generate(t, P3, p);
      const gears = d.order.filter((id) => toothed(d.panels[id]));
      expect(gears, `${n}`).toHaveLength(2 * n);
      // glued face to face: the input pinion to its ring, each gear to its ring and that ring to the next pinion
      expect(Object.values(d.connections).filter((c) => c.kind === 'laminate' && !c.broken), `${n}`).toHaveLength(2 * n);
      const s = gearboxSizes(p, P3.thickness);
      expect(s.a).toBeCloseTo(gearCentres(s.m, s.z1, s.z2) + MESH_PLAY, 9);
      // two axle holes through the front and the back
      const w = Object.values(d.panels).filter((x) => x.details.some((q) => q.shape === 'circle' && Math.abs(q.w - s.shaft) < 1e-9));
      expect(w, `${n}`).toHaveLength(2);
      expect(recordOf(d).gears).toBe(true);
    }
    expect(t.accepts!(P3, { ...defaults(t), pinion: 20, gear: 20 })).toBe('sen.why.gearSmall');
  }, 120_000);

  it('a game board has the Royal Game of Ur’s twenty squares on its lid and a tray of fourteen token holes glued on its base', () => {
    const t = templateById('gameBoard')!;
    const d = generate(t, P3, defaults(t));
    const squares = Object.values(d.panels).flatMap((p) => p.details.filter((x) => x.op === 'engrave' && x.shape === 'rect'));
    expect(squares).toHaveLength(UR_SQUARES.length);
    expect(UR_SQUARES).toHaveLength(20);
    const tray = Object.values(d.panels).find((p) => p.details.filter((x) => x.op === 'cut' && x.shape === 'circle').length === TOKENS);
    expect(tray).toBeTruthy();
    expect(Object.values(d.connections).some((c) => c.kind === 'laminate' && [c.a.panelId, c.b.panelId].includes(tray!.id))).toBe(true);
    expect(recordOf(d).game).toBe(true);
  });

  it('the cards are plywood only', () => {
    for (const m of MATERIALS.filter((x) => x.kind !== 'plywood')) for (const id of ['gearbox', 'gameBoard']) expect(makes(templateById(id)!, m), m.id).toBe(false);
  });
});
