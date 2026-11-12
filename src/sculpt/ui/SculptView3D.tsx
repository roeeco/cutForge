// The 3D stage of a waffle design, stage 1 Shape (WAFFLE_MODE.md §5): the
// shapes as solids and striped holes, the Shapes tool (drag a footprint, a
// ghost with a height arrow, ✓), size arrows, the 3D gizmo and groups.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { gridSnap, noSmartSnap, selectedShapeIds, shapeSel, useStore, useT } from '../../store/store';
import type { Design, Shape3, V3 } from '../../model/types';
import { buildShape, shapeMatrix } from '../build';
import { kernelNow } from '../kernel';
import { addShape, defaultPrimitive, HEIGHT_KINDS, moveShapes, parentMatrix, primitiveHeightArg, primitiveShape, startHeight, turnShapes, updateShape, worldPose, type Primitive } from '../ops';
import { ScaleFrame } from './ScaleFrame';
import { m4, m4Mul, qRot, Q_ID } from '../xform';
import { holeMaterial, shapeColor, snapLift, snapMove, toGeometry, toMatrix, unionBox, worldBox, type Box3 } from './geom';
import { Gizmo, OverlayContext, PushPull, mmPerPx, useRayFromScreen } from '../../views/widgets';
import { ConfirmBar } from '../../views/panelTool';
import { STAGE } from '../../views/palette';
import { Icon } from '../../ui/icons';
import { NumField } from '../../ui/NumField';
import { SketchLayer } from './SketchLayer';
import { SketchMode, stageCamera } from './SketchCard';
import { revolveBlocked } from '../sketch';
import { outcomeOf, outcomeUi } from '../outcomes';

/** The shapes on the stage: the top level, or the members of the group being worked inside. */
export function visibleShapes(d: Design, focus: string | null): { id: string; dim: boolean }[] {
  const sc = d.sculpt;
  if (!sc) return [];
  if (!focus || !sc.shapes[focus]) return sc.order.map((id) => ({ id, dim: false }));
  // inside a group: its members; everything else is dimmed (the group's own top-level ancestor is left out)
  let top = focus;
  for (let i = 0; i < 50; i++) {
    const p = Object.values(sc.shapes).find((s) => s.children?.includes(top));
    if (!p) break;
    top = p.id;
  }
  return [...sc.order.filter((id) => id !== top).map((id) => ({ id, dim: true })), ...(sc.shapes[focus].children ?? []).map((id) => ({ id, dim: false }))];
}

function ShapeMesh({ d, id, index, dim, selected, ghost, onDown, onDouble }: { d: Design; id: string; index: number; dim: boolean; selected: boolean; ghost: boolean; onDown: (e: ThreeEvent<PointerEvent>) => void; onDouble: (e: ThreeEvent<MouseEvent>) => void }) {
  const sc = d.sculpt!;
  const s = sc.shapes[id];
  const k = kernelNow()!;
  const m = buildShape(k, sc, id);
  const geo = useMemo(() => toGeometry(m), [m]);
  useEffect(() => () => geo.dispose(), [geo]);
  const matrix = useMemo(() => toMatrix(parentMatrix(sc, id)), [sc, id]);
  const hole = !!s.hole;
  const mat = useMemo(() => (hole ? holeMaterial(dim) : null), [hole, dim]);
  useEffect(() => () => mat?.dispose(), [mat]);
  const color = selected ? STAGE.selected : s.color ?? shapeColor(index);
  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh geometry={geo} onPointerDown={onDown} onDoubleClick={onDouble} userData={{ shapeId: id }} renderOrder={hole ? 5 : 0}>
        {mat ? <primitive object={mat} attach="material" /> : <meshStandardMaterial color={color} roughness={0.75} transparent={dim || ghost} opacity={ghost ? 0.6 : dim ? 0.25 : 1} depthWrite={!dim} emissive={selected ? '#0b4f4a' : '#000000'} emissiveIntensity={selected ? 0.25 : 0} />}
      </mesh>
      {(selected || ghost) && (
        <lineSegments raycast={() => null} renderOrder={6}>
          <edgesGeometry args={[geo, 30]} />
          <lineBasicMaterial color={ghost ? STAGE.ghostEdge : '#0f5d59'} transparent opacity={0.8} />
        </lineSegments>
      )}
    </group>
  );
}

