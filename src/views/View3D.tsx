import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, GizmoHelper, GizmoViewcube, Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { detailSel, growKind, selectedDetailIds, useStore, useT, type Quality } from '../store/store';
import type { Connection, Design, Frame, P2, Panel, V3 } from '../model/types';
import { addText, edgeConnection, MIN_PANEL, addRootPanel, addDetail, findDetail, newId, updateDetail, movePanel, parentConnection, setPanelSize, seatingOf, defaultOffset, setConnection } from '../model/ops';
import { checkHinge, fromHinge, hingeOf } from '../model/hinge';
import { hingeText } from '../ui/AngleDial';
import { inwardWorld } from '../model/seams';
import { edgeLength, edgeLocal, frameNormal, growFrame, matDir, toLocal, toWorld } from '../model/frame';
import { detailBBox, detailContour, detailContours } from '../model/geometry';
import { snapBox, snapContext, snapPoint, type Guide } from '../model/snap';
import { SNAP_PX } from '../geom/types';
import { v3add, v3dot, v3mul } from '../geom/v3';
import { contourLinePoints, contourShapeGeometry, faceZ, flapGeometry, frameMatrix, panelGeometry } from './three-geom';
import { fmtNum, translate } from '../i18n';
import { STAGE, partColors } from './palette';
import { foldDisplay, type Bend } from './foldView';
import { AngleArc, DimLabel, DimLine, OverlayContext, PushPull, StageHtml, mmPerPx } from './widgets';
import { Icon } from '../ui/icons';
import { FoldSlider } from '../ui/Inspector';
import { netGroups } from '../model/pieces';
import { panelLabel } from '../model/names';
import { Segmented } from '../ui/NumField';
import { FACE, findEdge, panelEdges, segLength, type EdgeSeg } from '../model/edges';
import { closedAt, OutlineHandles, PolygonTool, PolygonToolCard, type PolyToolHandle } from './polyTool';
import { MIN_EDGE, trayKinds, trayOf, wallHeight } from '../model/trays';
import { isOutlineShape } from '../model/outline';
import { allFoldOvers } from '../model/foldover';
import { FoldOverObject } from './foldOver3d';
import { panelsCutBy, removedByCut, throughHits, type ThroughHit } from '../model/through';
import polygonClipping from 'polygon-clipping';
import { polygonContour } from '../geom/vec';
import { clampToRanges, EDGE_GAP_PX, EDGE_MIN_HIT_PX, edgeGaps, edgeHitRanges, pushPullAnchors } from './edgeGaps';

const GRID = 1; // mm grid used when no smart-snap target is near
const snap = (x: number) => Math.round(x / GRID) * GRID;

type Drag =
  | { kind: 'panel-draw'; start: V3; cur: V3 }
  | { kind: 'shape-draw'; panelId: string; id: string; start: { x: number; y: number }; plane: THREE.Plane }
  | { kind: 'detail-move'; ids: string[]; panelId: string; start: { x: number; y: number }; box: { minX: number; maxX: number; minY: number; maxY: number }; plane: THREE.Plane }
  | { kind: 'panel-move'; id: string; start: V3; plane: THREE.Plane };

/** Text tool: place a text shape where the student clicked, select it, back to Select. */
export function placeText(panelId: string, x: number, y: number) {
  const st = useStore.getState();
  let id: string | null = null;
  const value = translate(st.lang, 'text.default');
  st.apply((d) => void (id = addText(d, panelId, Math.round(x), Math.round(y), value, 'engrave')));
  if (id) st.select(detailSel([id]));
  st.setTool('select');
}

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
const IDM = new THREE.Matrix4();
const NO_RAYCAST = () => null;

/** World point of a panel-local point (x, y, depth z into the material), through a display transform. */
function W(m: THREE.Matrix4, f: Frame, x: number, y: number, z = 0): V3 {
  return new THREE.Vector3(...toWorld(f, x, y, z)).applyMatrix4(m).toArray() as V3;
}
function Wdir(m: THREE.Matrix4, v: V3): V3 {
  return new THREE.Vector3(...v).transformDirection(m).toArray() as V3;
}

type Label = { text: string; x: number; y: number };

