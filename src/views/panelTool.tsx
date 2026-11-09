// The Panel tool on any face, as a ghost (milestone 29), and the floating
// confirm bar every ghost uses (milestone 30). The tool draws on the floor or
// on the face under the pointer: a rectangle lying flat on it, or (Standing) a
// line with a wall standing on it at the last height used. The ghost can be
// adjusted (corners, typed sizes, height, which side) until ✓ (Enter) makes it
// or ✕ (Esc) drops it; then the tool goes back to Select.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { gridSnap, noSmartSnap, useStore, useT, type PanelGhost } from '../store/store';
import type { Design, Frame, P2, Panel, PanelPlace, V3 } from '../model/types';
import { FLOOR_FRAME, faceOut, placeFrame } from '../model/place';
import { frameNormal, matDir, toLocal, toWorld } from '../model/frame';
import { addPlacedPanel, addRootPanel, MIN_PANEL, setConstruction, solve } from '../model/ops';
import { tOf } from '../model/materials';
import { panelEdges, rectSketch } from '../model/edges';
import { faceTargets, snapOnFace, type FaceTargets } from '../model/snap';
import { frameMatrix, panelGeometry } from './three-geom';
import { STAGE } from './palette';
import { DimLabel, PushPull, ScreenSized, StageHtml, mmPerPx, priorityRaycast, useHandleDrag, useRayFromScreen } from './widgets';
import { SNAP_PX } from '../geom/types';
import { Icon } from '../ui/icons';

/** The face a point on a panel is on: its material side (1) or its plane (−1), from the point's depth in the slab. */
export function faceAt(d: Design, p: Panel, point: V3): 1 | -1 {
  const o = p.frame.o, m = matDir(p.frame);
  const z = (point[0] - o[0]) * m[0] + (point[1] - o[1]) * m[1] + (point[2] - o[2]) * m[2];
  return z > tOf(d, p.id) / 2 ? 1 : -1;
}

/** A host's frame (the floor's for null) and the plane of its face, in world space. */
export function hostFace(d: Design, host: string | null, face: 1 | -1): { H: Frame; plane: THREE.Plane; z: number } | null {
  const H = host === null ? FLOOR_FRAME : d.panels[host]?.frame;
  if (!H) return null;
  const z = host === null || face === -1 ? 0 : tOf(d, host);
  const at = new THREE.Vector3(...toWorld(H, 0, 0, z));
  return { H, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...frameNormal(H)), at), z };
}

/** The panel a ghost stands for: its place on the host and its size (null while too small). */
export function ghostPlace(g: PanelGhost): { place: PanelPlace; w: number; h: number } | null {
  if (g.pose === 'flat') {
    const x0 = Math.min(g.a.x, g.b.x), y0 = Math.min(g.a.y, g.b.y);
    const w = Math.abs(g.b.x - g.a.x), h = Math.abs(g.b.y - g.a.y);
    if (w < MIN_PANEL || h < MIN_PANEL) return null;
    return { place: { host: g.host, face: g.face, x: x0, y: y0, rot: 0, pose: 'flat' }, w, h };
  }
  const w = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
  if (w < MIN_PANEL) return null;
  const rot = (Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) * 180) / Math.PI;
  return { place: { host: g.host, face: g.face, x: g.a.x, y: g.a.y, rot, pose: 'standing', side: g.side }, w, h: Math.max(MIN_PANEL, g.height) };
}

/** Make the ghost's panel (✓): one undo step; it is selected and the tool goes back to Select. */
export function confirmPanelGhost(): string | null {
  const st = useStore.getState();
  const g = st.panelGhost;
  const gp = g && ghostPlace(g);
  if (!g || !gp) return null;
  let id: string | null = null;
  st.apply((d) => {
    const { place, w, h } = gp;
    if (place.host === null && place.pose === 'flat') {
      // flat on the floor: an ordinary floor panel, as before
      id = addRootPanel(d, place.x, -place.y, w, h);
      if (g.construction) d.panels[id].construction = true;
      solve(d);
    } else id = addPlacedPanel(d, place, w, h, { construction: g.construction });
  });
  st.set({ panelGhost: null, ...(g.pose === 'standing' ? { standHeight: gp.h } : {}) });
  if (id) st.select({ kind: 'panel', id });
  st.setTool('select');
  return id;
}

export function cancelPanelGhost() {
  useStore.getState().set({ panelGhost: null });
}