/** The 3D gizmo for the selected shapes: a square and two arrows on the floor, a lift arrow, and three rings. */
function ShapeGizmo({ d, ids }: { d: Design; ids: string[] }) {
  const { camera, size } = useThree();
  const sc = d.sculpt!;
  const box = unionBox(ids.map((id) => worldBox(sc, id)));
  const st = useStore.getState;
  const startBox = useRef<Box3 | null>(null);
  const others = useRef<Box3[]>([]);
  if (!box) return null;
  const centre: V3 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  const at: V3 = [centre[0], box.min[1], centre[2]];
  const begin = () => {
    if (startBox.current) return;
    const base = st().txnBase ?? st().design;
    startBox.current = unionBox(ids.map((id) => worldBox(base.sculpt!, id)));
    const vis = base.sculpt!.order.filter((id) => !ids.includes(id));
    others.current = vis.map((id) => worldBox(base.sculpt!, id)).filter((b): b is Box3 => !!b);
  };
  const end = (cancel: boolean) => {
    startBox.current = null;
    if (cancel) st().cancel();
    else st().commit();
  };
  const tol = () => 10 * mmPerPx(camera, size.height, new THREE.Vector3(...at));
  return (
    <>
      <Gizmo
        at={at}
        ax={[1, 0, 0]}
        ay={[0, 0, -1]}
        n={[0, 1, 0]}
        onMove={(du, dv, ev) => {
          begin();
          let x = gridSnap(du, ev), z = gridSnap(-dv, ev);
          if (startBox.current && !noSmartSnap(ev)) ({ du: x, dz: z } = snapMove(startBox.current, others.current, x, z, tol()));
          st().preview((dd) => moveShapes(dd as Design, ids, [x, 0, z]));
          return { du: x, dv: -z };
        }}
        onRotate={(deg) => {
          begin();
          st().preview((dd) => turnShapes(dd as Design, ids, [0, 1, 0], deg, centre));
        }}
        onEnd={end}
        testId="shape-gizmo"
      />
      <Gizmo
        at={at}
        ax={[0, 0, -1]}
        ay={[0, 1, 0]}
        n={[1, 0, 0]}
        modes={['y', 'ring']}
        onMove={(_du, dv, ev) => {
          begin();
          let y = gridSnap(dv, ev);
          if (startBox.current && !noSmartSnap(ev)) y = snapLift(startBox.current, others.current, y, tol());
          st().preview((dd) => moveShapes(dd as Design, ids, [0, y, 0]));
          return { du: 0, dv: y };
        }}
        onRotate={(deg) => {
          begin();
          st().preview((dd) => turnShapes(dd as Design, ids, [1, 0, 0], deg, centre));
        }}
        onEnd={end}
        testId="shape-lift"
      />
      <Gizmo
        at={at}
        ax={[1, 0, 0]}
        ay={[0, 1, 0]}
        n={[0, 0, 1]}
        modes={['ring']}
        onRotate={(deg) => {
          begin();
          st().preview((dd) => turnShapes(dd as Design, ids, [0, 0, 1], deg, centre));
        }}
        onEnd={end}
        testId="shape-turn-z"
      />
    </>
  );
}