function Scene({ setLabel, quality }: { setLabel: (s: Label | null) => void; quality: 'simple' | 'rich' }) {
  const t = useT();
  const design = useStore((s) => s.design);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const grow = useStore((s) => s.grow);
  const prefs = useStore((s) => s.viewPrefs);
  const foldT = useStore((s) => s.foldT);
  const hoverPart = useStore((s) => s.hoverPart);
  const openJoint = useStore((s) => s.openJoint);
  const inTxn = useStore((s) => !!s.txnBase);
  const { controls } = useThree() as unknown as { controls: { enabled: boolean } | null };
  const ray = useRay();
  const drag = useRef<Drag | null>(null);
  const polyRef = useRef<PolyToolHandle>(null);
  const editOutline = useStore((s) => s.editOutline);
  const extrude = useStore((s) => s.extrude);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [drawRect, setDrawRect] = useState<{ a: V3; b: V3 } | null>(null);
  const [guides, setGuides] = useState<GuideState | null>(null);
  const three = useThree();
  const display = useMemo(() => foldDisplay(design, foldT), [design, foldT]);
  const folded = foldT < 0.999;
  /** Snap tolerance in mm at a world point: a fixed number of screen pixels at any zoom. */
  const tolAt = (p: V3) => SNAP_PX * mmPerPx(three.camera, three.gl.domElement.clientHeight || 600, new THREE.Vector3(...p));

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
          cx = g.start.x + ((Math.sign(x - g.start.x) || 1) * w) / 2;
          cy = g.start.y + ((Math.sign(y - g.start.y) || 1) * w) / 2;
        }
        if (w < 0.5 && h < 0.5) return;
        st.preview((d) => {
          addDetail(d, g.panelId, shape, st.shapeOp, cx, cy, w, h, g.id, st.shapeThrough);
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
      setDrawingId(null);
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
    if (folded) {
      // while a net is unfolded the parts can be looked at and selected, not edited
      if (e.button !== 0) return;
      e.stopPropagation();
      useStore.getState().select({ kind: 'panel', id: p.id });
      return;
    }
    if (tool === 'polygon') return polyRef.current?.start(e, p);
    if (tool === 'text') {
      if (e.button !== 0) return;
      e.stopPropagation();
      const l = toLocal(p.frame, [e.point.x, e.point.y, e.point.z]);
      placeText(p.id, l.x, l.y);
      return;
    }
    if (tool === 'rect' || tool === 'circle' || tool === 'roundrect') {
      const l = toLocal(p.frame, [e.point.x, e.point.y, e.point.z]);
      const ctx = e.nativeEvent.altKey ? null : snapContext(design, p.id, new Set());
      const sn = ctx ? snapPoint(ctx, l, tolAt([e.point.x, e.point.y, e.point.z])) : null;
      const start = { x: sn?.dx ? l.x + sn.dx : snap(l.x), y: sn?.dy ? l.y + sn.dy : snap(l.y) };
      const nid = newId('x');
      setDrawingId(nid);
      begin(e, { kind: 'shape-draw', panelId: p.id, id: nid, start, plane: planeOf(p, e.point) });
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
    if (tool !== 'select' || folded) return onPanelDown(p)(e);
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
    if (tool === 'polygon') return polyRef.current?.start(e, null);
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
    w.__cutforge.projectWorld = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    w.__cutforge.camera = () => ({ position: camera.position.toArray().map((x) => Math.round(x * 1000) / 1000), ortho: camera instanceof THREE.OrthographicCamera });
  }, [camera, gl]);

  const sel = selection;
  // the through-cut being drawn or selected: the panels it reaches are highlighted, with a count
  const activeThrough = useMemo(() => {
    const id = drawingId ?? (sel?.kind === 'detail' && sel.ids.length === 1 ? sel.id : null);
    const f = id ? findDetail(design, id) : null;
    return f && f.detail.op === 'cut' && f.detail.through ? f : null;
  }, [drawingId, sel, design]);
  const cutHits = useMemo(() => (activeThrough ? new Set(panelsCutBy(design, activeThrough.detail.id)) : null), [activeThrough, design]);
  const throughMap = useMemo(() => throughHits(design), [design]);
  const foldOvers = useMemo(() => allFoldOvers(design), [design]);
  const selEdge = sel?.kind === 'edge' ? sel : null;
  const selPanel = sel?.kind === 'panel' ? sel.id : null;
  const selAlso = sel?.kind === 'panel' ? (sel.also ?? []) : [];
  const selDetailPanels = useMemo(() => new Set(selectedDetailIds(sel).map((id) => findDetail(design, id)?.panel.id)), [sel, design]);
  const focus = selPanel;
  const selGrown = selPanel ? parentConnection(design, selPanel) : undefined;
  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    for (const id of design.order) {
      const p = design.panels[id];
      if (!p) continue;
      const m = display.xf.get(id) ?? IDM;
      for (const [x, y] of [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]) box.expandByPoint(new THREE.Vector3(...W(m, p.frame, x, y)));
    }
    return box;
  }, [design, display]);
  // contact shadow: re-rendered once after each finished edit, not during drags
  const [shadowKey, setShadowKey] = useState(0);
  useEffect(() => {
    if (!inTxn) setShadowKey((k) => k + 1);
  }, [design, foldT, inTxn]);
  const sc = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  const ss = bounds.isEmpty() ? 300 : Math.max(200, bounds.getSize(new THREE.Vector3()).length() * 1.8);

  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfd6e0', 1.35]} />
      <directionalLight position={[300, 600, 400]} intensity={1.5} />
      <directionalLight position={[-400, 250, -300]} intensity={0.45} />
      <Grid
        position={[0, -0.08, 0]}
        args={[2, 2]}
        cellSize={10}
        cellThickness={0.6}
        cellColor={STAGE.gridMinor}
        sectionSize={50}
        sectionThickness={1}
        sectionColor={STAGE.gridMajor}
        fadeDistance={2600}
        fadeStrength={1.4}
        infiniteGrid
        raycast={() => null}
        userData={{ noAO: true }}
      />
      {!bounds.isEmpty() && <ContactShadows key={shadowKey} frames={1} position={[sc.x, -0.05, sc.z]} scale={ss} far={Math.max(80, ss / 4)} blur={2.4} opacity={0.42} resolution={quality === 'rich' ? 1024 : 512} color="#2b3442" />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={onGroundDown} onClick={(e) => tool === 'select' && e.delta < 4 && performance.now() - closedAt.t > 600 && e.intersections[0]?.object === e.object && useStore.getState().select(null)} visible={false}>
        <planeGeometry args={[4000, 4000]} />
        <meshBasicMaterial />
      </mesh>
      {design.order.map((id, index) => {
        const p = design.panels[id];
        if (!p) return null;
        const selected = selPanel === id || selAlso.includes(id) || selDetailPanels.has(id) || selEdge?.panelId === id;
        return (
          <PanelObject
            key={id}
            d={design}
            p={p}
            index={index}
            m={display.xf.get(id) ?? IDM}
            selected={selPanel === id || selAlso.includes(id)}
            emphasis={selected ? 1 : sel ? -1 : hoverPart === id ? 0.5 : 0}
            hover={hoverPart === id}
            outlines={prefs.outlines}
            showEdges={tool === 'select' && !folded && (selPanel === id || hoverPart === id)}
            selDetails={selectedDetailIds(sel)}
            selEdge={selEdge && selEdge.panelId === id ? selEdge.edge : null}
            tool={tool}
            folded={folded}
            onPanelDown={onPanelDown(p)}
            onDetailDown={(did) => onDetailDown(p, did)}
            onDouble={() => useStore.getState().openSolo(id)}
            inert={!!editOutline}
            cutHit={!!cutHits?.has(id)}
            through={throughMap.get(id)}
          />
        );
      })}
      <Flaps d={design} xf={display.xf} />
      {foldOvers.map((fo) => (
        <FoldOverObject key={fo.f.id} d={design} p={design.panels[fo.panelId]} g={fo.g} m={display.xf.get(fo.panelId) ?? IDM} foldT={foldT} index={design.order.indexOf(fo.panelId)} />
      ))}
      {display.bends.map((b) => (
        <BendBead key={b.id} b={b} d={design} index={design.order.indexOf(b.panelId)} outlines={prefs.outlines} />
      ))}
      {guides && design.panels[guides.panelId] && <SnapGuides p={design.panels[guides.panelId]} t={design.material.thickness} g={guides} />}
      {selEdge && !folded && <GrowGhost d={design} panelId={selEdge.panelId} edge={selEdge.edge} m={display.xf.get(selEdge.panelId) ?? IDM} />}
      {selPanel && design.panels[selPanel] && tool === 'select' && !folded && editOutline !== selPanel && (
        <PanelWidgets d={design} p={design.panels[selPanel]} m={display.xf.get(selPanel) ?? IDM} dims={prefs.dims} />
      )}
      {activeThrough && (
        <StageHtml position={W(display.xf.get(activeThrough.panel.id) ?? IDM, activeThrough.panel.frame, activeThrough.detail.cx, activeThrough.detail.cy, design.material.thickness)} style={{ pointerEvents: 'none' }}>
          <span className="through-badge" data-testid="through-count">
            {t('through.cuts', { n: cutHits?.size ?? 0 })}
          </span>
        </StageHtml>
      )}
      {tool === 'polygon' && !folded && <PolygonTool ref={polyRef} setControls={setControls} />}
      {extrude && design.panels[extrude.baseId] && !folded && <TrayGhost d={design} baseId={extrude.baseId} height={extrude.height} m={display.xf.get(extrude.baseId) ?? IDM} />}
      {selPanel && editOutline === selPanel && tool === 'select' && !folded && design.panels[selPanel] && (
        <OutlineHandles p={design.panels[selPanel]} m={display.xf.get(selPanel) ?? IDM} t={design.material.thickness} />
      )}
      {selPanel && tool === 'select' && !folded && selGrown && editOutline !== selPanel && <HingeWidget d={design} c={selGrown} m={display.xf.get(selGrown.a.panelId) ?? IDM} />}
      {!folded && <SeamPills d={design} focus={prefs.joints ? focus : null} xf={display.xf} openJoint={openJoint} />}
      {drawRect && (
        <mesh position={[(drawRect.a[0] + drawRect.b[0]) / 2, 0.2, (drawRect.a[2] + drawRect.b[2]) / 2]} rotation={[-Math.PI / 2, 0, 0]} userData={{ noAO: true }}>
          <planeGeometry args={[Math.max(0.1, Math.abs(drawRect.b[0] - drawRect.a[0])), Math.max(0.1, Math.abs(drawRect.b[2] - drawRect.a[2]))]} />
          <meshBasicMaterial color={STAGE.selected} transparent opacity={0.35} />
        </mesh>
      )}
      <OrbitControls makeDefault enableDamping={false} />
      <GizmoHelper alignment="bottom-right" margin={[78, 128]} renderPriority={quality === 'rich' ? 2 : 1}>
        <GizmoViewcube
          faces={[t('cube.right'), t('cube.left'), t('cube.top'), t('cube.bottom'), t('cube.front'), t('cube.back')]}
          font='600 26px "Rubik UI", system-ui, sans-serif'
          color="#ffffff"
          hoverColor="#bdeee8"
          textColor="#334155"
          strokeColor="#94a3b8"
          opacity={1}
        />
      </GizmoHelper>
      {quality === 'rich' && <AOEffects />}
    </>
  );
}