/** Snap a point drawn on a face (host coordinates): smart targets, else the grid. */
export function snapGhostPoint(t: FaceTargets | null, p: P2, tol: number, ev: { altKey: boolean } | null): { p: P2; target: P2 | null } {
  const sn = t && !noSmartSnap(ev) ? snapOnFace(t, p, tol) : null;
  if (sn) return { p: sn.p, target: sn.target ?? sn.p };
  return { p: { x: gridSnap(p.x, ev), y: gridSnap(p.y, ev) }, target: null };
}

/**
 * The floating ✓ / ✕ bar next to a ghost (milestone 30): Enter makes it, Esc
 * drops it (not while a field is being typed in). Extra controls go before ✓.
 */
export function ConfirmBar(props: { at: V3; onOk: () => void; onCancel: () => void; okDisabled?: boolean; children?: React.ReactNode; testId?: string; okTestId?: string; cancelTestId?: string }) {
  const t = useT();
  const h = useRef(props);
  h.current = props;
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (ev.key === 'Enter' && !h.current.okDisabled) {
        ev.preventDefault();
        h.current.onOk();
      } else if (ev.key === 'Escape') h.current.onCancel();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <StageHtml position={props.at}>
      <div className="ghost-bar" dir="auto" data-testid={props.testId ?? 'ghost-bar'} onPointerDown={(e) => e.stopPropagation()}>
        {props.children}
        <button className="ok" disabled={props.okDisabled} onClick={() => props.onOk()} title={t('ghost.ok')} aria-label={t('ghost.ok')} data-testid={props.okTestId ?? 'ghost-ok'}>
          <Icon name="check" size={16} />
        </button>
        <button className="cancel" onClick={() => props.onCancel()} title={t('ghost.cancel')} aria-label={t('ghost.cancel')} data-testid={props.cancelTestId ?? 'ghost-cancel'}>
          <Icon name="close" size={16} />
        </button>
      </div>
    </StageHtml>
  );
}

