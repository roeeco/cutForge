// Milestone 16: no silent misses. Seeded random designs (boxes, trays,
// dividers, leaning panels, notched walls, dragged floor panels): every pair of
// panels whose slabs touch or overlap (sampled independently in tests/solid.ts)
// is joined by a connection, or the export check names the pair.
import { describe, expect, it } from 'vitest';
import {
  addDetail,
  addDivider,
  addPolygonPanel,
  addRootPanel,
  addSideWalls,
  addTray,
  autoConnect,
  createDesign,
  deletePanel,
  growPanel,
  movePanel,
  parentConnection,
  regularPolygon,
  setPanelSize,
  solve,
} from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { validate } from '../src/model/validate';
import { slabContacts, type SlabContact } from './solid';
import type { ConnectionKind, Design, MaterialProfile } from '../src/model/types';
import { toWorld } from '../src/model/frame';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}
type R = ReturnType<typeof rng>;

/** What the editor does after every edit. */
function edit(d: Design, fn: (d: Design) => unknown) {
  fn(d);
  solve(d);
  autoConnect(d);
}

const wallKind = (m: MaterialProfile): ConnectionKind => (m.kind === 'plywood' ? 'finger' : 'fold');

function box(d: Design, r: R, x = 0, z = 0) {
  const W = r.int(60, 200), H = r.int(50, 160);
  let base = '';
  edit(d, (x2) => void (base = addRootPanel(x2, x, z, W, H)));
  const edges = [0, 1, 2, 3].filter(() => r.chance(0.8));
  const same = r.chance(0.6);
  const h0 = r.int(20, 80);
  const walls: string[] = [];
  for (const e of edges) edit(d, (x2) => walls.push(growPanel(x2, base, e, { height: same ? h0 : r.int(20, 80), angle: 90, dir: 'up', kind: wallKind(x2.material) })!.panelId));
  return { base, walls, W, H };
}