/** The ghost of a shape just placed: its height arrow on top and the ✓ ✕ bar with the height to type. */
function ShapeGhostBar({ d, id }: { d: Design; id: string }) {
  const t = useT();
  const sc = d.sculpt!;
  const s = sc.shapes[id];
  const box = worldBox(sc, id);
  if (!s || !box) return null;
  const st = useStore.getState;
  const H = s.size?.[1] ?? s.height ?? 20;
  const pose = worldPose(sc, id);
  const top: V3 = [(box.min[0] + box.max[0]) / 2, box.max[1], (box.min[2] + box.max[2]) / 2];
  const setH = (v: number) => {
    st().preview((dd) => {
      const x = dd.sculpt!.shapes[id];
      if (x?.size) updateShape(dd as Design, id, { size: [x.size[0], Math.max(1, v), x.size[2]] });
    });
  };
  const ok = () => {
    // remembered by kind (a sphere, half sphere and ring never store one)
    const kind = s.kind as Primitive | 'extrude';
    if (HEIGHT_KINDS.includes(kind)) st().setSculpt({ heights: { ...st().sculpt.heights, [kind]: H } });
    st().confirmPending();
  };
  return (
    <>
      {s.size && (
        <PushPull at={[pose.at[0], pose.at[1] + H, pose.at[2]]} axis={qRot(pose.q, [0, 1, 0])} value={H} min={1} onPreview={setH} onCommit={() => st().commit()} onCancel={() => st().cancel()} color={STAGE.ghost} testId="ghost-height" />
      )}
      <ConfirmBar at={top} onOk={ok} onCancel={() => st().cancelPending()} okDisabled={revolveBlocked(s)} testId="shape-ghost-bar">
        {s.sketch && <SketchMode s={s} />}
        {revolveBlocked(s) && <span className="warn">{t('sketch.crossesAxis')}</span>}
        {s.size && (
          <span className="ghost-num" onKeyDown={(e) => e.stopPropagation()}>
            <NumField label={t('sculpt.height')} value={H} unit={t('unit.mm')} min={1} onCommit={(v) => (setH(v), st().commit())} testId="ghost-height-field" />
          </span>
        )}
      </ConfirmBar>
    </>
  );
}