/** Ambient occlusion (Rich quality): GTAO over the scene, widgets and lines left out. */
function AOEffects() {
  const { gl, scene, camera, size, invalidate } = useThree();
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, size.width, size.height);
    ao.blendIntensity = 0.85;
    ao.updateGtaoMaterial({ radius: 14, distanceExponent: 1.5, thickness: 8, scale: 1, samples: 12 });
    ao.updatePdMaterial({ radius: 6, samples: 12 });
    // keep translucent helpers and on-top widgets out of the depth/normal pass
    const hidden: THREE.Object3D[] = [];
    const ov = (ao as unknown as { _overrideVisibility: () => void })._overrideVisibility.bind(ao);
    const rv = (ao as unknown as { _restoreVisibility: () => void })._restoreVisibility.bind(ao);
    (ao as unknown as { _overrideVisibility: () => void })._overrideVisibility = () => {
      ov();
      scene.traverse((o) => {
        if (o.visible && (o.userData.noAO || ((o as THREE.Mesh).material as THREE.Material | undefined)?.transparent)) {
          o.visible = false;
          hidden.push(o);
        }
      });
    };
    (ao as unknown as { _restoreVisibility: () => void })._restoreVisibility = () => {
      rv();
      hidden.forEach((o) => (o.visible = true));
      hidden.length = 0;
    };
    c.addPass(ao);
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.setSize(size.width, size.height);
    composer.setPixelRatio(gl.getPixelRatio());
    // on-demand rendering: draw again now that the passes exist
    invalidate();
    const id = setTimeout(invalidate, 50);
    return () => clearTimeout(id);
  }, [composer, size, gl]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame(() => composer.render(), 1);
  return null;
}

function PanelObject(props: {
  d: Design;
  p: Panel;
  index: number;
  m: THREE.Matrix4;
  selected: boolean;
  /** 1 selected, 0.5 hovered, 0 normal, −1 dimmed (something else is selected). */
  emphasis: number;
  hover: boolean;
  outlines: boolean;
  showEdges: boolean;
  selDetails: string[];
  selEdge: string | null;
  tool: string;
  folded: boolean;
  onPanelDown: (e: ThreeEvent<PointerEvent>) => void;
  onDetailDown: (id: string) => (e: ThreeEvent<PointerEvent>) => void;
  onDouble: () => void;
  /** Outline editing: parts do not catch the pointer, so the vertex handles always can. */
  inert?: boolean;
  /** Reached by the through-cut being drawn or selected. */
  cutHit?: boolean;
  /** Through-cuts from other panels that reach this one. */
  through?: ThroughHit;
}) {
  const { d, p, selDetails, selEdge, tool } = props;
  const t = d.material.thickness;
  const geom = useMemo(() => panelGeometry(d, p), [d.material, d.connections, p, props.through]);
  const removed = useMemo(() => !!props.through && removedByCut(d, p.id), [d, p.id, props.through]);
  const outline = useMemo(() => (props.outlines ? new THREE.EdgesGeometry(geom, 25) : null), [geom, props.outlines]);
  const matrix = useMemo(() => props.m.clone().multiply(frameMatrix(p.frame)), [p.frame, props.m]);
  const [z0, z1] = faceZ(p, t);
  useEffect(() => () => geom.dispose(), [geom]);
  useEffect(() => () => outline?.dispose(), [outline]);
  const lift = props.emphasis === 1 ? 0.07 : props.emphasis === 0.5 ? 0.025 : props.emphasis === -1 ? -0.03 : 0;
  const mats = useMemo(() => {
    const c = partColors(d.material.kind, props.index, lift);
    return [new THREE.MeshStandardMaterial({ color: c.face, roughness: 0.88, metalness: 0 }), new THREE.MeshStandardMaterial({ color: c.edge, roughness: 0.92, metalness: 0 })];
  }, [d.material.kind, props.index, lift]);
  useEffect(() => () => mats.forEach((x) => x.dispose()), [mats]);
  const free = panelEdges(p).filter((e) => segLength(e) >= MIN_PANEL && !edgeConnection(d, p.id, e.key));
  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh
        geometry={geom}
        material={mats}
        onPointerDown={props.onPanelDown}
        raycast={props.inert ? NO_RAYCAST : THREE.Mesh.prototype.raycast}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (useStore.getState().hoverPart !== p.id) useStore.getState().set({ hoverPart: p.id });
        }}
        onPointerOut={() => useStore.getState().hoverPart === p.id && useStore.getState().set({ hoverPart: null })}
        onDoubleClick={(e) => {
          e.stopPropagation();
          props.onDouble();
        }}
        userData={{ panelId: p.id }}
      >
        {(props.selected || props.hover || props.cutHit) && (
          <Edges threshold={25} lineWidth={props.selected ? 2.6 : props.cutHit ? 2.2 : 1.6} color={props.cutHit ? '#d97706' : props.selected ? STAGE.selected : STAGE.hover} renderOrder={4} />
        )}
      </mesh>
      {removed && <RemovedGhost d={d} p={p} />}
      {props.through && tool === 'select' && !props.inert && <ThroughLinks p={p} hit={props.through} z0={z0} z1={z1} />}
      {outline && !props.selected && (
        <lineSegments geometry={outline} raycast={() => null}>
          <lineBasicMaterial color={STAGE.outline} transparent opacity={props.emphasis === -1 ? 0.35 : 0.62} />
        </lineSegments>
      )}
      {p.details.map((dt) => {
        const isSel = selDetails.includes(dt.id);
        const color = isSel ? STAGE.selected : dt.op === 'cut' ? '#5b4128' : dt.op === 'engrave' ? '#1c1c1c' : dt.op === 'add' ? '#2e8b57' : '#2f6feb';
        return (
          <group key={dt.id}>
            {detailContours(dt).map((c, i) => (
              <group key={i}>
                <DetailLines c={c} zs={[z0 - 0.15, z1 + 0.15]} color={color} />
                {!props.inert && <DetailHit c={c} z={z1 + 0.3} onDown={props.onDetailDown(dt.id)} />}
                {!props.inert && <DetailHit c={c} z={z0 - 0.3} onDown={props.onDetailDown(dt.id)} />}
              </group>
            ))}
          </group>
        );
      })}
      {tool === 'select' && !props.folded && !props.inert && free.map((e) => <EdgeHandle key={e.key} p={p} seg={e} t={t} z0={z0} z1={z1} show={props.showEdges} active={selEdge === e.key} />)}
    </group>
  );
}