const builders: Record<string, (d: Design, r: R) => void> = {
  box: (d, r) => void box(d, r),
  tray: (d, r) => {
    let base = '';
    edit(d, (x) => {
      base = r.chance(0.5) ? addRootPanel(x, 0, 0, r.int(60, 180), r.int(50, 150)) : addPolygonPanel(x, 0, 0, regularPolygon(r.int(3, 8), r.int(40, 90)))!;
    });
    edit(d, (x) => void addTray(x, base, r.int(20, 70)));
    // sometimes open a side
    if (r.chance(0.3)) {
      const walls = d.order.filter((id) => id.includes('/'));
      if (walls.length) edit(d, (x) => deletePanel(x, r.pick(walls)));
    }
  },
  dividers: (d, r) => {
    const { base, W, H } = box(d, r);
    const n = r.int(1, 3);
    for (let i = 0; i < n; i++) {
      const e = r.pick([0, 3] as const);
      const span = e === 0 ? H : W;
      edit(d, (x) => void addDivider(x, base, e, r.int(10, Math.max(11, span - 10)), r.int(15, 70)));
    }
  },
  leaning: (d, r) => {
    let base = '';
    edit(d, (x) => void (base = addRootPanel(x, 0, 0, r.int(80, 180), r.int(80, 160))));
    const angle = r.pick([30, 45, 60, 75]);
    const h = r.int(40, 90);
    edit(d, (x) => void addSideWalls(x, base, 0, angle, h));
    edit(d, (x) => void growPanel(x, base, 0, { height: h, angle, dir: 'up', kind: x.material.kind === 'plywood' ? 'lean' : 'glue', offset: r.int(10, 40) }));
  },
  notched: (d, r) => {
    const { walls } = box(d, r);
    for (const w of walls) {
      if (!r.chance(0.6)) continue;
      const p = d.panels[w];
      // a cut across the top edge, or across an end (taking part of a corner)
      const top = r.chance(0.6);
      const cw = r.int(8, 40), ch = r.int(6, 30);
      edit(d, (x) => void addDetail(x, w, 'rect', 'cut', top ? r.int(10, Math.max(11, p.w - 10)) : r.pick([0, p.w]), top ? p.h : r.int(10, Math.max(11, p.h - 5)), cw, ch));
    }
  },
  dragged: (d, r) => {
    const t = d.material.thickness;
    const A = box(d, r, 0, 0);
    // a second floor panel or box, dragged so it meets the first: flush, a little apart, or overlapping
    const second = r.chance(0.5) ? box(d, r, 400, 0) : (() => {
      let b = '';
      edit(d, (x) => void (b = addRootPanel(x, 400, 0, r.int(40, 120), r.int(40, 120))));
      return { base: b, walls: [] as string[], W: 0, H: 0 };
    })();
    const bA = d.panels[A.base], bB = d.panels[second.base];
    const gap = r.pick([0, 0, 0, -t / 2, -t, -2 * t, 0.5, t]);
    // world x of A's max side and B's min side
    const ax = Math.max(...[0, bA.w].map((x) => toWorld(bA.frame, x, 0)[0]));
    const bx = Math.min(...[0, bB.w].map((x) => toWorld(bB.frame, x, 0)[0]));
    // the walls stand on the base's face; B's walls (or its base) meet A's outermost x
    const reach = (ids: string[], base: string) => {
      let mx = -Infinity, mn = Infinity;
      for (const id of [base, ...ids]) {
        const p = d.panels[id];
        for (const q of [[0, 0], [p.w, 0], [0, p.h], [p.w, p.h]])
          for (const z of [0, t]) {
            const w = toWorld(p.frame, q[0], q[1], z);
            mx = Math.max(mx, w[0]);
            mn = Math.min(mn, w[0]);
          }
      }
      return { mx, mn };
    };
    const ra = reach(A.walls, A.base), rb = reach(second.walls, second.base);
    void ax;
    void bx;
    const dx = ra.mx - rb.mn + gap;
    const dz = r.int(-40, 40);
    edit(d, (x) => movePanel(x, second.base, dx, dz));
    if (r.chance(0.3)) edit(d, (x) => setPanelSize(x, A.base, x.panels[A.base].w + r.int(-5, 5), undefined));
  },
};

const FAMILIES = Object.keys(builders);
const MATS = [PLY, PLY, CARD, CORR16, CORR4];

export function buildSeed(seed: number): { d: Design; family: string } {
  const r = rng(seed);
  const family = FAMILIES[seed % FAMILIES.length];
  const d = createDesign(r.pick(MATS));
  builders[family](d, r);
  return { d, family };
}

/** Pairs that touch but have neither a connection nor an export-check message naming both. */
export function silentMisses(d: Design): (SlabContact & { why: string })[] {
  const issues = validate(d);
  const joined = (a: string, b: string) => Object.values(d.connections).some((c) => (c.a.panelId === a && c.b.panelId === b) || (c.a.panelId === b && c.b.panelId === a));
  const named = (a: string, b: string) => issues.some((i) => i.pair && i.pair.includes(a) && i.pair.includes(b));
  const out: (SlabContact & { why: string })[] = [];
  for (const c of slabContacts(d)) {
    if (joined(c.a, c.b) || named(c.a, c.b)) continue;
    const pa = parentConnection(d, c.a), pb = parentConnection(d, c.b);
    out.push({ ...c, why: `${c.a}(${pa?.a.panelId ?? 'root'}) ${c.b}(${pb?.a.panelId ?? 'root'})` });
  }
  return out;
}

/** Seeds that failed before the milestone 16 fixes (kept as fixed cases). */
const FIXED: number[] = [11,17,23,35,41,47,53,59,61,83,107,113,119,125,137,143,149,161,173,203,209,215,221,227,233,239,245,251,257,269,281,287,293,305,308,311,323,335,341,365,377,383,389,392,401,407,410,413,419,425,437,443,449,455,467,485,491,497];

