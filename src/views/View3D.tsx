import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, GizmoHelper, GizmoViewcube, Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { detailSel, gridSnap, growKind, noSmartSnap, selectedDetailIds, selectedPanelIds, useStore, useT, type Quality } from '../store/store';
import type { Connection, Content, Design, Detail, Frame, P2, Panel, V3, WallSketch } from '../model/types';
import { addTray, movePlaced, rotatePlaced, trayFlatInfo, addText, edgeConnection, MIN_PANEL, addRootPanel, addDetail, findDetail, newId, updateDetail, movePanel, parentConnection, setPanelSize, seatingOf, defaultOffset, setConnection, rotateDetails, rotatePanel, setDividerOffset, planDividerFor, addDividerFor, wallPicks, flipPlacedSide } from '../model/ops';
import { checkHinge, fromHinge, hingeOf } from '../model/hinge';
import { hingeText } from '../ui/AngleDial';
import { inwardWorld, ownerOf, tabLocks } from '../model/seams';
import { edgeLength, edgeLocal, frameNormal, growFrame, matDir, toLocal, toWorld } from '../model/frame';
import { detailBBox, detailContour, detailContours, detailCorners } from '../model/geometry';
import { snapBox, snapContext, snapFloor, snapPoint, type Guide } from '../model/snap';
import { SNAP_PX } from '../geom/types';
import { v3add, v3dot, v3mul } from '../geom/v3';
import { contourLinePoints, contourShapeGeometry, faceZ, flapGeometry, frameMatrix, panelGeometry } from './three-geom';
import { fmtNum, translate } from '../i18n';
import { STAGE, boardColors, partColors } from './palette';
import { matOf, tOf } from '../model/materials';
import { MaterialLegend } from '../ui/MaterialLegend';
import { flapMatrix, foldDisplay, type Bend } from './foldView';
import { AngleArc, DimLabel, DimLine, Gizmo, OverlayContext, PushPull, ScreenSized, StageHtml, closestOnLine, mmPerPx, priorityRaycast, useGrazing, useHandleDrag, useRayFromScreen } from './widgets';
import { Icon } from '../ui/icons';
import { FoldSlider } from '../ui/Inspector';
import { netGroups, netOverlaps } from '../model/pieces';
import { snapLineEnd, ConfirmBar, FaceHover, PanelGhostView, PendingBar, confirmPanelGhost, dividerGhost, faceAt, ghostPlace, hostFace, snapGhostPoint } from './panelTool';
import { drawsDivider } from './board';
import { faceTargets, snapOnFace, type FaceTargets } from '../model/snap';
import { commonPlane } from '../model/arrange';
import { FLOOR_FRAME, faceOut } from '../model/place';
import { panelLabel } from '../model/names';
import { Segmented } from '../ui/NumField';
import { FACE, findEdge, isCurveKey, panelEdges, segDir, segInward, segLength, type EdgeSeg } from '../model/edges';
import { clearBox, snapDividerOffset } from '../model/dividers';
import { angleTargets, edgeFreeSpans, edgeHasRoom, heightTargets, snapTo, spanFrame, spanTargets } from '../model/adapt';
import { doGrow, effectiveGrow, growOverlap, ownGrowKind } from './ghost';
import { sketchRing, wallCorners } from '../model/edges';
import { closedAt, OutlineHandles, PolygonTool, PolygonToolCard, type PolyToolHandle } from './polyTool';
import { MIN_EDGE, trayOf, wallHeight } from '../model/trays';
import { allowedKinds, newTrayKinds } from '../model/jointDefaults';
import { isOutlineShape } from '../model/outline';
import { allFoldOvers } from '../model/foldover';
import { FoldOverObject } from './foldOver3d';
import { panelsCutBy, removedByCut, throughHits, type ThroughHit } from '../model/through';
import polygonClipping from 'polygon-clipping';
import { polygonContour } from '../geom/vec';
import { clampToRanges, EDGE_GAP_PX, EDGE_MIN_HIT_PX, edgeGaps, edgeHitRanges, pushPullAnchors } from './edgeGaps';
import { featureState, shown, useFeature, useMode } from '../easy/features';
import { boxFootprintGo, extrudeCancel, extrudeGo, placeSticker } from '../easy/actions';
import { isBoxBase, quickWallHeight } from '../easy/recipes';
import { keepOutZones } from '../easy/guard';
import { moverSet, planeLines, snapFlush, type Seg } from '../model/planeSnap';
import { bundleSize, contentFit, objectById } from '../easy/objects';
import { assembleFold, assembleLift, playAssembly } from '../easy/assemble';
import { workshopOnly } from '../easy/mode';
import { registerStage } from '../tour/stage';
import { TOUR_STEPS } from '../tour/steps';

// mm grid (from the settings, 1 mm by default) used when no smart-snap target is near
const snap = (x: number, ev?: { altKey: boolean } | null) => gridSnap(x, ev);

type Drag =
  | { kind: 'panel-draw'; start: V3; cur: V3 }
  | { kind: 'shape-draw'; panelId: string; id: string; start: { x: number; y: number }; plane: THREE.Plane }
  | { kind: 'detail-move'; ids: string[]; panelId: string; start: { x: number; y: number }; box: { minX: number; maxX: number; minY: number; maxY: number }; plane: THREE.Plane }
  | { kind: 'panel-move'; id: string; ids?: string[]; start: V3; plane: THREE.Plane }
  /** The Board tool (or Quick build's Divider) drawing its ghost on a face (milestones 29, 42). */
  | { kind: 'ghost-draw'; plane: THREE.Plane; H: Frame; targets: FaceTargets }
  /** A placed panel dragged in its host's plane. */
  | { kind: 'placed-move'; id: string; plane: THREE.Plane; H: Frame; start: P2 }
  | { kind: 'content-move'; id: string; plane: THREE.Plane; H: Frame; start: P2; at: P2 };