const MAX_HIT_PIECES = 4;

/**
 * A free edge: invisible, screen-sized hit targets, a dashed hint when the
 * panel is in focus, and a "+ Grow" pill on hover. The targets leave a gap
 * around the edge's midpoint (and any push-pull anchor on it), so the width
 * and height arrows always win there; the pill follows the pointer along the
 * edge, kept out of those gaps.
 */
function EdgeHandle({ p, seg, t, z0, z1, show, active }: { p: Panel; seg: EdgeSeg; t: number; z0: number; z1: number; show: boolean; active: boolean }) {
  const tt = useT();
  const [hover, setHover] = useState(false);
  const [pillS, setPillS] = useState<number | null>(null);
  const hits = useRef<(THREE.Mesh | null)[]>([]);
  const live = useRef<boolean[]>([]);
  const gapMm = useRef(0);
  const rangesRef = useRef<[number, number][]>([]);
  const { camera, size } = useThree();
  const edge = seg.key;
  const L = segLength(seg);
  const mid = (z0 + z1) / 2;
  const dir = { x: (seg.b.x - seg.a.x) / (L || 1), y: (seg.b.y - seg.a.y) / (L || 1) };
  const gaps = useMemo(() => edgeGaps(p, seg), [p.w, p.h, seg.a.x, seg.a.y, seg.b.x, seg.b.y]);
  const at = (s: number): V3 => [seg.a.x + dir.x * s, seg.a.y + dir.y * s, mid];
  const pos = at(L / 2);
  const rot: [number, number, number] = [0, 0, Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x)];
  useFrame(() => {
    const m0 = hits.current[0];
    if (!m0?.parent) return;
    const wp = m0.parent.localToWorld(new THREE.Vector3(...pos));
    const px = mmPerPx(camera, size.height, wp);
    const k = Math.max(2, 14 * px);
    gapMm.current = EDGE_GAP_PX * px;
    const ranges = edgeHitRanges(L, gaps, gapMm.current, EDGE_MIN_HIT_PX * px);
    rangesRef.current = ranges;
    for (let i = 0; i < MAX_HIT_PIECES; i++) {
      const m = hits.current[i];
      if (!m) continue;
      const r = ranges[i];
      live.current[i] = !!r;
      if (!r) continue;
      m.position.set(...at((r[0] + r[1]) / 2));
      m.scale.set(r[1] - r[0], k, t + k);
    }
  });
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(seg.a.x, seg.a.y, z1 + 0.2), new THREE.Vector3(seg.b.x, seg.b.y, z1 + 0.2)]);
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: STAGE.selected, dashSize: 4, gapSize: 3, depthTest: false, transparent: true }));
    l.computeLineDistances();
    l.renderOrder = 6;
    l.userData.noAO = true;
    return l;
  }, [seg.a.x, seg.a.y, seg.b.x, seg.b.y, z1]);
  useEffect(() => () => (line.geometry.dispose(), (line.material as THREE.Material).dispose()), [line]);
  const raycasters = useMemo(
    () =>
      Array.from({ length: MAX_HIT_PIECES }, (_, i) =>
        function (this: THREE.Mesh, rc: THREE.Raycaster, out: THREE.Intersection[]) {
          if (live.current[i]) THREE.Mesh.prototype.raycast.call(this, rc, out);
        },
      ),
    [],
  );
  const follow = (ev: ThreeEvent<PointerEvent>) => {
    const parent = hits.current[0]?.parent;
    if (!parent) return;
    const l = parent.worldToLocal(ev.point.clone());
    const s = (l.x - seg.a.x) * dir.x + (l.y - seg.a.y) * dir.y;
    setPillS(clampToRanges(s, rangesRef.current));
  };
  const lit = hover || active;
  const pill = at(pillS ?? clampToRanges(L * 0.3, rangesRef.current) ?? L * 0.3);
  return (
    <>
      {raycasters.map((rc, i) => (
        <mesh
          key={i}
          ref={(m) => void (hits.current[i] = m)}
          position={pos}
          rotation={rot}
          visible={false}
          raycast={rc}
          onPointerOver={(ev) => (ev.stopPropagation(), setHover(true), follow(ev))}
          onPointerMove={follow}
          onPointerOut={() => setHover(false)}
          onPointerDown={(ev) => {
            if (ev.button !== 0) return;
            ev.stopPropagation();
            useStore.getState().select({ kind: 'edge', panelId: p.id, edge });
          }}
          userData={{ edgeHit: edge }}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial />
        </mesh>
      ))}
      {(show || lit) && <primitive object={line} raycast={() => null} />}
      {lit && (
        <mesh position={pos} rotation={rot} renderOrder={7} raycast={() => null} userData={{ noAO: true }}>
          <boxGeometry args={[L, 1.2, t + 1.2]} />
          <meshBasicMaterial color={active ? STAGE.selected : STAGE.hover} transparent opacity={0.9} depthTest={false} />
        </mesh>
      )}
      {hover && !active && (
        <StageHtml position={[pill[0], pill[1], z1 + 1]} style={{ pointerEvents: 'none' }}>
          <span className="w-grow" data-testid="grow-pill" data-s={Math.round((pillS ?? 0) * 10) / 10} data-gap={Math.round(gapMm.current * 10) / 10} data-len={Math.round(L * 10) / 10}>
            <Icon name="plus" /> {tt('edge.growHere')}
          </span>
        </StageHtml>
      )}
    </>
  );
}

