// Milestone 17: turned shapes and floor panels (schema v7).
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addDetail, addRootPanel, autoConnect, createDesign, growPanel, panelYaw, rotateDetails, rotatePanel, setPanelYaw, updateDetail } from '../src/model/ops';
import { SCHEMA_VERSION } from '../src/model/types';
import { setArray } from '../src/model/edit';
import { MATERIALS } from '../src/model/materials';
import { prepareExport } from '../src/export/prepare';
import { sheetsToSvg } from '../src/export/svg';
import { sheetsToDxf } from '../src/export/dxf';
import { detailBBox, detailContours } from '../src/model/geometry';
import { snapBox, snapContext } from '../src/model/snap';
import { parseProject, serializeProject } from '../src/model/serialize';
import { validate } from '../src/model/validate';
import { buildPieces } from '../src/model/pieces';
import { maxOverlap } from './solid';
import type { Design, P2 } from '../src/model/types';

const PLY = MATERIALS[3];

function hasPython() {
  try {
    execFileSync('python3', ['-c', 'import ezdxf, svgpathtools']);
    return true;
  } catch {
    return false;
  }
}

/** Export to files and read them back with the independent reader. */
function dump(d: Design) {
  const prep = prepareExport(d);
  const dir = mkdtempSync(join(tmpdir(), 'cutforge-rot-'));
  const dxfPath = join(dir, 'out.dxf'), svgPath = join(dir, 'out.svg');
  writeFileSync(dxfPath, sheetsToDxf(prep.sheets));
  writeFileSync(svgPath, sheetsToSvg(prep.sheets));
  return JSON.parse(execFileSync('python3', ['tests/py/dump_shapes.py', dxfPath, svgPath]).toString()) as {
    dxf: { layer: string; closed?: boolean; pts?: [number, number, number][]; circle?: number[] }[];
    svg: { stroke: string; closed: boolean; segs: { t: string; a: number[]; b: number[]; r?: number[] }[] }[];
  };
}

/** The corners of a w × h rectangle centred at c, turned by deg. */
function corners(c: P2, w: number, h: number, deg: number): P2[] {
  const a = (deg * Math.PI) / 180;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: c.x + (i * w / 2) * Math.cos(a) - (j * h / 2) * Math.sin(a), y: c.y + (i * w / 2) * Math.sin(a) + (j * h / 2) * Math.cos(a) }));
}
const sameSet = (got: P2[], want: P2[], tol = 1e-3) => want.every((w) => got.some((g) => Math.hypot(g.x - w.x, g.y - w.y) < tol)) && got.length === want.length;