/** Text tool: place a text shape where the student clicked, select it, back to Select. */
export function placeText(panelId: string, x: number, y: number) {
  const st = useStore.getState();
  st.cancelPending();
  let id: string | null = null;
  const value = translate(st.lang, 'text.default');
  st.apply((d) => void (id = addText(d, panelId, Math.round(x), Math.round(y), value, 'engrave')));
  if (id) {
    // a ghost until ✓ (milestone 30); then back to Select
    st.select(detailSel([id]));
    st.beginPending({ kind: 'shape', ids: [id], panelId });
  }
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

// Moving a panel sticks to other panels' planes (flush faces, edges in line): lines per design and moving set, kept for the drag
const flushCache = new WeakMap<Design, Map<string, { moving: Seg[]; targets: Seg[] }>>();
function flushMove(base: Design, ids: string[], F: Frame, dx: number, dy: number, tol: number) {
  const key = `${ids.join(',')}|${F.o.join(',')}|${F.u.join(',')}|${F.v.join(',')}`;
  let m = flushCache.get(base);
  if (!m) flushCache.set(base, (m = new Map()));
  let lines = m.get(key);
  if (!lines) {
    const movers = moverSet(base, ids);
    lines = { moving: planeLines(base, F, (id) => movers.has(id)), targets: planeLines(base, F, (id) => !movers.has(id)) };
    m.set(key, lines);
  }
  return snapFlush(lines.moving, lines.targets, dx, dy, tol);
}
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
  // looking at the joints: their labels, without the grow, move and turn handles (a clearer joint stage)
  const jointsOn = prefs.joints;
  const foldT = useStore((s) => s.foldT);
  const hoverPart = useStore((s) => s.hoverPart);
  const openJoint = useStore((s) => s.openJoint);
  const panelGhost = useStore((s) => s.panelGhost);
  const fHinge = shown(useFeature('hinge')), fJoints = shown(useFeature('joints'));
  // Quick build shows parts made with Workshop tools read-only (milestone 37): no edges, gizmo or slide on them
  const quick = useMode() === 'quick';
  const locked = (id: string | null | undefined) => quick && !!id && !!workshopOnly(design, id);
  const [faceHover, setFaceHover] = useState<{ panelId: string; face: 1 | -1 } | null>(null);
  // the tour can leave panels off the stage for a step (the lid while drawing inside the box, milestone 43)
  const tourHidden = useStore((s) => {
    const st = s.tour && TOUR_STEPS[s.tour.step];
    return st?.hide ? st.hide(s.design).join(',') : '';
  });
  const hiddenIds = useMemo(() => new Set(tourHidden ? tourHidden.split(',') : []), [tourHidden]);
  // with the Board tool over the floor: the snapped point under the pointer (milestone 42)
  const [floorHover, setFloorHover] = useState<V3 | null>(null);
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
  // Show how it goes together (milestone 40): the folds close, then the pieces come in one at a time
  const assemble = useStore((s) => s.assemble);
  const display = useMemo(() => {
    const r = foldDisplay(design, assemble !== null ? assembleFold(assemble) : foldT);
    if (assemble !== null) for (const [id, m] of assembleLift(design, assemble)) r.xf.set(id, m.multiply(r.xf.get(id) ?? new THREE.Matrix4()));
    return r;
  }, [design, foldT, assemble]);
  const folded = foldT < 0.999 || assemble !== null;
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
        g.cur = [snap(p[0], ev), 0, snap(p[2], ev)];
        setDrawRect({ a: g.start, b: g.cur });
        setLabel({ text: `${fmtNum(Math.abs(g.cur[0] - g.start[0]))} × ${fmtNum(Math.abs(g.cur[2] - g.start[2]))}`, x: ev.clientX, y: ev.clientY });
      } else if (g.kind === 'ghost-draw') {
        const p = ray(ev.clientX, ev.clientY, g.plane);
        const cur = st.panelGhost;
        if (!p || !cur) return;
        // standing boards and dividers keep level and parallel; flat ones are drawn square to the face anyway
        const q = cur.pose === 'standing' ? snapLineEnd(st.design, cur.host, g.targets, cur.a, toLocal(g.H, p), tolAt(p), ev) : snapGhostPoint(g.targets, toLocal(g.H, p), tolAt(p), ev).p;
        st.set({ panelGhost: { ...cur, b: q } });
        const w = Math.abs(q.x - cur.a.x), h = Math.abs(q.y - cur.a.y);
        setLabel({ text: cur.pose === 'flat' ? `${fmtNum(w)} × ${fmtNum(h)}` : fmtNum(Math.hypot(w, h)), x: ev.clientX, y: ev.clientY });
      } else if (g.kind === 'content-move') {
        const p = ray(ev.clientX, ev.clientY, g.plane);
        if (!p) return;
        const l = toLocal(g.H, p);
        const x = Math.round(g.at.x + l.x - g.start.x), y = Math.round(g.at.y + l.y - g.start.y);
        st.preview((d) => {
          const c = d.contents?.find((k) => k.id === g.id);
          if (c) Object.assign(c, { x, y });
        });
      } else if (g.kind === 'placed-move') {
        const p = ray(ev.clientX, ev.clientY, g.plane);
        if (!p) return;
        const l = toLocal(g.H, p);
        const fl = noSmartSnap(ev) ? null : flushMove(st.txnBase ?? st.design, [g.id], g.H, l.x - g.start.x, l.y - g.start.y, tolAt(p) * 1.5);
        const dx = fl ? fl.dx : snap(l.x - g.start.x, ev), dy = fl ? fl.dy : snap(l.y - g.start.y, ev);
        st.preview((d) => movePlaced(d, g.id, dx, dy));
      } else if (g.kind === 'shape-draw') {
        const panel = st.design.panels[g.panelId];
        const p = ray(ev.clientX, ev.clientY, g.plane);
        if (!panel || !p) return;
        const l = toLocal(panel.frame, p);
        const ctx = noSmartSnap(ev) ? null : snapContext(st.txnBase ?? st.design, g.panelId, new Set([g.id]));
        const sn = ctx ? snapPoint(ctx, l, tolAt(p)) : null;
        const x = sn?.dx ? l.x + sn.dx : snap(l.x, ev), y = sn?.dy ? l.y + sn.dy : snap(l.y, ev);
        setGuides(sn && sn.guides.length ? { panelId: g.panelId, guides: sn.guides, targets: sn.targets } : null);
        const shape = st.tool === 'circle' || st.tool === 'roundrect' ? st.tool : 'rect';
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
        const ctx = noSmartSnap(ev) ? null : snapContext(base, g.panelId, new Set(g.ids));
        const sn = ctx ? snapBox(ctx, { minX: g.box.minX + dx, maxX: g.box.maxX + dx, minY: g.box.minY + dy, maxY: g.box.maxY + dy }, tolAt(p)) : null;
        dx = sn?.dx ? dx + sn.dx : snap(dx, ev);
        dy = sn?.dy ? dy + sn.dy : snap(dy, ev);
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
        // snap to other floor panels' corners and edges (Alt: off), otherwise to the grid
        const raw = [p[0] - g.start[0], p[2] - g.start[2]];
        const base = st.txnBase ?? st.design;
        // flush against other panels first (floor-local y runs along −Z), then corners and edges of floor panels
        const fl = noSmartSnap(ev) ? null : flushMove(base, g.ids ?? [g.id], FLOOR_FRAME, raw[0], -raw[1], tolAt(p) * 1.5);
        const sn = fl || noSmartSnap(ev) ? null : snapFloor(base, g.id, raw[0], raw[1], tolAt(p));
        const dx = fl ? fl.dx : sn ? sn.dx : snap(raw[0], ev), dz = fl ? -fl.dy : sn ? sn.dz : snap(raw[1], ev);
        st.preview((d) => {
          for (const id of g.ids ?? [g.id]) movePanel(d, id, dx, dz);
        });
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
      if (g.kind === 'ghost-draw') {
        const cur = st.panelGhost;
        if (!cur) return;
        if (st.tool === 'panel') {
          // the Board tool (milestone 42): release makes the board (a click or a short drag makes nothing, the tool stays)
          if (cur.divider ? dividerGhost(st.design, cur) : ghostPlace(cur)) confirmPanelGhost();
          else st.set({ panelGhost: null });
          return;
        }
        // Quick build's Divider: a line too short is dropped; otherwise it waits for ✓ or ✕
        st.set({ panelGhost: (cur.divider ? dividerGhost(st.design, cur) : ghostPlace(cur)) ? { ...cur, drawing: false } : null });
        return;
      }
      if (g.kind === 'panel-draw' && st.tool === 'box') {
        setDrawRect(null);
        boxFootprintGo(g.start, g.cur);
        return;
      }
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
        if (made) {
          // a ghost until ✓ (milestone 30)
          st.select(detailSel([g.id]));
          st.beginPending({ kind: 'shape', ids: [g.id], panelId: g.panelId });
        }
      } else {
        st.commit();
      }
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && drag.current) {
        if (drag.current.kind === 'ghost-draw') useStore.getState().set({ panelGhost: null });
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
    // a paste following the pointer: a click puts it down (it then waits for ✓)
    if (useStore.getState().pasting && e.button === 0) {
      e.stopPropagation();
      useStore.getState().set({ pasting: false });
      return;
    }
    if (folded) {
      // while a net is unfolded the parts can be looked at and selected, not edited
      if (e.button !== 0) return;
      e.stopPropagation();
      useStore.getState().select({ kind: 'panel', id: p.id });
      return;
    }
    if (tool === 'polygon') return polyRef.current?.start(e, p);
    if (tool === 'box') return;
    if (tool === 'divider') {
      if (e.button !== 0) return;
      e.stopPropagation();
      const pt: V3 = [e.point.x, e.point.y, e.point.z];
      // on a box's base, or on a part of the box (a wall, a lid): the line is drawn on its base
      const host = (() => {
        for (let id: string | undefined = p.id, k = 0; id && k < 20; id = parentConnection(design, id)?.a.panelId, k++) if (isBoxBase(design, id)) return id;
        return null;
      })();
      if (!host) return;
      const hf = hostFace(design, host, 1);
      const hit = hf && host !== p.id ? new THREE.Ray(camera.position.clone(), new THREE.Vector3(...pt).sub(camera.position).normalize()).intersectPlane(hf.plane, new THREE.Vector3()) : null;
      return startGhost(e, host, 1, hit ? [hit.x, hit.y, hit.z] : pt, true);
    }
    if (tool === 'sticker') {
      if (e.button !== 0) return;
      e.stopPropagation();
      const l = toLocal(p.frame, [e.point.x, e.point.y, e.point.z]);
      placeSticker(p.id, l.x, l.y);
      return;
    }
    if (tool === 'panel') {
      const pt: V3 = [e.point.x, e.point.y, e.point.z];
      return panelDown(e, p.id, faceAt(design, p, pt), pt);
    }
    if (tool === 'text') {
      if (e.button !== 0) return;
      e.stopPropagation();
      const l = toLocal(p.frame, [e.point.x, e.point.y, e.point.z]);
      placeText(p.id, l.x, l.y);
      return;
    }
    if (tool === 'rect' || tool === 'circle' || tool === 'roundrect') {
      // another drawing drops a shape still waiting for ✓
      useStore.getState().cancelPending();
      const l = toLocal(p.frame, [e.point.x, e.point.y, e.point.z]);
      const ctx = noSmartSnap(e.nativeEvent) ? null : snapContext(design, p.id, new Set());
      const sn = ctx ? snapPoint(ctx, l, tolAt([e.point.x, e.point.y, e.point.z])) : null;
      const start = { x: sn?.dx ? l.x + sn.dx : snap(l.x, e.nativeEvent), y: sn?.dy ? l.y + sn.dy : snap(l.y, e.nativeEvent) };
      const nid = newId('x');
      setDrawingId(nid);
      begin(e, { kind: 'shape-draw', panelId: p.id, id: nid, start, plane: planeOf(p, e.point) });
    } else if (tool === 'select') {
      e.stopPropagation();
      const stx = useStore.getState();
      // Shift (or Ctrl, Cmd on a Mac) adds or removes a panel (milestone 31)
      const ne = e.nativeEvent;
      const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
      if (ne.shiftKey || (mac ? ne.metaKey : ne.ctrlKey)) {
        stx.clickPanel(p.id, true);
        return;
      }
      // a panel already among several selected keeps the group (to drag it)
      const group = selectedPanelIds(stx.selection);
      if (!(group.length > 1 && group.includes(p.id))) useStore.getState().select({ kind: 'panel', id: p.id });
      // a panel placed on a face moves in that face's plane
      const pl = p.place;
      const hf = pl && pl.host !== null ? hostFace(design, pl.host, pl.face) : null;
      if (locked(p.id)) return;
      if (hf && e.button === 0) {
        setControls(false);
        drag.current = { kind: 'placed-move', id: p.id, plane: hf.plane, H: hf.H, start: toLocal(hf.H, [e.point.x, e.point.y, e.point.z]) };
      } else if (!parentConnection(design, p.id) && e.button === 0) {
        setControls(false);
        // dragging one of several selected floor panels moves them all
        const ids = group.length > 1 && group.includes(p.id) && 'surface' in commonPlane(design, group) ? group : undefined;
        drag.current = { kind: 'panel-move', id: p.id, ids, start: [e.point.x, e.point.y, e.point.z], plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -e.point.y) };
      }
    }
  };

  const onDetailDown = (p: Panel, id: string) => (e: ThreeEvent<PointerEvent>) => {
    if (tool !== 'select' || folded || useStore.getState().pasting) return onPanelDown(p)(e);
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
    if (locked(p.id)) return e.stopPropagation();
    const boxes = group.map((x) => findDetail(design, x)).filter((f) => f && f.panel.id === p.id).map((f) => detailBBox(f!.detail));
    const box = { minX: Math.min(...boxes.map((b) => b.minX)), maxX: Math.max(...boxes.map((b) => b.maxX)), minY: Math.min(...boxes.map((b) => b.minY)), maxY: Math.max(...boxes.map((b) => b.maxY)) };
    const l = toLocal(p.frame, [e.point.x, e.point.y, e.point.z]);
    begin(e, { kind: 'detail-move', ids: group, panelId: p.id, start: l, box, plane: planeOf(p, e.point) });
  };

  const onGroundDown = (e: ThreeEvent<PointerEvent>) => {
    if (tool === 'polygon') return polyRef.current?.start(e, null);
    if (tool === 'box') {
      // Quick build's Box (milestone 38): drag the footprint on the floor
      if (e.button !== 0) return;
      e.stopPropagation();
      const p: V3 = [snap(e.point.x, e.nativeEvent), 0, snap(e.point.z, e.nativeEvent)];
      setControls(false);
      drag.current = { kind: 'panel-draw', start: p, cur: p };
      return;
    }
    if (tool !== 'panel') return;
    panelDown(e, null, 1, [e.point.x, 0, e.point.z]);
  };

  /**
   * The Board tool (milestone 42): pressing on the floor or a face starts the
   * board there at once, flat or standing as the rail's Board / Standing board button chose; a
   * standing line on a box's base is a divider line.
   */
  const panelDown = (e: ThreeEvent<PointerEvent>, host: string | null, face: 1 | -1, pt: V3) => {
    if (e.button !== 0) return;
    setFloorHover(null);
    startGhost(e, host, face, pt, drawsDivider(design, useStore.getState().panelPose, host, face));
  };

  /** The Board tool: start a ghost on the floor (host null) or a panel's face, from the snapped point under the pointer. */
  const startGhost = (e: ThreeEvent<PointerEvent>, host: string | null, face: 1 | -1, point: V3, divider = false) => {
    const hf = hostFace(design, host, face);
    if (!hf || e.button !== 0) return;
    const targets = faceTargets(design, host, face);
    const q = snapGhostPoint(targets, toLocal(hf.H, point), tolAt(point), e.nativeEvent).p;
    const st = useStore.getState();
    st.set({ panelGhost: { host, face, pose: divider ? 'standing' : st.panelPose, a: q, b: q, height: st.standHeight, side: 1, drawing: true, ...(divider ? { divider: true } : {}) } });
    begin(e, { kind: 'ghost-draw', plane: hf.plane, H: hf.H, targets });
  };

  const { camera, gl, invalidate, scene } = useThree();
  // the first-use tour (milestone 43) points at places on the stage and starts from a known camera
  useEffect(() => {
    if (!controls) return;
    const ctl = controls as unknown as { target: THREE.Vector3; update(): void };
    registerStage({
      project: (p) => {
        const v = new THREE.Vector3(...p).project(camera);
        if (v.z > 1) return null;
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      setCamera: (pos, target) => {
        camera.position.set(...pos);
        ctl.target.set(...target);
        ctl.update();
        camera.updateMatrixWorld();
        invalidate();
      },
    });
    return () => registerStage(null);
  }, [camera, gl, controls]);
  useEffect(() => {
    // Test hook: screen position of a point on a panel (local mm coordinates).
    const w = window as unknown as { __cutforge?: Record<string, unknown> };
    if (!w.__cutforge) return;
    w.__cutforge.project = (panelId: string, x: number, y: number, top = true) => {
      const p = useStore.getState().design.panels[panelId];
      if (!p) return null;
      const z = faceZ(p, tOf(useStore.getState().design, panelId))[top ? 1 : 0];
      const v = new THREE.Vector3(x, y, z).applyMatrix4(frameMatrix(p.frame)).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    // a point on a panel's face: 1 its material side, −1 its plane (milestone 29)
    w.__cutforge.projectFace = (panelId: string, x: number, y: number, face: 1 | -1 = 1) => {
      const d = useStore.getState().design;
      const p = d.panels[panelId];
      if (!p) return null;
      const v = new THREE.Vector3(...toWorld(p.frame, x, y, face === 1 ? tOf(d, panelId) : 0)).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    w.__cutforge.projectWorld = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    // Test hook: screen centre of a stage handle by its test id (milestone 40)
    w.__cutforge.handleAt = (testId: string) => {
      scene.updateMatrixWorld(true);
      let at: THREE.Vector3 | null = null;
      scene.traverse((o) => {
        if (!at && o.userData?.testId === testId) at = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      });
      if (!at) return null;
      const v = (at as THREE.Vector3).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    w.__cutforge.camera = () => ({ position: camera.position.toArray().map((x) => Math.round(x * 1000) / 1000), ortho: camera instanceof THREE.OrthographicCamera });
    // Test hook: world bounding boxes of the panels and glue flaps as drawn (after the fold view's transforms).
    w.__cutforge.stageBoxes = () => {
      scene.updateMatrixWorld(true);
      const out: { panels: Record<string, number[]>; flaps: { owner: string; on: string; box: number[] }[]; colors: Record<string, string> } = { panels: {}, flaps: [], colors: {} };
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const box = () => new THREE.Box3().setFromObject(mesh).min.toArray().concat(new THREE.Box3().setFromObject(mesh).max.toArray());
        if (mesh.userData.panelId) {
          out.panels[mesh.userData.panelId] = box();
          const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
          if (mat?.color) out.colors[mesh.userData.panelId] = '#' + mat.color.getHexString();
        }
        else if (mesh.userData.flapOwner) out.flaps.push({ owner: mesh.userData.flapOwner, on: mesh.userData.flapOn, box: box() });
      });
      return out;
    };
    // Test hook: put the camera at `pos`, looking at `target`.
    w.__cutforge.setCamera = (pos: V3, target: V3) => {
      const ctl = controls as unknown as { target: THREE.Vector3; update(): void } | null;
      camera.position.set(...pos);
      if (ctl) {
        ctl.target.set(...target);
        ctl.update();
      } else camera.lookAt(...target);
      camera.updateMatrixWorld();
      invalidate();
    };
  }, [camera, gl, controls, scene]);

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
  const selAlso = selectedPanelIds(sel);
  // several panels selected (milestone 31): the group gizmo instead of one panel's widgets
  const multi = selAlso.length > 1;
  const selPanel = sel?.kind === 'panel' && !multi ? sel.id : null;
  const selDetailPanels = useMemo(() => new Set(selectedDetailIds(sel).map((id) => findDetail(design, id)?.panel.id)), [sel, design]);
  const focus = selPanel;
  const selGrown = selPanel ? parentConnection(design, selPanel) : undefined;
  const selLocked = locked(selPanel);
  const shapeLocked = sel?.kind === 'detail' && locked(findDetail(design, sel.id)?.panel.id);

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
      {/* no contact shadow (BUGFIX_PLAN U2): drei's one-frame capture drew it away from the boxes */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={onGroundDown}
        onPointerMove={(e) => {
          if (tool !== 'panel' || folded) return;
          // the floor is hovered only where nothing stands in front of it
          if (e.intersections[0]?.object !== e.object) return floorHover && setFloorHover(null);
          if (faceHover) setFaceHover(null);
          const q: V3 = [snap(e.point.x, e.nativeEvent), 0, snap(e.point.z, e.nativeEvent)];
          if (!floorHover || floorHover[0] !== q[0] || floorHover[2] !== q[2]) setFloorHover(q);
        }}
        onPointerOut={() => floorHover && setFloorHover(null)}
        onClick={(e) => tool === 'select' && e.delta < 4 && performance.now() - closedAt.t > 600 && e.intersections[0]?.object === e.object && useStore.getState().select(null)} visible={false}>
        <planeGeometry args={[4000, 4000]} />
        <meshBasicMaterial />
      </mesh>
      {design.order.map((id, index) => {
        const p = design.panels[id];
        if (!p || hiddenIds.has(id)) return null;
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
            showEdges={(tool === 'select' || tool === 'wall') && !folded && !jointsOn && (selPanel === id || hoverPart === id) && !locked(id)}
            edges={!jointsOn}
            selDetails={selectedDetailIds(sel)}
            selEdge={selEdge && selEdge.panelId === id ? selEdge.edge : null}
            tool={tool}
            folded={folded}
            onPanelDown={onPanelDown(p)}
            onHoverPoint={!folded ? (pt) => {
              if (tool === 'panel') {
                if (floorHover) setFloorHover(null);
                const face = faceAt(design, p, pt);
                if (faceHover?.panelId !== p.id || faceHover.face !== face) setFaceHover({ panelId: p.id, face });
              }
              // where a paste lands; a paste being placed follows the pointer (milestone 33)
              const st = useStore.getState();
              const l = toLocal(p.frame, pt);
              st.pointerHit = { panelId: p.id, x: l.x, y: l.y, tol: tolAt(pt) };
              if (st.pasting) st.movePaste(p.id, gridSnap(l.x), gridSnap(l.y), tolAt(pt));
            } : undefined}
            onDetailDown={(did) => onDetailDown(p, did)}
            onDouble={() => useStore.getState().openSolo(id)}
            inert={!!editOutline}
            cutHit={!!cutHits?.has(id)}
            through={throughMap.get(id)}
          />
        );
      })}
      <Flaps d={design} xf={display.xf} foldT={foldT} />
      {folded && <NetOverlapMarks d={design} xf={display.xf} />}
      {foldOvers.map((fo) => (
        <FoldOverObject key={fo.f.id} d={design} p={design.panels[fo.panelId]} g={fo.g} m={display.xf.get(fo.panelId) ?? IDM} foldT={foldT} index={design.order.indexOf(fo.panelId)} />
      ))}
      {display.bends.map((b) => (
        <BendBead key={b.id} b={b} d={design} index={design.order.indexOf(b.panelId)} outlines={prefs.outlines} />
      ))}
      {guides && design.panels[guides.panelId] && <SnapGuides p={design.panels[guides.panelId]} t={design.material.thickness} g={guides} />}
      {selEdge && !folded && !jointsOn && <GrowGhost d={design} panelId={selEdge.panelId} edge={selEdge.edge} m={display.xf.get(selEdge.panelId) ?? IDM} />}
      {selPanel && design.panels[selPanel] && tool === 'select' && !folded && !jointsOn && editOutline !== selPanel && (
        <PanelWidgets d={design} p={design.panels[selPanel]} m={display.xf.get(selPanel) ?? IDM} dims={prefs.dims} />
      )}
      {activeThrough && (
        <StageHtml position={W(display.xf.get(activeThrough.panel.id) ?? IDM, activeThrough.panel.frame, activeThrough.detail.cx, activeThrough.detail.cy, design.material.thickness)} style={{ pointerEvents: 'none' }}>
          <span className="through-badge" data-testid="through-count">
            {t('through.cuts', { n: cutHits?.size ?? 0 })}
          </span>
        </StageHtml>
      )}
      {tool === 'select' && !folded && !jointsOn && selAlso.length === 2 && <DividerButton d={design} a={selAlso[0]} b={selAlso[1]} />}
      {tool === 'polygon' && !folded && <PolygonTool ref={polyRef} setControls={setControls} />}
      {(tool === 'panel' || tool === 'divider') && !folded && <PanelGhostView d={design} />}
      {!folded && <PendingBar d={design} m={(id) => display.xf.get(id) ?? IDM} />}
      {tool === 'panel' && !folded && !panelGhost && faceHover && design.panels[faceHover.panelId] && <FaceHover d={design} panelId={faceHover.panelId} face={faceHover.face} />}
      {tool === 'panel' && !folded && !panelGhost && floorHover && <FloorHover at={floorHover} />}
      {extrude && design.panels[extrude.baseId] && !folded && <TrayGhost d={design} baseId={extrude.baseId} height={extrude.height} m={display.xf.get(extrude.baseId) ?? IDM} />}
      {selPanel && editOutline === selPanel && tool === 'select' && !folded && design.panels[selPanel] && (
        <OutlineHandles p={design.panels[selPanel]} m={display.xf.get(selPanel) ?? IDM} t={design.material.thickness} />
      )}
      {selPanel && tool === 'select' && !folded && !jointsOn && selGrown && editOutline !== selPanel && fHinge && !selLocked && <HingeWidget d={design} c={selGrown} m={display.xf.get(selGrown.a.panelId) ?? IDM} />}
      {selPanel && tool === 'select' && !folded && !jointsOn && selGrown && editOutline !== selPanel && !selLocked && (
        <DividerSlide key="divider-slide" d={design} id={selPanel} m={display.xf.get(selPanel) ?? IDM} tolAt={tolAt} />
      )}
      {multi && tool === 'select' && !folded && !jointsOn && !selAlso.some(locked) && <GroupGizmo d={design} ids={selAlso} tolAt={tolAt} />}
      {selPanel && tool === 'select' && !folded && !jointsOn && !selGrown && editOutline !== selPanel && !selLocked && design.panels[selPanel] && (
        design.panels[selPanel].place?.host ? (
          <>
            <PlacedGizmo d={design} p={design.panels[selPanel]} m={display.xf.get(selPanel) ?? IDM} tolAt={tolAt} />
            {design.panels[selPanel].place?.pose === 'standing' && <PlacedFlip d={design} p={design.panels[selPanel]} m={display.xf.get(selPanel) ?? IDM} />}
          </>
        ) : (
          <FloorGizmo d={design} p={design.panels[selPanel]} m={display.xf.get(selPanel) ?? IDM} tolAt={tolAt} />
        )
      )}
      {sel?.kind === 'detail' && tool === 'select' && !folded && !jointsOn && !editOutline && !shapeLocked && (
        <ShapeGizmo d={design} ids={sel.ids} m={display.xf.get(findDetail(design, sel.id)?.panel.id ?? '') ?? IDM} tolAt={tolAt} />
      )}
      {sel?.kind === 'detail' && sel.ids.length === 1 && tool === 'select' && !folded && !jointsOn && !editOutline && !shapeLocked && <ThroughEdit d={design} id={sel.id} tolAt={tolAt} />}
      {!folded && <ContentsView d={design} xf={display.xf} onDown={(c, e) => {
        if (tool !== 'select' || e.button !== 0) return;
        e.stopPropagation();
        const base = design.panels[c.baseId];
        const hf = hostFace(design, c.baseId, 1);
        if (!base || !hf) return;
        setControls(false);
        const q = toLocal(hf.H, [e.point.x, e.point.y, e.point.z]);
        drag.current = { kind: 'content-move', id: c.id, plane: hf.plane, H: hf.H, start: q, at: { x: c.x, y: c.y } };
      }} />}
      {!folded && quick && <GuardOverlay d={design} panelId={inTxn ? (drawingId ? findDetail(design, drawingId)?.panel.id : sel?.kind === 'detail' ? findDetail(design, sel.id)?.panel.id : undefined) : undefined} xf={display.xf} />}
      {!folded && (fJoints || prefs.joints) && <SeamPills d={design} focus={prefs.joints ? focus : null} all={prefs.joints} xf={display.xf} openJoint={openJoint} />}
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
  /** Grow edges are offered (not while the joints are being looked at). */
  edges?: boolean;
  selDetails: string[];
  selEdge: string | null;
  tool: string;
  folded: boolean;
  onPanelDown: (e: ThreeEvent<PointerEvent>) => void;
  /** The Panel tool: the point under the pointer on this panel (to show which face it would draw on). */
  onHoverPoint?: (point: V3) => void;
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
  const t = tOf(d, p.id);
  const geom = useMemo(() => panelGeometry(d, p), [d.material, d.materials, d.connections, p, props.through]);
  const removed = useMemo(() => !!props.through && removedByCut(d, p.id), [d, p.id, props.through]);
  const outline = useMemo(() => (props.outlines ? new THREE.EdgesGeometry(geom, 25) : null), [geom, props.outlines]);
  const matrix = useMemo(() => props.m.clone().multiply(frameMatrix(p.frame)), [p.frame, props.m]);
  const [z0, z1] = faceZ(p, t);
  useEffect(() => () => geom.dispose(), [geom]);
  useEffect(() => () => outline?.dispose(), [outline]);
  const lift = props.emphasis === 1 ? 0.07 : props.emphasis === 0.5 ? 0.025 : props.emphasis === -1 ? -0.03 : 0;
  const mats = useMemo(() => {
    const c = boardColors(d, p.id, props.index, lift);
    return [new THREE.MeshStandardMaterial({ color: c.face, roughness: 0.88, metalness: 0 }), new THREE.MeshStandardMaterial({ color: c.edge, roughness: 0.92, metalness: 0 })];
  }, [d.material, d.materials, p.material, props.index, lift]);
  useEffect(() => () => mats.forEach((x) => x.dispose()), [mats]);
  const free = panelEdges(p).filter((e) => segLength(e) >= MIN_PANEL && !isCurveKey(e.key) && edgeHasRoom(d, p.id, e.key, MIN_PANEL));
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
        onPointerMove={props.onHoverPoint ? (e) => props.onHoverPoint!([e.point.x, e.point.y, e.point.z]) : undefined}
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
      {(tool === 'select' || tool === 'wall') && props.edges !== false && !props.folded && !props.inert && free.map((e) => <EdgeHandle key={e.key} p={p} seg={e} t={t} z0={z0} z1={z1} show={props.showEdges} active={selEdge === e.key} />)}
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
  const ray = useRayFromScreen();
  /** Where along the edge (mm from its start) the pointer is, snapped to the edge's targets (Alt, or smart snapping off: the grid). */
  const spanAt = (clientX: number, clientY: number, A: THREE.Vector3, D: THREE.Vector3, ev: { altKey: boolean }): number => {
    const sRaw = Math.max(0, Math.min(L, closestOnLine(ray(clientX, clientY), A, D)));
    const tol = SNAP_PX * mmPerPx(camera, size.height, A.clone().addScaledVector(D, sRaw));
    const sn = noSmartSnap(ev) ? null : snapTo(sRaw, spanTargets(useStore.getState().design, p.id, edge), tol);
    return Math.max(0, Math.min(L, sn ?? gridSnap(sRaw, ev)));
  };
  const startSpanPick = (ev: ThreeEvent<PointerEvent>) => {
    const parent = hits.current[0]?.parent;
    if (!parent) return;
    const A = parent.localToWorld(new THREE.Vector3(seg.a.x, seg.a.y, mid)), B = parent.localToWorld(new THREE.Vector3(seg.b.x, seg.b.y, mid));
    const D = B.clone().sub(A).normalize();
    const st = useStore.getState();
    const s = spanAt(ev.nativeEvent.clientX, ev.nativeEvent.clientY, A, D, ev.nativeEvent);
    const sp = st.spanPick;
    // the second of two Cmd/Ctrl-clicks on this edge sets the end
    if (sp && sp.panelId === p.id && sp.edge === edge && sp.s1 === null) {
      if (Math.abs(s - sp.s0) >= MIN_PANEL) st.setGrow({ span: [Math.min(sp.s0, s), Math.max(sp.s0, s)], sketch: null });
      st.set({ spanPick: null });
      return;
    }
    if (!(st.selection?.kind === 'edge' && st.selection.panelId === p.id && st.selection.edge === edge)) st.select({ kind: 'edge', panelId: p.id, edge });
    st.set({ spanPick: { panelId: p.id, edge, s0: s, s1: s, typed: '' } });
    const { controls } = (three as unknown as { controls: { enabled: boolean } | null });
    if (controls) controls.enabled = false;
    const move = (e: PointerEvent) => {
      const cur = useStore.getState().spanPick;
      if (!cur || cur.s1 === null) return;
      const s1 = spanAt(e.clientX, e.clientY, A, D, e);
      useStore.getState().set({ spanPick: { ...cur, s1 } });
      if (Math.abs(s1 - cur.s0) >= MIN_PANEL) useStore.getState().setGrow({ span: [Math.min(cur.s0, s1), Math.max(cur.s0, s1)], sketch: null });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (controls) controls.enabled = true;
      const cur = useStore.getState().spanPick;
      if (!cur) return;
      // hardly moved: a click; the next Cmd/Ctrl-click (or a typed distance) sets the end
      if (cur.s1 === null || Math.abs(cur.s1 - cur.s0) < MIN_PANEL) useStore.getState().set({ spanPick: { ...cur, s1: null } });
      else useStore.getState().set({ spanPick: null });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const three = useThree();
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
            const ne = ev.nativeEvent;
            const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
            // Cmd-drag (Mac) / Ctrl-drag: pick the part of the edge to grow on (milestone 35)
            if ((mac ? ne.metaKey : ne.ctrlKey) && shown(featureState('grow.advanced'))) return startSpanPick(ev);
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

/** With the Board tool over the floor: a small square at the snapped point under the pointer (milestone 42). */
function FloorHover({ at }: { at: V3 }) {
  const geom = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints([[-7, -7], [7, -7], [7, 7], [-7, 7]].map(([x, y]) => new THREE.Vector3(x, 0, y)));
  }, []);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <ScreenSized position={[at[0], 0.3, at[2]]}>
      <lineLoop geometry={geom} raycast={() => null} renderOrder={7}>
        <lineBasicMaterial color={STAGE.hover} depthTest={false} transparent opacity={0.95} />
      </lineLoop>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={6} userData={{ noAO: true, floorHover: true }}>
        <planeGeometry args={[14, 14]} />
        <meshBasicMaterial color={STAGE.hover} transparent opacity={0.3} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </ScreenSized>
  );
}

/**
 * What goes inside (milestone 40): each placed object as a translucent block
 * resting on its box's floor, green when it fits its compartment, amber with
 * the room it still needs when it does not. Drag one to move it.
 */
function ContentsView({ d, xf, onDown }: { d: Design; xf: Map<string, THREE.Matrix4>; onDown: (c: Content, e: ThreeEvent<PointerEvent>) => void }) {
  const t = useT();
  const items = (d.contents ?? []).filter((c) => d.panels[c.baseId]);
  if (!items.length) return null;
  return (
    <>
      {items.map((c) => {
        const base = d.panels[c.baseId];
        const fit = contentFit(d, c);
        const b = bundleSize(d, c);
        const z = tOf(d, c.baseId);
        const m = (xf.get(c.baseId) ?? IDM).clone().multiply(frameMatrix(base.frame));
        const need = [fit.need.w && t('inside.needW', { n: fmtNum(fit.need.w, 1) }), fit.need.d && t('inside.needD', { n: fmtNum(fit.need.d, 1) }), fit.need.h && t('inside.needH', { n: fmtNum(fit.need.h, 1) })].filter(Boolean).join(', ');
        return (
          <group key={c.id} matrixAutoUpdate={false} matrix={m} userData={{ noAO: true, content: c.id, fits: fit.ok }}>
            <mesh position={[c.x, c.y, z + b.h / 2 + 0.2]} onPointerDown={(e) => onDown(c, e)} renderOrder={4}>
              <boxGeometry args={[b.w, b.d, b.h]} />
              <meshStandardMaterial color={fit.ok ? '#3bb273' : '#e0a030'} transparent opacity={0.45} depthWrite={false} />
              <Edges color={fit.ok ? '#1f7a4a' : '#9a6400'} />
            </mesh>
            <StageHtml position={[c.x, c.y, z + b.h + 4]} style={{ pointerEvents: 'none' }}>
              <span className={`w-dim ghost content-tag ${fit.ok ? 'ok' : 'no'}`} data-testid="content-tag" data-object={c.object} data-ok={fit.ok}>
                {(c.count ?? 1) > 1 ? `${c.count} × ` : ''}
                {t(objectById(c.object).key)} {fit.ok ? '✓' : fit.cell ? `· ${need}` : `· ${t('inside.noCell')}`}
              </span>
            </StageHtml>
          </group>
        );
      })}
    </>
  );
}

/**
 * Quick build's guardrails on the stage (milestone 39): while a shape is being
 * dragged, the keep-out zones of its panel as a faint amber line; when an
 * edit was kept from one, a tooltip saying why.
 */
function GuardOverlay({ d, panelId, xf }: { d: Design; panelId?: string; xf: Map<string, THREE.Matrix4> }) {
  const t = useT();
  const note = useStore((s) => s.guardNote);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!note) return;
    const h = setTimeout(() => tick((x) => x + 1), 2600);
    return () => clearTimeout(h);
  }, [note]);
  const zones = useMemo(() => (panelId ? keepOutZones(d, panelId) : null), [d, panelId]);
  const lines = useMemo(() => {
    if (!zones || !panelId) return null;
    const p = d.panels[panelId];
    const z = tOf(d, panelId) + 0.4;
    const ring = (pts: P2[]) => pts.map((q) => new THREE.Vector3(...toWorld(p.frame, q.x, q.y, z)));
    const geo = (pts: THREE.Vector3[]) => new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
    return [zones.inset, ...zones.holes].filter((r) => r.length > 2).map((r) => geo(ring(r)));
  }, [zones, d, panelId]);
  useEffect(() => () => lines?.forEach((g) => g.dispose()), [lines]);
  const f = note && Date.now() - note.at < 2500 ? findDetail(d, note.detailId) : null;
  const m = panelId ? (xf.get(panelId) ?? IDM) : IDM;
  return (
    <>
      {lines && (
        <group matrixAutoUpdate={false} matrix={m} userData={{ noAO: true }}>
          {lines.map((g, i) => (
            <line key={i}>
              <primitive object={g} attach="geometry" />
              <lineBasicMaterial color="#d08a1a" transparent opacity={0.75} depthTest={false} />
            </line>
          ))}
        </group>
      )}
      {f && note && (
        <StageHtml position={W(xf.get(f.panel.id) ?? IDM, f.panel.frame, f.detail.cx, f.detail.cy + f.detail.h / 2 + 4, tOf(d, f.panel.id))} style={{ pointerEvents: 'none' }}>
          <span className="guard-tip" data-testid="guard-tip" data-why={note.why}>
            {t(`guard.${note.why}`, { mm: fmtNum(note.mm, 1) })}
          </span>
        </StageHtml>
      )}
    </>
  );
}