/** The Panel tool's ghost on the stage: the panel it would make, its handles, sizes, height arrow and the ghost bar. */
export function PanelGhostView({ d }: { d: Design }) {
  const t = useT();
  const g = useStore((s) => s.panelGhost);
  const { camera, gl } = useThree();
  const ray = useRayFromScreen();
  const hf = g ? hostFace(d, g.host, g.face) : null;
  const gp = g ? ghostPlace(g) : null;
  const ghost = useMemo((): Panel | null => {
    if (!gp) return null;
    const frame = placeFrame(d, gp.place);
    return frame ? { id: 'ghost-panel', name: '', w: gp.w, h: gp.h, sketch: rectSketch(gp.w, gp.h), frame, details: [] } : null;
  }, [d, gp?.place.x, gp?.place.y, gp?.place.rot, gp?.place.pose, gp?.place.side, gp?.place.host, gp?.place.face, gp?.w, gp?.h]);
  const geom = useMemo(() => (ghost ? panelGeometry(d, ghost, { joints: false }) : null), [ghost, d]);
  useEffect(() => () => geom?.dispose(), [geom]);
  const targets = useMemo(() => (g ? faceTargets(d, g.host, g.face) : null), [d, g?.host, g?.face]);
  const set = (patch: Partial<PanelGhost>) => {
    const cur = useStore.getState().panelGhost;
    if (cur) useStore.getState().set({ panelGhost: { ...cur, ...patch } });
  };
  const handle = (which: 'a' | 'b' | 'ab' | 'ba') => {
    // a corner of the rectangle (ab: a.x with b.y; ba: b.x with a.y) or an end of the line
    return (ev: PointerEvent) => {
      if (!hf) return;
      const r = ray(ev.clientX, ev.clientY);
      const hit = r.intersectPlane(hf.plane, new THREE.Vector3());
      if (!hit) return;
      const l = toLocal(hf.H, [hit.x, hit.y, hit.z]);
      const tol = SNAP_PX * mmPerPx(camera, gl.domElement.clientHeight || 600, hit);
      const q = snapGhostPoint(targets, l, tol, ev).p;
      const cur = useStore.getState().panelGhost;
      if (!cur) return;
      if (which === 'a') set({ a: q });
      else if (which === 'b') set({ b: q });
      else if (which === 'ab') set({ a: { x: q.x, y: cur.a.y }, b: { x: cur.b.x, y: q.y } });
      else set({ b: { x: q.x, y: cur.b.y }, a: { x: cur.a.x, y: q.y } });
    };
  };
  if (!g || !hf) return null;
  const at = (q: P2): V3 => toWorld(hf.H, q.x, q.y, hf.z);
  const out = faceOut(hf.H, g.host === null ? 1 : g.face);
  const ends: [P2, 'a' | 'b' | 'ab' | 'ba'][] = g.pose === 'flat' ? [[g.a, 'a'], [g.b, 'b'], [{ x: g.a.x, y: g.b.y }, 'ab'], [{ x: g.b.x, y: g.a.y }, 'ba']] : [[g.a, 'a'], [g.b, 'b']];
  const th = d.material.thickness;
  const top: V3 | null = ghost ? toWorld(ghost.frame, ghost.w / 2, g.pose === 'flat' ? ghost.h / 2 : ghost.h, th) : null;
  const barAt: V3 | null = top ? [top[0] + out[0] * 14, top[1] + out[1] * 14, top[2] + out[2] * 14] : null;
  const setPose = (pose: 'flat' | 'standing') => {
    useStore.getState().set({ panelPose: pose });
    set({ pose });
  };
  return (
    <>
      {ghost && geom && (
        <group matrixAutoUpdate={false} matrix={frameMatrix(ghost.frame)} userData={{ noAO: true, panelGhost: g.pose }}>
          <mesh geometry={geom} raycast={() => null}>
            <meshStandardMaterial color={g.construction ? '#7aa7c7' : STAGE.ghost} transparent opacity={STAGE.ghostOpacity} depthWrite={false} />
            <Edges threshold={25} lineWidth={2} color={STAGE.ghostEdge} />
          </mesh>
        </group>
      )}
      {!g.drawing &&
        ends.map(([q, which]) => (
          <GhostHandle key={which} at={at(q)} onMove={handle(which)} testId={`ghost-handle-${which}`} />
        ))}
      {ghost && !g.drawing && gp && (
        <>
          <DimLabel
            at={g.pose === 'flat' ? at({ x: (g.a.x + g.b.x) / 2, y: Math.min(g.a.y, g.b.y) }) : at({ x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 })}
            k="W"
            value={gp.w}
            unit={t('unit.mm')}
            ghost
            onCommit={(v) => {
              const cur = useStore.getState().panelGhost!;
              if (cur.pose === 'flat') set({ b: { x: cur.a.x + Math.sign(cur.b.x - cur.a.x || 1) * v, y: cur.b.y } });
              else {
                const L = Math.hypot(cur.b.x - cur.a.x, cur.b.y - cur.a.y) || 1;
                set({ b: { x: cur.a.x + ((cur.b.x - cur.a.x) / L) * v, y: cur.a.y + ((cur.b.y - cur.a.y) / L) * v } });
              }
            }}
            testId="ghost-w"
          />
          <DimLabel
            at={g.pose === 'flat' ? at({ x: Math.max(g.a.x, g.b.x), y: (g.a.y + g.b.y) / 2 }) : toWorld(ghost.frame, 0, ghost.h / 2, th / 2)}
            k="H"
            value={gp.h}
            unit={t('unit.mm')}
            ghost
            onCommit={(v) => {
              const cur = useStore.getState().panelGhost!;
              if (cur.pose === 'flat') set({ b: { x: cur.b.x, y: cur.a.y + Math.sign(cur.b.y - cur.a.y || 1) * v } });
              else set({ height: v });
            }}
            testId="ghost-h"
          />
          {g.pose === 'standing' && top && (
            <>
              <PushPull at={top} axis={out} value={gp.h} min={MIN_PANEL} max={2000} onPreview={(v) => set({ height: v })} onCommit={() => undefined} onCancel={() => undefined} testId="ghost-height" />
              <StageHtml position={toWorld(ghost.frame, ghost.w, ghost.h / 2, th / 2)}>
                <button className="w-dim ghost flip-badge" onClick={() => set({ side: g.side === 1 ? -1 : 1 })} title={t('ghost.flip')} aria-label={t('ghost.flip')} data-testid="ghost-flip">
                  <Icon name="flip" size={14} />
                </button>
              </StageHtml>
            </>
          )}
        </>
      )}
      {barAt && !g.drawing && (
        <ConfirmBar at={barAt} onOk={() => void confirmPanelGhost()} onCancel={cancelPanelGhost} okDisabled={!gp} testId="panel-ghost-bar">
          <span className="seg" role="radiogroup" aria-label={t('ghost.pose')}>
            <button role="radio" aria-checked={g.pose === 'flat'} className={g.pose === 'flat' ? 'on' : ''} onClick={() => setPose('flat')} data-testid="ghost-flat">
              {t('ghost.flat')}
            </button>
            <button role="radio" aria-checked={g.pose === 'standing'} className={g.pose === 'standing' ? 'on' : ''} onClick={() => setPose('standing')} data-testid="ghost-standing">
              {t('ghost.standing')}
            </button>
          </span>
          <label className="check">
            <input type="checkbox" checked={g.construction} onChange={(e) => set({ construction: e.target.checked })} data-testid="ghost-construction" />
            {t('ghost.construction')}
          </label>
        </ConfirmBar>
      )}
    </>
  );
}