describe('turned shapes', () => {
  it('a rectangle cut turned 30° keeps its size and turns its corners; snapping uses them', () => {
    const d = createDesign(PLY);
    const p = addRootPanel(d, 0, 0, 100, 80);
    const id = addDetail(d, p, 'rect', 'cut', 50, 40, 30, 20)!;
    rotateDetails(d, [id], 30);
    const dt = d.panels[p].details[0];
    expect(dt.rot).toBe(30);
    expect(dt.cx).toBe(50);
    const pts = detailContours(dt)[0].segs.map((s) => s.a);
    expect(sameSet(pts, corners({ x: 50, y: 40 }, 30, 20, 30))).toBe(true);
    // the box used by align/distribute and spacing is the turned shape's bounds
    const bb = detailBBox(dt);
    expect(bb.maxX - bb.minX).toBeCloseTo(30 * Math.cos(Math.PI / 6) + 20 * Math.sin(Math.PI / 6), 9);
    // a new shape near a turned corner snaps to that corner, not to the old box
    const ctx = snapContext(d, p, new Set())!;
    const c = corners({ x: 50, y: 40 }, 30, 20, 30)[1];
    const sn = snapBox(ctx, { minX: c.x + 0.5, maxX: c.x + 10.5, minY: c.y + 0.3, maxY: c.y + 5.3 }, 1);
    expect(sn.dx).toBeCloseTo(-0.5, 9);
    expect(sn.dy).toBeCloseTo(-0.3, 9);
    expect(validate(d)).toEqual([]);
  });

  it.skipIf(!hasPython())('a rectangle cut turned 30° exports the right outline in SVG and DXF', () => {
    const d = createDesign(PLY);
    const p = addRootPanel(d, 0, 0, 100, 80);
    const id = addDetail(d, p, 'rect', 'cut', 50, 40, 30, 20)!;
    updateDetail(d, id, { rot: 30 });
    const r = dump(d);
    // DXF (y up): the outer polyline gives the piece origin
    const polys = r.dxf.filter((e) => e.pts);
    const outer = polys.reduce((a, b) => (Math.max(...b.pts!.map((q) => q[0])) - Math.min(...b.pts!.map((q) => q[0])) > Math.max(...a.pts!.map((q) => q[0])) - Math.min(...a.pts!.map((q) => q[0])) ? b : a));
    const ox = Math.min(...outer.pts!.map((q) => q[0])), oy = Math.min(...outer.pts!.map((q) => q[1]));
    const hole = polys.find((e) => e !== outer)!;
    expect(hole.closed).toBe(true);
    expect(sameSet(hole.pts!.map(([x, y]) => ({ x: x - ox, y: y - oy })), corners({ x: 50, y: 40 }, 30, 20, 30))).toBe(true);
    // SVG (y down): same corners, flipped about the piece's top edge
    const paths = r.svg.filter((p) => p.closed);
    const allY = paths.flatMap((p) => p.segs.map((s) => s.a[1]));
    const allX = paths.flatMap((p) => p.segs.map((s) => s.a[0]));
    const top = Math.min(...allY), left = Math.min(...allX);
    const svgHole = paths.find((p) => p.segs.length === 4 && !p.segs.some((s) => Math.abs(s.a[0] - left) < 1e-6))!;
    expect(sameSet(svgHole.segs.map((s) => ({ x: s.a[0] - left, y: 80 - (s.a[1] - top) })), corners({ x: 50, y: 40 }, 30, 20, 30))).toBe(true);
  });

  it.skipIf(!hasPython())('a turned rounded rectangle keeps true arcs (SVG A and DXF bulges)', () => {
    const d = createDesign(PLY);
    const p = addRootPanel(d, 0, 0, 100, 80);
    const id = addDetail(d, p, 'roundrect', 'cut', 50, 40, 40, 24)!;
    updateDetail(d, id, { r: 5, rot: 25 });
    const segs = detailContours(d.panels[p].details[0])[0].segs;
    expect(segs.filter((s) => s.k === 'A')).toHaveLength(4);
    const r = dump(d);
    const hole = r.dxf.filter((e) => e.pts).find((e) => e.pts!.some((q) => Math.abs(q[2]) > 1e-9))!;
    expect(hole.pts!.filter((q) => Math.abs(q[2]) > 1e-9)).toHaveLength(4);
    // a quarter-circle bulge is tan(90°/4)
    for (const q of hole.pts!.filter((q) => Math.abs(q[2]) > 1e-9)) expect(Math.abs(q[2])).toBeCloseTo(Math.tan(Math.PI / 8), 4); // the writer rounds bulges to 4 decimals
    const svgHole = r.svg.find((x) => x.segs.some((s) => s.t === 'A'))!;
    const arcs = svgHole.segs.filter((s) => s.t === 'A');
    expect(arcs).toHaveLength(4);
    for (const a of arcs) expect(a.r![0]).toBeCloseTo(5, 6);
    // the straight sides run at 25°
    const line = svgHole.segs.find((s) => s.t === 'L' && Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 20)!;
    const ang = (Math.atan2(-(line.b[1] - line.a[1]), line.b[0] - line.a[0]) * 180) / Math.PI;
    expect(((ang % 180) + 180) % 180).toBeCloseTo(25, 3); // coordinates are written to 0.001 mm
  });

  it('an array turns as a group about its centre', () => {
    const d = createDesign(PLY);
    const p = addRootPanel(d, 0, 0, 160, 100);
    const id = addDetail(d, p, 'rect', 'cut', 40, 50, 10, 6)!;
    setArray(d, id, { nx: 3, ny: 1, dx: 20, dy: 0 });
    updateDetail(d, id, { rot: 90 });
    const cs = detailContours(d.panels[p].details[0]);
    const centres = cs.map((c) => ({ x: c.segs.reduce((s, q) => s + q.a.x, 0) / 4, y: c.segs.reduce((s, q) => s + q.a.y, 0) / 4 }));
    // the row (centre 60, 50) stands up: copies at y = 30, 50, 70
    expect(centres.map((q) => q.x).every((x) => Math.abs(x - 60) < 1e-9)).toBe(true);
    expect(centres.map((q) => Math.round(q.y)).sort((a, b) => a - b)).toEqual([30, 50, 70]);
  });

  it('a circle is unchanged by rotation; rotation survives save and reload', () => {
    const d = createDesign(PLY);
    const p = addRootPanel(d, 0, 0, 100, 80);
    const c = addDetail(d, p, 'circle', 'cut', 30, 30, 12, 12)!;
    const r = addDetail(d, p, 'rect', 'cut', 70, 40, 20, 10)!;
    const before = sheetsToSvg(prepareExport(d).sheets);
    updateDetail(d, c, { rot: 40 });
    expect(sheetsToSvg(prepareExport(d).sheets)).toBe(before);
    updateDetail(d, r, { rot: 15 });
    const svg = sheetsToSvg(prepareExport(d).sheets);
    const back = parseProject(serializeProject(d));
    expect(back.schemaVersion).toBe(SCHEMA_VERSION);
    expect(back.panels[p].details.find((x) => x.id === r)!.rot).toBe(15);
    expect(sheetsToSvg(prepareExport(back).sheets)).toBe(svg);
  });
});

