// The Board tool on any face, as a ghost while drawing (milestones 29, 42),
// and the floating confirm bar every ghost uses (milestone 30). The tool draws
// on the floor or on the face under the pointer: a rectangle lying flat on
// it, or (the Standing board button) a line with a board standing on it at the
// last height used. Releasing the drag makes it (one undo step), selects it
// and goes back to Select. Quick build's Divider draws the same ghost and
// waits for ✓ (Enter) or ✕ (Esc).
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { gridSnap, noSmartSnap, useStore, useT, type PanelGhost } from '../store/store';
import type { Design, Frame, P2, Panel, PanelPlace, V3 } from '../model/types';
import { FLOOR_FRAME, faceOut, placeFrame } from '../model/place';
import { frameNormal, matDir, toLocal, toWorld } from '../model/frame';
import { MIN_PANEL } from '../model/ops';
import { tOf } from '../model/materials';
import { panelEdges, rectSketch } from '../model/edges';
import { faceTargets, snapOnFace, type FaceTargets } from '../model/snap';
import { frameMatrix, panelGeometry } from './three-geom';
import { STAGE } from './palette';
import { DimLabel, ScreenSized, StageHtml, mmPerPx, priorityRaycast, useHandleDrag, useRayFromScreen } from './widgets';
import { SNAP_PX } from '../geom/types';
import { Icon } from '../ui/icons';
import { planDividerLine, type DividerLinePlan } from '../easy/recipes';
import { confirmDividerLine } from '../easy/actions';
import { boardFromGhost, ghostPlace } from './board';

export { ghostPlace };

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

/** A divider line's ghost (milestone 38): what the line makes, drawn as a panel standing along it. */
export function dividerGhost(d: Design, g: PanelGhost): { gp: { place: PanelPlace; w: number; h: number }; plan: DividerLinePlan } | null {
  if (!g.divider || !g.host) return null;
  const plan = planDividerLine(d, g.host, g.a, g.b, g.height);
  if (!plan) return null;
  const rot = (Math.atan2(plan.b.y - plan.a.y, plan.b.x - plan.a.x) * 180) / Math.PI;
  const w = Math.hypot(plan.b.x - plan.a.x, plan.b.y - plan.a.y);
  const h = plan.kind === 'divider' ? plan.plan.height : plan.height;
  return { gp: { place: { host: g.host, face: 1, x: plan.a.x, y: plan.a.y, rot, pose: 'standing', side: 1 }, w, h }, plan };
}

/**
 * Make the ghost's board: on release with the Board tool (milestone 42), or ✓
 * on Quick build's Divider. One undo step; it is selected and the tool goes
 * back to Select. Null (nothing made) when the ghost is too small.
 */
