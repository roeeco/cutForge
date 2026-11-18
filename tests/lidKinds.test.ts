// Milestone 79 (LIDS_LINES_PROJECTS_PLAN.md §3.2): the lid generator: Cap and Flat, why one cannot be made, Automatic.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { addDividerLine, addRootPanel, addRoundPanel, addTray, autoConnect, createDesign, deletePanel, setCustomHeight, setPanelSize, setTrayHeight, solve } from '../src/model/ops';
import { autoStyle, boxLid, capRimOf, lidStyleWhy, setBoxLid, setCapRim } from '../src/easy/lid';
import { boxDividers, dropinOnFrame, flatLidsOf, flatLip, flatOnFrame } from '../src/model/lid';
import { pointInPolygon } from '../src/geom/vec';
import { toLocal, toWorld } from '../src/model/frame';
import { findEdge } from '../src/model/edges';
import { buildPieces } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { yieldReport } from '../src/model/split';
import { trayRing } from '../src/model/cartons';
import { idempotence, roundTrip } from './harness';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;
function box(m = PLY, w = 120, dp = 80, h = 50) {
  const d = createDesign(m);
  const b = addRootPanel(d, 0, 0, w, dp);
  const tray = addTray(d, b, h)!;
  autoConnect(d);
  return { d, b, tray };
}

describe('Automatic and why', () => {
  it('plywood makes a Flat lid; corrugated and card a cap', () => {
    for (const [m, want] of [[PLY, 'flat'], [CORR4, 'cap'], [CORR16, 'cap'], [CARD, 'cap']] as const) {
      const { d, tray } = box(m);
      expect(autoStyle(d, tray)).toBe(want);
      setBoxLid(d, tray, 'liftoff');
      const lid = boxLid(d, tray);
      expect(lid.kind === 'liftoff' && lid.style).toBe(want);
    }
  });

  it('says why a Flat lid cannot be made: card, a round box, an open side, walls of different heights', () => {
    const c = box(CARD);
    expect(lidStyleWhy(c.d, c.tray, 'flat')).toBe('lid.why.flatCard');
    const r = createDesign(PLY);
    const rb = addRoundPanel(r, 0, 0, 100, 100, { shape: 'circle' })!;
    const rt = addTray(r, rb, 40)!;
    autoConnect(r);
    expect(lidStyleWhy(r, rt, 'flat')).toBe('lid.why.flatRound');
    expect(autoStyle(r, rt)).toBe('cap');
    const o = box(PLY);
    deletePanel(o.d, trayRing(o.d, o.d.trays[o.tray])[0].wall);
    expect(lidStyleWhy(o.d, o.tray, 'flat')).toBe('lid.why.openSide');
    const h = box(PLY);
    const w = trayRing(h.d, h.d.trays[h.tray])[1].wall;
    setCustomHeight(h.d, w, true);
    setPanelSize(h.d, w, undefined, 70);
    expect(lidStyleWhy(h.d, h.tray, 'flat')).toBe('lid.why.notLevel');
    for (const x of [o, h]) expect(lidStyleWhy(x.d, x.tray, 'cap')).toBeNull();
  });
});

describe('the Flat lid', () => {
  it.each([PLY, CORR4])('$id: tabs flush with its top through slots that clear them by the fit, its own piece, nothing glued', (m) => {
    const { d, tray } = box(m);
    setBoxLid(d, tray, 'liftoff', 'flat');
    const L = flatLidsOf(d, tray)[0];
    expect(L).toBeTruthy();
    const on = flatOnFrame(d, L, d.trays[tray])!;
    const tabs = Object.values(d.connections).filter((c) => c.id.startsWith('lidtab:'));
    expect(tabs).toHaveLength(4);

    let slots = 0;
    for (const c of tabs) {
      const W = d.panels[c.a.panelId];
      const notches = c.geom!.edges[0].notches;
      expect(notches.length).toBe(W.w < 80 ? 1 : 2);
      for (const n of notches) expect(n.depth).toBeCloseTo(-m.thickness, 9);
      // each slot holds its tab: the tab's middle at the lid's underside lands inside the slot, the slot a fit wider
      c.geom!.holes.forEach((h, i) => {
        const n = notches[i];
        const e = findEdge(W, 'e2')!, sm = (n.s0 + n.s1) / 2, len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
        const mid = toLocal(on, toWorld(W.frame, e.a.x + ((e.b.x - e.a.x) * sm) / len, e.a.y + ((e.b.y - e.a.y) * sm) / len, m.thickness / 2));
        expect(pointInPolygon(mid, h.poly)).toBe(true);
        const xs = h.poly.map((q) => q.x), ys = h.poly.map((q) => q.y);
        const span = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].sort((a, b) => a - b);
        expect(span[0]).toBeCloseTo(m.thickness + 0.3, 6);
        expect(span[1]).toBeCloseTo(n.s1 - n.s0 + 0.3, 6);
        // and a web to the lid's edge
        for (const q of h.poly) expect(Math.min(q.x, q.y, L.w - q.x, L.h - q.y)).toBeGreaterThan(m.thickness - 1e-6);
        slots++;
      });
    }
    expect(slots).toBe(8);

    const pc = buildPieces(d).find((p) => p.panels.some((n) => n.panelId === L.id))!;
    expect(pc.panels).toHaveLength(1);
    expect(yieldReport(d).glue).toBe(0);
    expect(validate(d).map((i) => i.key)).toEqual([]);
    expect(idempotence(d)).toBeNull();
    expect(roundTrip(d)).toBeNull();
  });

  it('follows its box: a resize, a height, a material', () => {
    const { d, b, tray } = box(PLY);
    setBoxLid(d, tray, 'liftoff', 'flat');
    const L = () => flatLidsOf(d, tray)[0];
    const lip = flatLip(d, d.trays[tray]);
    setPanelSize(d, b, 150, undefined);
    expect(L().w).toBeCloseTo(150 + 2 * lip, 6);
    setTrayHeight(d, tray, 70);
    expect(flatOnFrame(d, L(), d.trays[tray])!.o[1]).toBeCloseTo(70, 6);
    expect(Object.values(d.connections).filter((c) => c.id.startsWith('lidtab:')).every((c) => c.geom!.holes.length > 0)).toBe(true);
    expect(validate(d).map((i) => i.key)).toEqual([]);

  });

  it('from a Flat lid to a cap and back: nothing of the old one left', () => {
    const { d, tray } = box(PLY);
    setBoxLid(d, tray, 'liftoff', 'flat');
    const n0 = d.order.length;
    setBoxLid(d, tray, 'liftoff', 'cap');
    expect(flatLidsOf(d, tray)).toHaveLength(0);
    expect(Object.keys(d.connections).some((k) => k.startsWith('lidtab:'))).toBe(false);
    setBoxLid(d, tray, 'liftoff', 'flat');
    expect(d.order.length).toBe(n0);
    setBoxLid(d, tray, 'none');
    expect(d.order.length).toBe(n0 - 1);
  });
});