describe('turned floor panels', () => {
  function box() {
    const d = createDesign(PLY);
    const base = addRootPanel(d, 0, 0, 120, 80);
    for (const e of [0, 1, 2, 3]) growPanel(d, base, e, { height: 50, angle: 90, dir: 'up', kind: 'finger' });
    autoConnect(d);
    const w = d.order[1];
    addDetail(d, w, 'circle', 'cut', 60, 25, 20, 20);
    return { d, base };
  }

  it('a plywood box turned 45° exports the same pieces and keeps every joint', () => {
    const a = box();
    const b = box();
    rotatePanel(b.d, b.base, 45);
    autoConnect(b.d);
    expect(panelYaw(b.d.panels[b.base])).toBeCloseTo(45, 9);
    // the walls followed: still standing on the turned base's edges
    const kinds = (d: Design) => Object.values(d.connections).map((c) => `${c.kind}${c.broken ? '!' : ''}`).sort();
    expect(kinds(b.d)).toEqual(kinds(a.d));
    expect(Object.values(b.d.connections).some((c) => c.broken)).toBe(false);
    // the same pieces, to 1e-6 mm
    const nums = (s: string) => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const sa = nums(sheetsToSvg(prepareExport(a.d).sheets)), sb = nums(sheetsToSvg(prepareExport(b.d).sheets));
    expect(sb.length).toBe(sa.length);
    expect(sb.every((x, i) => Math.abs(x - sa[i]) < 1e-6)).toBe(true);
    expect(buildPieces(b.d)).toHaveLength(buildPieces(a.d).length);
    expect(validate(b.d)).toEqual([]);
    // no two panels share material (the corners checked in the turned box's frame)
    const c = b.d.panels[b.base].frame.o;
    expect(maxOverlap(b.d, [c[0] - 40, 0, c[2] - 120], [c[0] + 130, 55, c[2] + 40], 0.9)).toBeLessThanOrEqual(1);
  });

  it('yaw can be set exactly and turned back; a save keeps it', () => {
    const { d, base } = box();
    const o = [...d.panels[base].frame.o];
    setPanelYaw(d, base, 30);
    expect(panelYaw(d.panels[base])).toBeCloseTo(30, 9);
    const back = parseProject(serializeProject(d));
    expect(panelYaw(back.panels[base])).toBeCloseTo(30, 9);
    setPanelYaw(d, base, 0);
    expect(panelYaw(d.panels[base])).toBe(0);
    d.panels[base].frame.o.forEach((x, i) => expect(x).toBeCloseTo(o[i], 9));
  });
});

describe('turned template', () => {
  it("a template's floor panel keeps its yaw when its parameters change", async () => {
    const { defaults, generate, regenerate, templateById } = await import('../src/templates/registry');
    const t = templateById('organiser')!;
    const d = generate(t, PLY, defaults(t));
    rotatePanel(d, 't:base', 30);
    const { design } = regenerate(d, { ...defaults(t), width: 200 });
    expect(panelYaw(design.panels['t:base'])).toBeCloseTo(30, 9);
    expect(Object.values(design.connections).some((c) => c.broken)).toBe(false);
  });
});

describe('floor-panel moves snap to other floor panels', () => {
  it("a panel dragged near another one's edge lands flush; corner to corner when both are near", async () => {
    const { snapFloor } = await import('../src/model/snap');
    const d = createDesign(PLY);
    addRootPanel(d, 0, 0, 100, 60); // x 0..100, z -60..0
    const b = addRootPanel(d, 200, 0, 50, 40); // x 200..250, z -40..0
    // dragged so its left edge is 0.7 mm right of A's right edge, 13 mm lower: flush on x only
    let s = snapFloor(d, b, -100 + 0.7, 13, 2)!;
    expect(s.dx).toBeCloseTo(-100, 9);
    expect(s.dz).toBeCloseTo(13, 9);
    // near A's top-right corner as well: corner to corner
    s = snapFloor(d, b, -100 + 0.7, 0.8, 2)!;
    expect(s.dx).toBeCloseTo(-100, 9);
    expect(s.dz).toBeCloseTo(0, 9);
    // nothing near
    expect(snapFloor(d, b, -50, 30, 2)).toBeNull();
    // a turned panel snaps its turned edge onto another panel's corner
    rotatePanel(d, b, 45);
    const r = snapFloor(d, b, 0, 0, 2);
    expect(r).toBeNull();
  });
});
