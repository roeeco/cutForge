import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { detailSel, selectedDetailIds, useStore, useT } from '../store/store';
import type { Design, Panel, V3 } from '../model/types';
import { edgeConnection, addRootPanel, addDetail, findDetail, newId, updateDetail, movePanel, parentConnection } from '../model/ops';
import { edgeLength, frameNormal, growFrame, toLocal } from '../model/frame';
import { detailBBox, detailContour, detailContours } from '../model/geometry';
import { snapBox, snapContext, snapPoint, type Guide } from '../model/snap';
import { SNAP_PX } from '../geom/types';
import { v3add, v3dot, v3mul } from '../geom/v3';
import { contourLinePoints, contourShapeGeometry, faceZ, flapGeometry, frameMatrix, panelGeometry } from './three-geom';
import { fmtNum } from '../i18n';
import { EdgeBar } from '../ui/EdgeBar';

const COLORS: Record<string, string> = { plywood: '#d9b98b', card: '#efe9dc', corrugated: '#c99f68' };
const GRID = 1; // mm grid used when no smart-snap target is near
const snap = (x: number) => Math.round(x / GRID) * GRID;

type Drag =
  | { kind: 'panel-draw'; start: V3; cur: V3 }
  | { kind: 'shape-draw'; panelId: string; id: string; start: { x: number; y: number }; plane: THREE.Plane }
  | { kind: 'detail-move'; ids: string[]; panelId: string; start: { x: number; y: number }; box: { minX: number; maxX: number; minY: number; maxY: number }; plane: THREE.Plane }
  | { kind: 'panel-move'; id: string; start: V3; plane: THREE.Plane };

function useRay() {
  const { camera, gl } = useThree();
  const rc = useMemo(() => new THREE.Raycaster(), []);
  return (clientX: number, clientY: number, plane: THREE.Plane): V3 | null => {
    const r = gl.domElement.getBoundingClientRect();
    rc.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = rc.ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? [hit.x, hit.y, hit.z] : null;
  };
}

function planeOf(p: Panel, point: THREE.Vector3) {
  return new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...frameNormal(p.frame)), point);
}
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

type Label = { text: string; x: number; y: number };