describe('a cap’s rim', () => {
  it('Shallow, Half, Full', () => {
    const { d, tray } = box(CORR4);
    setBoxLid(d, tray, 'liftoff', 'cap');
    expect(capRimOf(d, tray)).toBe('shallow');
    for (const r of ['half', 'full', 'shallow'] as const) {
      setCapRim(d, tray, r);
      expect(capRimOf(d, tray)).toBe(r);
    }
    setCapRim(d, tray, 'full');
    expect(validate(d).map((i) => i.key)).toEqual([]);
    solve(d);
  });
});

describe('the Drop-in lid (milestone 80)', () => {
  const organiser = (m: (typeof MATERIALS)[number]) => {
    const { d, b, tray } = box(m, 160, 110, 45);
    // two dividers across, 35 mm tall: one through the middle, where the finger hole would go
    addDividerLine(d, b, { x: 10, y: 55 }, { x: 150, y: 55 }, 35);
    addDividerLine(d, b, { x: 80, y: 10 }, { x: 80, y: 100 }, 35);
    autoConnect(d);
    return { d, tray, base: b };
  };
  it.each([PLY, CORR16, CARD])('$id: inside the walls by the fit, on the dividers, its finger hole clear of them', (m) => {
    const { d, tray } = organiser(m);
    expect(lidStyleWhy(d, tray, 'dropin')).toBeNull();
    setBoxLid(d, tray, 'liftoff', 'dropin');
    const lid = boxLid(d, tray);
    expect(lid.kind === 'liftoff' && lid.style).toBe('dropin');
    const L = flatLidsOf(d, tray)[0];
    const B = d.panels[d.trays[tray].baseId];
    const g = m.thickness + 0.3;
    expect(L.w).toBeCloseTo(B.w - 2 * g, 6);
    expect(L.h).toBeCloseTo(B.h - 2 * g, 6);
    const on = dropinOnFrame(d, L, d.trays[tray])!;
    const divs = boxDividers(d, d.trays[tray]);
    expect(divs.length).toBeGreaterThan(0);
    expect(on.o[1]).toBeCloseTo(B.frame.o[1] + m.thickness + Math.max(...divs.map((p) => p.h)), 6);
    const hole = L.details.find((x) => x.shape === 'circle')!;
    // the hole's middle, in the base's coordinates, is clear of every divider's line by its radius and the divider
    const c = toLocal(B.frame, toWorld(on, hole.cx, hole.cy));
    for (const p of divs) {
      const a = (p.place!.rot * Math.PI) / 180, A = { x: p.place!.x, y: p.place!.y }, v = { x: Math.cos(a) * p.w, y: Math.sin(a) * p.w };
      const k = Math.max(0, Math.min(1, ((c.x - A.x) * v.x + (c.y - A.y) * v.y) / (v.x * v.x + v.y * v.y)));
      expect(Math.hypot(c.x - A.x - v.x * k, c.y - A.y - v.y * k)).toBeGreaterThan(10 + m.thickness);
    }
    expect(buildPieces(d).find((p) => p.panels.some((n) => n.panelId === L.id))!.panels).toHaveLength(1);
    expect(validate(d).map((i) => i.key)).toEqual([]);
    expect(idempotence(d)).toBeNull();
    expect(roundTrip(d)).toBeNull();
  });
  it('needs dividers lower than the walls by its thickness', () => {
    const { d, tray } = box(PLY);
    expect(lidStyleWhy(d, tray, 'dropin')).toBe('lid.why.dropinDividers');
  });
});