/** Rounded bend along a fold, with the crease (score line) on its outside. */
function BendBead({ b, d, index, outlines }: { b: Bend; d: Design; index: number; outlines: boolean }) {
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.axis), [b.axis]);
  const color = useMemo(() => partColors(d.material.kind, Math.max(0, index)).face, [d.material.kind, index]);
  const crease = useMemo(() => {
    const p0 = b.pivot.clone().addScaledVector(b.crease, b.radius * 1.04).addScaledVector(b.axis, -b.length / 2);
    const p1 = p0.clone().addScaledVector(b.axis, b.length);
    const g = new THREE.BufferGeometry().setFromPoints([p0, p1]);
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: '#2f6feb', dashSize: b.mountain ? 6 : 3, gapSize: b.mountain ? 2 : 2 }));
    l.computeLineDistances();
    l.userData.noAO = true;
    return l;
  }, [b]);
  useEffect(() => () => (crease.geometry.dispose(), (crease.material as THREE.Material).dispose()), [crease]);
  return (
    <>
      <mesh position={b.pivot} quaternion={q} raycast={() => null}>
        <cylinderGeometry args={[b.radius, b.radius, b.length, 20, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {outlines && <primitive object={crease} raycast={() => null} />}
    </>
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
    grp.userData.noAO = true;
    return grp;
  }, [g, z0, z1]);
  useEffect(() => () => obj.traverse((o) => (o as THREE.Line).geometry?.dispose()), [obj]);
  return (
    <group matrixAutoUpdate={false} matrix={frameMatrix(p.frame)}>
      <primitive object={obj} raycast={() => null} />
    </group>
  );
}