function Scene({ setLabel }: { setLabel: (s: Label | null) => void }) {
  const design = useStore((s) => s.design);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const grow = useStore((s) => s.grow);
  const { controls } = useThree() as unknown as { controls: { enabled: boolean } | null };
  const ray = useRay();
  const drag = useRef<Drag | null>(null);
  const [drawRect, setDrawRect] = useState<{ a: V3; b: V3 } | null>(null);
  const [guides, setGuides] = useState<GuideState | null>(null);
  const three = useThree();
  /** Snap tolerance in mm at a world point: a fixed number of screen pixels at any zoom. */
  const tolAt = (p: V3) => {
    const cam = three.camera;
    const hpx = three.gl.domElement.clientHeight || 600;
    if (cam instanceof THREE.OrthographicCamera) return (SNAP_PX * (cam.top - cam.bottom)) / cam.zoom / hpx;
    const pc = cam as THREE.PerspectiveCamera;
    const dist = pc.position.distanceTo(new THREE.Vector3(...p));
    return (SNAP_PX * 2 * dist * Math.tan((pc.fov * Math.PI) / 360)) / hpx;
  };

  const setControls = (on: boolean) => {
    if (controls) controls.enabled = on;
  };

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      const st = useStore.getState();
      if (g.kind === 'panel-draw') {
        const p = ray(ev.clientX, ev.clientY, GROUND);
        if (!p) return;
        g.cur = [snap(p[0]), 0, snap(p[2])];
        setDrawRect({ a: g.start, b: g.cur });
        setLabel({ text: `${fmtNum(Math.abs(g.cur[0] - g.start[0]))} × ${fmtNum(Math.abs(g.cur[2] - g.start[2]))}`, x: ev.clientX, y: ev.clientY });
      } else if (g.kind === 'shape-draw') {
        const panel = st.design.panels[g.panelId];
        const p = ray(ev.clientX, ev.clientY, g.plane);
        if (!panel || !p) return;
        const l = toLocal(panel.frame, p);
        const ctx = ev.altKey ? null : snapContext(st.txnBase ?? st.design, g.panelId, new Set([g.id]));
        const sn = ctx ? snapPoint(ctx, l, tolAt(p)) : null;
        const x = sn?.dx ? l.x + sn.dx : snap(l.x), y = sn?.dy ? l.y + sn.dy : snap(l.y);
        setGuides(sn && sn.guides.length ? { panelId: g.panelId, guides: sn.guides, targets: sn.targets } : null);
        const shape = st.tool === 'select' || st.tool === 'panel' ? 'rect' : st.tool;
        let w = Math.abs(x - g.start.x), h = Math.abs(y - g.start.y);
        let cx = (x + g.start.x) / 2, cy = (y + g.start.y) / 2;
        if (shape === 'circle') {
          w = h = Math.max(w, h);
          cx = g.start.x + (Math.sign(x - g.start.x) || 1) * w / 2;
          cy = g.start.y + (Math.sign(y - g.start.y) || 1) * w / 2;
        }
        if (w < 0.5 && h < 0.5) return;
        st.preview((d) => {
          addDetail(d, g.panelId, shape, st.shapeOp, cx, cy, w, h, g.id);
        });
        setLabel({ text: shape === 'circle' ? `Ø ${fmtNum(w)}` : `${fmtNum(w)} × ${fmtNum(h)}`, x: ev.clientX, y: ev.clientY });
      } else if (g.kind === 'detail-move') {
        const panel = st.design.panels[g.panelId];
        const p = ray(ev.clientX, ev.clientY, g.plane);
        if (!panel || !p) return;
        const l = toLocal(panel.frame, p);
        let dx = l.x - g.start.x, dy = l.y - g.start.y;
        const base = st.txnBase ?? st.design;
        const ctx = ev.altKey ? null : snapContext(base, g.panelId, new Set(g.ids));
        const sn = ctx ? snapBox(ctx, { minX: g.box.minX + dx, maxX: g.box.maxX + dx, minY: g.box.minY + dy, maxY: g.box.maxY + dy }, tolAt(p)) : null;
        dx = sn?.dx ? dx + sn.dx : snap(dx);
        dy = sn?.dy ? dy + sn.dy : snap(dy);
        setGuides(sn && sn.guides.length ? { panelId: g.panelId, guides: sn.guides, targets: sn.targets } : null);
        // the same movement in space, measured on each shape's own panel
        const wd = v3add(v3mul(panel.frame.u, dx), v3mul(panel.frame.v, dy));
        st.preview((d) => {
          for (const id of g.ids) {
            const f = findDetail(base, id);
            if (!f) continue;
            const lx = f.panel.id === g.panelId ? dx : v3dot(wd, f.panel.frame.u);
            const ly = f.panel.id === g.panelId ? dy : v3dot(wd, f.panel.frame.v);
            updateDetail(d, id, { cx: f.detail.cx + lx, cy: f.detail.cy + ly });
          }
        });
      } else if (g.kind === 'panel-move') {
        const p = ray(ev.clientX, ev.clientY, g.plane);
        if (!p) return;
        const dx = snap(p[0] - g.start[0]), dz = snap(p[2] - g.start[2]);
        st.preview((d) => movePanel(d, g.id, dx, dz));
      }
    };
    const up = () => {
      const g = drag.current;
      if (!g) return;
      drag.current = null;
      setLabel(null);
      setGuides(null);
      setControls(true);
      const st = useStore.getState();
      if (g.kind === 'panel-draw') {
        setDrawRect(null);
        const x0 = Math.min(g.start[0], g.cur[0]), x1 = Math.max(g.start[0], g.cur[0]);
        const z0 = Math.min(g.start[2], g.cur[2]), z1 = Math.max(g.start[2], g.cur[2]);
        if (x1 - x0 < 5 || z1 - z0 < 5) return;
        let id = '';
        st.apply((d) => {
          id = addRootPanel(d, x0, z1, x1 - x0, z1 - z0);
        });
        st.select({ kind: 'panel', id });
        st.setTool('select');
      } else if (g.kind === 'shape-draw') {
        const made = !!st.txnBase;
        st.commit();
        if (made) st.select(detailSel([g.id]));
      } else {
        st.commit();
      }
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && drag.current) {
        drag.current = null;
        setDrawRect(null);
        setLabel(null);
        setGuides(null);
        setControls(true);
        useStore.getState().cancel();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  });

  const begin = (e: ThreeEvent<PointerEvent>, g: Drag) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setControls(false);
    drag.current = g;
  };

  const onPanelDown = (p: Panel) => (e: ThreeEvent<PointerEvent>) => {
    if (tool === 'rect' || tool === 'circle' || tool === 'roundrect') {
      const l = toLocal(p.frame, [e.point.x, e.point.y, e.point.z]);
      const ctx = e.nativeEvent.altKey ? null : snapContext(design, p.id, new Set());
      const sn = ctx ? snapPoint(ctx, l, tolAt([e.point.x, e.point.y, e.point.z])) : null;
      const start = { x: sn?.dx ? l.x + sn.dx : snap(l.x), y: sn?.dy ? l.y + sn.dy : snap(l.y) };
      begin(e, { kind: 'shape-draw', panelId: p.id, id: newId('x'), start, plane: planeOf(p, e.point) });
    } else if (tool === 'select') {
      e.stopPropagation();
      useStore.getState().select({ kind: 'panel', id: p.id });
      if (!parentConnection(design, p.id) && e.button === 0) {
        setControls(false);
        drag.current = { kind: 'panel-move', id: p.id, start: [e.point.x, e.point.y, e.point.z], plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -e.point.y) };
      }
    }
  };

  const onDetailDown = (p: Panel, id: string) => (e: ThreeEvent<PointerEvent>) => {
    if (tool !== 'select') return onPanelDown(p)(e);
    const dt = p.details.find((x) => x.id === id);
    if (!dt) return;
    const st = useStore.getState();
    const ne = e.nativeEvent;
    if (ne.shiftKey || ne.ctrlKey || ne.metaKey) {
      e.stopPropagation();
      return st.clickDetail(id, true);
    }
    const cur = selectedDetailIds(st.selection);
    const group = cur.includes(id) ? cur : [id];
    if (!cur.includes(id)) st.select(detailSel([id]));
    const boxes = group.map((x) => findDetail(design, x)).filter((f) => f && f.panel.id === p.id).map((f) => detailBBox(f!.detail));
    const box = { minX: Math.min(...boxes.map((b) => b.minX)), maxX: Math.max(...boxes.map((b) => b.maxX)), minY: Math.min(...boxes.map((b) => b.minY)), maxY: Math.max(...boxes.map((b) => b.maxY)) };
    const l = toLocal(p.frame, [e.point.x, e.point.y, e.point.z]);
    begin(e, { kind: 'detail-move', ids: group, panelId: p.id, start: l, box, plane: planeOf(p, e.point) });
  };

  const onGroundDown = (e: ThreeEvent<PointerEvent>) => {
    if (tool !== 'panel') return;
    const p: V3 = [snap(e.point.x), 0, snap(e.point.z)];
    begin(e, { kind: 'panel-draw', start: p, cur: p });
  };

  const { camera, gl } = useThree();
  useEffect(() => {
    // Test hook: screen position of a point on a panel (local mm coordinates).
    const w = window as unknown as { __cutforge?: Record<string, unknown> };
    if (!w.__cutforge) return;
    w.__cutforge.project = (panelId: string, x: number, y: number, top = true) => {
      const p = useStore.getState().design.panels[panelId];
      if (!p) return null;
      const z = faceZ(p, useStore.getState().design.material.thickness)[top ? 1 : 0];
      const v = new THREE.Vector3(x, y, z).applyMatrix4(frameMatrix(p.frame)).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    w.__cutforge.camera = () => ({ position: camera.position.toArray().map((x) => Math.round(x * 1000) / 1000), ortho: camera instanceof THREE.OrthographicCamera });
  }, [camera, gl]);

  const sel = selection;
  const selEdge = sel?.kind === 'edge' ? sel : null;

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[300, 600, 400]} intensity={1.1} />
      <directionalLight position={[-400, 200, -300]} intensity={0.35} />
      <gridHelper args={[2000, 200, '#b9c2cc', '#e2e7ec']} position={[0, -0.05, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={onGroundDown} onClick={(e) => tool === 'select' && e.delta < 4 && useStore.getState().select(null)} visible={false}>
        <planeGeometry args={[4000, 4000]} />
        <meshBasicMaterial />
      </mesh>
      {design.order.map((id) => {
        const p = design.panels[id];
        return p ? (
          <PanelObject
            key={id}
            d={design}
            p={p}
            selected={sel?.kind === 'panel' && sel.id === id}
            selDetails={selectedDetailIds(sel)}
            selEdge={selEdge && selEdge.panelId === id ? selEdge.edge : null}
            tool={tool}
            onPanelDown={onPanelDown(p)}
            onDetailDown={(did) => onDetailDown(p, did)}
            onDouble={() => useStore.getState().openSolo(id)}
          />
        ) : null;
      })}
      <Flaps d={design} />
      {guides && design.panels[guides.panelId] && <SnapGuides p={design.panels[guides.panelId]} t={design.material.thickness} g={guides} />}
      {selEdge && <GrowGhost d={design} panelId={selEdge.panelId} edge={selEdge.edge} height={grow.height} angle={grow.angle} dir={grow.dir} />}
      {drawRect && (
        <mesh position={[(drawRect.a[0] + drawRect.b[0]) / 2, 0.2, (drawRect.a[2] + drawRect.b[2]) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[Math.max(0.1, Math.abs(drawRect.b[0] - drawRect.a[0])), Math.max(0.1, Math.abs(drawRect.b[2] - drawRect.a[2]))]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.35} />
        </mesh>
      )}
      <OrbitControls makeDefault enableDamping={false} />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} />
      </GizmoHelper>
    </>
  );
}