describe('auto-connection: no silent misses', () => {
  it.each(FIXED)('fixed case: seed %i', (seed) => {
    const { d } = buildSeed(seed);
    expect(silentMisses(d)).toEqual([]);
  });

  it('500 seeds', () => {
    const fails: string[] = [];
    for (let seed = 1; seed <= 500; seed++) {
      let fam = '?';
      try {
        const { d, family } = buildSeed(seed);
        fam = `${family} ${d.material.id}`;
        const m = silentMisses(d);
        if (m.length) fails.push(`${seed} ${fam}: ${m.map((x) => `${x.why} depth ${x.depth.toFixed(2)} ext ${x.extent.toFixed(1)}`).join('; ')}`);
      } catch (e) {
        fails.push(`${seed} ${fam}: THROWS ${(e as Error).message.slice(0, 80)}`);
      }
    }
    expect(fails).toEqual([]);
  }, 600_000);
});

// ---------------------------------------------------------------------------
// The causes from the brief, one case each.
import { findOpenSeams, seamsBetween } from '../src/model/seams';
import { addWallInsert, edgeConnection } from '../src/model/ops';
import { maxOverlap } from './solid';
import { fromHinge } from '../src/model/hinge';
import { frameNormal } from '../src/model/frame';
import { v3dot } from '../src/geom/v3';

const between = (d: Design, a: string, b: string) => Object.values(d.connections).filter((c) => (c.a.panelId === a && c.b.panelId === b) || (c.a.panelId === b && c.b.panelId === a));

function plyBox(h = 50) {
  const d = createDesign(PLY);
  const base = addRootPanel(d, 0, 0, 120, 80);
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: h, angle: 90, dir: 'up', kind: 'finger' })!.panelId);
  autoConnect(d);
  return { d, base, walls };
}