/** A small draggable sphere on the face (a ghost's corner or line end). */
function GhostHandle({ at, onMove, testId }: { at: V3; onMove: (ev: PointerEvent) => void; testId: string }) {
  const down = useHandleDrag({ move: onMove, end: () => undefined });
  return (
    <ScreenSized position={at}>
      <mesh onPointerDown={down} renderOrder={21} raycast={priorityRaycast} userData={{ noAO: true, testId }}>
        <sphereGeometry args={[6, 14, 10]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} transparent opacity={0.95} />
      </mesh>
      <mesh renderOrder={20} raycast={() => null}>
        <sphereGeometry args={[7.5, 14, 10]} />
        <meshBasicMaterial color={STAGE.ghostEdge} depthTest={false} transparent opacity={0.9} />
      </mesh>
    </ScreenSized>
  );
}

/** With the Panel tool: the face under the pointer, outlined on that face. */
export function FaceHover({ d, panelId, face }: { d: Design; panelId: string; face: 1 | -1 }) {
  const p = d.panels[panelId];
  const g = useMemo(() => {
    if (!p) return null;
    const pts = panelEdges(p).map((e) => new THREE.Vector2(e.a.x, e.a.y));
    return pts.length >= 3 ? new THREE.ShapeGeometry(new THREE.Shape(pts)) : null;
  }, [p]);
  useEffect(() => () => g?.dispose(), [g]);
  if (!p || !g) return null;
  const t = tOf(d, panelId);
  const z = (face === 1 ? t + 0.15 : -0.15) * p.frame.side;
  const m = frameMatrix(p.frame).multiply(new THREE.Matrix4().makeTranslation(0, 0, z));
  return (
    <mesh geometry={g} matrixAutoUpdate={false} matrix={m} raycast={() => null} renderOrder={6} userData={{ noAO: true, faceHover: `${panelId}:${face}` }}>
      <meshBasicMaterial color={STAGE.hover} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

export { matDir };

/**
 * The ghost bar for what a drawing tool just made (milestone 30): next to the
 * shape (its centre, out from its panel's face) or the polygon panel.
 */
export function PendingBar({ d, m }: { d: Design; m: (panelId: string) => THREE.Matrix4 }) {
  const g = useStore((s) => s.pending);
  if (!g) return null;
  const p = d.panels[g.panelId];
  if (!p) return null;
  let x = p.w / 2, y = p.h / 2;
  if (g.kind === 'shape') {
    const dts = p.details.filter((dt) => g.ids.includes(dt.id));
    if (!dts.length) return null;
    x = dts.reduce((s, dt) => s + dt.cx, 0) / dts.length;
    y = Math.max(...dts.map((dt) => dt.cy + dt.h / 2));
  }
  const t = tOf(d, p.id);
  const w = new THREE.Vector3(...toWorld(p.frame, x, y, t + 10)).applyMatrix4(m(p.id));
  const st = useStore.getState;
  return <ConfirmBar at={[w.x, w.y, w.z]} onOk={() => st().confirmPending()} onCancel={() => st().cancelPending()} testId="pending-bar" />;
}

/** The same bar as plain HTML at a screen position (the cut plan and the face-on view). */
export function PendingBarHtml({ x, y }: { x: number; y: number }) {
  const t = useT();
  const st = useStore.getState;
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (ev.key === 'Enter') {
        ev.preventDefault();
        st().confirmPending();
      } else if (ev.key === 'Escape') st().cancelPending();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="ghost-bar" style={{ position: 'absolute', left: x, top: y }} dir="auto" data-testid="pending-bar" onPointerDown={(e) => e.stopPropagation()}>
      <button className="ok" onClick={() => st().confirmPending()} title={t('ghost.ok')} aria-label={t('ghost.ok')} data-testid="ghost-ok">
        <Icon name="check" size={16} />
      </button>
      <button className="cancel" onClick={() => st().cancelPending()} title={t('ghost.cancel')} aria-label={t('ghost.cancel')} data-testid="ghost-cancel">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