function PanelObject(props: {
  d: Design;
  p: Panel;
  selected: boolean;
  selDetails: string[];
  selEdge: number | null;
  tool: string;
  onPanelDown: (e: ThreeEvent<PointerEvent>) => void;
  onDetailDown: (id: string) => (e: ThreeEvent<PointerEvent>) => void;
  onDouble: () => void;
}) {
  const { d, p, selected, selDetails, selEdge, tool } = props;
  const t = d.material.thickness;
  const geom = useMemo(() => panelGeometry(d, p), [d.material, d.connections, p]);
  const matrix = useMemo(() => frameMatrix(p.frame), [p.frame]);
  const [z0, z1] = faceZ(p, t);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  useEffect(() => () => geom.dispose(), [geom]);
  const edgeBoxes = [0, 1, 2, 3].map((e) => {
    const L = edgeLength(p, e);
    const mid = (z0 + z1) / 2;
    const pos: V3 = e === 0 ? [p.w / 2, 0, mid] : e === 1 ? [p.w, p.h / 2, mid] : e === 2 ? [p.w / 2, p.h, mid] : [0, p.h / 2, mid];
    const size: V3 = e % 2 === 0 ? [L, 3, t + 1] : [3, L, t + 1];
    return { e, pos, size };
  });
  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh
        geometry={geom}
        onPointerDown={props.onPanelDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          props.onDouble();
        }}
        userData={{ panelId: p.id }}
      >
        <meshStandardMaterial color={COLORS[d.material.kind]} emissive={selected ? '#2563eb' : '#000000'} emissiveIntensity={selected ? 0.35 : 0} roughness={0.85} metalness={0} />
      </mesh>
      {p.details.map((dt) => {
        const isSel = selDetails.includes(dt.id);
        const color = isSel ? '#2563eb' : dt.op === 'cut' ? '#7a4b1c' : dt.op === 'engrave' ? '#222222' : '#1d4ed8';
        return (
          <group key={dt.id}>
            {detailContours(dt).map((c, i) => (
              <group key={i}>
                <DetailLines c={c} zs={[z0 - 0.15, z1 + 0.15]} color={color} />
                <DetailHit c={c} z={z1 + 0.3} onDown={props.onDetailDown(dt.id)} />
                <DetailHit c={c} z={z0 - 0.3} onDown={props.onDetailDown(dt.id)} />
              </group>
            ))}
          </group>
        );
      })}
      {tool === 'select' &&
        edgeBoxes.map(({ e, pos, size }) => {
          const active = selEdge === e || hoverEdge === e;
          return (
            <mesh
              key={e}
              position={pos}
              onPointerOver={(ev) => (ev.stopPropagation(), setHoverEdge(e))}
              onPointerOut={() => setHoverEdge((h) => (h === e ? null : h))}
              onPointerDown={(ev) => {
                if (ev.button !== 0) return;
                ev.stopPropagation();
                useStore.getState().select({ kind: 'edge', panelId: p.id, edge: e });
              }}
            >
              <boxGeometry args={size} />
              <meshBasicMaterial color={selEdge === e ? '#2563eb' : '#f97316'} transparent opacity={active ? 0.85 : 0} depthWrite={false} />
            </mesh>
          );
        })}
    </group>
  );
}

