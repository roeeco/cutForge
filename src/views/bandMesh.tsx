// A band (a fold with a radius, milestone 63) on the 3D stage: its curved
// slab between the two cut-back panels, and its pattern's lines on its outer
// face (scores blue, hinge slits dark), as the fold view poses it.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Design } from '../model/types';
import { bandPose, bandWorld } from '../model/bands';
import type { BandShown } from './foldView';
import { boardColors } from './palette';

const ARC_STEPS = 24;

/** The band's slab as triangles in world coordinates (design pose): outer and inner faces and the two ends. */
export function bandGeometry(s: BandShown): THREE.BufferGeometry {
  const b = s.band;
  const { outer, inner } = bandPose(b, s.k, ARC_STEPS);
  const [s0, s1] = b.span;
  const P = (q: { x: number; y: number }, at: number) => new THREE.Vector3(...bandWorld(b, q, at));
  const pos: number[] = [];
  const quad = (a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => pos.push(...a.toArray(), ...bb.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
  for (let i = 0; i < ARC_STEPS; i++) {
    quad(P(outer[i], s0), P(outer[i + 1], s0), P(outer[i + 1], s1), P(outer[i], s1));
    quad(P(inner[i], s1), P(inner[i + 1], s1), P(inner[i + 1], s0), P(inner[i], s0));
    quad(P(outer[i], s0), P(inner[i], s0), P(inner[i + 1], s0), P(outer[i + 1], s0));
    quad(P(outer[i + 1], s1), P(inner[i + 1], s1), P(inner[i], s1), P(outer[i], s1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** The pattern's lines on the band's outer face (lifted a hair so they show), scores and cuts apart. */
export function bandLines(s: BandShown): { scores: THREE.BufferGeometry; cuts: THREE.BufferGeometry } {
  const b = s.band;
  const { outer, inner } = bandPose(b, s.k, ARC_STEPS);
  // a point x across the band (0..lb) on its outer face, nudged outward
  const at = (x: number, y: number) => {
    const f = Math.max(0, Math.min(1, x / Math.max(1e-9, b.lb))) * ARC_STEPS;
    const i = Math.min(ARC_STEPS - 1, Math.floor(f)), r = f - i;
    const o = { x: outer[i].x + (outer[i + 1].x - outer[i].x) * r, y: outer[i].y + (outer[i + 1].y - outer[i].y) * r };
    const n = { x: inner[i].x - outer[i].x, y: inner[i].y - outer[i].y }, L = Math.hypot(n.x, n.y) || 1;
    return new THREE.Vector3(...bandWorld(b, { x: o.x - (n.x / L) * 0.15, y: o.y - (n.y / L) * 0.15 }, b.span[0] + y));
  };
  const make = (segs: { a: { x: number; y: number }; b: { x: number; y: number } }[]) => new THREE.BufferGeometry().setFromPoints(segs.flatMap((q) => [at(q.a.x, q.a.y), at(q.b.x, q.b.y)]));
  const pathSegs = b.pattern.lines.paths.flatMap((q) => q.pts.slice(0, q.closed ? q.pts.length : q.pts.length - 1).map((p, i) => ({ a: p, b: q.pts[(i + 1) % q.pts.length] })));
  return { scores: make(b.pattern.lines.scores), cuts: make([...b.pattern.lines.cuts, ...pathSegs]) };
}

export function BandObject({ s, d, m, index, outlines }: { s: BandShown; d: Design; m: THREE.Matrix4; index: number; outlines: boolean }) {
  const geo = useMemo(() => bandGeometry(s), [s]);
  const lines = useMemo(() => bandLines(s), [s]);
  const color = useMemo(() => boardColors(d, s.band.parent, Math.max(0, index)).face, [d.material, d.materials, d.panels[s.band.parent]?.material, s.band.parent, index]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => (lines.scores.dispose(), lines.cuts.dispose()), [lines]);
  return (
    <group matrixAutoUpdate={false} matrix={m}>
      <mesh geometry={geo} raycast={() => null}>
        <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {outlines && (
        <>
          <lineSegments geometry={lines.scores} raycast={() => null}>
            <lineBasicMaterial color="#2f6feb" />
          </lineSegments>
          <lineSegments geometry={lines.cuts} raycast={() => null}>
            <lineBasicMaterial color="#7a1f12" />
          </lineSegments>
        </>
      )}
    </group>
  );
}