export function confirmPanelGhost(): string | null {
  const st = useStore.getState();
  const g = st.panelGhost;
  if (!g) return null;
  if (g.divider && g.host) return confirmDividerLine(g.host, g.a, g.b, g.height);
  const gp = ghostPlace(g);
  if (!gp) return null;
  let id: string | null = null;
  st.apply((d) => void (id = boardFromGhost(d, g)?.id ?? null));
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
export function ConfirmBar(props: { at: V3; onOk: () => void; onCancel: () => void; okDisabled?: boolean; children?: React.ReactNode; testId?: string; okTestId?: string; cancelTestId?: string; below?: boolean }) {
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
    // over the other stage labels (a hinge's angle, the height): the ✓ is always reachable
    <StageHtml position={props.at} zIndexRange={[70, 60]}>
      <div className={`ghost-bar ${props.below ? 'below' : ''}`} dir="auto" data-testid={props.testId ?? 'ghost-bar'} onPointerDown={(e) => e.stopPropagation()}>
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

/**
 * The ghost on the stage: the board it would make while the Board tool draws
 * (milestone 42: release makes it, nothing waits), and the divider line's
 * compartments. Quick build's Divider keeps its ghost after release, with its
 * end handles, length and the ✓ bar.
 */
export function PanelGhostView({ d }: { d: Design }) {
  const t = useT();
  const g = useStore((s) => s.panelGhost);
  const { camera, gl } = useThree();
  const ray = useRayFromScreen();
  const hf = g ? hostFace(d, g.host, g.face) : null;
  const dv = useMemo(() => (g?.divider ? dividerGhost(d, g) : null), [d, g]);
  const gp = g ? (g.divider ? (dv?.gp ?? null) : ghostPlace(g)) : null;
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
  const handle = (which: 'a' | 'b') => {
    // an end of the line (a divider line waiting for ✓)
    return (ev: PointerEvent) => {
      if (!hf) return;
      const r = ray(ev.clientX, ev.clientY);
      const hit = r.intersectPlane(hf.plane, new THREE.Vector3());
      if (!hit) return;
      const l = toLocal(hf.H, [hit.x, hit.y, hit.z]);
      const tol = SNAP_PX * mmPerPx(camera, gl.domElement.clientHeight || 600, hit);
      const cur = useStore.getState().panelGhost;
      if (!cur) return;
      const q = snapLineEnd(d, cur.host, targets, which === 'a' ? cur.b : cur.a, l, tol, ev);
      set(which === 'a' ? { a: q } : { b: q });
    };
  };
  if (!g || !hf) return null;
  const at = (q: P2): V3 => toWorld(hf.H, q.x, q.y, hf.z);
  const out = faceOut(hf.H, g.host === null ? 1 : g.face);
  const th = d.material.thickness;
  const top: V3 | null = ghost ? toWorld(ghost.frame, ghost.w / 2, g.pose === 'flat' ? ghost.h / 2 : ghost.h, th) : null;
  const barAt: V3 | null = top ? [top[0] + out[0] * 14, top[1] + out[1] * 14, top[2] + out[2] * 14] : null;
  const plan = dv?.plan;
  // only Quick build's Divider waits after release
  const waiting = !g.drawing && !!g.divider;
  const ends: [P2, 'a' | 'b'][] = [[g.a, 'a'], [g.b, 'b']];
  return (
    <>
      {ghost && geom && (
        <group matrixAutoUpdate={false} matrix={frameMatrix(ghost.frame)} userData={{ noAO: true, panelGhost: g.pose }}>
          <mesh geometry={geom} raycast={() => null}>
            <meshStandardMaterial color={STAGE.ghost} transparent opacity={STAGE.ghostOpacity} depthWrite={false} />
            <Edges threshold={25} lineWidth={2} color={STAGE.ghostEdge} />
          </mesh>
        </group>
      )}
      {waiting && ends.map(([q, which]) => <GhostHandle key={which} at={at(q)} onMove={handle(which)} testId={`ghost-handle-${which}`} />)}
      {ghost && waiting && gp && (
        <DimLabel
          at={at({ x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 })}
          k="W"
          value={gp.w}
          unit={t('unit.mm')}
          ghost
          onCommit={(v) => {
            const cur = useStore.getState().panelGhost!;
            const L = Math.hypot(cur.b.x - cur.a.x, cur.b.y - cur.a.y) || 1;
            set({ b: { x: cur.a.x + ((cur.b.x - cur.a.x) / L) * v, y: cur.a.y + ((cur.b.y - cur.a.y) / L) * v } });
          }}
          testId="ghost-w"
        />
      )}
      {g.divider && plan && g.drawing && (
        // the compartments while drawing (milestone 38)
        <StageHtml position={at({ x: (plan.a.x + plan.b.x) / 2, y: (plan.a.y + plan.b.y) / 2 })} style={{ pointerEvents: 'none' }}>
          <span className="w-dim ghost" data-testid="divider-live" data-kind={plan.kind}>
            {plan.kind === 'divider' ? (plan.gaps ? t('quick.dividerMakes', { a: plan.gaps[0], b: plan.gaps[1] }) : t('quick.dividerWall')) : t('quick.standingMakes')}
          </span>
        </StageHtml>
      )}
      {barAt && waiting && (
        <ConfirmBar at={barAt} onOk={() => void confirmPanelGhost()} onCancel={cancelPanelGhost} okDisabled={!gp} testId="panel-ghost-bar">
          {plan && (
            <span className="note" data-testid="divider-makes" data-kind={plan.kind}>
              {plan.kind === 'divider' ? (plan.gaps ? t('quick.dividerMakes', { a: plan.gaps[0], b: plan.gaps[1] }) : t('quick.dividerWall')) : t('quick.standingMakes')}
            </span>
          )}
        </ConfirmBar>
      )}
    </>
  );
}

/** How close (degrees) a standing line's direction must come to snap level or parallel. */
export const LEVEL_SNAP_DEG = 7;

/**
 * A standing panel's line, kept level and parallel (boards and dividers): its
 * direction snaps to the face's own axes (level and square on a wall, the
 * floor's axes), to the panels standing on the face and to the face's edges;
 * its end then lands on a wall face along that direction. Alt draws freely.
 */
export function snapLineEnd(d: Design, host: string | null, t: FaceTargets | null, a: P2, raw: P2, tol: number, ev: { altKey: boolean } | null): P2 {
  const free = snapGhostPoint(t, raw, tol, ev).p;
  if (noSmartSnap(ev)) return free;
  const L = Math.hypot(raw.x - a.x, raw.y - a.y);
  if (L < 1e-6) return free;
  const ang = Math.atan2(raw.y - a.y, raw.x - a.x);
  const dirs: number[] = [0, Math.PI / 2];
  for (const l of t?.lines ?? []) dirs.push(Math.atan2(l[1].y - l[0].y, l[1].x - l[0].x));
  const hp = host !== null ? d.panels[host] : null;
  if (hp) for (const e of panelEdges(hp)) dirs.push(Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x));
  // the nearest direction (lines have no sense: modulo 180°)
  let best: number | null = null, bd = (LEVEL_SNAP_DEG * Math.PI) / 180;
  for (const r of dirs) {
    let diff = (((ang - r) % Math.PI) + Math.PI) % Math.PI;
    if (diff > Math.PI / 2) diff -= Math.PI;
    if (Math.abs(diff) < bd) [best, bd] = [ang - diff, Math.abs(diff)];
  }
  if (best === null) return free;
  const u = { x: Math.cos(best), y: Math.sin(best) };
  const s = (raw.x - a.x) * u.x + (raw.y - a.y) * u.y;
  // the length to the grid, along the snapped direction
  const sg = gridSnap(s, ev);
  let end = { x: a.x + u.x * sg, y: a.y + u.y * sg };
  // along that direction, the end lands on a wall face (or a corner) within reach
  let hit: { p: P2; k: number } | null = null;
  for (const l of t?.lines ?? []) {
    const lx = l[1].x - l[0].x, ly = l[1].y - l[0].y;
    const den = u.x * ly - u.y * lx;
    if (Math.abs(den) < 1e-9) continue;
    const k = ((l[0].x - a.x) * ly - (l[0].y - a.y) * lx) / den;
    const m = ((l[0].x - a.x) * u.y - (l[0].y - a.y) * u.x) / den;
    if (m < -0.02 || m > 1.02 || Math.abs(k - s) > tol) continue;
    if (!hit || Math.abs(k - s) < Math.abs(hit.k - s)) hit = { p: { x: a.x + u.x * k, y: a.y + u.y * k }, k };
  }
  if (hit) end = hit.p;
  return end;
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
  const ex = useStore((s) => s.extrude);
  if (!g) return null;
  // a Box's base: the rising walls carry the ✓ (milestone 38)
  if (ex && g.ids.includes(ex.baseId)) return null;
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