type GuideState = { panelId: string; guides: Guide[]; targets: { x: number; y: number }[] };

/** Snap guides and the active target, drawn on the panel's outer faces. */
function SnapGuides({ p, t, g }: { p: Panel; t: number; g: GuideState }) {
  const [z0, z1] = faceZ(p, t);
  const obj = useMemo(() => {
    const grp = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: '#e11d48', depthTest: false });
    for (const z of [z0 - 0.4, z1 + 0.4]) {
      for (const gd of g.guides) grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(gd.a.x, gd.a.y, z), new THREE.Vector3(gd.b.x, gd.b.y, z)]), mat));
      for (const tp of g.targets) {
        const r = 2;
        grp.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 16 }, (_, i) => new THREE.Vector3(tp.x + r * Math.cos((i * Math.PI) / 8), tp.y + r * Math.sin((i * Math.PI) / 8), z))), mat));
      }
    }
    grp.renderOrder = 10;
    return grp;
  }, [g, z0, z1]);
  useEffect(() => () => obj.traverse((o) => (o as THREE.Line).geometry?.dispose()), [obj]);
  return (
    <group matrixAutoUpdate={false} matrix={frameMatrix(p.frame)}>
      <primitive object={obj} raycast={() => null} />
    </group>
  );
}

function Flaps({ d }: { d: Design }) {
  const items = useMemo(() => {
    const out: { key: string; geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
    for (const c of Object.values(d.connections)) {
      c.geom?.flaps3d.forEach((f, i) => {
        const p = d.panels[f.panelId];
        if (p) out.push({ key: `${c.id}:${i}`, geom: flapGeometry(p, f.poly, f.z0, f.z1), matrix: frameMatrix(p.frame) });
      });
    }
    return out;
  }, [d.connections, d.panels]);
  useEffect(() => () => items.forEach((x) => x.geom.dispose()), [items]);
  return (
    <>
      {items.map((x) => (
        <group key={x.key} matrixAutoUpdate={false} matrix={x.matrix}>
          <mesh geometry={x.geom} raycast={() => null}>
            <meshStandardMaterial color="#b88a52" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function DetailLines({ c, zs, color }: { c: ReturnType<typeof detailContour>; zs: number[]; color: string }) {
  const lines = useMemo(
    () => zs.map((z) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(contourLinePoints(c, z)), new THREE.LineBasicMaterial({ color }))),
    [c, color, zs[0], zs[1]],
  );
  useEffect(() => () => lines.forEach((l) => (l.geometry.dispose(), (l.material as THREE.Material).dispose())), [lines]);
  return (
    <>
      {lines.map((l, i) => (
        <primitive key={i} object={l} raycast={() => null} />
      ))}
    </>
  );
}

function DetailHit({ c, z, onDown }: { c: ReturnType<typeof detailContour>; z: number; onDown: (e: ThreeEvent<PointerEvent>) => void }) {
  const g = useMemo(() => contourShapeGeometry(c), [c]);
  useEffect(() => () => g.dispose(), [g]);
  return (
    <mesh geometry={g} position={[0, 0, z]} onPointerDown={onDown}>
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function GrowGhost({ d, panelId, edge, height, angle, dir }: { d: Design; panelId: string; edge: number; height: number; angle: number; dir: 'up' | 'down' }) {
  const parent = d.panels[panelId];
  const free = parent && !edgeConnection(d, panelId, edge);
  const ghost = useMemo(() => {
    if (!parent || !free) return null;
    const frame = growFrame(parent, edge, angle, dir, d.material.thickness);
    const p: Panel = { id: 'ghost', name: '', w: edgeLength(parent, edge), h: height, frame, details: [] };
    return { p, geom: panelGeometry(d, p, { joints: false }), matrix: frameMatrix(frame) };
  }, [d, parent, free, edge, angle, dir, height]);
  useEffect(() => () => ghost?.geom.dispose(), [ghost]);
  if (!ghost) return null;
  return (
    <group matrixAutoUpdate={false} matrix={ghost.matrix}>
      <mesh geometry={ghost.geom} raycast={() => null}>
        <meshStandardMaterial color="#60a5fa" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** 3D camera kept while another view is open, so returning restores the same framing. */
const savedCam: { ortho: boolean; position?: [number, number, number]; target?: [number, number, number]; zoom?: number } = { ortho: false };

function CameraKeeper() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const { camera, controls } = get() as unknown as { camera: THREE.Camera & { zoom: number; updateProjectionMatrix(): void }; controls: { target: THREE.Vector3; update(): void } | null };
        if (!savedCam.position) return;
        camera.position.set(...savedCam.position);
        if (savedCam.zoom && camera instanceof THREE.OrthographicCamera) camera.zoom = savedCam.zoom;
        camera.updateProjectionMatrix();
        if (controls && savedCam.target) {
          controls.target.set(...savedCam.target);
          controls.update();
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      const { camera, controls } = get() as unknown as { camera: THREE.Camera & { zoom: number }; controls: { target: THREE.Vector3 } | null };
      savedCam.position = camera.position.toArray() as [number, number, number];
      savedCam.zoom = camera.zoom;
      if (controls) savedCam.target = controls.target.toArray() as [number, number, number];
    };
  }, []);
  return null;
}

function CameraRig({ ortho, fitSignal }: { ortho: boolean; fitSignal: number }) {
  const { camera, set, size, controls } = useThree() as unknown as {
    camera: THREE.Camera & { zoom: number; updateProjectionMatrix(): void };
    set: (s: { camera: THREE.Camera }) => void;
    size: { width: number; height: number };
    controls: { target: THREE.Vector3; update(): void } | null;
  };
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!ortho) return;
    }
    const target = controls?.target ?? new THREE.Vector3();
    const dir = new THREE.Vector3().subVectors(camera.position, target).normalize();
    const fov = 45;
    const tanH = Math.tan((fov * Math.PI) / 360);
    if (ortho && camera instanceof THREE.PerspectiveCamera) {
      const dist = camera.position.distanceTo(target);
      const visH = 2 * dist * tanH;
      const c = new THREE.OrthographicCamera(-size.width / 2, size.width / 2, size.height / 2, -size.height / 2, -20000, 20000);
      c.position.copy(target).addScaledVector(dir, Math.max(dist, 2000));
      c.quaternion.copy(camera.quaternion);
      c.up.copy(camera.up);
      c.zoom = size.height / visH;
      c.updateProjectionMatrix();
      set({ camera: c });
    } else if (!ortho && camera instanceof THREE.OrthographicCamera) {
      const visH = size.height / camera.zoom;
      const dist = visH / (2 * tanH);
      const c = new THREE.PerspectiveCamera(fov, size.width / size.height, 1, 20000);
      c.position.copy(target).addScaledVector(dir, dist);
      c.quaternion.copy(camera.quaternion);
      c.up.copy(camera.up);
      c.updateProjectionMatrix();
      set({ camera: c });
    }
  }, [ortho]);
  useEffect(() => {
    if (!fitSignal) return;
    const d = useStore.getState().design;
    const box = new THREE.Box3();
    for (const id of d.order) {
      const p = d.panels[id];
      if (!p) continue;
      const m = frameMatrix(p.frame);
      for (const [x, y] of [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]) box.expandByPoint(new THREE.Vector3(x, y, 0).applyMatrix4(m));
    }
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(200, 0, 200));
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(50, box.getSize(new THREE.Vector3()).length() / 2);
    const target = controls?.target ?? new THREE.Vector3();
    const dir = new THREE.Vector3().subVectors(camera.position, target).normalize();
    target.copy(center);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.position.copy(center).addScaledVector(dir, 2000);
      camera.zoom = Math.min(size.width, size.height) / (radius * 2.4);
    } else {
      camera.position.copy(center).addScaledVector(dir, (radius * 1.3) / Math.tan((45 * Math.PI) / 360));
    }
    camera.updateProjectionMatrix();
    controls?.update();
  }, [fitSignal]);
  return null;
}