describe('milestone 16: causes of missed joints', () => {
  /** A plywood box with a lid folded over from the back wall's top edge. */
  function lidBox() {
    const { d, base, walls } = plyBox();
    let lid = '';
    edit(d, (x) => void (lid = growPanel(x, walls[2], 'e2', { height: 80, angle: 90, dir: 'up', kind: 'finger' })!.panelId));
    return { d, base, walls, lid };
  }

  it('overlap up to t: a wall typed into the lid is joined at the contact; through it, it collides', () => {
    const t = PLY.thickness;
    for (const h of [50 - t, 50 - t + 0.5, 50 - t / 2, 50 - 0.5]) {
      const { d, walls, lid } = lidBox();
      const front = walls[0];
      edit(d, (x) => setPanelSize(x, front, undefined, h));
      const cs = between(d, lid, front);
      expect(cs, `front wall ${h} mm`).toHaveLength(1);
      expect(cs[0].broken).toBe(false);
      expect(cs[0].b.edge).toBe('face');
      expect(silentMisses(d)).toEqual([]);
      expect(maxOverlap(d, [-1, 40, -6], [121, 51, 2], 0.33)).toBeLessThanOrEqual(1);
    }
    // a wall typed past the lid runs into the lid's end: still a joint (the lid's end into the wall)
    {
      const { d, walls, lid } = lidBox();
      edit(d, (x) => setPanelSize(x, walls[0], undefined, 55));
      expect(between(d, lid, walls[0]).map((c) => c.broken)).toEqual([false]);
      expect(silentMisses(d)).toEqual([]);
    }
    // two dividers placed into each other (deeper than any joint can take): flagged, both panels named
    const { d, base } = plyBox();
    let a = '', b = '';
    edit(d, (x) => void (a = addDivider(x, base, 0, 30, 40)!));
    edit(d, (x) => void (b = addDivider(x, base, 0, 31.5, 40)!));
    expect(between(d, a, b)).toHaveLength(0);
    expect(validate(d).some((i) => i.key === 'val.collide' && i.pair!.includes(a) && i.pair!.includes(b))).toBe(true);
  });

  it('several seams per pair: a lid on a wall whose top has a notch meets it along two edges', () => {
    const { d, walls } = plyBox();
    const [front, , back] = walls;
    // the front wall's top edge gets a notch: two inserted points pushed down
    for (const [t, off] of [[0.35, 0], [0.4, -15], [0.6, -15], [0.65, 0]]) edit(d, (x) => void addWallInsert(x, front, 'e2', t, off));
    // a lid folded over from the back wall's top edge
    let lid = '';
    edit(d, (x) => void (lid = growPanel(x, back, 'e2', { height: 80, angle: 90, dir: 'up', kind: 'finger' })!.panelId));
    expect(lid).not.toBe('');
    const s = seamsBetween(d, d.panels[lid], d.panels[front]);
    expect(s.length).toBe(2);
    const cs = between(d, lid, front);
    expect(cs).toHaveLength(2);
    expect(cs.every((c) => !c.broken)).toBe(true);
    expect(new Set(cs.map((c) => (c.a.panelId === front ? c.a.edge : c.b.edge))).size).toBe(2);
    expect(findOpenSeams(d)).toEqual([]);
    expect(silentMisses(d)).toEqual([]);
  });

  it('angled edge on a face: a panel leaning back against the back wall is joined there', () => {
    const d = createDesign(PLY);
    const t = PLY.thickness;
    const base = addRootPanel(d, 0, 0, 120, 100);
    const back = growPanel(d, base, 'e2', { height: 90, angle: 90, dir: 'up', kind: 'finger' })!.panelId;
    autoConnect(d);
    // lean at 45° from the front edge, 20 mm in; height chosen so its top edge lies on the back wall's inner face
    const g = fromHinge(45);
    let lean = '';
    edit(d, (x) => void (lean = growPanel(x, base, 'e0', { height: 50, angle: g.angle, dir: g.dir, kind: 'lean', offset: 20 })!.panelId));
    const L = d.panels[lean], B = d.panels[back];
    // world z along the lean's v axis, and the back wall's inner face (its material lies towards −z or +z)
    const bz = [0, t].map((z) => B.frame.o[2] + (frameNormal(B.frame)[2] * B.frame.side) * z);
    const inner = Math.max(...bz) > 50 ? Math.min(...bz) : Math.max(...bz);
    const z0 = L.frame.o[2], vz = L.frame.v[2];
    const h = (inner - z0) / vz;
    edit(d, (x) => void (x.panels[lean].h = h));
    const cs = between(d, lean, back);
    expect(cs).toHaveLength(1);
    expect(cs[0].broken).toBe(false);
    expect(cs[0].b.edge).toBe('face');
    expect(silentMisses(d)).toEqual([]);
  });

  it('a notched receiver: a divider end meeting a wall with a slot cut in from its end gets tabs on both stretches', () => {
    const { d, base, walls } = plyBox(60);
    const right = walls[1];
    let div = '';
    edit(d, (x) => void (div = addDivider(x, base, 0, 40, 55)!));
    // a horizontal slot cut into the right wall from its back end, past the divider's line, at mid height
    const rw = d.panels[right];
    edit(d, (x) => void addDetail(x, right, 'rect', 'cut', rw.w, 30, 2 * (rw.w - 40 + 15), 10));
    const cs = between(d, div, right);
    expect(cs).toHaveLength(1);
    expect(cs[0].broken).toBe(false);
    // slots in the wall below and above the cut
    const slots = cs[0].geom!.holes.filter((h) => h.panelId === right).map((h) => Math.min(...h.poly.map((q) => q.y)));
    expect(slots.some((y) => y < 25)).toBe(true);
    expect(slots.some((y) => y > 35)).toBe(true);
    expect(silentMisses(d)).toEqual([]);
  });
});
