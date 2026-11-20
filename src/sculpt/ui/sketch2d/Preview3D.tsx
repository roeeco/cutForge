// The sketch view's 3D preview (SKETCH_OVERHAUL.md §6.4): a small inset with its
// own canvas, showing the draft as it would be built (120 ms after the last
// change) among the other shapes, dimmed. Double-click resets its view.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore, useT } from '../../../store/store';
import type { Shape3, SketchGraph } from '../../../model/types';
import { buildShape } from '../../build';
import { kernelNow } from '../../kernel';
import { startHeight } from '../../ops';
import { parentMatrix } from '../../tree';
import { shapeColor } from '../colors';
import { toGeometry, toMatrix, unionBox, worldBox } from '../geom';
import { Icon } from '../../../ui/icons';
import { STAGE } from '../../../views/palette';
import { m4Apply } from '../../xform';

/** The draft as a one-shape sculpture, built in the sketch's own frame. */
function draftShape(draft: SketchGraph, mode: 'extrude' | 'revolve', from: Shape3 | null, height: number): Shape3 {
  const axis = from?.axis?.kind === 'seg' && draft.segs[from.axis.id]?.k === 'line' ? from.axis : { kind: 'plane' as const };
  // an upright plane at the origin: the body comes out in sketch coordinates (x, y, normal)
  const base = { id: 'tmp', name: '', at: [0, 0, 0], q: [0, 0, 0, 1], sketch: { plane: 'upright', v: 2, ...draft } } as Shape3;
  return mode === 'extrude' ? { ...base, kind: 'extrude', height: from?.height ?? height } : { ...base, kind: 'revolve', angle: from?.angle ?? 360, axis };
}

function Scene({ fit }: { fit: number }) {
  const k = useStore((s) => s.sketch);
  const d = useStore((s) => s.design);
  const heights = useStore((s) => s.sculpt.heights);
  const { camera, controls, invalidate } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update(): void } | null; invalidate: () => void };
  // the draft is rebuilt 120 ms after the last change
  const [draft, setDraft] = useState(k?.draft ?? null);
  useEffect(() => {
    const tm = setTimeout(() => setDraft(k?.draft ?? null), 120);
    return () => clearTimeout(tm);
  }, [k?.draft]);
  const from = k?.shapeId ? d.sculpt?.shapes[k.shapeId] ?? null : null;
  const geo = useMemo(() => {
    const kr = kernelNow();
    if (!kr || !draft || !k) return null;
    const s = draftShape(draft, k.mode, from, startHeight('extrude', heights));
    const m = buildShape(kr, { shapes: { tmp: s }, order: ['tmp'] }, 'tmp');
    return m.isEmpty() ? null : toGeometry(m);
  }, [draft, k?.mode, from?.height, from?.angle]);
  useEffect(() => () => geo?.dispose(), [geo]);
  const others = useMemo(() => {
    const sc = d.sculpt;
    const kr = kernelNow();
    if (!sc || !kr) return [];
    return sc.order.filter((id) => id !== k?.shapeId && sc.shapes[id] && !sc.shapes[id].hole).map((id) => ({ id, geo: toGeometry(buildShape(kr, sc, id)), m: toMatrix(parentMatrix(sc, id)) }));
  }, [d.sculpt, k?.shapeId]);
  useEffect(() => () => others.forEach((o) => o.geo.dispose()), [others]);
  const M = useMemo(() => (k ? toMatrix(k.M) : new THREE.Matrix4()), [k?.M]);
  // frame what is there
  useEffect(() => {
    const sc = d.sculpt;
    const box = sc ? unionBox(sc.order.filter((id) => id !== k?.shapeId).map((id) => worldBox(sc, id))) : null;
    const pts: number[][] = box ? [box.min, box.max] : [];
    if (geo) {
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(m4Apply(k!.M, [x, y, z]));
    }
    const min = [0, 1, 2].map((i) => (pts.length ? Math.min(...pts.map((p) => p[i])) : -50)), max = [0, 1, 2].map((i) => (pts.length ? Math.max(...pts.map((p) => p[i])) : 50));
    const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const r = Math.max(30, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
    camera.position.copy(c).addScaledVector(new THREE.Vector3(0.6, 0.65, 1).normalize(), (r * 1.5) / Math.tan((camera.fov * Math.PI) / 360));
    camera.lookAt(c);
    if (controls) {
      controls.target.copy(c);
      controls.update();
    }
    invalidate();
  }, [fit, !!controls, !!geo]);
  useEffect(() => invalidate(), [geo, others]);
  return (
    <>
      {others.map((o) => (
        <mesh key={o.id} geometry={o.geo} matrixAutoUpdate={false} matrix={o.m}>
          <meshStandardMaterial color="#c3cbd5" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
      {geo && (
        <mesh geometry={geo} matrixAutoUpdate={false} matrix={M} data-testid="preview-body">
          <meshStandardMaterial color={from?.color ?? shapeColor(Object.keys(d.sculpt?.shapes ?? {}).length)} roughness={0.7} />
        </mesh>
      )}
    </>
  );
}

export default function Preview3D() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [fit, setFit] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  return (
    <div className={`sk-preview ${open ? '' : 'folded'}`} ref={wrap} data-testid="sketch-preview">
      <button className="ghost sk-preview-fold" onClick={() => setOpen((o) => !o)} aria-label={t(open ? 'sketch.previewHide' : 'sketch.previewShow')} title={t(open ? 'sketch.previewHide' : 'sketch.previewShow')} data-testid="sketch-preview-fold">
        <Icon name={open ? 'minus' : 'plus'} size={14} /> {t('sketch.preview')}
      </button>
      {open && (
        <div className="sk-preview-canvas" onDoubleClick={() => setFit((f) => f + 1)}>
          <Canvas frameloop="demand" camera={{ fov: 40, near: 1, far: 20000 }} dpr={[1, 2]} gl={{ antialias: true }}>
            <color attach="background" args={[STAGE.bg]} />
            <hemisphereLight args={['#ffffff', '#cfd6e0', 1.4]} />
            <directionalLight position={[300, 600, 400]} intensity={1.4} />
            <Scene fit={fit} />
            <OrbitControls makeDefault enableDamping={false} />
          </Canvas>
        </div>
      )}
    </div>
  );
}