function Flaps({ d, xf }: { d: Design; xf: Map<string, THREE.Matrix4> }) {
  const items = useMemo(() => {
    const out: { key: string; geom: THREE.BufferGeometry; matrix: THREE.Matrix4; index: number }[] = [];
    for (const c of Object.values(d.connections)) {
      c.geom?.flaps3d.forEach((f, i) => {
        const p = d.panels[f.panelId];
        if (p) out.push({ key: `${c.id}:${i}`, geom: flapGeometry(p, f.poly, f.z0, f.z1), matrix: (xf.get(p.id) ?? IDM).clone().multiply(frameMatrix(p.frame)), index: d.order.indexOf(p.id) });
      });
    }
    return out;
  }, [d.connections, d.panels, xf]);
  useEffect(() => () => items.forEach((x) => x.geom.dispose()), [items]);
  return (
    <>
      {items.map((x) => (
        <group key={x.key} matrixAutoUpdate={false} matrix={x.matrix}>
          <mesh geometry={x.geom} raycast={() => null}>
            <meshStandardMaterial color={partColors(d.material.kind, x.index, -0.06).face} roughness={0.9} />
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

/** A panel a through-cut removed entirely: shown faintly, so deleting the cut brings it back. */
function RemovedGhost({ d, p }: { d: Design; p: Panel }) {
  const g = useMemo(() => panelGeometry(d, p, { joints: false }), [d, p]);
  useEffect(() => () => g.dispose(), [g]);
  return (
    <mesh geometry={g} raycast={() => null} userData={{ noAO: true }} data-testid="removed-ghost">
      <meshStandardMaterial color="#d97706" transparent opacity={0.16} depthWrite={false} />
    </mesh>
  );
}

/** On a panel a through-cut reaches: clicking where it cut selects the source shape (one live feature). */
function ThroughLinks({ p, hit, z0, z1 }: { p: Panel; hit: ThroughHit; z0: number; z1: number }) {
  const contours = useMemo(() => {
    // the regions clipped to the panel, so the hit areas stay on it
    const ring = (pts: P2[]) => pts.map((q) => [q.x, q.y] as [number, number]);
    const box = [ring([{ x: -1, y: -1 }, { x: p.w + 1, y: -1 }, { x: p.w + 1, y: p.h + 1 }, { x: -1, y: p.h + 1 }])];
    const out: { c: ReturnType<typeof detailContour>; src: string }[] = [];
    hit.regions.forEach((r, i) => {
      try {
        for (const poly of polygonClipping.intersection([ring(r)], box)) out.push({ c: polygonContour(poly[0].slice(0, -1).map(([x, y]) => ({ x, y }))), src: hit.sources[Math.min(i, hit.sources.length - 1)] });
      } catch {
        /* skip */
      }
    });
    return out;
  }, [p, hit]);
  const select = (src: string) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    useStore.getState().select(detailSel([src]));
  };
  return (
    <>
      {contours.map((x, i) => (
        <group key={i}>
          <DetailHit c={x.c} z={z1 + 0.35} onDown={select(x.src)} />
          <DetailHit c={x.c} z={z0 - 0.35} onDown={select(x.src)} />
        </group>
      ))}
    </>
  );
}

function DetailHit({ c, z, onDown }: { c: ReturnType<typeof detailContour>; z: number; onDown: (e: ThreeEvent<PointerEvent>) => void }) {
  const g = useMemo(() => contourShapeGeometry(c), [c]);
  useEffect(() => () => g.dispose(), [g]);
  return (
    <mesh geometry={g} position={[0, 0, z]} onPointerDown={onDown} visible={false}>
      <meshBasicMaterial side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * Where along the edge the hinge knob sits: towards one end, so it never
 * shares a spot with the height arrow (middle of the far edge), which it
 * would when the panel is seen from above.
 */
const knobAt = (w: number) => Math.min(w * 0.2, 40);

/** Hinge point (at the knob's place along the edge) and its 0° / 90° directions (into the parent, out of its material face), in display space. */
function hingeBasis(d: Design, parent: Panel, edge: string, m: THREE.Matrix4) {
  const [a, b] = edgeLocal(parent, edge);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const k = knobAt(len) / len;
  const o = W(m, parent.frame, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, d.material.thickness / 2);
  return { o, x: Wdir(m, inwardWorld(parent, edge)), y: Wdir(m, matDir(parent.frame)) };
}

/** Ghost of the panel that "Grow" would add, with its stage widgets: hinge ring, height arrow, height label. */
function GrowGhost({ d, panelId, edge, m }: { d: Design; panelId: string; edge: string; m: THREE.Matrix4 }) {
  const t = useT();
  const grow = useStore((s) => s.grow);
  const setGrow = useStore((s) => s.setGrow);
  const parent = d.panels[panelId];
  const free = parent && !edgeConnection(d, panelId, edge);
  const kind = growKind(d, grow);
  const check = parent ? checkHinge(d, panelId, edge, grow.angle, grow.height) : null;
  const blocked = !!check?.blocking;
  const th = d.material.thickness;
  const frameAt = (h: number) => {
    const { angle, dir } = fromHinge(h);
    return growFrame(parent, edge, angle, dir, th, seatingOf(kind), defaultOffset(d, kind));
  };
  const w = parent ? edgeLength(parent, edge) : 0;
  const ghost = useMemo(() => {
    if (!parent || !free) return null;
    const frame = frameAt(grow.angle);
    const p: Panel = { id: 'ghost', name: '', w, h: grow.height, sketch: { kind: 'wall' }, frame, details: [] };
    return { p, frame, geom: panelGeometry(d, p, { joints: false }), matrix: m.clone().multiply(frameMatrix(frame)) };
  }, [d, parent, free, edge, grow.angle, grow.height, kind, m]);
  useEffect(() => () => ghost?.geom.dispose(), [ghost]);
  const arcR = Math.max(10, Math.min(grow.height * 0.4, 45));
  const pointAt = useMemo(() => (a: number) => W(m, frameAt(a), knobAt(w), arcR, th / 2), [m, parent, edge, kind, arcR, w]);
  const zoneAt = useMemo(() => (a: number) => checkHinge(d, panelId, edge, a, grow.height).zone, [d, panelId, edge, grow.height]);
  if (!ghost || !check) return null;
  const f = ghost.frame;
  const color = blocked ? STAGE.blocked : STAGE.ghost;
  return (
    <>
      <group matrixAutoUpdate={false} matrix={ghost.matrix} userData={{ noAO: true }}>
        <mesh geometry={ghost.geom} raycast={() => null}>
          <meshStandardMaterial color={color} transparent opacity={blocked ? 0.28 : 0.38} depthWrite={false} />
          <Edges threshold={25} lineWidth={1.8} color={blocked ? '#c27c0e' : '#15706b'} />
        </mesh>
      </group>
      <AngleArc
        pointAt={pointAt}
        hinge={hingeBasis(d, parent, edge, m)}
        zoneAt={zoneAt}
        value={grow.angle}
        onChange={(a) => setGrow({ angle: a })}
        label={`${grow.angle}°`}
        message={hingeText(t, check)}
        testId="ghost-hinge"
      />
      <PushPull
        at={W(m, f, w / 2, grow.height, th / 2)}
        axis={Wdir(m, f.v)}
        value={grow.height}
        min={5}
        max={2000}
        onPreview={(v) => setGrow({ height: v })}
        onCommit={() => undefined}
        onCancel={() => undefined}
        testId="ghost-height"
      />
      <DimLabel at={W(m, f, w, grow.height / 2, th / 2)} k="H" value={grow.height} unit={t('unit.mm')} ghost onCommit={(v) => setGrow({ height: v })} testId="ghost-dim-h" />
    </>
  );
}

/** Extrude preview: a ghost wall on every edge of the base, with a push-pull arrow for the shared height. */
function TrayGhost({ d, baseId, height, m }: { d: Design; baseId: string; height: number; m: THREE.Matrix4 }) {
  const t = useT();
  const base = d.panels[baseId];
  const th = d.material.thickness;
  const kind = trayKinds(d.material).wallKind;
  const ghosts = useMemo(() => {
    if (!base) return [];
    const h = Math.max(MIN_PANEL, wallHeight(d, kind, height));
    return panelEdges(base)
      .filter((e) => segLength(e) >= MIN_EDGE)
      .map((e) => {
        const frame = growFrame(base, e.key, 90, 'up', th, seatingOf(kind), defaultOffset(d, kind));
        const p: Panel = { id: `ghost-${e.key}`, name: '', w: segLength(e), h, sketch: { kind: 'wall' }, frame, details: [] };
        return { key: e.key, p, geom: panelGeometry(d, p, { joints: false }), matrix: m.clone().multiply(frameMatrix(frame)) };
      });
  }, [d, base, height, kind, m, th]);
  useEffect(() => () => ghosts.forEach((g) => g.geom.dispose()), [ghosts]);
  if (!ghosts.length) return null;
  const first = ghosts[0].p;
  const setH = (v: number) => {
    const ex = useStore.getState().extrude;
    if (ex) useStore.getState().set({ extrude: { ...ex, height: Math.round(v) } });
  };
  return (
    <>
      {ghosts.map((g) => (
        <group key={g.key} matrixAutoUpdate={false} matrix={g.matrix} userData={{ noAO: true }}>
          <mesh geometry={g.geom} raycast={() => null}>
            <meshStandardMaterial color={STAGE.ghost} transparent opacity={0.38} depthWrite={false} />
            <Edges threshold={25} lineWidth={1.8} color="#15706b" />
          </mesh>
        </group>
      ))}
      <PushPull
        at={W(m, first.frame, first.w / 2, first.h, th / 2)}
        axis={Wdir(m, first.frame.v)}
        value={height}
        min={5 + th}
        max={1000}
        onPreview={setH}
        onCommit={() => undefined}
        onCancel={() => undefined}
        testId="tray-ghost-height"
      />
      <DimLabel at={W(m, first.frame, first.w, first.h / 2, th / 2)} k="H" value={height} unit={t('unit.mm')} ghost onCommit={setH} testId="tray-ghost-dim" />
    </>
  );
}

/** A selected Cut shape on a tray base that reaches a walled edge (new tray edges always get walls). */
function cutOnTrayBase(d: Design, sel: ReturnType<typeof useStore.getState>['selection']): boolean {
  if (sel?.kind !== 'detail') return false;
  const f = findDetail(d, sel.id);
  if (!f || f.detail.op !== 'cut' || !trayOf(d, f.panel.id) || trayOf(d, f.panel.id)!.baseId !== f.panel.id) return false;
  return isOutlineShape(f.panel, f.detail.id);
}

/** Selected grown panel: the hinge ring at its parent edge, to turn it in place. */
function HingeWidget({ d, c, m }: { d: Design; c: Connection; m: THREE.Matrix4 }) {
  const t = useT();
  const parent = d.panels[c.a.panelId], child = d.panels[c.b.panelId];
  const th = d.material.thickness;
  const h = hingeOf(c.angle, c.dir);
  const [refused, setRefused] = useState<string | undefined>();
  const pointAt = useMemo(() => {
    if (!parent || !child) return () => [0, 0, 0] as V3;
    const r = Math.max(10, Math.min(child.h * 0.4, 45));
    return (a: number) => {
      const { angle, dir } = fromHinge(a);
      return W(m, growFrame(parent, c.a.edge, angle, dir, th, seatingOf(c.kind), c.offset), knobAt(child.w), r, th / 2);
    };
  }, [m, parent, child?.h, child?.w, c.a.edge, c.kind, c.offset, th]);
  const zoneAt = useMemo(() => (a: number) => (child ? checkHinge(d, c.a.panelId, c.a.edge, a, child.h).zone : 'ok'), [d, c.a.panelId, c.a.edge, child?.h]);
  if (!parent || !child) return null;
  const check = checkHinge(d, c.a.panelId, c.a.edge, h, child.h);
  return (
    <AngleArc
      pointAt={pointAt}
      hinge={hingeBasis(d, parent, c.a.edge, m)}
      zoneAt={zoneAt}
      value={h}
      onChange={(a) => {
        setRefused(undefined);
        useStore.getState().preview((x) => setConnection(x, c.id, fromHinge(a)));
      }}
      onEnd={(cancel) => {
        const st = useStore.getState();
        const cc = st.design.connections[c.id];
        const now = cc ? checkHinge(st.design, c.a.panelId, c.a.edge, hingeOf(cc.angle, cc.dir), child.h) : null;
        if (cancel || !now || now.zone === 'bad') {
          if (now && now.zone === 'bad' && !cancel) setRefused(t('hinge.cantSet', { reason: hingeText(t, now) ?? '' }));
          st.cancel();
        } else st.commit();
      }}
      label={`${h}°`}
      message={refused ?? hingeText(t, check)}
      testId="panel-hinge"
    />
  );
}

/** Selected panel: width/height push-pull arrows and in-place dimensions. */
function PanelWidgets({ d, p, m, dims }: { d: Design; p: Panel; m: THREE.Matrix4; dims: boolean }) {
  const t = useT();
  const th = d.material.thickness;
  const off = Math.max(8, 0.07 * Math.max(p.w, p.h));
  const st = useStore.getState;
  const resize = (w?: number, h?: number) => st().preview((x) => setPanelSize(x, p.id, w, h));
  // dimension lines run along the bottom and left edges, just outside the panel, on its far face
  const Wv = (x: number, y: number) => W(m, p.frame, x, y, th);
  const u = Wdir(m, p.frame.u), v = Wdir(m, p.frame.v);
  const tickV = v3mul(v, 3), tickU = v3mul(u, 3);
  const pp = pushPullAnchors(p);
  return (
    <>
      <PushPull at={W(m, p.frame, pp.width.x, pp.width.y, th / 2)} axis={u} value={p.w} offset={pp.width.x - p.w} min={5} onPreview={(w) => resize(w, undefined)} onCommit={() => st().commit()} onCancel={() => st().cancel()} testId="pp-width" />
      <PushPull at={W(m, p.frame, pp.height.x, pp.height.y, th / 2)} axis={v} value={p.h} offset={pp.height.y - p.h} min={5} onPreview={(h) => resize(undefined, h)} onCommit={() => st().commit()} onCancel={() => st().cancel()} testId="pp-height" />
      {dims && (
        <>
          <DimLine a={Wv(0, -off)} b={Wv(p.w, -off)} tick={tickV} />
          <DimLine a={Wv(-off, 0)} b={Wv(-off, p.h)} tick={tickU} />
          <DimLabel at={Wv(p.w / 2, -off)} k="W" value={p.w} unit={t('unit.mm')} onCommit={(w) => st().apply((x) => setPanelSize(x, p.id, w, undefined))} testId="dim-w" />
          <DimLabel at={Wv(-off, p.h / 2)} k="H" value={p.h} unit={t('unit.mm')} onCommit={(h) => st().apply((x) => setPanelSize(x, p.id, undefined, h))} testId="dim-h" />
        </>
      )}
    </>
  );
}

/** Where a connection's seam is, in display space. */
function seamPoint(d: Design, c: Connection, xf: Map<string, THREE.Matrix4>, at = 0.5): V3 | null {
  const end = c.b.edge !== FACE ? c.b : c.a.edge !== FACE ? c.a : null;
  if (!end) {
    const p = d.panels[c.a.panelId];
    return p ? W(xf.get(p.id) ?? IDM, p.frame, p.w / 2, p.h, d.material.thickness / 2) : null;
  }
  const p = d.panels[end.panelId];
  if (!p) return null;
  const e = findEdge(p, end.edge);
  if (!e) return null;
  const s = at;
  const x = e.a.x + (e.b.x - e.a.x) * s, y = e.a.y + (e.b.y - e.a.y) * s;
  return W(xf.get(p.id) ?? IDM, p.frame, x, y, d.material.thickness / 2);
}

/** Joint pills: the focused panel's connections (and broken ones, always). Clicking one opens its settings. */
function SeamPills({ d, focus, xf, openJoint }: { d: Design; focus: string | null; xf: Map<string, THREE.Matrix4>; openJoint: string | null }) {
  const t = useT();
  const list = Object.values(d.connections).filter((c) => c.broken || (focus && (c.a.panelId === focus || c.b.panelId === focus)));
  return (
    <>
      {list.map((c) => {
        const at = seamPoint(d, c, xf, 0.24);
        if (!at) return null;
        const other = c.a.panelId === focus ? c.b.panelId : c.a.panelId;
        return (
          <StageHtml key={c.id} position={at}>
            <button
              className={`w-pill ${c.broken ? 'broken' : ''} ${openJoint === c.id ? 'on' : ''}`}
              title={t('conn.with', { kind: t(`conn.${c.kind}` as 'conn.fold'), panel: panelLabel(d, other, t) })}
              onClick={() => {
                const st = useStore.getState();
                const owner = focus && (c.a.panelId === focus || c.b.panelId === focus) ? focus : c.b.panelId;
                if (st.selection?.kind !== 'panel' || st.selection.id !== owner) st.select({ kind: 'panel', id: owner });
                st.set({ openJoint: c.id });
                requestAnimationFrame(() => document.querySelector('[data-testid=inspector-connection]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
              }}
              data-testid={`seam-pill-${c.kind}`}
            >
              <Icon name={c.broken ? 'alert' : c.kind} />
              {t(`conn.short.${c.kind}` as 'conn.short.fold')}
            </button>
          </StageHtml>
        );
      })}
    </>
  );
}

/** 3D camera kept while another view is open, so returning restores the same framing. */
const savedCam: { ortho: boolean; position?: [number, number, number]; target?: [number, number, number]; zoom?: number } = { ortho: false };

function CameraKeeper() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const { camera, controls, invalidate } = get() as unknown as { camera: THREE.Camera & { zoom: number; updateProjectionMatrix(): void }; controls: { target: THREE.Vector3; update(): void } | null; invalidate: () => void };
        if (!savedCam.position) return;
        camera.position.set(...savedCam.position);
        if (savedCam.zoom && camera instanceof THREE.OrthographicCamera) camera.zoom = savedCam.zoom;
        camera.updateProjectionMatrix();
        if (controls && savedCam.target) {
          controls.target.set(...savedCam.target);
          controls.update();
        }
        invalidate();
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

function designBox(d: Design): THREE.Box3 {
  const box = new THREE.Box3();
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    const m = frameMatrix(p.frame);
    for (const [x, y] of [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]) box.expandByPoint(new THREE.Vector3(x, y, 0).applyMatrix4(m));
  }
  return box;
}

function CameraRig({ ortho, fitSignal, onAutoFit }: { ortho: boolean; fitSignal: number; onAutoFit: () => void }) {
  const { camera, set, size, controls, invalidate } = useThree() as unknown as {
    camera: THREE.Camera & { zoom: number; updateProjectionMatrix(): void };
    set: (s: { camera: THREE.Camera }) => void;
    size: { width: number; height: number };
    controls: { target: THREE.Vector3; update(): void } | null;
    invalidate: () => void;
  };
  const first = useRef(true);
  const order = useStore((s) => s.design.order);
  const material = useStore((s) => s.design.material.id);
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
    const box = designBox(useStore.getState().design);
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
    invalidate();
  }, [fitSignal]);
  // a view that shows none of the design (after a view switch, a new template
  // or a material change) frames it again by itself
  useEffect(() => {
    const id = setTimeout(() => {
      const box = designBox(useStore.getState().design);
      if (box.isEmpty()) return;
      camera.updateMatrixWorld();
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      if (!fr.intersectsBox(box)) onAutoFit();
    }, 120);
    return () => clearTimeout(id);
  }, [order, material]);
  return null;
}

const AUTO_KEY = 'cutforge.autoQuality';
function storedAuto(): 'simple' | 'rich' | null {
  try {
    const v = localStorage.getItem(AUTO_KEY);
    return v === 'simple' || v === 'rich' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Auto quality: software renderers start (and stay) Simple; otherwise start
 * Rich and drop to Simple if orbiting runs slowly. The result is remembered.
 */
function QualityProbe({ pref, onResolve }: { pref: Quality; onResolve: (q: 'simple' | 'rich') => void }) {
  const { gl } = useThree();
  const samples = useRef<number[]>([]);
  const last = useRef(0);
  const done = useRef(false);
  useEffect(() => {
    if (pref !== 'auto') return;
    const known = storedAuto();
    if (known) return onResolve(known);
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) {
      done.current = true;
      onResolve('simple');
    } else onResolve('rich');
  }, [pref]);
  useFrame(() => {
    if (pref !== 'auto' || done.current || storedAuto()) return;
    const now = performance.now();
    const dt = now - last.current;
    last.current = now;
    const fresh = dt > 0;
    if (fresh && dt < 150) samples.current.push(dt);
    if (samples.current.length >= 40) {
      done.current = true;
      const s = [...samples.current].sort((a, b) => a - b);
      const q = s[Math.floor(s.length / 2)] > 28 ? 'simple' : 'rich';
      try {
        localStorage.setItem(AUTO_KEY, q);
      } catch {
        /* ignore */
      }
      onResolve(q);
    }
  });
  return null;
}

function ViewSettings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const prefs = useStore((s) => s.viewPrefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  return (
    <div className="popover" ref={ref} role="dialog" aria-label={t('viewset.title')} data-testid="view-settings">
      <h4>{t('viewset.title')}</h4>
      <label className="check">
        <input type="checkbox" checked={prefs.outlines} onChange={(e) => setPrefs({ outlines: e.target.checked })} data-testid="pref-outlines" /> {t('viewset.outlines')}
      </label>
      <label className="check">
        <input type="checkbox" checked={prefs.joints} onChange={(e) => setPrefs({ joints: e.target.checked })} data-testid="pref-joints" /> {t('viewset.joints')}
      </label>
      <label className="check">
        <input type="checkbox" checked={prefs.dims} onChange={(e) => setPrefs({ dims: e.target.checked })} data-testid="pref-dims" /> {t('viewset.dims')}
      </label>
      <Segmented
        label={t('viewset.quality')}
        value={prefs.quality}
        options={(['auto', 'simple', 'rich'] as const).map((q) => ({ value: q, label: t(`viewset.q.${q}`), testId: `pref-quality-${q}` }))}
        onChange={(q) => setPrefs({ quality: q as Quality })}
      />
      <p className="note">{t('viewset.qualityNote')}</p>
    </div>
  );
}

/** The fold/unfold slider, on the stage whenever the design has a fold (card and corrugated nets). */
function FoldBar() {
  const hasFolds = useStore((s) => netGroups(s.design).some((g) => g.length > 1));
  if (!hasFolds) return null;
  return (
    <div className="fold-bar card" dir="auto">
      <FoldSlider />
    </div>
  );
}

export function View3D() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const empty = useStore((s) => s.design.order.length === 0);
  const prefs = useStore((s) => s.viewPrefs);
  const foldT = useStore((s) => s.foldT);
  const [ortho, setOrthoState] = useState(savedCam.ortho);
  const setOrtho = (f: (o: boolean) => boolean) =>
    setOrthoState((o) => {
      const n = f(o);
      savedCam.ortho = n;
      return n;
    });
  const [fit, setFit] = useState(0);
  const [label, setLabel] = useState<Label | null>(null);
  const [settings, setSettings] = useState(false);
  const [autoQ, setAutoQ] = useState<'simple' | 'rich'>(() => storedAuto() ?? 'simple');
  const quality = prefs.quality === 'auto' ? autoQ : prefs.quality;
  const wrap = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'o' || e.key === 'O') setOrtho((o) => !o);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const editing = useStore((s) => !!s.editOutline);
  const trayCut = useStore((s) => cutOnTrayBase(s.design, s.selection));
  const hint =
    foldT < 0.999
      ? 'fold.hint'
      : editing && tool === 'select'
        ? 'outline.help'
        : trayCut && tool === 'select'
          ? 'tray.cutHint'
        : tool === 'select'
          ? 'tool.hint.select'
          : tool === 'panel'
            ? 'tool.hint.panel'
            : tool === 'polygon'
              ? 'tool.hint.polygon'
              : tool === 'text'
                ? 'tool.hint.text'
                : 'tool.hint.shape';
  return (
    <div className="view3d" dir="ltr" data-testid="view3d" ref={wrap}>
      <Canvas frameloop="demand" camera={{ position: [0, 260, 330], fov: 45, near: 1, far: 20000 }} dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }} className={`tool-${tool}`}>
        <color attach="background" args={[STAGE.bg]} />
        <OverlayContext.Provider value={overlay}>
          <Scene setLabel={setLabel} quality={quality} />
        </OverlayContext.Provider>
        <CameraRig ortho={ortho} fitSignal={fit} onAutoFit={() => setFit((f) => f + 1)} />
        <CameraKeeper />
        <QualityProbe pref={prefs.quality} onResolve={setAutoQ} />
      </Canvas>
      <div className="stage-overlay" ref={overlay} />
      {label && wrap.current && (
        <div
          className="dim-label"
          style={{ position: 'absolute', left: label.x - wrap.current.getBoundingClientRect().left, top: label.y - wrap.current.getBoundingClientRect().top, pointerEvents: 'none' }}
        >
          {label.text} {t('unit.mm')}
        </div>
      )}
      <div className="view-dock" dir="auto">
        <div className="cluster">
          <button className={ortho ? 'on' : ''} onClick={() => setOrtho((o) => !o)} title={`${ortho ? t('view.ortho') : t('view.persp')} (O)`} aria-label={ortho ? t('view.ortho') : t('view.persp')} data-testid="toggle-ortho">
            <Icon name={ortho ? 'ortho' : 'persp'} />
          </button>
          <button onClick={() => setFit((f) => f + 1)} title={t('view.fit')} aria-label={t('view.fit')} data-testid="fit-view">
            <Icon name="fit" />
          </button>
          <button
            className={`stage-toggle ${prefs.joints ? 'on' : ''}`}
            onClick={() => useStore.getState().setPrefs({ joints: !prefs.joints })}
            title={t('view.joints')}
            aria-label={t('view.joints')}
            aria-pressed={prefs.joints}
            data-testid="toggle-joints"
          >
            <Icon name="finger" />
          </button>
          <button className={settings ? 'on' : ''} onClick={() => setSettings((s) => !s)} title={t('viewset.title')} aria-label={t('viewset.title')} aria-expanded={settings} data-testid="open-view-settings">
            <Icon name="settings" />
          </button>
        </div>
        {settings && <ViewSettings onClose={() => setSettings(false)} />}
      </div>
      <div className="view-hint" dir="auto">{empty && tool === 'select' ? t('view.empty3d') : t(hint)}</div>
      <PolygonToolCard />
      <FoldBar />
      <span hidden data-testid="quality" data-quality={quality} />
    </div>
  );
}
