// Milestone 22: glue flaps fold off the panel they are cut from.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addDivider, addRootPanel, connectSeams, createDesign, growPanel, setConnection, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { toWorld } from '../src/model/frame';
import { flapMatrix, foldDisplay } from '../src/views/foldView';
import { frameMatrix } from '../src/views/three-geom';
import type { Design, Flap3d } from '../src/model/types';

const CARD = MATERIALS[0];

function cardBox(W = 80, D = 60, H = 40) {
  const d = createDesign(CARD);
  const base = addRootPanel(d, 0, 0, W, D);
  const walls = [0, 1, 2, 3].map((e) => growPanel(d, base, e, { height: H, angle: 90, dir: 'up', kind: 'fold' })!.panelId);
  for (const w of walls) connectSeams(d, w);
  return { d, base, walls };
}

const flaps = (d: Design) => Object.values(d.connections).flatMap((c) => (c.geom?.flaps3d ?? []).map((f) => ({ c, f })));

/** The flap's slab corners (receiver-local poly at z0 and z1), in world space through m. */
function slab(d: Design, f: Flap3d, m: THREE.Matrix4): THREE.Vector3[] {
  const R = d.panels[f.panelId];
  const out: THREE.Vector3[] = [];
  // flapGeometry: material z along u × v when side = 1, against it otherwise
  for (const q of f.poly) for (const z of [f.z0, f.z1]) out.push(new THREE.Vector3(q.x, q.y, R.frame.side === 1 ? z : -z).applyMatrix4(m));
  return out;
}

/** The flap as cut: its outline added to the owner, through the owner's thickness. */
function flatSlab(d: Design, f: Flap3d, adds: { panelId: string; poly: { x: number; y: number }[] }[]): THREE.Vector3[][] {
  const O = d.panels[f.owner!];
  return adds.filter((a) => a.panelId === O.id).map((a) => a.poly.flatMap((q) => [0, d.material.thickness].map((z) => new THREE.Vector3(...toWorld(O.frame, q.x, q.y, z)))));
}

function checkFlap(d: Design, c: Design['connections'][string], f: Flap3d) {
  expect(f.owner).toBeTruthy();
  expect(f.owner).not.toBe(f.panelId);
  expect(f.hinge).toHaveLength(2);
  // folded (foldT = 1): exactly where it was drawn before, on its receiver
  const id = new Map<string, THREE.Matrix4>();
  const folded = flapMatrix(d, f, foldDisplay(d, 1).xf, 1);
  const before = frameMatrix(d.panels[f.panelId].frame);
  folded.elements.forEach((x, i) => expect(x).toBeCloseTo(before.elements[i], 9));
  // flat (turned back by its whole angle, owner where it is): the cut net's added outline
  const flat = slab(d, f, flapMatrix(d, f, id, 0));
  const cands = flatSlab(d, f, c.geom!.adds);
  const err = Math.min(...cands.map((cand) => Math.max(...flat.map((p) => Math.min(...cand.map((q) => p.distanceTo(q)))))));
  expect(err).toBeLessThan(1e-6);
}

describe('glue flaps fold off their own panel', () => {
  it('tray corners (card): each flap belongs to its wall, folded pose unchanged, flat pose is the net', () => {
    const { d, walls } = cardBox();
    const fs = flaps(d);
    expect(fs).toHaveLength(4);
    for (const { c, f } of fs) {
      expect(walls).toContain(f.owner);
      expect(Math.abs(f.angle!)).toBeCloseTo(90, 6);
      checkFlap(d, c, f);
    }
  });

  it('a wall glued onto its base at 60° (grown glue)', () => {
    const d = createDesign(CARD);
    const base = addRootPanel(d, 0, 0, 60, 40);
    const r = growPanel(d, base, 0, { height: 30, angle: 60, dir: 'up', kind: 'glue' })!;
    const [{ c, f }] = flaps(d);
    expect(f.panelId).toBe(base);
    expect(f.owner).toBe(r.panelId);
    checkFlap(d, c, f);
  });

  it('a divider glued to the walls (edge on a face)', () => {
    const { d, base } = cardBox(100, 60, 40);
    const div = addDivider(d, base, 0, 30, 35)!;
    for (const c of Object.values(d.connections)) if (!c.grown && (c.a.panelId === div || c.b.panelId === div)) setConnection(d, c.id, { kind: 'glue' });
    solve(d);
    const mine = flaps(d).filter(({ f }) => f.owner === div);
    expect(mine.length).toBeGreaterThan(0);
    for (const { c, f } of mine) checkFlap(d, c, f);
  });

  it('in the fold view a flap moves with its owner: half folded, it is turned half way from flat', () => {
    const { d } = cardBox();
    const { f } = flaps(d)[0];
    const half = foldDisplay(d, 0.5).xf;
    const owner = half.get(f.owner!)!;
    const m = flapMatrix(d, f, half, 0.5);
    // the hinge line is carried by the owner's transform
    const h0 = new THREE.Vector3(...toWorld(d.panels[f.owner!].frame, ...f.hinge![0]));
    const onFlap = h0.clone().applyMatrix4(owner);
    const viaFlap = h0.clone().applyMatrix4(m.clone().multiply(frameMatrix(d.panels[f.panelId].frame).invert()));
    expect(onFlap.distanceTo(viaFlap)).toBeLessThan(1e-6);
    // not on its receiver's transform any more (the receiver is the base, which does not move; the wall does)
    expect(m.equals(half.get(f.panelId)!.clone().multiply(frameMatrix(d.panels[f.panelId].frame)))).toBe(false);
  });
});
