// 3D of a fold-over: the liner on the wall's inner face, a rounded rim along
// the folded edge, and the lock tabs through the base (drawn straight). The
// fold slider swings the liner and tabs out about the rim, so at 0 they lie
// flat beyond the edge as in the net.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Design, P2, Panel } from '../model/types';
import type { FoldOverGeom } from '../model/foldover';
import { segDir, segInward, segLength } from '../model/edges';
import { flapGeometry, frameMatrix } from './three-geom';
import { boardColors } from './palette';
import { tOf } from '../model/materials';

export function FoldOverObject({ d, p, g, m, foldT, index }: { d: Design; p: Panel; g: FoldOverGeom; m: THREE.Matrix4; foldT: number; index: number }) {
  const t = tOf(d, p.id);
  const { e, x0, x1, q0, q1 } = g.liner;
  const dir = segDir(e), inw = segInward(e);
  const at = (s: number, q: number): P2 => ({ x: e.a.x + dir.x * s + inw.x * q, y: e.a.y + dir.y * s + inw.y * q });
  const parts = useMemo(() => {
    const liner = flapGeometry(p, [at(x0, q0), at(x1, q0), at(x1, q1), at(x0, q1)], t, 2 * t);
    const tabs = g.tabs.map((tb) => flapGeometry(p, [at(tb.x0, q1), at(tb.x1, q1), at(tb.x1 - 0.18 * (tb.x1 - tb.x0), q1 + t + tb.depth), at(tb.x0 + 0.18 * (tb.x1 - tb.x0), q1 + t + tb.depth)], t, 2 * t));
    return { liner, tabs };
  }, [p, g, t]);
  useEffect(() => () => (parts.liner.dispose(), parts.tabs.forEach((x) => x.dispose())), [parts]);
  const color = useMemo(() => boardColors(d, p.id, index, -0.02), [d.material, d.materials, p.material, index]);
  const mats = useMemo(() => [new THREE.MeshStandardMaterial({ color: color.face, roughness: 0.88 }), new THREE.MeshStandardMaterial({ color: color.edge, roughness: 0.92 })], [color]);
  useEffect(() => () => mats.forEach((x) => x.dispose()), [mats]);
  // frame-matrix coordinates: z along the plane normal, the material at side·z
  const side = p.frame.side;
  const base = useMemo(() => m.clone().multiply(frameMatrix(p.frame)), [m, p.frame]);
  // swing about the rim: from the inner face (folded) to flat beyond the edge (foldT = 0)
  const swing = useMemo(() => {
    const pivot = new THREE.Vector3(e.a.x + inw.x * t, e.a.y + inw.y * t, side * t);
    const axis = new THREE.Vector3(inw.y * side, -inw.x * side, 0).normalize();
    const th = (1 - foldT) * Math.PI;
    return new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, th)).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  }, [e, inw.x, inw.y, side, t, foldT]);
  const linerMatrix = useMemo(() => base.clone().multiply(swing), [base, swing]);
  // the rim: a rounded bead of radius t along the edge
  const L = segLength(e);
  const rim = useMemo(() => {
    const mid = new THREE.Vector3(e.a.x + dir.x * (L / 2) + inw.x * t, e.a.y + dir.y * (L / 2) + inw.y * t, side * t);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir.x, dir.y, 0));
    return { mid, q };
  }, [e, L, dir.x, dir.y, inw.x, inw.y, side, t]);
  return (
    <>
      <group matrixAutoUpdate={false} matrix={base} userData={{ noAO: true }}>
        {foldT > 0.98 && (
          <mesh position={rim.mid} quaternion={rim.q} raycast={() => null}>
            <cylinderGeometry args={[t * 0.98, t * 0.98, L, 20, 1, false]} />
            <meshStandardMaterial color={color.face} roughness={0.9} />
          </mesh>
        )}
      </group>
      <group matrixAutoUpdate={false} matrix={linerMatrix} data-testid="fold-liner">
        <mesh geometry={parts.liner} material={mats} raycast={() => null} userData={{ foldLiner: p.id }} />
        {parts.tabs.map((tg, i) => (
          <mesh key={i} geometry={tg} material={mats} raycast={() => null} />
        ))}
      </group>
    </>
  );
}
