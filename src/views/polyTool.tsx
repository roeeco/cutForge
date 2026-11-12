// Polygon tool (G) and outline vertex editing on the 3D stage.
//
// Polygon: click to place vertices on the floor (a new base) or on a panel
// (a polygon shape with the current op). Close by clicking the first point or
// pressing Enter; Backspace removes the last point; Esc cancels. Vertices
// snap to the 1 mm grid and to the first point; Shift locks the segment to
// 15° steps; typing a number sets the current segment's length (Enter
// places it). n-gon mode: drag from the centre (Shift turns it in 15° steps).
//
// Outline editing: handles on a base's vertices (drag; select and Delete) and
// "+" handles on edge midpoints (click to insert a vertex).
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Frame, P2, Panel, V3, WallSketch } from '../model/types';
import { GROUND_FRAME, frameNormal, toLocal, toWorld } from '../model/frame';
import { addPolygonPanel, addPolygonShape, addWallInsert, deleteVertex, deleteWallInsert, insertVertex, isSimplePolygon, moveVertex, moveWallInsert, regularPolygon, setWallCorner } from '../model/ops';
import { sketchRing, straightRing, wallCorners, type EdgeSeg } from '../model/edges';
import { detailSel, gridSnap, noSmartSnap, useStore, useT } from '../store/store';
import { outlineTargets, snapOutlinePoint, type OutlineSnap, type OutlineTargets } from '../model/snap';
import { SNAP_PX } from '../geom/types';
import { fmtNum } from '../i18n';
import { mmPerPx, StageHtml } from './widgets';
import { panelsCutBy } from '../model/through';
import { STAGE } from './palette';
import { frameMatrix, faceZ } from './three-geom';
import { tOf } from '../model/materials';
import { nextPolyPoint, typedPoint } from './polyDraw';

const FLOOR = GROUND_FRAME(0, 0);

/** When the last polygon was closed: the stage ignores the click that ends that gesture. */
export const closedAt = { t: 0 };

type Draft = {
  /** Panel the shape goes on, or null for a new base on the floor. */
  panelId: string | null;
  frame: Frame;
  /** Face z (material depth) where the drawing is shown. */
  z: number;
  plane: THREE.Plane;
  pts: P2[];
  cur: P2 | null;
  typed: string;
  /** n-gon drag: its centre. */
  centre?: P2;
  /** Pointer-down time of the click that started the draft (the DOM listener ignores it). */
  stamp: number;
  shift?: boolean;
};

export type PolyToolHandle = { start: (e: ThreeEvent<PointerEvent>, panel: Panel | null) => void; active: () => boolean };

const snap1 = (x: number) => gridSnap(x);
const STEP = Math.PI / 12; // 15°