export function View3D() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const empty = useStore((s) => s.design.order.length === 0);
  const [ortho, setOrthoState] = useState(savedCam.ortho);
  const setOrtho = (f: (o: boolean) => boolean) =>
    setOrthoState((o) => {
      const n = f(o);
      savedCam.ortho = n;
      return n;
    });
  const [fit, setFit] = useState(0);
  const [label, setLabel] = useState<Label | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const selection = useStore((s) => s.selection);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'o' || e.key === 'O') setOrtho((o) => !o);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const hint = tool === 'select' ? 'tool.hint.select' : tool === 'panel' ? 'tool.hint.panel' : 'tool.hint.shape';
  return (
    <div className="view3d" dir="ltr" data-testid="view3d" ref={wrap}>
      <Canvas camera={{ position: [0, 260, 330], fov: 45, near: 1, far: 20000 }} dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }} className={`tool-${tool}`}>
        <color attach="background" args={['#f4f6f8']} />
        <Scene setLabel={setLabel} />
        <CameraRig ortho={ortho} fitSignal={fit} />
        <CameraKeeper />
      </Canvas>
      {label && wrap.current && (
        <div
          className="dim-label"
          style={{ position: 'absolute', left: label.x - wrap.current.getBoundingClientRect().left, top: label.y - wrap.current.getBoundingClientRect().top, pointerEvents: 'none' }}
        >
          {label.text} {t('unit.mm')}
        </div>
      )}
      <div className="view-controls" dir="auto">
        <button onClick={() => setOrtho((o) => !o)} title="O" data-testid="toggle-ortho">
          {ortho ? t('view.ortho') : t('view.persp')}
        </button>
        <button onClick={() => setFit((f) => f + 1)}>{t('view.fit')}</button>
      </div>
      <div className="view-hint" dir="auto">{empty && tool === 'select' ? t('view.empty3d') : t(hint)}</div>
      {selection?.kind === 'edge' && <EdgeBar panelId={selection.panelId} edge={selection.edge} />}
    </div>
  );
}