/** A shape dragged from its tile: a see-through copy at the pointer's floor point; released over the stage, it is placed there. */
function TileDrag({ kind }: { kind: Primitive }) {
  const ray = useRayFromScreen();
  const { gl, invalidate } = useThree();
  const [at, setAt] = useState<V3 | null>(null);
  const atRef = useRef<V3 | null>(null);
  const shape = useMemo(() => {
    const st = useStore.getState();
    return defaultPrimitive(kind, [0, 0, 0], st.sculpt.heights);
  }, [kind]);
  const geo = useMemo(() => {
    const k = kernelNow();
    if (!k) return null;
    const tmp = { shapes: { tmp: { ...shape, id: 'tmp', name: '' } as Shape3 }, order: ['tmp'] };
    return toGeometry(buildShape(k, tmp, 'tmp'));
  }, [shape]);
  useEffect(() => () => geo?.dispose(), [geo]);
  useEffect(() => {
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const over = (ev: PointerEvent) => document.elementFromPoint(ev.clientX, ev.clientY) === gl.domElement;
    const move = (ev: PointerEvent) => {
      const hit = over(ev) ? ray(ev.clientX, ev.clientY).intersectPlane(floor, new THREE.Vector3()) : null;
      const p: V3 | null = hit ? [gridSnap(hit.x, ev), 0, gridSnap(hit.z, ev)] : null;
      atRef.current = p;
      setAt(p);
      invalidate();
    };
    const stop = () => useStore.getState().setSculpt({ dragKind: null });
    const up = (ev: PointerEvent) => {
      move(ev);
      const p = atRef.current;
      stop();
      if (p) placePrimitive(kind, p);
    };
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && stop();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  }, [kind]);
  if (!at || !geo) return null;
  return (
    <mesh geometry={geo} matrixAutoUpdate={false} matrix={toMatrix(m4Mul(m4(at, Q_ID), shapeMatrix({ ...shape, at: [0, 0, 0] } as Shape3)))} raycast={() => null} data-testid="tile-drag-ghost">
      <meshStandardMaterial color={STAGE.ghost} transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
}

/** Add a primitive at a floor point (a tile clicked or dropped): selected, with the Select tool. */
export function placePrimitive(kind: Primitive, at: V3) {
  const st = useStore.getState();
  let id = '';
  st.cancelPending();
  st.apply((x) => {
    id = addShape(x as Design, { ...defaultPrimitive(kind, at, st.sculpt.heights), color: shapeColor(Object.keys(x.sculpt?.shapes ?? {}).length), ...(st.sculpt.nextHole ? { hole: true as const } : {}) }, st.sculpt.focus);
  });
  if (!id) return;
  st.setTool('select');
  st.select(shapeSel([id]));
}

/** The design's outcome's stage-2 layer and bar (the waffle's slices and its steps). */
function OutcomeLayer() {
  const id = useStore((s) => outcomeOf(s.design));
  const L = outcomeUi(id)?.Layer;
  return L ? <L /> : null;
}
function OutcomeBar() {
  const id = useStore((s) => outcomeOf(s.design));
  const B = outcomeUi(id)?.Bar;
  return B ? <B /> : null;
}

type Draw = { y: number; a: THREE.Vector3; b: THREE.Vector3; moved: boolean; px: { x: number; y: number }; into: string | null };

function SculptScene() {
  const d = useStore((s) => s.design);
  const sel = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const ui = useStore((s) => s.sculpt);
  const pending = useStore((s) => s.pending);
  const sc = d.sculpt;
  const ray = useRayFromScreen();
  const [draw, setDraw] = useState<Draw | null>(null);
  const drawRef = useRef<Draw | null>(null);
  drawRef.current = draw;
  const { controls } = useThree() as unknown as { controls: { enabled: boolean } | null };
  const ids = selectedShapeIds(sel);
  const ghostIds = pending?.kind === 'sculpt' ? pending.ids : [];
  const shown = visibleShapes(d, ui.focus);

  // drawing a footprint: window listeners while the pointer is down
  useEffect(() => {
    if (!draw) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -draw.y);
    const move = (ev: PointerEvent) => {
      const g = drawRef.current;
      if (!g) return;
      const hit = ray(ev.clientX, ev.clientY).intersectPlane(plane, new THREE.Vector3());
      if (!hit) return;
      let bx = gridSnap(hit.x, ev), bz = gridSnap(hit.z, ev);
      if (ev.shiftKey) {
        const s = Math.max(Math.abs(bx - g.a.x), Math.abs(bz - g.a.z));
        bx = g.a.x + Math.sign(bx - g.a.x || 1) * s;
        bz = g.a.z + Math.sign(bz - g.a.z || 1) * s;
      }
      const moved = g.moved || Math.hypot(ev.clientX - g.px.x, ev.clientY - g.px.y) > 4;
      setDraw({ ...g, b: new THREE.Vector3(bx, g.y, bz), moved });
    };
    const up = () => {
      const g = drawRef.current;
      setDraw(null);
      if (controls) controls.enabled = true;
      if (!g) return;
      const st = useStore.getState();
      const w = g.moved ? Math.abs(g.b.x - g.a.x) : 40, dd = g.moved ? Math.abs(g.b.z - g.a.z) : 40;
      if (w < 1 || dd < 1) return;
      const cx = g.moved ? (g.a.x + g.b.x) / 2 : g.a.x, cz = g.moved ? (g.a.z + g.b.z) / 2 : g.a.z;
      const kind = st.sculpt.next as Primitive;
      const h = startHeight(kind, st.sculpt.heights, w, dd);
      let id = '';
      st.cancelPending();
      st.apply((x) => {
        const shape = primitiveShape(kind, { x: cx, z: cz, w, d: dd, y: g.y }, primitiveHeightArg(kind, h, w, dd));
        id = addShape(x as Design, { ...shape, color: shapeColor(Object.keys(x.sculpt?.shapes ?? {}).length), ...(st.sculpt.nextHole ? { hole: true } : {}) }, g.into);
      });
      if (!id) return;
      st.select(shapeSel([id]));
      st.beginPending({ kind: 'sculpt', ids: [id], panelId: '' });
    };
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && (setDraw(null), controls && (controls.enabled = true));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  }, [!!draw]);

  const startDraw = (e: ThreeEvent<PointerEvent>, y: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = new THREE.Vector3(gridSnap(e.point.x, e.nativeEvent), y, gridSnap(e.point.z, e.nativeEvent));
    if (controls) controls.enabled = false;
    setDraw({ y, a: p, b: p.clone(), moved: false, px: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }, into: useStore.getState().sculpt.focus });
  };

  const onShapeDown = (id: string, dim: boolean) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || e.intersections[0]?.object !== e.object) return;
    const st = useStore.getState();
    if (tool === 'shapes') {
      // on a shape's top: the footprint is drawn there, so the new shape stands on it
      const n = e.face?.normal.clone().transformDirection(e.object.matrixWorld);
      if (n && n.y > 0.7) return startDraw(e, Math.round(e.point.y * 100) / 100);
      return startDraw(e, 0);
    }
    if (tool !== 'select' || dim) return;
    e.stopPropagation();
    st.clickShape(id, e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey);
  };
  const onShapeDouble = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    const s = sc?.shapes[id];
    if (!s || tool !== 'select') return;
    // an extrusion or revolve opens its sketch (milestone 57); a group is worked inside
    if ((s.kind === 'extrude' || s.kind === 'revolve') && s.sketch && ui.stage === 'shape') {
      e.stopPropagation();
      useStore.getState().openSketch(id);
      return;
    }
    if (s.kind !== 'group') return;
    e.stopPropagation();
    useStore.getState().setSculpt({ focus: id });
    useStore.getState().select(null);
  };

  if (!sc || !kernelNow()) return null;
  const single = ids.length === 1 && !ghostIds.length ? sc.shapes[ids[0]] : undefined;
  const footBox = draw && draw.moved ? { x0: Math.min(draw.a.x, draw.b.x), x1: Math.max(draw.a.x, draw.b.x), z0: Math.min(draw.a.z, draw.b.z), z1: Math.max(draw.a.z, draw.b.z) } : null;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} visible={false} onPointerDown={(e) => tool === 'shapes' && e.intersections[0]?.object === e.object && startDraw(e, 0)} onClick={(e) => tool === 'select' && e.delta < 4 && e.intersections[0]?.object === e.object && useStore.getState().select(null)} data-testid="sculpt-floor">
        <planeGeometry args={[6000, 6000]} />
        <meshBasicMaterial />
      </mesh>
      {shown.map(({ id, dim }, i) =>
        sc.shapes[id] ? (
          <ShapeMesh key={id} d={d} id={id} index={sc.order.indexOf(id) >= 0 ? sc.order.indexOf(id) : i} dim={dim || ui.stage === 'make'} selected={ids.includes(id) && !ghostIds.includes(id)} ghost={ghostIds.includes(id)} onDown={onShapeDown(id, dim)} onDouble={onShapeDouble(id)} />
        ) : null,
      )}
      {footBox && (
        <mesh position={[(footBox.x0 + footBox.x1) / 2, draw!.y + 0.3, (footBox.z0 + footBox.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[Math.max(0.1, footBox.x1 - footBox.x0), Math.max(0.1, footBox.z1 - footBox.z0)]} />
          <meshBasicMaterial color={STAGE.ghost} transparent opacity={0.45} />
        </mesh>
      )}
      {ui.stage === 'shape' && tool === 'select' && !!ids.length && !ghostIds.length && <ShapeGizmo d={d} ids={ids} />}
      {ui.stage === 'shape' && tool === 'select' && !!ids.length && !ghostIds.length && <ScaleFrame d={d} ids={ids} />}
      {ui.dragKind && <TileDrag kind={ui.dragKind} />}
      {ghostIds.length === 1 && <ShapeGhostBar d={d} id={ghostIds[0]} />}
      {ui.stage === 'shape' && <SketchLayer />}
      {ui.stage === 'make' && <OutcomeLayer />}
    </>
  );
}