export const PolygonTool = forwardRef<PolyToolHandle, { setControls: (on: boolean) => void }>(function PolygonTool({ setControls }, ref) {
  const t = useT();
  const { camera, gl } = useThree();
  const [draft, setDraftState] = useState<Draft | null>(null);
  const dr = useRef<Draft | null>(null);
  // keep the ref current at once, so quick clicks never build on a stale draft
  const setDraft = (d: Draft | null) => {
    dr.current = d;
    setDraftState(d);
  };
  const mode = useStore((s) => s.polyMode);
  const sides = useStore((s) => s.ngonSides);
  const rc = useMemo(() => new THREE.Raycaster(), []);

  const localAt = (d: Draft, clientX: number, clientY: number): P2 | null => {
    const r = gl.domElement.getBoundingClientRect();
    rc.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = rc.ray.intersectPlane(d.plane, new THREE.Vector3());
    return hit ? toLocal(d.frame, [hit.x, hit.y, hit.z]) : null;
  };
  const pxTol = (d: Draft) => 10 * mmPerPx(camera, gl.domElement.clientHeight || 600, new THREE.Vector3(...toWorld(d.frame, d.pts[0]?.x ?? 0, d.pts[0]?.y ?? 0)));

  /** Snapped next vertex for a pointer position. */
  // Shift: 15° steps (the waffle sketch tool shares this with 30° by default, src/views/polyDraw.ts)
  const nextPoint = (d: Draft, raw: P2, shift: boolean): P2 => nextPolyPoint(d.pts, raw, { angle: shift ? STEP : null, grid: snap1, closeTol: pxTol(d) });

  const ngonPts = (d: Draft, to: P2, shift: boolean): P2[] | null => {
    if (!d.centre) return null;
    const r = Math.hypot(to.x - d.centre.x, to.y - d.centre.y);
    if (r < 2.5) return null;
    const rot = shift ? Math.round((Math.atan2(to.y - d.centre.y, to.x - d.centre.x) + Math.PI / 2 + Math.PI / sides) / STEP) * STEP : 0;
    return regularPolygon(sides, Math.round(r * 2) / 2, rot).map((p) => ({ x: p.x + d.centre!.x, y: p.y + d.centre!.y }));
  };

  const finish = (pts: P2[], regular?: number) => {
    // the click that closes a polygon must not also reach the stage (which would deselect)
    closedAt.t = performance.now();
    const d = dr.current;
    setDraft(null);
    setControls(true);
    if (!d || pts.length < 3 || !isSimplePolygon(pts)) return;
    const st = useStore.getState();
    let id: string | null = null;
    st.cancelPending();
    if (d.panelId === null) {
      st.apply((x) => void (id = addPolygonPanel(x, 0, 0, pts)));
      if (id) {
        // a ghost until ✓ (milestone 30)
        st.select({ kind: 'panel', id });
        st.beginPending({ kind: 'panel', ids: [id], panelId: id });
      }
    } else {
      const pid = d.panelId;
      st.apply((x) => void (id = addPolygonShape(x, pid, pts, st.shapeOp, regular, undefined, st.shapeThrough)));
      if (id) {
        st.select(detailSel([id]));
        st.beginPending({ kind: 'shape', ids: [id], panelId: pid });
      }
    }
  };

  useImperativeHandle(ref, () => ({
    active: () => !!dr.current,
    start: (e, panel) => {
      if (e.button !== 0 || dr.current) return;
      e.stopPropagation();
      const st = useStore.getState();
      const frame = panel ? panel.frame : FLOOR;
      const z = panel ? faceZ(panel, tOf(st.design, panel.id))[1] : 0;
      const n = new THREE.Vector3(...frameNormal(frame));
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(e.point.x, e.point.y, e.point.z));
      const l = toLocal(frame, [e.point.x, e.point.y, e.point.z]);
      const p0 = { x: snap1(l.x), y: snap1(l.y) };
      const d: Draft = { panelId: panel?.id ?? null, frame, z, plane, pts: [], cur: p0, typed: '', stamp: e.nativeEvent.timeStamp };
      if (st.polyMode === 'ngon') {
        d.centre = p0;
        setControls(false);
      } else d.pts = [p0];
      setDraft(d);
    },
  }));

  useEffect(() => {
    if (!draft) return;
    const el = gl.domElement;
    const down = (ev: PointerEvent) => {
      const d = dr.current;
      if (!d || ev.button !== 0 || ev.timeStamp === d.stamp || d.centre) return;
      const raw = localAt(d, ev.clientX, ev.clientY);
      if (!raw) return;
      ev.stopPropagation();
      const p = nextPoint(d, raw, ev.shiftKey);
      if (d.pts.length >= 3 && p === d.pts[0]) return finish(d.pts);
      const last = d.pts[d.pts.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) return;
      setDraft({ ...d, pts: [...d.pts, p], typed: '' });
    };
    const move = (ev: PointerEvent) => {
      const d = dr.current;
      if (!d) return;
      const raw = localAt(d, ev.clientX, ev.clientY);
      if (!raw) return;
      setDraft({ ...d, cur: d.centre ? raw : nextPoint(d, raw, ev.shiftKey), shift: ev.shiftKey });
    };
    const up = (ev: PointerEvent) => {
      const d = dr.current;
      if (!d?.centre) return;
      const raw = localAt(d, ev.clientX, ev.clientY);
      const pts = raw && ngonPts(d, raw, ev.shiftKey);
      if (pts) finish(pts, sides);
      else {
        setDraft(null);
        setControls(true);
      }
    };
    const key = (ev: KeyboardEvent) => {
      const d = dr.current;
      if (!d) return;
      const tgt = ev.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        setDraft(null);
        setControls(true);
      } else if (/^[0-9.]$/.test(ev.key) && !d.centre) {
        ev.preventDefault();
        ev.stopPropagation();
        setDraft({ ...d, typed: d.typed + ev.key });
      } else if (ev.key === 'Backspace' && !d.centre) {
        ev.preventDefault();
        ev.stopPropagation();
        if (d.typed) setDraft({ ...d, typed: d.typed.slice(0, -1) });
        else if (d.pts.length > 1) setDraft({ ...d, pts: d.pts.slice(0, -1) });
        else {
          setDraft(null);
          setControls(true);
        }
      } else if (ev.key === 'Enter' && !d.centre) {
        ev.preventDefault();
        ev.stopPropagation();
        const q = typedPoint(d.pts, d.cur, d.typed);
        if (q) setDraft({ ...d, pts: [...d.pts, q], typed: '' });
        else if (d.pts.length >= 3) finish(d.pts);
      }
    };
    el.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key, true);
    return () => {
      el.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key, true);
    };
  }, [!!draft, sides]);

  // the drawing: placed edges, the rubber-band segment and the closing segment (red when it would cross)
  const view = useMemo(() => {
    if (!draft) return null;
    const shift = draft.shift ?? false;
    const pts = draft.centre ? (draft.cur && ngonPts(draft, draft.cur, shift)) || [] : [...draft.pts, ...(draft.cur ? [draft.cur] : [])];
    const closedOk = pts.length >= 3 && isSimplePolygon(pts);
    const m = frameMatrix(draft.frame);
    const zz = draft.z + (draft.frame.side === 1 ? 0.4 : -0.4);
    const v = (p: P2) => new THREE.Vector3(p.x, p.y, draft.panelId ? zz : 0.4).applyMatrix4(m);
    const open = pts.map(v);
    const close = pts.length >= 3 ? [v(pts[pts.length - 1]), v(pts[0])] : [];
    const last = draft.pts[draft.pts.length - 1];
    const seg = last && draft.cur && !draft.centre ? Math.hypot(draft.cur.x - last.x, draft.cur.y - last.y) : null;
    return { open, close, closedOk, seg, label: pts.length ? v(draft.cur ?? pts[0]) : null, n: draft.centre ? sides : null, r: draft.centre && draft.cur ? Math.hypot(draft.cur.x - draft.centre.x, draft.cur.y - draft.centre.y) : null };
  }, [draft, sides]);

  // a through-cut being drawn on a panel: how many panels it will cut, live (rounded to whole mm so it is not redone every pixel)
  const through = useStore((s) => s.shapeThrough && s.shapeOp === 'cut');
  const design = useStore((s) => s.design);
  const throughPts = draft && through && draft.panelId ? (draft.centre ? (draft.cur && ngonPts(draft, draft.cur, draft.shift ?? false)) || [] : [...draft.pts, ...(draft.cur ? [draft.cur] : [])]) : [];
  const throughKey = throughPts.map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(' ');
  const cutCount = useMemo(() => {
    if (!draft?.panelId || throughPts.length < 3 || !isSimplePolygon(throughPts)) return null;
    const copy = JSON.parse(JSON.stringify(design));
    const id = addPolygonShape(copy, draft.panelId, throughPts, 'cut', undefined, '__live_through', true);
    return id ? panelsCutBy(copy, id).length : null;
  }, [throughKey, design, draft?.panelId]);

  if (!draft || !view) return null;
  const lineGeom = (ps: THREE.Vector3[]) => new THREE.BufferGeometry().setFromPoints(ps);
  return (
    <group userData={{ noAO: true }}>
      {view.open.length >= 2 && (
        <line>
          <primitive object={lineGeom(draft.centre ? [...view.open, view.open[0]] : view.open)} attach="geometry" />
          <lineBasicMaterial color={STAGE.selected} depthTest={false} transparent />
        </line>
      )}
      {!draft.centre && view.close.length === 2 && (
        <line>
          <primitive object={lineGeom(view.close)} attach="geometry" />
          <lineBasicMaterial color={view.closedOk ? STAGE.selected : '#d1372b'} depthTest={false} transparent opacity={0.55} />
        </line>
      )}
      {view.open.map((p, i) => (
        <mesh key={i} position={p} renderOrder={8} raycast={() => null}>
          <sphereGeometry args={[i === 0 ? 1.6 : 1.1, 10, 8]} />
          <meshBasicMaterial color={i === 0 ? '#ffffff' : STAGE.selected} depthTest={false} />
        </mesh>
      ))}
      {view.label && (
        <StageHtml position={view.label.toArray() as V3} style={{ pointerEvents: 'none' }}>
          <span className="dim-label poly-label" data-testid="poly-label" dir="ltr">
            {draft.typed ? `${draft.typed}▍ ${t('unit.mm')}` : view.n ? `${view.n} × r ${fmtNum(view.r ?? 0)}` : view.seg !== null ? `${fmtNum(view.seg)} ${t('unit.mm')}` : ''}
            {!draft.centre && !view.closedOk && draft.pts.length >= 3 ? ` · ${t('poly.crosses')}` : ''}
          </span>
        </StageHtml>
      )}
      {cutCount !== null && view.label && (
        <StageHtml position={view.open[0].toArray() as V3} style={{ pointerEvents: 'none' }}>
          <span className="through-badge" data-testid="through-count">
            {t('through.cuts', { n: cutCount })}
          </span>
        </StageHtml>
      )}
    </group>
  );
});