/** Rounded bend along a fold, with the crease (score line) on its outside. */
function BendBead({ b, d, index, outlines }: { b: Bend; d: Design; index: number; outlines: boolean }) {
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.axis), [b.axis]);
  const color = useMemo(() => boardColors(d, b.panelId, Math.max(0, index)).face, [d.material, d.materials, b.panelId, index]);
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

/** While a net is unfolded: where it would overlap when flat (milestone 35), in red on its root panel's plane. */
function NetOverlapMarks({ d, xf }: { d: Design; xf: Map<string, THREE.Matrix4> }) {
  const list = useMemo(() => netOverlaps(d), [d]);
  const items = useMemo(
    () =>
      list.flatMap((o, k) => {
        const root = d.panels[o.net];
        if (!root) return [];
        const z = tOf(d, root.id) + 0.3;
        return o.region.map((r, j) => {
          const shape = new THREE.Shape(r.map((q) => new THREE.Vector2(q.x, q.y)));
          const g = new THREE.ShapeGeometry(shape);
          const m = (xf.get(root.id) ?? IDM).clone().multiply(frameMatrix(root.frame)).multiply(new THREE.Matrix4().makeTranslation(0, 0, z * root.frame.side));
          return { key: `${k}.${j}`, g, m };
        });
      }),
    [list, xf, d],
  );
  useEffect(() => () => items.forEach((x) => x.g.dispose()), [items]);
  return (
    <>
      {items.map((x) => (
        <mesh key={x.key} geometry={x.g} matrixAutoUpdate={false} matrix={x.m} raycast={() => null} renderOrder={12} userData={{ netOverlap: true }}>
          <meshBasicMaterial color="#dc2626" transparent opacity={0.6} side={THREE.DoubleSide} depthTest={false} />
        </mesh>
      ))}
    </>
  );
}