/** Frames the sculpture: on the fit button, and once when the design opens. */
function FitRig({ signal }: { signal: number }) {
  const { camera, controls, invalidate } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update(): void } | null; invalidate: () => void };
  useEffect(() => {
    const d = useStore.getState().design;
    const box = d.sculpt ? unionBox(d.sculpt.order.map((id) => worldBox(d.sculpt!, id))) : null;
    const min = box?.min ?? [-100, 0, -100], max = box?.max ?? [100, 60, 100];
    const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const r = Math.max(60, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
    const dir = new THREE.Vector3(0.55, 0.62, 1).normalize();
    camera.position.copy(c).addScaledVector(dir, (r * 1.4) / Math.tan((camera.fov * Math.PI) / 360));
    camera.lookAt(c);
    if (controls) {
      controls.target.copy(c);
      controls.update();
    }
    invalidate();
  }, [signal, !!controls]);
  return null;
}

/** Re-renders the canvas when the kernel arrives (frameloop is on demand); records the camera for an upright plane. */
function Invalidate() {
  const { invalidate, camera, controls } = useThree() as unknown as { invalidate: () => void; camera: THREE.Camera; controls: { target: THREE.Vector3 } | null };
  useFrame(() => {
    stageCamera.pos = [camera.position.x, camera.position.y, camera.position.z];
    if (controls) stageCamera.target = [controls.target.x, controls.target.y, controls.target.z];
  });
  const d = useStore((s) => s.design);
  const ready = useStore((s) => s.sculpt.ready);
  useEffect(() => invalidate(), [d, ready]);
  return null;
}