/**
 * Where a dragged outline vertex lands: on a corner or edge within reach
 * (own outline, or panels in or standing on this plane), in line with its own
 * other points, else on the grid. Alt (or smart snapping off) skips the
 * targets; Alt also skips the grid.
 */
function placeVertex(tg: OutlineTargets, l: P2, ev: PointerEvent, tol: number): { p: P2; snap: OutlineSnap | null } {
  const sn = noSmartSnap(ev) ? null : snapOutlinePoint(tg, l, tol);
  const hit = sn && sn.kind ? sn : null;
  return { p: { x: hit?.fixed.x ? hit.p.x : gridSnap(l.x, ev), y: hit?.fixed.y ? hit.p.y : gridSnap(l.y, ev) }, snap: hit };
}

/** Middle of a sketch edge as drawn: on its curve when it was flattened into one. */
function edgeMid(drawn: EdgeSeg[], key: string, a: P2, b: P2): P2 {
  const segs = drawn.filter((e) => e.key.startsWith(key + '~'));
  if (segs.length > 1) {
    const k = segs.length / 2;
    const s0 = segs[Math.floor(k)];
    return Number.isInteger(k) ? s0.a : { x: (s0.a.x + s0.b.x) / 2, y: (s0.a.y + s0.b.y) / 2 };
  }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The snap a vertex drag found: a ring on the corner it landed on, the edge or alignment line. */
function SnapMarks({ snap, at, z, k }: { snap: OutlineSnap | null; at: P2 | null; z: number; k: number }) {
  const lines = useMemo(() => {
    if (!snap || !at) return null;
    const pts: THREE.Vector3[] = [];
    for (const g of snap.guides) pts.push(new THREE.Vector3(g.a.x, g.a.y, z), new THREE.Vector3(g.b.x, g.b.y, z));
    return pts.length ? new THREE.BufferGeometry().setFromPoints(pts) : null;
  }, [snap, at, z]);
  if (!snap || !at) return null;
  return (
    <group userData={{ snapKind: snap.kind }}>
      {lines && (
        <lineSegments geometry={lines} renderOrder={10} raycast={() => null}>
          <lineBasicMaterial color="#d97706" depthTest={false} transparent />
        </lineSegments>
      )}
      <mesh position={[at.x, at.y, z]} renderOrder={10} raycast={() => null}>
        <torusGeometry args={[k * 1.9, k * 0.28, 6, 24]} />
        <meshBasicMaterial color="#d97706" depthTest={false} transparent />
      </mesh>
    </group>
  );
}

/** Vertex handles of a base being edited: drag a vertex, select it and press Delete, click "+" on an edge to insert one. */
export function OutlineHandles({ p, m, t }: { p: Panel; m: THREE.Matrix4; t: number }) {
  const { camera, gl, controls } = useThree() as unknown as { camera: THREE.Camera; gl: THREE.WebGLRenderer; controls: { enabled: boolean } | null };
  const selVertex = useStore((s) => s.selVertex);
  const rc = useMemo(() => new THREE.Raycaster(), []);
  const [hover, setHover] = useState<string | null>(null);
  const [mark, setMark] = useState<{ snap: OutlineSnap | null; at: P2 } | null>(null);
  const s = p.sketch;
  const mat = useMemo(() => m.clone().multiply(frameMatrix(p.frame)), [m, p.frame]);
  const z = faceZ(p, t)[1] + 0.3;
  const k = mmPerPx(camera, gl.domElement.clientHeight || 600, new THREE.Vector3(...toWorld(p.frame, p.w / 2, p.h / 2))) * 7;

  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      const st = useStore.getState();
      const tgt = ev.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && st.selVertex !== null) {
        ev.preventDefault();
        ev.stopPropagation();
        const i = st.selVertex;
        if (typeof i === 'number') st.apply((x) => void deleteVertex(x, p.id, i));
        else if (i === 'tl' || i === 'tr') st.apply((x) => setWallCorner(x, p.id, i, { dx: 0, dy: 0 }));
        else st.apply((x) => deleteWallInsert(x, p.id, i));
        st.set({ selVertex: null });
      } else if (ev.key === 'Escape' || ev.key === 'Enter') {
        ev.stopPropagation();
        st.set({ editOutline: null, selVertex: null });
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [p.id]);

  if (s.kind === 'wall') return <WallHandles p={p} mat={mat} z={z} k={k} />;
  const tolAt = (w: THREE.Vector3) => SNAP_PX * mmPerPx(camera, gl.domElement.clientHeight || 600, w);
  const drawn = sketchRing(p);
  const n = s.pts.length;
  const startDrag = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useStore.getState();
    st.set({ selVertex: i });
    if (controls) controls.enabled = false;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...frameNormal(p.frame)), new THREE.Vector3(e.point.x, e.point.y, e.point.z));
    const frame = p.frame;
    const tg = outlineTargets(st.txnBase ?? st.design, p.id, s.pts[i]);
    const move = (ev: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      rc.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = rc.ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) return;
      const l = toLocal(frame, [hit.x, hit.y, hit.z]);
      const v = placeVertex(tg, l, ev, tolAt(hit));
      setMark(v.snap ? { snap: v.snap, at: v.p } : null);
      useStore.getState().preview((x) => void moveVertex(x, p.id, i, v.p));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (controls) controls.enabled = true;
      setMark(null);
      useStore.getState().commit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <group matrixAutoUpdate={false} matrix={mat} userData={{ noAO: true }}>
      <SnapMarks snap={mark?.snap ?? null} at={mark?.at ?? null} z={z} k={k} />
      {s.pts.map((q, i) => (
        <mesh key={`v${i}`} position={[q.x, q.y, z]} renderOrder={9} onPointerDown={startDrag(i)} onPointerOver={() => setHover(`v${i}`)} onPointerOut={() => setHover(null)} userData={{ vertex: i }}>
          <sphereGeometry args={[k * (hover === `v${i}` || selVertex === i ? 1.3 : 1), 12, 10]} />
          <meshBasicMaterial color={selVertex === i ? '#d1372b' : STAGE.selected} depthTest={false} />
        </mesh>
      ))}
      {s.pts.map((q, i) => {
        const b = s.pts[(i + 1) % n];
        const m2 = edgeMid(drawn, s.edgeIds[i], q, b);
        const mid: V3 = [m2.x, m2.y, z];
        return (
          <mesh
            key={`m${i}`}
            position={mid}
            renderOrder={9}
            onPointerOver={() => setHover(`m${i}`)}
            onPointerOut={() => setHover(null)}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              const st = useStore.getState();
              st.apply((x) => void insertVertex(x, p.id, i));
              st.set({ selVertex: i + 1 });
            }}
          >
            <boxGeometry args={[k * 1.2, k * 1.2, k * 1.2]} />
            <meshBasicMaterial color={hover === `m${i}` ? STAGE.selected : '#ffffff'} depthTest={false} transparent opacity={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * A wall's outline handles: its two top corners and inserted points can be
 * dragged; "+" on a free edge inserts a point; the attached bottom edge is
 * locked (its corners are shown greyed).
 */
function WallHandles({ p, mat, z, k }: { p: Panel; mat: THREE.Matrix4; z: number; k: number }) {
  const { camera, gl, controls } = useThree() as unknown as { camera: THREE.Camera; gl: THREE.WebGLRenderer; controls: { enabled: boolean } | null };
  const selVertex = useStore((s) => s.selVertex);
  const [hover, setHover] = useState<string | null>(null);
  const rc = useMemo(() => new THREE.Raycaster(), []);
  const [mark, setMark] = useState<{ snap: OutlineSnap | null; at: P2 } | null>(null);
  const s = p.sketch as WallSketch;
  const c = wallCorners(p.w, p.h, s);
  const drawn = sketchRing(p);
  // handles sit on the straight sketch's points; "+" on its edges, drawn at the middle of each edge as curved
  const ring = straightRing(p);
  const drag = (id: string, from: P2, at: (l: P2) => void) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useStore.getState();
    st.set({ selVertex: id });
    if (controls) controls.enabled = false;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...frameNormal(p.frame)), new THREE.Vector3(e.point.x, e.point.y, e.point.z));
    const frame = p.frame;
    const tg = outlineTargets(st.txnBase ?? st.design, p.id, from);
    const move = (ev: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      rc.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = rc.ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) return;
      const v = placeVertex(tg, toLocal(frame, [hit.x, hit.y, hit.z]), ev, SNAP_PX * mmPerPx(camera, gl.domElement.clientHeight || 600, hit));
      setMark(v.snap ? { snap: v.snap, at: v.p } : null);
      at(v.p);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (controls) controls.enabled = true;
      setMark(null);
      useStore.getState().commit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const corner = (name: 'tl' | 'tr', base: P2, now: P2) => {
    // a drag that would make the wall cross itself stops at the last place that did not (BUGFIX_PLAN B10)
    let ok = { dx: now.x - base.x, dy: now.y - base.y };
    return drag(name, now, (l) =>
      useStore.getState().preview((x) => {
        const off = { dx: l.x - base.x, dy: l.y - base.y };
        if (setWallCorner(x, p.id, name, off)) ok = off;
        else setWallCorner(x, p.id, name, ok);
      }),
    );
  };
  // an insert's base edge (between the rectangle's corners, after their offsets)
  const baseEdge = (edge: 'e1' | 'e2' | 'e3') => {
    const i = Number(edge[1]);
    return { a: c[i], b: c[(i + 1) % 4] };
  };
  const toInsert = (edge: 'e1' | 'e2' | 'e3', l: P2) => {
    const { a, b } = baseEdge(edge);
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
    const t = ((l.x - a.x) * dx + (l.y - a.y) * dy) / L;
    // outward = right of the edge direction
    const off = (l.x - a.x) * dy - (l.y - a.y) * dx;
    return { t, off: Math.round(off * 100) / 100 };
  };
  const ball = (id: string, q: P2, on: ((e: ThreeEvent<PointerEvent>) => void) | null, color?: string) => (
    <mesh key={id} position={[q.x, q.y, z]} renderOrder={9} onPointerDown={on ?? undefined} onPointerOver={() => on && setHover(id)} onPointerOut={() => setHover(null)} userData={{ vertex: id }}>
      <sphereGeometry args={[k * (hover === id || selVertex === id ? 1.3 : 1), 12, 10]} />
      <meshBasicMaterial color={color ?? (selVertex === id ? '#d1372b' : STAGE.selected)} depthTest={false} transparent opacity={on ? 1 : 0.45} />
    </mesh>
  );
  const rect = [{ x: 0, y: p.h }, { x: p.w, y: p.h }];
  return (
    <group matrixAutoUpdate={false} matrix={mat} userData={{ noAO: true }}>
      <SnapMarks snap={mark?.snap ?? null} at={mark?.at ?? null} z={z} k={k} />
      {ball('bl', c[0], null, '#9aa3b2')}
      {ball('br', c[1], null, '#9aa3b2')}
      {ball('tr', c[2], corner('tr', rect[1], c[2]))}
      {ball('tl', c[3], corner('tl', rect[0], c[3]))}
      {(s.inserts ?? []).map((ins) => {
        const seg = ring.find((e) => e.key === ins.id);
        return seg ? ball(ins.id, seg.a, drag(ins.id, seg.a, (l) => useStore.getState().preview((x) => moveWallInsert(x, p.id, ins.id, toInsert(ins.edge, l))))) : null;
      })}
      {ring
        .filter((e) => e.key !== 'e0')
        .map((e) => {
          const mid = edgeMid(drawn, e.key, e.a, e.b);
          const ins = (s.inserts ?? []).find((x) => x.id === e.key);
          const edge = (ins ? ins.edge : e.key) as 'e1' | 'e2' | 'e3';
          if (!['e1', 'e2', 'e3'].includes(edge)) return null;
          const id = `m-${e.key}`;
          return (
            <mesh
              key={id}
              position={[mid.x, mid.y, z]}
              renderOrder={9}
              onPointerOver={() => setHover(id)}
              onPointerOut={() => setHover(null)}
              onPointerDown={(ev) => {
                if (ev.button !== 0) return;
                ev.stopPropagation();
                const at = toInsert(edge, mid);
                let nid: string | null = null;
                useStore.getState().apply((x) => void (nid = addWallInsert(x, p.id, edge, at.t, at.off)));
                if (nid) useStore.getState().set({ selVertex: nid });
              }}
            >
              <boxGeometry args={[k * 1.2, k * 1.2, k * 1.2]} />
              <meshBasicMaterial color={hover === id ? STAGE.selected : '#ffffff'} depthTest={false} transparent opacity={0.9} />
            </mesh>
          );
        })}
    </group>
  );
}

/** Floating card for the polygon tool: click mode or regular n-gon with its number of sides. */
export function PolygonToolCard() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.polyMode);
  const sides = useStore((s) => s.ngonSides);
  if (tool !== 'polygon') return null;
  const set = useStore.getState().set;
  return (
    <div className="card poly-card" data-testid="poly-card">
      <p className="kicker">{t('tool.polygon')}</p>
      <div className="seg" role="radiogroup" aria-label={t('poly.mode')}>
        {(['click', 'ngon'] as const).map((x) => (
          <button key={x} role="radio" aria-checked={mode === x} className={mode === x ? 'on' : ''} onClick={() => set({ polyMode: x })} data-testid={`poly-mode-${x}`}>
            {t(`poly.mode.${x}`)}
          </button>
        ))}
      </div>
      {mode === 'ngon' && (
        <div className="field stepper-row">
          <span className="label">{t('poly.sides')}</span>
          <button className="ghost" onClick={() => set({ ngonSides: Math.max(3, sides - 1) })} aria-label="−" data-testid="ngon-minus" disabled={sides <= 3}>
            −
          </button>
          <output data-testid="ngon-sides">{sides}</output>
          <button className="ghost" onClick={() => set({ ngonSides: Math.min(12, sides + 1) })} aria-label="+" data-testid="ngon-plus" disabled={sides >= 12}>
            +
          </button>
        </div>
      )}
      <p className="note">{t(mode === 'ngon' ? 'poly.help.ngon' : 'poly.help.click')}</p>
    </div>
  );
}
