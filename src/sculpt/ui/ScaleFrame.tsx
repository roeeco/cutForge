// The scale frame (SKETCH_OVERHAUL.md §4.4): a box around the selection with
// handles. Bottom corners change width and depth, bottom side middles one
// direction, the top cone the height. Shift or Keep proportions scales all
// three alike; Alt scales about the middle. One shape: its own box in its own
// axes (a turned shape has a turned frame). Several: their box in the world.
import { useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { gridSnap, useStore, useT } from '../../store/store';
import type { Design, V3 } from '../../model/types';
import { canStretch, scaleShape, scaleShapes, shapeSize } from '../scale';
import { parentMatrix } from '../ops';
import { m4, m4Apply, m4InvAffine, m4Mul, type M4 } from '../xform';
import { unionBox, worldBox, type Box3 } from './geom';
import { closestOnLine, DimLabel, priorityRaycast, ScreenSized, StageHtml, useHandleDrag, useRayFromScreen } from '../../views/widgets';

const onTop = { depthTest: false, depthWrite: false, transparent: true } as const;

/** The frame of a selection: its box in frame coordinates and the frame → world matrix. */
export type FrameBox = { box: Box3; M: M4; one: string | null };

export function selectionFrame(d: Design, ids: string[]): FrameBox | null {
  const sc = d.sculpt;
  if (!sc || !ids.length) return null;
  if (ids.length === 1) {
    const s = sc.shapes[ids[0]];
    const b = s && shapeSize(sc, ids[0]);
    if (!s || !b) return null;
    return { box: b, M: m4Mul(parentMatrix(sc, ids[0]), m4(s.at, s.q)), one: ids[0] };
  }
  const b = unionBox(ids.map((id) => worldBox(sc, id)));
  return b ? { box: b, M: m4([0, 0, 0], [0, 0, 0, 1]), one: null } : null;
}

/** Scale a selection by f (frame axes) about a frame point: one shape along its own axes, several along the world's. */
export function scaleSelection(d: Design, fr: FrameBox, ids: string[], f: V3, anchor: V3): boolean {
  if (fr.one) {
    scaleShape(d, fr.one, f, anchor);
    return true;
  }
  return scaleShapes(d, ids, f, anchor);
}

const mid = (b: Box3, i: number) => (b.min[i] + b.max[i]) / 2;
const len = (b: Box3, i: number) => b.max[i] - b.min[i];

/**
 * A handle: the frame axes it changes (0 = x, 1 = up, 2 = z) and, for each,
 * the side it sits on (+1 max, −1 min).
 */
type Handle = { id: string; axes: { i: number; side: 1 | -1 }[]; at: V3; kind: 'corner' | 'side' | 'top' };

function handlesOf(b: Box3, stretchable: boolean): Handle[] {
  const y = b.min[1];
  const out: Handle[] = [];
  for (const sx of [-1, 1] as const)
    for (const sz of [-1, 1] as const)
      out.push({ id: `c${sx > 0 ? 'x' : 'n'}${sz > 0 ? 'x' : 'n'}`, kind: 'corner', axes: [{ i: 0, side: sx }, { i: 2, side: sz }], at: [sx > 0 ? b.max[0] : b.min[0], y, sz > 0 ? b.max[2] : b.min[2]] });
  if (stretchable) {
    for (const s of [-1, 1] as const) {
      out.push({ id: `x${s > 0 ? 'x' : 'n'}`, kind: 'side', axes: [{ i: 0, side: s }], at: [s > 0 ? b.max[0] : b.min[0], y, mid(b, 2)] });
      out.push({ id: `z${s > 0 ? 'x' : 'n'}`, kind: 'side', axes: [{ i: 2, side: s }], at: [mid(b, 0), y, s > 0 ? b.max[2] : b.min[2]] });
    }
  }
  out.push({ id: 'top', kind: 'top', axes: [{ i: 1, side: 1 }], at: [mid(b, 0), b.max[1], mid(b, 2)] });
  return out;
}

/** The factors and anchor for a drag of a handle to frame point p (from the box at drag start). */
export function dragScale(b: Box3, h: Pick<Handle, 'axes'>, p: V3, o: { ratio: boolean; centre: boolean; snap: (x: number) => number }): { f: V3; anchor: V3 } {
  const f: V3 = [1, 1, 1];
  const anchor: V3 = [mid(b, 0), b.min[1], mid(b, 2)];
  for (const { i, side } of h.axes) {
    const L = len(b, i);
    if (!(L > 1e-9)) continue;
    const fixed = o.centre ? mid(b, i) : side > 0 ? b.min[i] : b.max[i];
    anchor[i] = fixed;
    const raw = o.centre ? 2 * Math.abs(p[i] - fixed) : side * (p[i] - fixed);
    f[i] = Math.max(1, o.snap(raw)) / L;
  }
  if (o.ratio) {
    // the factor of the direction dragged furthest
    const k = h.axes.map(({ i }) => f[i]).reduce((a, x) => (Math.abs(x - 1) > Math.abs(a - 1) ? x : a), 1);
    f[0] = f[1] = f[2] = k;
  }
  return { f, anchor };
}

function HandleMesh({ h, M, q, onDown }: { h: Handle; M: M4; q: THREE.Quaternion; onDown: (e: any) => void }) {
  const [hover, setHover] = useState(false);
  const at = m4Apply(M, h.at);
  const color = hover ? '#0f5d59' : h.kind === 'side' ? '#1f2937' : '#ffffff';
  return (
    <ScreenSized position={at} quaternion={q}>
      <group onPointerOver={(e) => (e.stopPropagation(), setHover(true))} onPointerOut={() => setHover(false)} onPointerDown={onDown} userData={{ noAO: true, testId: `scale-${h.id}` }}>
        {h.kind === 'top' ? (
          <mesh position={[0, 10, 0]} renderOrder={21} raycast={priorityRaycast}>
            <coneGeometry args={[7, 14, 18]} />
            <meshBasicMaterial color={hover ? '#0f5d59' : '#ffffff'} {...onTop} />
          </mesh>
        ) : (
          <mesh renderOrder={21} raycast={priorityRaycast}>
            <boxGeometry args={[10, 10, 10]} />
            <meshBasicMaterial color={color} {...onTop} />
          </mesh>
        )}
        <mesh renderOrder={20} raycast={priorityRaycast}>
          <boxGeometry args={[14, 14, 14]} />
          <meshBasicMaterial color="#0f5d59" opacity={0.9} {...onTop} />
        </mesh>
      </group>
    </ScreenSized>
  );
}

export function ScaleFrame({ d, ids }: { d: Design; ids: string[] }) {
  const t = useT();
  const ray = useRayFromScreen();
  const keepRatio = useStore((s) => !!s.viewPrefs.keepRatio);
  const { invalidate } = useThree();
  const fr = selectionFrame(d, ids);
  const stretchable = !!fr && (!!fr.one || canStretch(d.sculpt!, ids));
  const drag = useRef<{ h: Handle; fr: FrameBox; inv: M4 } | null>(null);
  const st = useStore.getState;
  const down = useHandleDrag({
    move: (ev) => {
      const g = drag.current;
      if (!g) return;
      const r = ray(ev.clientX, ev.clientY);
      // the ray in frame coordinates
      const o = m4Apply(g.inv, [r.origin.x, r.origin.y, r.origin.z]);
      const e = m4Apply(g.inv, [r.origin.x + r.direction.x, r.origin.y + r.direction.y, r.origin.z + r.direction.z]);
      const lr = new THREE.Ray(new THREE.Vector3(...o), new THREE.Vector3(e[0] - o[0], e[1] - o[1], e[2] - o[2]).normalize());
      const b = g.fr.box;
      let p: V3;
      if (g.h.kind === 'corner') {
        const hit = lr.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -b.min[1]), new THREE.Vector3());
        if (!hit) return;
        p = [hit.x, hit.y, hit.z];
      } else {
        const i = g.h.axes[0].i;
        const dir = new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
        const base = new THREE.Vector3(...g.h.at).setComponent(i, 0);
        const s = closestOnLine(lr, base, dir);
        p = [...g.h.at] as V3;
        p[i] = s;
      }
      const { f, anchor } = dragScale(b, g.h, p, { ratio: ev.shiftKey || keepRatio || !stretchable, centre: ev.altKey && g.h.kind !== 'top', snap: (x) => gridSnap(x, ev) });
      st().preview((dd) => void scaleSelection(dd as Design, g.fr, ids, f, anchor));
      invalidate();
    },
    end: (cancel) => {
      drag.current = null;
      if (cancel) st().cancel();
      else st().commit();
    },
  });
  const q = useMemo(() => {
    if (!fr) return new THREE.Quaternion();
    const m = new THREE.Matrix4().fromArray(fr.M);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(pos, quat, sc);
    return quat;
  }, [fr && fr.M.join(',')]);
  const lines = useMemo(() => {
    if (!fr) return null;
    const b = fr.box, M = fr.M;
    const c = (x: number, y: number, z: number) => m4Apply(M, [x ? b.max[0] : b.min[0], y ? b.max[1] : b.min[1], z ? b.max[2] : b.min[2]]);
    const pts: number[] = [];
    const E: [number, number, number, number, number, number][] = [];
    for (const y of [0, 1]) for (const [a, bb] of [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]] as const) E.push([a[0], y, a[1], bb[0], y, bb[1]]);
    for (const [x, z] of [[0, 0], [1, 0], [1, 1], [0, 1]]) E.push([x, 0, z, x, 1, z]);
    for (const e of E) pts.push(...c(e[0], e[1], e[2]), ...c(e[3], e[4], e[5]));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geo;
  }, [fr && JSON.stringify(fr)]);
  if (!fr || !lines) return null;
  const b = fr.box;
  const handles = handlesOf(b, stretchable);
  const commitDim = (i: number, v: number) => {
    const L = len(b, i);
    if (!(L > 0)) return;
    const k = Math.max(1, v) / L;
    const f: V3 = keepRatio || !stretchable ? [k, k, k] : (i === 0 ? [k, 1, 1] : i === 1 ? [1, k, 1] : [1, 1, k]);
    st().apply((dd) => void scaleSelection(dd as Design, fr, ids, f, [mid(b, 0), b.min[1], mid(b, 2)]));
  };
  const P = (p: V3) => m4Apply(fr.M, p);
  return (
    <>
      <lineSegments geometry={lines} raycast={() => null} renderOrder={18}>
        <lineBasicMaterial color="#0f5d59" opacity={0.7} {...onTop} />
      </lineSegments>
      {handles.map((h) => (
        <HandleMesh
          key={h.id}
          h={h}
          M={fr.M}
          q={q}
          onDown={(e) => {
            drag.current = { h, fr, inv: m4InvAffine(fr.M) };
            down(e);
          }}
        />
      ))}
      <DimLabel at={P([mid(b, 0), b.min[1], b.max[2]])} k="W" value={len(b, 0)} unit={t('unit.mm')} min={1} onCommit={(v) => commitDim(0, v)} testId="scale-dim-w" />
      <DimLabel at={P([b.max[0], b.min[1], mid(b, 2)])} k="D" value={len(b, 2)} unit={t('unit.mm')} min={1} onCommit={(v) => commitDim(2, v)} testId="scale-dim-d" />
      <DimLabel at={P([b.max[0], mid(b, 1), b.max[2]])} k="H" value={len(b, 1)} unit={t('unit.mm')} min={1} onCommit={(v) => commitDim(1, v)} testId="scale-dim-h" />
      {!stretchable && (
        <StageHtml position={P([mid(b, 0), b.max[1], mid(b, 2)])}>
          <span className="w-dim note" data-testid="scale-group-first">
            {t('scale.groupFirst')}
          </span>
        </StageHtml>
      )}
    </>
  );
}