export function SculptView3D() {
  const t = useT();
  const ready = useStore((s) => s.sculpt.ready);
  const failed = useStore((s) => s.sculpt.failed);
  const tool = useStore((s) => s.tool);
  const stage = useStore((s) => s.sculpt.stage);
  const focus = useStore((s) => s.sculpt.focus);
  const focusName = useStore((s) => (s.sculpt.focus ? s.design.sculpt?.shapes[s.sculpt.focus] : undefined));
  const empty = useStore((s) => !s.design.sculpt?.order.length);
  const ghost = useStore((s) => s.pending?.kind === 'sculpt');
  const [fit, setFit] = useState(0);
  const overlay = useRef<HTMLDivElement>(null);
  const hint = ghost ? 'sculpt.hint.ghost' : tool === 'shapes' ? 'sculpt.hint.shapes' : tool === 'sketch' ? 'sketch.hint.draw' : tool === 'radius' ? 'radius.hint' : stage === 'make' ? 'waffle.hint' : empty ? 'sculpt.empty' : 'sculpt.hint.select';
  return (
    <div className="view3d sculpt-view" dir="ltr" data-testid="sculpt-view">
      <Canvas frameloop="demand" camera={{ position: [0, 260, 330], fov: 45, near: 1, far: 20000 }} dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }} className={`tool-${tool}`}>
        <color attach="background" args={[STAGE.bg]} />
        <hemisphereLight args={['#ffffff', '#cfd6e0', 1.35]} />
        <directionalLight position={[300, 600, 400]} intensity={1.5} />
        <directionalLight position={[-400, 250, -300]} intensity={0.45} />
        <Grid position={[0, -0.08, 0]} args={[2, 2]} cellSize={10} cellThickness={0.6} cellColor={STAGE.gridMinor} sectionSize={50} sectionThickness={1} sectionColor={STAGE.gridMajor} fadeDistance={2600} fadeStrength={1.4} infiniteGrid raycast={() => null} />
        <OverlayContext.Provider value={overlay}>{ready && <SculptScene />}</OverlayContext.Provider>
        <OrbitControls makeDefault enableDamping={false} />
        {ready && <FitRig signal={fit} />}
        <Invalidate />
      </Canvas>
      <div className="stage-overlay" ref={overlay} />
      {!ready && (
        <div className="sculpt-loading" role="status" data-testid="sculpt-loading">
          {failed ? t('sculpt.failed') : t('sculpt.loading')}
        </div>
      )}
      {focus && focusName && (
        <div className="sculpt-focus" dir="auto" data-testid="sculpt-focus">
          {t('sculpt.inGroup', { name: t('sculpt.kind.group') })}
          <button className="link" onClick={() => useStore.getState().setSculpt({ focus: null })} data-testid="leave-group">
            {t('sculpt.leaveGroup')}
          </button>
        </div>
      )}
      {stage === 'make' && <OutcomeBar />}
      <div className="view-dock" dir="auto">
        <div className="cluster">
          <button onClick={() => setFit((f) => f + 1)} title={t('view.fit')} aria-label={t('view.fit')} data-testid="fit-view">
            <Icon name="fit" />
          </button>
        </div>
      </div>
      <div className="view-hint" dir="auto">
        {t(hint as 'sculpt.empty')}
      </div>
    </div>
  );
}

export type { Shape3 };