function Flaps({ d, xf, foldT }: { d: Design; xf: Map<string, THREE.Matrix4>; foldT: number }) {
  const items = useMemo(() => {
    const out: { key: string; geom: THREE.BufferGeometry; matrix: THREE.Matrix4; index: number; owner: string; on: string }[] = [];
    for (const c of Object.values(d.connections)) {
      c.geom?.flaps3d.forEach((f, i) => {
        const p = d.panels[f.panelId];
        // coloured as the panel it is cut from, moving with it in the fold view
        const owner = f.owner && d.panels[f.owner] ? f.owner : f.panelId;
        if (p) out.push({ key: `${c.id}:${i}`, geom: flapGeometry(p, f.poly, f.z0, f.z1), matrix: flapMatrix(d, f, xf, foldT), index: d.order.indexOf(owner), owner, on: f.panelId });
      });
    }
    return out;
  }, [d.connections, d.panels, xf, foldT]);
  useEffect(() => () => items.forEach((x) => x.geom.dispose()), [items]);
  return (
    <>
      {items.map((x) => (
        <group key={x.key} matrixAutoUpdate={false} matrix={x.matrix}>
          <mesh geometry={x.geom} raycast={() => null} userData={{ flapOwner: x.owner, flapOn: x.on }}>
            <meshStandardMaterial color={boardColors(d, x.owner, x.index, -0.06).face} roughness={0.9} />
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
function hingeBasis(d: Design, parent: Panel, edge: string, m: THREE.Matrix4, s0 = 0, w?: number) {
  const [a, b] = edgeLocal(parent, edge);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const k = (s0 + knobAt(w ?? len)) / len;
  const o = W(m, parent.frame, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, tOf(d, parent.id) / 2);
  return { o, x: Wdir(m, inwardWorld(parent, edge)), y: Wdir(m, matDir(parent.frame)) };
}

/** Ghost of the panel that "Grow" would add, with its stage widgets: hinge ring, height arrow (snapping to other panels), span ends, height label, and outline handles when editing. */
function GrowGhost({ d, panelId, edge, m }: { d: Design; panelId: string; edge: string; m: THREE.Matrix4 }) {
  const t = useT();
  const grow = useStore((s) => s.grow);
  const setGrow = useStore((s) => s.setGrow);
  const { camera, size } = useThree();
  const parent = d.panels[panelId];
  const free = parent && edgeHasRoom(d, panelId, edge);
  const eg = useMemo(() => (parent ? effectiveGrow(d, panelId, edge, grow) : null), [d, panelId, edge, grow]);
  const kind = eg?.kind ?? growKind(d, grow, panelId);
  const check = parent ? checkHinge(d, panelId, edge, grow.angle, grow.height) : null;
  const blocked = !!check?.blocking;
  const th = parent ? tOf(d, parent.id) : d.material.thickness;
  const span = eg?.span ?? null;
  const frameAt = (h: number) => {
    const { angle, dir } = fromHinge(h);
    return spanFrame(parent, edge, angle, dir, th, seatingOf(kind), defaultOffset(d, kind, panelId), span);
  };
  const [snapped, setSnapped] = useState<number | null>(null);
  const ghost = useMemo(() => {
    if (!parent || !free || !eg?.ghost) return null;
    const p = eg.ghost;
    return { p, frame: p.frame, geom: panelGeometry(d, p, { joints: false }), matrix: m.clone().multiply(frameMatrix(p.frame)) };
  }, [d, parent, free, eg, m]);
  useEffect(() => () => ghost?.geom.dispose(), [ghost]);
  const w = ghost?.p.w ?? 0;
  const arcR = Math.max(10, Math.min(grow.height * 0.4, 45));
  const pointAt = useMemo(() => (a: number) => W(m, frameAt(a), knobAt(w), arcR, th / 2), [m, parent, edge, kind, arcR, w, span?.[0], span?.[1]]);
  const zoneAt = useMemo(() => (a: number) => checkHinge(d, panelId, edge, a, grow.height).zone, [d, panelId, edge, grow.height]);
  const angTargets = useMemo(() => (parent ? angleTargets(d, panelId, edge, grow.height, defaultOffset(d, kind), span) : []), [d, panelId, edge, grow.height, kind, span?.[0], span?.[1]]);
  const hTargets = useMemo(() => (eg?.plain ? heightTargets(d, eg.plain, new Set([panelId])) : []), [d, eg?.plain, panelId]);
  // Quick build (milestone 37): 90°, the whole edge, adapting: no dial, span ends or outline handles
  const advanced = shown(useFeature('grow.advanced'));
  // … and it starts at the height that fits: a lid across to the opposite wall, a wall as tall as its neighbours (milestone 38)
  useEffect(() => {
    if (!advanced) useStore.getState().setGrow({ height: quickWallHeight(useStore.getState().design, panelId, edge, useStore.getState().grow.height) });
  }, [panelId, edge, advanced]);
  // a fold whose net would overlap when flat (milestone 35): amber, with a way out
  const over = useMemo(() => (parent && free && eg?.ghost ? growOverlap(d, panelId, edge, grow) : []), [d, panelId, edge, grow, !!eg?.ghost, free]);
  if (!ghost || !check || !eg) return null;
  const f = ghost.frame;
  // the height arrow sits on the ghost's (trimmed) outline, at half its width
  const ghostTop = pushPullAnchors(ghost.p).height;
  const warn = blocked || over.length > 0;
  const color = warn ? STAGE.blocked : STAGE.ghost;
  // the ✓ bar sits a little below the height arrow (which points up from the top edge), never on it
  const barAt = W(m, f, w / 2, ghostTop.y, th / 2);
  const tolAt = (p: V3) => SNAP_PX * mmPerPx(camera, size.height, new THREE.Vector3(...p));
  // span ends along the parent edge
  const pe = findEdge(parent, edge)!;
  const L = segLength(pe);
  const sp = span ?? [0, L];
  const inl = segInward(pe), dir = segDir(pe);
  const edgeW = (s: number) => W(m, parent.frame, pe.a.x + dir.x * s + inl.x * eg.offset, pe.a.y + dir.y * s + inl.y * eg.offset, th);
  const freeAround = edgeFreeSpans(d, panelId, edge).find(([lo, hi]) => sp[0] + 1e-6 >= lo && hi >= sp[1] - 1e-6) ?? [0, L];
  const targets = spanTargets(d, panelId, edge);
  const setEnd = (i: 0 | 1, s: number, ev: PointerEvent) => {
    let v = Math.max(freeAround[0], Math.min(freeAround[1], s));
    const sn = noSmartSnap(ev) ? null : snapTo(v, targets, tolAt(edgeW(v)));
    v = sn ?? Math.round(v);
    const next: [number, number] = i === 0 ? [Math.min(v, sp[1] - MIN_PANEL), sp[1]] : [sp[0], Math.max(v, sp[0] + MIN_PANEL)];
    useStore.getState().setGrow({ span: next[0] <= 1e-6 && next[1] >= L - 1e-6 ? null : next, sketch: null });
  };
  return (
    <>
      <group matrixAutoUpdate={false} matrix={ghost.matrix} userData={{ noAO: true }}>
        <mesh geometry={ghost.geom} raycast={() => null}>
          <meshStandardMaterial color={color} transparent opacity={blocked ? 0.34 : STAGE.ghostOpacity} depthWrite={false} />
          <Edges threshold={25} lineWidth={2} color={warn ? '#a8690a' : STAGE.ghostEdge} />
        </mesh>
      </group>
      <ConfirmBar
        at={barAt}
        below
        onOk={() => void doGrow(panelId, edge)}
        onCancel={() => useStore.getState().select({ kind: 'panel', id: panelId })}
        okDisabled={blocked}
        okTestId="grow-go"
        testId="grow-ghost-bar"
      >
        {over.length > 0 && (
          <>
            <span className="warn" data-testid="grow-overlap">{t('grow.overlap', { panels: over.map((x) => panelLabel(d, x, t)).join(', ') })}</span>
            <button onClick={() => void doGrow(panelId, edge, ownGrowKind(d, panelId))} data-testid="grow-own">
              {t('grow.own')}
            </button>
          </>
        )}
      </ConfirmBar>
      {snapped !== null && <DimLine a={W(m, f, 0, snapped, th / 2)} b={W(m, f, w, snapped, th / 2)} tick={[0, 0, 0]} />}
      {advanced && <AngleArc
        pointAt={pointAt}
        hinge={hingeBasis(d, parent, edge, m, sp[0], w)}
        zoneAt={zoneAt}
        value={grow.angle}
        onChange={(a) => setGrow({ angle: a, sketch: grow.editGhost ? grow.sketch : null })}
        label={`${grow.angle}°`}
        message={hingeText(t, check)}
        testId="ghost-hinge"
        targets={angTargets}
      />}
      <PushPull
        at={W(m, f, ghostTop.x, ghostTop.y, th / 2)}
        axis={Wdir(m, f.v)}
        value={grow.height}
        offset={ghostTop.y - grow.height}
        min={5}
        max={2000}
        onPreview={(v) => {
          // the free edge snaps to other panels' edges, faces and heights
          const sn = snapTo(v, hTargets, tolAt(W(m, f, w / 2, v, th / 2)));
          setSnapped(sn);
          setGrow({ height: sn ?? v, sketch: grow.editGhost ? grow.sketch : null });
        }}
        onCommit={() => setSnapped(null)}
        onCancel={() => setSnapped(null)}
        testId="ghost-height"
      />
      {eg.offset === 0 && advanced &&
        ([0, 1] as const).map((i) => <SpanEnd key={i} at={edgeW(sp[i])} base={edgeW(0)} dir={Wdir(m, [parent.frame.u[0] * dir.x + parent.frame.v[0] * dir.y, parent.frame.u[1] * dir.x + parent.frame.v[1] * dir.y, parent.frame.u[2] * dir.x + parent.frame.v[2] * dir.y])} onMove={(s, ev) => setEnd(i, s, ev)} testId={`ghost-span-${i}`} />)}
      <DimLabel at={W(m, f, w, grow.height / 2, th / 2)} k="H" value={grow.height} unit={t('unit.mm')} ghost onCommit={(v) => setGrow({ height: v, sketch: null })} testId="ghost-dim-h" />
      {grow.editGhost && advanced && <GhostOutlineHandles ghost={ghost.p} m={m} th={th} />}
      <SpanPickLabel panelId={panelId} edge={edge} L={L} at={edgeW} />
    </>
  );
}

/**
 * Picking part of an edge (milestone 35): the end being placed shows its
 * distances from both ends of the edge; typing a number and Enter sets it (mm
 * from the edge's start); Esc cancels.
 */
function SpanPickLabel({ panelId, edge, L, at }: { panelId: string; edge: string; L: number; at: (s: number) => V3 }) {
  const t = useT();
  const sp = useStore((s) => s.spanPick);
  const mine = !!sp && sp.panelId === panelId && sp.edge === edge;
  useEffect(() => {
    if (!mine) return;
    const key = (ev: KeyboardEvent) => {
      const st = useStore.getState();
      const cur = st.spanPick;
      if (!cur) return;
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        st.set({ spanPick: null });
        st.setGrow({ span: null, sketch: null });
      } else if (/^[0-9.]$/.test(ev.key)) st.set({ spanPick: { ...cur, typed: cur.typed + ev.key } });
      else if (ev.key === 'Backspace') st.set({ spanPick: { ...cur, typed: cur.typed.slice(0, -1) } });
      else if (ev.key === 'Enter' && cur.typed) {
        ev.preventDefault();
        ev.stopPropagation();
        const v = Math.max(0, Math.min(L, Number(cur.typed)));
        if (Number.isFinite(v) && Math.abs(v - cur.s0) >= MIN_PANEL) st.setGrow({ span: [Math.min(cur.s0, v), Math.max(cur.s0, v)], sketch: null });
        st.set({ spanPick: null });
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [mine, L]);
  if (!sp || !mine) return null;
  const s = sp.s1 ?? sp.s0;
  return (
    <StageHtml position={at(s)} style={{ pointerEvents: 'none' }}>
      <span className="w-dim ghost span-pick" data-testid="span-pick-label" data-s0={sp.s0} data-s={s}>
        {sp.typed ? `${sp.typed} ${t('unit.mm')}` : t('grow.spanPick', { a: fmtNum(s), b: fmtNum(L - s) })}
      </span>
    </StageHtml>
  );
}

/** A span end of the grow ghost: a small handle on the parent edge that slides along it. */
function SpanEnd({ at, base, dir, onMove, testId }: { at: V3; base: V3; dir: V3; onMove: (s: number, ev: PointerEvent) => void; testId: string }) {
  const ray = useRayFromScreen();
  const [hover, setHover] = useState(false);
  const B = useMemo(() => new THREE.Vector3(...base), [base[0], base[1], base[2]]);
  const D = useMemo(() => new THREE.Vector3(...dir).normalize(), [dir[0], dir[1], dir[2]]);
  const grab = useRef(0);
  const down = useHandleDrag({
    move: (ev) => onMove(closestOnLine(ray(ev.clientX, ev.clientY), B, D) - grab.current, ev),
    end: () => undefined,
  });
  return (
    <ScreenSized position={at}>
      <mesh
        renderOrder={21}
        raycast={priorityRaycast}
        onPointerOver={(e) => (e.stopPropagation(), setHover(true))}
        onPointerOut={() => setHover(false)}
        onPointerDown={(e) => {
          grab.current = closestOnLine(e.ray, B, D) - new THREE.Vector3(...at).sub(B).dot(D);
          down(e);
        }}
        userData={{ testId, noAO: true }}
      >
        <boxGeometry args={[hover ? 13 : 11, hover ? 13 : 11, hover ? 13 : 11]} />
        <meshBasicMaterial color={hover ? '#0f5d59' : '#1fb8ac'} depthTest={false} depthWrite={false} transparent />
      </mesh>
    </ScreenSized>
  );
}

/** Outline handles on the grow ghost: drag its top corners, add and drag points on its free edges (whole millimetres). */
function GhostOutlineHandles({ ghost, m, th }: { ghost: Panel; m: THREE.Matrix4; th: number }) {
  const { camera, gl, controls } = useThree() as unknown as { camera: THREE.Camera; gl: THREE.WebGLRenderer; controls: { enabled: boolean } | null };
  const rc = useMemo(() => new THREE.Raycaster(), []);
  const mat = useMemo(() => m.clone().multiply(frameMatrix(ghost.frame)), [m, ghost.frame]);
  const s = ghost.sketch as WallSketch;
  const c = wallCorners(ghost.w, ghost.h, s);
  const ring = sketchRing(ghost);
  const k = mmPerPx(camera, gl.domElement.clientHeight || 600, new THREE.Vector3(...toWorld(ghost.frame, ghost.w / 2, ghost.h / 2))) * 7;
  const z = th + 0.3;
  const edit = (fn: (sk: WallSketch) => void) => {
    const g = useStore.getState().grow;
    const sk: WallSketch = JSON.parse(JSON.stringify(g.sketch ?? { kind: 'wall' }));
    fn(sk);
    useStore.getState().setGrow({ sketch: sk });
  };
  const drag = (at: (l: P2) => void) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (controls) controls.enabled = false;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...frameNormal(ghost.frame)), new THREE.Vector3(e.point.x, e.point.y, e.point.z));
    const frame = ghost.frame;
    const move = (ev: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      rc.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = rc.ray.intersectPlane(plane, new THREE.Vector3());
      if (hit) at(toLocal(frame, [hit.x, hit.y, hit.z]));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (controls) controls.enabled = true;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const corner = (name: 'tl' | 'tr', base: P2) => drag((l) => edit((sk) => void ((sk.corners ??= {})[name] = { dx: Math.round(l.x - base.x), dy: Math.round(l.y - base.y) })));
  const baseEdge = (edge: 'e1' | 'e2' | 'e3') => ({ a: c[Number(edge[1])], b: c[(Number(edge[1]) + 1) % 4] });
  const toInsert = (edge: 'e1' | 'e2' | 'e3', l: P2) => {
    const { a, b } = baseEdge(edge);
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
    return { t: Math.max(0.01, Math.min(0.99, ((l.x - a.x) * dx + (l.y - a.y) * dy) / L)), off: Math.round((l.x - a.x) * dy - (l.y - a.y) * dx) };
  };
  const ball = (id: string, q: P2, on: ((e: ThreeEvent<PointerEvent>) => void) | null, color: string) => (
    <mesh key={id} position={[q.x, q.y, z]} renderOrder={9} raycast={on ? priorityRaycast : () => null} onPointerDown={on ?? undefined} userData={{ vertex: id, testId: `ghost-${id}` }}>
      <sphereGeometry args={[k, 12, 10]} />
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={on ? 1 : 0.45} />
    </mesh>
  );
  return (
    <group matrixAutoUpdate={false} matrix={mat} userData={{ noAO: true }}>
      {ball('tr', c[2], corner('tr', { x: ghost.w, y: ghost.h }), STAGE.selected)}
      {ball('tl', c[3], corner('tl', { x: 0, y: ghost.h }), STAGE.selected)}
      {(s.inserts ?? []).map((ins) => {
        const seg = ring.find((e) => e.key === ins.id);
        return seg ? ball(ins.id, seg.a, drag((l) => edit((sk) => Object.assign(sk.inserts!.find((x) => x.id === ins.id)!, toInsert(ins.edge, l)))), STAGE.selected) : null;
      })}
      {ring
        .filter((e) => e.key !== 'e0')
        .map((e) => {
          const ins = (s.inserts ?? []).find((x) => x.id === e.key);
          const edge = (ins ? ins.edge : e.key) as 'e1' | 'e2' | 'e3';
          if (!['e1', 'e2', 'e3'].includes(edge)) return null;
          const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
          return (
            <mesh
              key={`m-${e.key}`}
              position={[mid.x, mid.y, z]}
              renderOrder={9}
              raycast={priorityRaycast}
              onPointerDown={(ev) => {
                if (ev.button !== 0) return;
                ev.stopPropagation();
                const at = toInsert(edge, mid);
                edit((sk) => void (sk.inserts = [...(sk.inserts ?? []), { id: newId('i'), edge, t: at.t, off: at.off }]));
              }}
              userData={{ testId: `ghost-add-${e.key}` }}
            >
              <boxGeometry args={[k * 1.2, k * 1.2, k * 1.2]} />
              <meshBasicMaterial color="#ffffff" depthTest={false} transparent opacity={0.9} />
            </mesh>
          );
        })}
    </group>
  );
}

/** Extrude preview: a ghost wall on every edge of the base, with a push-pull arrow for the shared height. */
function TrayGhost({ d, baseId, height, m }: { d: Design; baseId: string; height: number; m: THREE.Matrix4 }) {
  const t = useT();
  const base = d.panels[baseId];
  const th = base ? tOf(d, baseId) : d.material.thickness;
  const kind = newTrayKinds(d, baseId).wallKind;
  const ghosts = useMemo(() => {
    if (!base) return [];
    const h = Math.max(MIN_PANEL, wallHeight(d, kind, height, baseId));
    return panelEdges(base)
      .filter((e) => segLength(e) >= MIN_EDGE && !isCurveKey(e.key))
      .map((e) => {
        const frame = growFrame(base, e.key, 90, 'up', th, seatingOf(kind), defaultOffset(d, kind, baseId));
        const p: Panel = { id: `ghost-${e.key}`, name: '', w: segLength(e), h, sketch: { kind: 'wall' }, frame, details: [], ...(base.material ? { material: base.material } : {}) };
        return { key: e.key, p, geom: panelGeometry(d, p, { joints: false }), matrix: m.clone().multiply(frameMatrix(frame)) };
      });
  }, [d, base, height, kind, m, th]);
  useEffect(() => () => ghosts.forEach((g) => g.geom.dispose()), [ghosts]);
  // nets that lie flat (milestone 35): the tallest height that keeps the net one piece, and the walls changed past it
  const info = useMemo(() => trayFlatInfo(d, baseId, height), [d, baseId, height]);
  const fh = info && Number.isFinite(info.flatHeight) && info.flatHeight < 1000 ? info.flatHeight : null;
  const changed = new Set(Object.entries(info?.fixes ?? {}).filter(([, f]) => f !== 'trim').map(([k]) => k));
  if (!ghosts.length) return null;
  const first = ghosts[0].p;
  const setH = (v: number) => {
    const ex = useStore.getState().extrude;
    // the arrow snaps to the flat height
    const snapped = fh !== null && Math.abs(v - fh) <= 2 ? fh : Math.round(v);
    if (ex) useStore.getState().set({ extrude: { ...ex, height: snapped } });
  };
  const hf = fh !== null ? wallHeight(d, kind, fh, baseId) : null;
  return (
    <>
      {ghosts.map((g) => (
        <group key={g.key} matrixAutoUpdate={false} matrix={g.matrix} userData={{ noAO: true, trayGhost: g.key, changed: changed.has(g.key) }}>
          <mesh geometry={g.geom} raycast={() => null}>
            <meshStandardMaterial color={changed.has(g.key) ? STAGE.blocked : STAGE.ghost} transparent opacity={STAGE.ghostOpacity} depthWrite={false} />
            <Edges threshold={25} lineWidth={2} color={changed.has(g.key) ? '#9a6400' : STAGE.ghostEdge} />
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
      <ConfirmBar
        at={W(m, first.frame, first.w / 2, first.h, th / 2)}
        below
        onOk={extrudeGo}
        onCancel={extrudeCancel}
        okTestId="extrude-go"
        cancelTestId="extrude-cancel"
        testId="tray-ghost-bar"
      />
      {hf !== null && hf > 0 && (
        <>
          <DimLine a={W(m, first.frame, -4, hf, th)} b={W(m, first.frame, first.w + 4, hf, th)} tick={v3mul(Wdir(m, first.frame.v), 2)} />
          <StageHtml position={W(m, first.frame, -6, hf, th)}>
            <div className="flat-tick" data-testid="flat-tick" data-h={fh}>
              {t('flat.tick', { h: fmtNum(fh!, 1) })}
            </div>
          </StageHtml>
        </>
      )}
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
  const th = tOf(d, c.a.panelId), tc = tOf(d, c.b.panelId);
  const h = hingeOf(c.angle, c.dir);
  const [refused, setRefused] = useState<string | undefined>();
  const pointAt = useMemo(() => {
    if (!parent || !child) return () => [0, 0, 0] as V3;
    const r = Math.max(10, Math.min(child.h * 0.4, 45));
    return (a: number) => {
      const { angle, dir } = fromHinge(a);
      return W(m, spanFrame(parent, c.a.edge, angle, dir, th, seatingOf(c.kind), c.offset, c.trayId ? null : c.span, tc), knobAt(child.w), r, tc / 2);
    };
  }, [m, parent, child?.h, child?.w, c.a.edge, c.kind, c.offset, th, c.span?.[0], c.span?.[1]]);
  const zoneAt = useMemo(() => (a: number) => (child ? checkHinge(d, c.a.panelId, c.a.edge, a, child.h).zone : 'ok'), [d, c.a.panelId, c.a.edge, child?.h]);
  if (!parent || !child) return null;
  const check = checkHinge(d, c.a.panelId, c.a.edge, h, child.h);
  return (
    <AngleArc
      pointAt={pointAt}
      hinge={hingeBasis(d, parent, c.a.edge, m, c.span && !c.trayId ? Math.min(...c.span) : 0, child.w)}
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

/** The selected shapes' gizmo (all on one panel): move in the panel's plane with smart snapping, turn about their centre. */
function ShapeGizmo({ d, ids, m, tolAt }: { d: Design; ids: string[]; m: THREE.Matrix4; tolAt: (p: V3) => number }) {
  const found = ids.map((id) => findDetail(d, id)).filter((f): f is NonNullable<typeof f> => !!f);
  const panel = found[0]?.panel;
  if (!panel || found.some((f) => f.panel.id !== panel.id)) return null;
  const box = shapesBox(found.map((f) => f.detail));
  const c = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const th = tOf(d, panel.id);
  const at = W(m, panel.frame, c.x, c.y, th / 2);
  const st = useStore.getState;
  // every start value (positions, box for snapping, pivot) comes from the design as it was at pointer-down
  const start = () => {
    const base = st().txnBase ?? st().design;
    const fs = ids.map((id) => findDetail(base, id)).filter((f): f is NonNullable<typeof f> => !!f);
    const b = shapesBox(fs.map((f) => f.detail));
    const pivot = fs.length === 1 ? { x: fs[0].detail.cx, y: fs[0].detail.cy } : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    return { base, fs, box: b, pivot };
  };
  return (
    <Gizmo
      at={at}
      ax={Wdir(m, panel.frame.u)}
      ay={Wdir(m, panel.frame.v)}
      n={Wdir(m, frameNormal(panel.frame))}
      onMove={(du, dv, ev) => {
        const { base, fs, box: b0 } = start();
        const ctx = !ev || noSmartSnap(ev) ? null : snapContext(base, panel.id, new Set(ids));
        const sn = ctx ? snapBox(ctx, { minX: b0.minX + du, maxX: b0.maxX + du, minY: b0.minY + dv, maxY: b0.maxY + dv }, tolAt(at)) : null;
        const x = !ev ? du : sn?.dx ? du + sn.dx : snap(du, ev), y = !ev ? dv : sn?.dy ? dv + sn.dy : snap(dv, ev);
        st().preview((dd) => {
          for (const f of fs) updateDetail(dd, f.detail.id, { cx: f.detail.cx + x, cy: f.detail.cy + y });
        });
        return { du: x, dv: y };
      }}
      onRotate={(deg) => {
        const { pivot } = start();
        st().preview((dd) => rotateDetails(dd, ids, deg, pivot));
      }}
      onEnd={(cancel) => (cancel ? st().cancel() : st().commit())}
      testId="gizmo"
    />
  );
}

function shapesBox(ds: Detail[]) {
  const boxes = ds.map((x) => detailBBox(x));
  return { minX: Math.min(...boxes.map((b) => b.minX)), maxX: Math.max(...boxes.map((b) => b.maxX)), minY: Math.min(...boxes.map((b) => b.minY)), maxY: Math.max(...boxes.map((b) => b.maxY)) };
}

/**
 * A selected through-cut, edited from any panel it reaches: on each of them
 * (and on its own panel) its corners are shown where it cuts and can be
 * dragged to resize it, and on each panel it reaches a gizmo moves and turns
 * it. Every edit changes the one source shape; snapping includes the panels in
 * its path.
 */
function ThroughEdit({ d, id, tolAt }: { d: Design; id: string; tolAt: (p: V3) => number }) {
  const f = findDetail(d, id);
  const reached = useMemo(() => (f && f.detail.op === 'cut' && f.detail.through ? panelsCutBy(d, id) : []), [d, id, f?.detail]);
  if (!f || f.detail.op !== 'cut' || !f.detail.through || f.detail.shape === 'text') return null;
  const S = f.panel, dt = f.detail;
  const n = frameNormal(S.frame);
  const thOf = (P: Panel) => tOf(d, P.id);
  const st = useStore.getState;
  // a source-local point, carried along the cut direction onto P's mid-plane
  const onto = (P: Panel, q: P2): V3 => {
    const w = toWorld(S.frame, q.x, q.y, 0);
    const mP = matDir(P.frame);
    const k = v3dot(n, mP);
    if (Math.abs(k) < 1e-6) return w;
    const lam = (thOf(P) / 2 - v3dot([w[0] - P.frame.o[0], w[1] - P.frame.o[1], w[2] - P.frame.o[2]], mP)) / k;
    return v3add(w, v3mul(n, lam));
  };
  const panels = [S, ...reached.map((pid) => d.panels[pid]).filter((P) => P && Math.abs(v3dot(n, frameNormal(P.frame))) > 1e-6)];
  const cs = detailCorners(dt);
  const ids = [id];
  return (
    <>
      {panels.map((P, pi) => (
        <group key={P.id}>
          {cs.map((c, k) => (
            <ThroughCorner key={k} at={onto(P, c)} plane={{ p: onto(P, { x: dt.cx, y: dt.cy }), n: matDir(P.frame) }} S={S} fixed={cs[(k + 2) % 4]} rot={dt.shape === 'circle' ? 0 : (dt.rot ?? 0)} circle={dt.shape === 'circle'} id={id} tolAt={tolAt} testId={`tcorner-${pi}-${k}`} />
          ))}
          {pi > 0 && (
            <Gizmo
              at={onto(P, { x: dt.cx, y: dt.cy })}
              ax={S.frame.u}
              ay={S.frame.v}
              n={n}
              onMove={(du, dv, ev) => {
                const base = st().txnBase ?? st().design;
                const b0 = detailBBox(findDetail(base, id)!.detail);
                const ctx = !ev || noSmartSnap(ev) ? null : snapContext(base, S.id, new Set(ids));
                const at = onto(P, { x: dt.cx, y: dt.cy });
                const sn = ctx ? snapBox(ctx, { minX: b0.minX + du, maxX: b0.maxX + du, minY: b0.minY + dv, maxY: b0.maxY + dv }, tolAt(at)) : null;
                const x = !ev ? du : sn?.dx ? du + sn.dx : snap(du, ev), y = !ev ? dv : sn?.dy ? dv + sn.dy : snap(dv, ev);
                const o = findDetail(base, id)!.detail;
                st().preview((dd) => updateDetail(dd, id, { cx: o.cx + x, cy: o.cy + y }));
                return { du: x, dv: y };
              }}
              onRotate={(deg) => st().preview((dd) => rotateDetails(dd, ids, deg))}
              onEnd={(cancel) => (cancel ? st().cancel() : st().commit())}
              testId={`tgizmo-${pi}`}
            />
          )}
        </group>
      ))}
    </>
  );
}

/** One corner of a through-cut, shown where it cuts a panel: dragging it resizes the source shape about the opposite corner, along its own sides. */
function ThroughCorner(props: { at: V3; plane: { p: V3; n: V3 }; S: Panel; fixed: P2; rot: number; circle: boolean; id: string; tolAt: (p: V3) => number; testId: string }) {
  const ray = useRayFromScreen();
  const [hover, setHover] = useState(false);
  const st = useStore.getState;
  const down = useHandleDrag({
    move: (ev) => {
      const hit = ray(ev.clientX, ev.clientY).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...props.plane.n), new THREE.Vector3(...props.plane.p)), new THREE.Vector3());
      if (!hit) return;
      let l = toLocal(props.S.frame, [hit.x, hit.y, hit.z]);
      const base = st().txnBase ?? st().design;
      const ctx = noSmartSnap(ev) ? null : snapContext(base, props.S.id, new Set([props.id]));
      const sn = ctx ? snapPoint(ctx, l, props.tolAt([hit.x, hit.y, hit.z])) : null;
      l = { x: sn?.dx ? l.x + sn.dx : snap(l.x, ev), y: sn?.dy ? l.y + sn.dy : snap(l.y, ev) };
      const a = (props.rot * Math.PI) / 180, c = Math.cos(a), s2 = Math.sin(a);
      const rx = l.x - props.fixed.x, ry = l.y - props.fixed.y;
      const lx = rx * c + ry * s2, ly = -rx * s2 + ry * c;
      let w = Math.max(0.5, Math.abs(lx)), h = Math.max(0.5, Math.abs(ly));
      if (props.circle) w = h = Math.max(w, h);
      const hx = ((Math.sign(lx) || 1) * w) / 2, hy = ((Math.sign(ly) || 1) * h) / 2;
      st().preview((dd) => updateDetail(dd, props.id, { cx: props.fixed.x + hx * c - hy * s2, cy: props.fixed.y + hx * s2 + hy * c, w, h }));
    },
    end: (cancel) => (cancel ? st().cancel() : st().commit()),
  });
  return (
    <ScreenSized position={props.at}>
      <mesh
        renderOrder={22}
        raycast={priorityRaycast}
        onPointerOver={(e) => (e.stopPropagation(), setHover(true))}
        onPointerOut={() => setHover(false)}
        onPointerDown={down}
        userData={{ testId: props.testId, noAO: true }}
      >
        <boxGeometry args={[hover ? 12 : 9, hover ? 12 : 9, hover ? 12 : 9]} />
        <meshBasicMaterial color={hover ? '#0f5d59' : '#d97706'} depthTest={false} depthWrite={false} transparent />
      </mesh>
    </ScreenSized>
  );
}

/** A selected floor panel's gizmo: move on the floor (snapping to other floor panels), turn about the vertical with everything grown on it. */
function FloorGizmo({ d, p, m, tolAt }: { d: Design; p: Panel; m: THREE.Matrix4; tolAt: (p: V3) => number }) {
  const th = tOf(d, p.id);
  const st = useStore.getState;
  const at = W(m, p.frame, p.w / 2, p.h / 2, th);
  const u = p.frame.u, v = p.frame.v;
  return (
    <Gizmo
      at={at}
      ax={Wdir(m, u)}
      ay={Wdir(m, v)}
      n={Wdir(m, frameNormal(p.frame))}
      onMove={(du, dv, ev) => {
        const base = st().txnBase ?? st().design;
        let dx = u[0] * du + v[0] * dv, dz = u[2] * du + v[2] * dv;
        const fl = ev && !noSmartSnap(ev) ? flushMove(base, [p.id], FLOOR_FRAME, dx, -dz, tolAt(at) * 1.5) : null;
        const sn = !fl && ev && !noSmartSnap(ev) ? snapFloor(base, p.id, dx, dz, tolAt(at)) : null;
        if (fl) [dx, dz] = [fl.dx, -fl.dy];
        else if (sn) [dx, dz] = [sn.dx, sn.dz];
        else if (ev) [dx, dz] = [snap(dx, ev), snap(dz, ev)];
        st().preview((dd) => movePanel(dd, p.id, dx, dz));
        return { du: dx * u[0] + dz * u[2], dv: dx * v[0] + dz * v[2] };
      }}
      onRotate={(deg) => {
        const b = (st().txnBase ?? st().design).panels[p.id] ?? p;
        const c0 = toWorld(b.frame, b.w / 2, b.h / 2);
        st().preview((dd) => rotatePanel(dd, p.id, deg, [c0[0], c0[2]]));
      }}
      onEnd={(cancel) => (cancel ? st().cancel() : st().commit())}
      testId="floor-gizmo"
    />
  );
}

/**
 * A selected panel placed on a face (milestone 29): the gizmo moves it in its
 * host's plane (its corners snapping to the face's targets: the host's corners
 * and shapes, other panels on the face, walls standing on it) and turns it
 * about the host's normal.
 */
/** A selected standing board's flip badge (milestone 42): its material goes to the other side of its line. */
function PlacedFlip({ d, p, m }: { d: Design; p: Panel; m: THREE.Matrix4 }) {
  const t = useT();
  return (
    <StageHtml position={W(m, p.frame, p.w, p.h / 2, tOf(d, p.id) / 2)}>
      <button className="w-dim ghost flip-badge" onClick={() => useStore.getState().apply((x) => flipPlacedSide(x, p.id))} title={t('ghost.flip')} aria-label={t('ghost.flip')} data-testid="placed-flip-badge">
        <Icon name="flip" size={14} />
      </button>
    </StageHtml>
  );
}

function PlacedGizmo({ d, p, m, tolAt }: { d: Design; p: Panel; m: THREE.Matrix4; tolAt: (p: V3) => number }) {
  const st = useStore.getState;
  const pl = p.place!;
  const hf = hostFace(d, pl.host, pl.face);
  const targets = useMemo(() => (hf ? faceTargets(d, pl.host, pl.face) : null), [d, pl.host, pl.face]);
  if (!hf) return null;
  const H = hf.H;
  const th = tOf(d, p.id);
  const at = W(m, p.frame, p.w / 2, pl.pose === 'flat' ? p.h / 2 : p.h / 2, th);
  // the panel's footprint on the face (host coordinates), as it was at the start of the drag
  const feet = (q: Panel): P2[] => {
    const pts = pl.pose === 'flat' ? [[0, 0], [q.w, 0], [q.w, q.h], [0, q.h]] : [[0, 0], [q.w, 0]];
    return pts.map(([x, y]) => toLocal(H, toWorld(q.frame, x, y, 0)));
  };
  return (
    <Gizmo
      at={at}
      ax={Wdir(m, H.u)}
      ay={Wdir(m, H.v)}
      n={Wdir(m, frameNormal(H))}
      onMove={(du, dv, ev) => {
        const base = st().txnBase ?? st().design;
        const b = base.panels[p.id] ?? p;
        let dx = du, dy = dv;
        // flush against other panels' faces first; else the footprint corner nearest a target snaps onto it
        const fl = ev && !noSmartSnap(ev) ? flushMove(base, [p.id], H, du, dv, tolAt(at) * 1.5) : null;
        if (fl) [dx, dy] = [fl.dx, fl.dy];
        else if (ev && !noSmartSnap(ev) && targets) {
          let best: { x: number; y: number; d: number } | null = null;
          for (const q of feet(b)) {
            const sn = snapOnFace(targets, { x: q.x + dx, y: q.y + dy }, tolAt(at));
            if (!sn) continue;
            const ddx = sn.p.x - q.x - dx, ddy = sn.p.y - q.y - dy, dd = Math.hypot(ddx, ddy);
            if (!best || dd < best.d) best = { x: ddx, y: ddy, d: dd };
          }
          if (best) [dx, dy] = [dx + best.x, dy + best.y];
          else if (ev) [dx, dy] = [snap(dx, ev), snap(dy, ev)];
        } else if (ev) [dx, dy] = [snap(dx, ev), snap(dy, ev)];
        st().preview((dd) => movePlaced(dd, p.id, dx, dy));
        return { du: dx, dv: dy };
      }}
      onRotate={(deg) => st().preview((dd) => rotatePlaced(dd, p.id, deg))}
      onEnd={(cancel) => (cancel ? st().cancel() : st().commit())}
      testId="placed-gizmo"
    />
  );
}

/**
 * Several selected panels on one surface (milestone 31): the gizmo moves them
 * together in that plane (floor panels on the floor, panels placed on one face
 * in that face's plane).
 */
function GroupGizmo({ d, ids, tolAt }: { d: Design; ids: string[]; tolAt: (p: V3) => number }) {
  const st = useStore.getState;
  const c = commonPlane(d, ids);
  if (!('surface' in c)) return null;
  const s = c.surface;
  const F = s.kind === 'floor' ? FLOOR_FRAME : d.panels[s.host]?.frame;
  if (!F) return null;
  // the middle of the group, on top of it
  const pts = ids.map((id) => toWorld(d.panels[id].frame, d.panels[id].w / 2, d.panels[id].h / 2, tOf(d, id)));
  const at: V3 = [0, 1, 2].map((k) => pts.reduce((a, q) => a + q[k], 0) / pts.length) as V3;
  void tolAt;
  return (
    <Gizmo
      at={at}
      ax={F.u}
      ay={F.v}
      n={frameNormal(F)}
      modes={['pad', 'x', 'y']}
      onMove={(du, dv, ev) => {
        const dx = ev ? snap(du, ev) : du, dy = ev ? snap(dv, ev) : dv;
        st().preview((dd) => {
          for (const id of ids) {
            if (dd.panels[id]?.place) movePlaced(dd, id, dx, dy);
            else movePanel(dd, id, dx, -dy);
          }
        });
        return { du: dx, dv: dy };
      }}
      onEnd={(cancel) => (cancel ? st().cancel() : st().commit())}
      testId="group-gizmo"
    />
  );
}

/** A wall standing at 90° on a base (a divider counts): Shift-click another for + Divider. */
function isWallLike(d: Design, id: string): boolean {
  const c = parentConnection(d, id);
  return !!c && Math.abs(c.angle - 90) < 1e-6 && !parentConnection(d, c.a.panelId);
}

/** A divider: a panel standing at 90° on a floor panel, some way in from the edge it was grown from. */
function isDivider(d: Design, id: string): Connection | null {
  const c = parentConnection(d, id);
  if (!c || c.offset <= 0.5 || Math.abs(c.angle - 90) > 1e-6 || c.dir !== 'up' || parentConnection(d, c.a.panelId)) return null;
  return c;
}

/** Slabs standing on the same base parallel to a divider (other dividers from the same edge), and the clear limits, along the divider's axis. */
function dividerRow(d: Design, c: Connection): { lo: number; hi: number; others: number[] } | null {
  const box = clearBox(d, c.a.panelId);
  if (!box || (c.a.edge !== 'e0' && c.a.edge !== 'e3')) return null;
  const [lo, hi] = c.a.edge === 'e3' ? [box.x0, box.x1] : [box.y0, box.y1];
  const others = Object.values(d.connections)
    .filter((x) => x.grown && x.a.panelId === c.a.panelId && x.a.edge === c.a.edge && x.id !== c.id && isDivider(d, x.b.panelId))
    .map((x) => x.offset);
  return { lo, hi, others };
}

/**
 * A selected divider: a slide arrow on its face (along its normal) that moves
 * it, snapping to even spacing, and the compartment sizes along its row (the
 * two next to it can be typed). Dragging a divider of an automatic set takes
 * it out of the set.
 */
function DividerSlide({ d, id, m, tolAt }: { d: Design; id: string; m: THREE.Matrix4; tolAt: (p: V3) => number }) {
  const tt = useT();
  const c = isDivider(d, id);
  const p = d.panels[id];
  const st = useStore.getState;
  const drag = useRef<{ from: string; to: string } | null>(null);
  if (!c || !p) return null;
  const base = d.panels[c.a.panelId];
  const th = tOf(d, p.id);
  const row = dividerRow(d, c);
  const axis = Wdir(m, inwardWorld(base, c.a.edge));
  // on the face, low and in the middle: clear of the height arrow (top), the hinge knob and the compartment labels (above the top)
  const at = W(m, p.frame, p.w / 2, p.h * 0.3, th / 2);
  const move = (v: number, snapIt: boolean) => {
    drag.current ??= { from: id, to: id };
    const off = row && snapIt ? (snapDividerOffset(row, v, th, tolAt(at)) ?? v) : v;
    st().preview((x) => setDividerOffset(x, id, off));
  };
  // compartments along the row, labelled at the dividers' top
  const labels: { mid: number; size: number; side: 'left' | 'right' | null }[] = [];
  if (row) {
    const slabs = [...row.others, c.offset].sort((a, b) => a - b);
    let cur = row.lo;
    for (const o of [...slabs, null]) {
      const end = o === null ? row.hi : o;
      if (end - cur > 0.5) labels.push({ mid: (cur + end) / 2, size: end - cur, side: o === c.offset ? 'left' : cur === c.offset + th ? 'right' : null });
      if (o !== null) cur = o + th;
    }
  }
  const labelAt = (mid: number): V3 => {
    const e = findEdge(base, c.a.edge)!;
    const inw = segInward(e), dir = segDir(e);
    // towards the far end of the row, clear of the hinge knob (20%) and the height arrow (middle)
    const along = segLength(e) * 0.82;
    const x = e.a.x + dir.x * along + inw.x * mid, y = e.a.y + dir.y * along + inw.y * mid;
    return W(m, base.frame, x, y, th + p.h + 6);
  };
  return (
    <>
      <PushPull
        at={at}
        axis={axis}
        value={c.offset}
        min={1}
        onPreview={(v) => move(v, true)}
        onCommit={() => {
          drag.current = null;
          st().commit();
        }}
        onCancel={() => {
          drag.current = null;
          st().cancel();
          st().select({ kind: 'panel', id });
        }}
        color="#e0a21b"
        testId="div-slide"
      />
      {labels.map((l, i) => (
        <DimLabel
          key={i}
          at={labelAt(l.mid)}
          k={tt('div.compartment')}
          value={Math.round(l.size * 10) / 10}
          unit={tt('unit.mm')}
          min={1}
          onCommit={
            l.side
              ? (v) => {
                  const off = l.side === 'left' ? l.mid - l.size / 2 + v : l.mid + l.size / 2 - v - th;
                  move(off, false);
                  drag.current = null;
                  st().commit();
                }
              : undefined
          }
          testId={`div-comp-${i}`}
        />
      ))}
    </>
  );
}

/** Faces picked for "Divider between": a marker on each, and at the second one the pill (greyed with the reason when no divider fits). */
/**
 * Two facing walls selected (milestone 32): a floating + Divider button
 * between them puts a divider halfway along where they overlap; greyed, with
 * the reason, when no divider fits.
 */
function DividerButton({ d, a, b }: { d: Design; a: string; b: string }) {
  const t = useT();
  const plan = planDividerFor(d, a, b);
  const picks = wallPicks(d, a, b);
  if (!picks) return null;
  const at: V3 = [(picks[0].point[0] + picks[1].point[0]) / 2, (picks[0].point[1] + picks[1].point[1]) / 2, (picks[0].point[2] + picks[1].point[2]) / 2];
  return (
    <StageHtml position={at}>
      <button
        className={`w-pill between-pill ${plan.ok ? '' : 'off'}`}
        disabled={!plan.ok}
        title={plan.ok ? undefined : t(`div.why.${plan.reason}` as 'div.why.notParallel')}
        onClick={() => {
          const st = useStore.getState();
          let id: string | null = null;
          st.apply((x) => void (id = addDividerFor(x, a, b)));
          if (id) st.select({ kind: 'panel', id });
        }}
        data-testid="add-divider"
      >
        <Icon name="plus" /> {t('div.add')}
        {!plan.ok && (
          <span className="why" data-testid="add-divider-why">
            {t(`div.why.${plan.reason}` as 'div.why.notParallel')}
          </span>
        )}
      </button>
    </StageHtml>
  );
}

/** Selected panel: width/height push-pull arrows and in-place dimensions. */
function PanelWidgets({ d, p, m, dims }: { d: Design; p: Panel; m: THREE.Matrix4; dims: boolean }) {
  const t = useT();
  const th = tOf(d, p.id);
  const off = Math.max(8, 0.07 * Math.max(p.w, p.h));
  const st = useStore.getState;
  const resize = (w?: number, h?: number) => st().preview((x) => setPanelSize(x, p.id, w, h));
  // dimension lines run along the bottom and left edges, just outside the panel, on its far face
  const Wv = (x: number, y: number) => W(m, p.frame, x, y, th);
  const u = Wdir(m, p.frame.u), v = Wdir(m, p.frame.v);
  const tickV = v3mul(v, 3), tickU = v3mul(u, 3);
  const pp = pushPullAnchors(p);
  // seen nearly edge-on the labels pile up on the panel (and on its gizmo): hidden until the view turns
  const grazing = useGrazing(Wdir(m, frameNormal(p.frame)), Wv(p.w / 2, p.h / 2));
  return (
    <>
      <PushPull at={W(m, p.frame, pp.width.x, pp.width.y, th / 2)} axis={u} value={p.w} offset={pp.width.x - p.w} min={5} onPreview={(w) => resize(w, undefined)} onCommit={() => st().commit()} onCancel={() => st().cancel()} testId="pp-width" />
      <PushPull at={W(m, p.frame, pp.height.x, pp.height.y, th / 2)} axis={v} value={p.h} offset={pp.height.y - p.h} min={5} onPreview={(h) => resize(undefined, h)} onCommit={() => st().commit()} onCancel={() => st().cancel()} testId="pp-height" />
      {dims && !grazing && (
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
    return p ? W(xf.get(p.id) ?? IDM, p.frame, p.w / 2, p.h, tOf(d, p.id) / 2) : null;
  }
  const p = d.panels[end.panelId];
  if (!p) return null;
  const e = findEdge(p, end.edge);
  if (!e) return null;
  const s = at;
  const x = e.a.x + (e.b.x - e.a.x) * s, y = e.a.y + (e.b.y - e.a.y) * s;
  return W(xf.get(p.id) ?? IDM, p.frame, x, y, tOf(d, p.id) / 2);
}

/** Joint pills: the focused panel's connections (and broken ones, always). Clicking one opens its settings. */
function SeamPills({ d, focus, all, xf, openJoint }: { d: Design; focus: string | null; all?: boolean; xf: Map<string, THREE.Matrix4>; openJoint: string | null }) {
  const t = useT();
  // the joints view: the selected panel's joints only (none while nothing is selected); otherwise the broken ones
  const list = Object.values(d.connections).filter((c) => (all ? !!focus && (c.a.panelId === focus || c.b.panelId === focus) : c.broken));
  const [menu, setMenu] = useState<string | null>(null);
  // a click elsewhere, or Esc, closes the menu
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => !(e.target as HTMLElement | null)?.closest?.('.pill-wrap') && setMenu(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [menu]);
  return (
    <>
      {list.map((c) => {
        const at = seamPoint(d, c, xf, 0.24);
        if (!at) return null;
        const other = c.a.panelId === focus ? c.b.panelId : c.a.panelId;
        const owner = focus && (c.a.panelId === focus || c.b.panelId === focus) ? focus : c.b.panelId;
        const open = menu === c.id;
        const kinds = open ? allowedKinds(d, c) : [];
        return (
          <StageHtml key={c.id} position={at} {...(open ? { zIndexRange: [60, 50] } : {})}>
            <div className="pill-wrap">
              <button
                className={`w-pill ${c.broken ? 'broken' : ''} ${openJoint === c.id || open ? 'on' : ''}`}
                title={t('conn.with', { kind: t(`conn.${c.kind}` as 'conn.fold'), panel: panelLabel(d, other, t) })}
                aria-expanded={open}
                onClick={() => setMenu(open ? null : c.id)}
                data-testid={`seam-pill-${c.kind}`}
              >
                <Icon name={c.broken ? 'alert' : c.kind} />
                {t(`conn.short.${c.kind}` as 'conn.short.fold')}
              </button>
              {open && (
                // a joint's own menu (it was only in the card's advanced section)
                <div className="joint-menu" role="menu" data-testid="joint-menu" onPointerDown={(e) => e.stopPropagation()}>
                  <p className="joint-menu-head" dir="auto">
                    {panelLabel(d, c.a.panelId, t)} · {panelLabel(d, c.b.panelId, t)}
                  </p>
                  {kinds.map((k) => (
                    <button
                      key={k}
                      role="menuitemradio"
                      aria-checked={c.kind === k}
                      className={c.kind === k ? 'on' : ''}
                      onClick={() => {
                        if (k !== c.kind) useStore.getState().apply((x) => void setConnection(x, c.id, { kind: k }));
                        setMenu(null);
                      }}
                      data-testid={`joint-kind-${k}`}
                    >
                      <Icon name={k} size={16} /> {t(`conn.${k}` as 'conn.fold')}
                    </button>
                  ))}
                  {c.kind === 'tabslot' && (
                    // how the tabs hold: flush, folded under, self-locking, bolted
                    <div className="joint-menu-sub" role="group" aria-label={t('conn.tabLen')}>
                      <p className="joint-menu-head">{t('conn.tabLen')}</p>
                      {tabLocks(matOf(d, ownerOf(c).owner), c.tabLen).map((k) => (
                        <button
                          key={k}
                          role="menuitemradio"
                          aria-checked={(c.tabLen ?? 'flush') === k}
                          className={(c.tabLen ?? 'flush') === k ? 'on' : ''}
                              onClick={() => {
                            if (k !== (c.tabLen ?? 'flush')) useStore.getState().apply((x) => void setConnection(x, c.id, { tabLen: k }));
                            setMenu(null);
                          }}
                          data-testid={`joint-tablen-${k}`}
                        >
                          {t(`conn.tabLen.${k}`)}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className="link"
                    onClick={() => {
                      const st = useStore.getState();
                      if (st.selection?.kind !== 'panel' || st.selection.id !== owner) st.select({ kind: 'panel', id: owner });
                      st.set({ openJoint: c.id });
                      setMenu(null);
                      requestAnimationFrame(() => document.querySelector('[data-testid=inspector-connection]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
                    }}
                    data-testid="joint-more"
                  >
                    {t('joint.more')}
                  </button>
                </div>
              )}
            </div>
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
  // Quick build calls the joints view "How it's built" (milestone 37)
  const jointsKey = shown(useFeature('joints')) ? 'view.joints' : 'quick.howBuilt';
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
  // one wall selected: Shift-click the opposite wall for + Divider (milestone 32)
  const picking = useStore((s) => s.selection?.kind === 'panel' && !s.selection.ids && isWallLike(s.design, s.selection.id));
  const boardPose = useStore((s) => s.panelPose);
  // the joints view shows one panel's joints at a time
  const jointsIdle = useStore((s) => s.viewPrefs.joints && !(s.selection?.kind === 'panel' && !s.selection.ids?.length));
  const hint =
    foldT < 0.999
      ? 'fold.hint'
      : jointsIdle
        ? 'joint.pickPanel'
      : picking && tool === 'select'
        ? 'div.pickHint'
      : editing && tool === 'select'
        ? 'outline.help'
        : trayCut && tool === 'select'
          ? 'tray.cutHint'
        : tool === 'select'
          ? 'tool.hint.select'
          : tool === 'panel'
            ? boardPose === 'standing' ? 'tool.hint.boardStanding' : 'tool.hint.board'
            : tool === 'polygon'
              ? 'tool.hint.polygon'
              : tool === 'text'
                ? 'tool.hint.text'
                : tool === 'box'
                  ? 'quick.boxHelp'
                  : tool === 'wall'
                    ? 'quick.wallHelp'
                    : tool === 'divider'
                      ? 'quick.dividerHelp'
                      : tool === 'sticker'
                        ? 'quick.stickerHelp'
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
            className={`stage-toggle joints-toggle ${prefs.joints ? 'on' : ''}`}
            onClick={() => useStore.getState().setPrefs({ joints: !prefs.joints })}
            title={t('view.jointsHelp')}
            aria-label={t(jointsKey)}
            aria-pressed={prefs.joints}
            data-testid="toggle-joints"
          >
            <Icon name="finger" />
            <span>{t(jointsKey === 'view.joints' ? 'view.jointsOn' : jointsKey)}</span>
          </button>
          <button onClick={playAssembly} title={t('assemble.go')} aria-label={t('assemble.go')} data-testid="assemble-go">
            <Icon name="play" />
          </button>
          <button className={settings ? 'on' : ''} onClick={() => setSettings((s) => !s)} title={t('viewset.title')} aria-label={t('viewset.title')} aria-expanded={settings} data-testid="open-view-settings">
            <Icon name="settings" />
          </button>
        </div>
        {settings && <ViewSettings onClose={() => setSettings(false)} />}
        <MaterialLegend />
      </div>
      <div className="view-hint" dir="auto">{empty && tool === 'select' ? t('view.empty3d') : t(hint)}</div>
      <PolygonToolCard />
      <FoldBar />
      <span hidden data-testid="quality" data-quality={quality} />
    </div>
  );
}
