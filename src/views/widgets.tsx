// Stage widgets: handles drawn on top of the model at a constant screen size.
//  - PushPull: an arrow you drag along an axis (panel width/height, ghost height)
//  - AngleArc: the hinge ring, a full circle with a rotate handle
//  - DimLabel: an in-place dimension; click to type an exact value
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { V3 } from '../model/types';
import { evalNumber } from '../ui/NumField';
import { fmtNum } from '../i18n';
import { snapHinge } from '../model/hinge';

export const HTML_Z: [number, number] = [5, 0];

/**
 * DOM overlay for stage labels and buttons. It lives outside the canvas's
 * event area, so clicking a pill or a badge never also clicks the scene.
 */
export const OverlayContext = createContext<React.RefObject<HTMLDivElement | null> | null>(null);
export function StageHtml(props: ComponentProps<typeof Html>) {
  const portal = useContext(OverlayContext);
  return <Html zIndexRange={HTML_Z} {...props} portal={portal && portal.current ? (portal as React.RefObject<HTMLElement>) : undefined} />;
}

/** World size of one screen pixel at a point. */
export function mmPerPx(camera: THREE.Camera, heightPx: number, p: THREE.Vector3): number {
  if (camera instanceof THREE.OrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / heightPx;
  const pc = camera as THREE.PerspectiveCamera;
  return (2 * pc.position.distanceTo(p) * Math.tan((pc.fov * Math.PI) / 360)) / heightPx;
}

export function useRayFromScreen() {
  const { camera, gl } = useThree();
  const rc = useMemo(() => new THREE.Raycaster(), []);
  return (clientX: number, clientY: number) => {
    const r = gl.domElement.getBoundingClientRect();
    rc.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    return rc.ray.clone();
  };
}

/** Parameter s of the point base + s·dir closest to the ray. */
export function closestOnLine(ray: THREE.Ray, base: THREE.Vector3, dir: THREE.Vector3): number {
  const w0 = base.clone().sub(ray.origin);
  const b = dir.dot(ray.direction);
  const d = dir.dot(w0), e = ray.direction.dot(w0);
  const den = 1 - b * b;
  if (Math.abs(den) < 1e-6) return d * -1;
  return (b * e - d) / den;
}

/** Window-level drag that started on a handle; the orbit controls are paused meanwhile. */
export function useHandleDrag(handlers: { move: (ev: PointerEvent) => void; end: (cancel: boolean) => void }) {
  const { controls } = useThree() as unknown as { controls: { enabled: boolean } | null };
  const h = useRef(handlers);
  h.current = handlers;
  return (e: ThreeEvent<PointerEvent> | React.PointerEvent) => {
    if ('button' in e && e.button !== 0) return;
    e.stopPropagation();
    if (controls) controls.enabled = false;
    const move = (ev: PointerEvent) => h.current.move(ev);
    const finish = (cancel: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key, true);
      if (controls) controls.enabled = true;
      h.current.end(cancel);
    };
    const up = () => finish(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        finish(true);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key, true);
  };
}

/** Group scaled every frame so one local unit is one screen pixel. */
export function ScreenSized({ position, children, quaternion }: { position: V3; children: React.ReactNode; quaternion?: THREE.Quaternion }) {
  const ref = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const p = useMemo(() => new THREE.Vector3(...position), [position[0], position[1], position[2]]);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.scale.setScalar(mmPerPx(camera, size.height, p));
  });
  return (
    <group ref={ref} position={p} quaternion={quaternion}>
      {children}
    </group>
  );
}

const onTop = { depthTest: false, depthWrite: false, transparent: true } as const;

/**
 * Raycast for handles drawn on top: their hits count as nearest, so a handle
 * always wins over the model (and an edge's hit target) behind it.
 */
export function priorityRaycast(this: THREE.Mesh, rc: THREE.Raycaster, out: THREE.Intersection[]) {
  const n = out.length;
  THREE.Mesh.prototype.raycast.call(this, rc, out);
  for (let i = n; i < out.length; i++) out[i].distance = 1e-3 * (i - n + 1);
}

/** Arrow handle at `at`, pointing along `axis`; dragging changes `value` (the distance from at − axis·value). */
export function PushPull(props: {
  at: V3;
  axis: V3;
  value: number;
  /** The arrow sits this far past the value along the axis (a gable's apex above the wall height). */
  offset?: number;
  min?: number;
  max?: number;
  color?: string;
  onPreview: (v: number) => void;
  onCommit: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  const ray = useRayFromScreen();
  const [hover, setHover] = useState(false);
  const axis = useMemo(() => new THREE.Vector3(...props.axis).normalize(), [props.axis[0], props.axis[1], props.axis[2]]);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis), [axis]);
  const start = useRef<{ base: THREE.Vector3; grab: number } | null>(null);
  const down = useHandleDrag({
    move: (ev) => {
      const s = start.current;
      if (!s) return;
      const v = closestOnLine(ray(ev.clientX, ev.clientY), s.base, axis) - s.grab;
      props.onPreview(Math.min(props.max ?? Infinity, Math.max(props.min ?? 5, Math.round(v))));
    },
    end: (cancel) => {
      start.current = null;
      if (cancel) props.onCancel();
      else props.onCommit();
    },
  });
  const color = hover ? '#0f5d59' : (props.color ?? '#1fb8ac');
  return (
    <ScreenSized position={props.at} quaternion={q}>
      <group
        onPointerOver={(e) => (e.stopPropagation(), setHover(true))}
        onPointerOut={() => setHover(false)}
        onPointerDown={(e) => {
          const base = new THREE.Vector3(...props.at).addScaledVector(axis, -props.value - (props.offset ?? 0));
          const grab = closestOnLine(e.ray, base, axis) - props.value;
          start.current = { base, grab };
          down(e);
        }}
        userData={{ noAO: true, testId: props.testId }}
      >
        <mesh position={[0, 8, 0]} renderOrder={20} raycast={priorityRaycast}>
          <coneGeometry args={[7, 14, 18]} />
          <meshBasicMaterial color={color} {...onTop} />
        </mesh>
        <mesh position={[0, -1, 0]} renderOrder={20} raycast={priorityRaycast}>
          <cylinderGeometry args={[2.2, 2.2, 6, 10]} />
          <meshBasicMaterial color={color} {...onTop} />
        </mesh>
        <mesh renderOrder={19} raycast={priorityRaycast}>
          <sphereGeometry args={[14, 12, 10]} />
          <meshBasicMaterial color="white" opacity={hover ? 0.55 : 0} {...onTop} />
        </mesh>
      </group>
    </ScreenSized>
  );
}

const ZONE_COLOR = { ok: '#1fb8ac', support: '#e0a21b', bad: '#d4543c' } as const;
type Zone = keyof typeof ZONE_COLOR;

/** Line segments through pointAt(a) for a in [a0, a1], coloured by zone. */
function arcLine(pointAt: (a: number) => V3, zoneAt: (a: number) => Zone, a0: number, a1: number, opacity: number) {
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  for (let a = a0; a < a1 - 1e-9; a += 2.5) {
    const b = Math.min(a1, a + 2.5);
    c.set(ZONE_COLOR[zoneAt((((a + b) / 2) % 360 + 360) % 360)]);
    pos.push(...pointAt(a), ...pointAt(b));
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...onTop, opacity }));
  l.renderOrder = 18;
  return l;
}

/**
 * Hinge handle: a small knob at the panel's far side with a short arc around
 * the current angle. While it is dragged the whole circle shows, coloured by
 * what can be built (green fine, amber a note, red impossible), with the
 * reason next to the angle. 5° steps, Alt for 1°. `pointAt(a)` is the knob
 * position for hinge angle a; `hinge` the hinge point with its 0° and 90° axes.
 */
export function AngleArc(props: {
  pointAt: (a: number) => V3;
  hinge: { o: V3; x: V3; y: V3 };
  value: number;
  zoneAt: (a: number) => Zone;
  onChange: (a: number) => void;
  onEnd?: (cancel: boolean) => void;
  label: string;
  message?: string;
  testId?: string;
}) {
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const show = hover || dragging;
  const ring = useMemo(() => (show ? arcLine(props.pointAt, props.zoneAt, 0, 360, dragging ? 0.9 : 0.5) : null), [show, dragging, props.pointAt, props.zoneAt]);
  const near = useMemo(() => arcLine(props.pointAt, props.zoneAt, props.value - 40, props.value + 40, 0.85), [props.pointAt, props.zoneAt, props.value]);
  useEffect(() => () => void (ring && (ring.geometry.dispose(), (ring.material as THREE.Material).dispose())), [ring]);
  useEffect(() => () => (near.geometry.dispose(), (near.material as THREE.Material).dispose()), [near]);
  const { camera, gl } = useThree();
  // Dragging works in screen space: where the hinge circle is seen well, the
  // knob follows the pointer around it; seen nearly edge-on (where a plane
  // intersection would jump), movement along the knob's path turns it, and
  // dragging up or down always works as a fallback.
  const drag = useRef<{ raw: number; x: number; y: number } | null>(null);
  const toScreen = (p: THREE.Vector3) => {
    const r = gl.domElement.getBoundingClientRect();
    const v = p.clone().project(camera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  };
  const down = useHandleDrag({
    move: (ev) => {
      const st = drag.current;
      if (!st) return;
      const o = new THREE.Vector3(...props.hinge.o);
      const R = Math.max(1, o.distanceTo(new THREE.Vector3(...props.pointAt(st.raw))));
      const C = toScreen(o);
      const sx = toScreen(o.clone().addScaledVector(new THREE.Vector3(...props.hinge.x), R));
      const sy = toScreen(o.clone().addScaledVector(new THREE.Vector3(...props.hinge.y), R));
      const X = { x: sx.x - C.x, y: sx.y - C.y }, Y = { x: sy.x - C.x, y: sy.y - C.y };
      const det = X.x * Y.y - X.y * Y.x;
      const lx = Math.hypot(X.x, X.y), ly = Math.hypot(Y.x, Y.y);
      let raw: number;
      if (Math.abs(det) > 0.35 * lx * ly && lx > 4 && ly > 4) {
        const p = { x: ev.clientX - C.x, y: ev.clientY - C.y };
        const c = (p.x * Y.y - p.y * Y.x) / det, sn = (X.x * p.y - X.y * p.x) / det;
        raw = (Math.atan2(sn, c) * 180) / Math.PI;
      } else {
        const th = (st.raw * Math.PI) / 180;
        const T = { x: -Math.sin(th) * X.x + Math.cos(th) * Y.x, y: -Math.sin(th) * X.y + Math.cos(th) * Y.y };
        const dp = { x: ev.clientX - st.x, y: ev.clientY - st.y };
        const lt = Math.hypot(T.x, T.y);
        const dRad = lt > 20 ? (dp.x * T.x + dp.y * T.y) / Math.max(lt * lt, 3600) : -dp.y * 0.012;
        raw = st.raw + (dRad * 180) / Math.PI;
      }
      drag.current = { raw, x: ev.clientX, y: ev.clientY };
      const a = snapHinge(raw, ev.altKey);
      if (a !== props.value) props.onChange(a);
    },
    end: (cancel) => {
      drag.current = null;
      setDragging(false);
      props.onEnd?.(cancel);
    },
  });
  const cur = props.pointAt(props.value);
  const zone = props.zoneAt(props.value);
  const showWhy = show && zone !== 'ok' && props.message;
  return (
    <group userData={{ noAO: true }}>
      {ring && <primitive object={ring} raycast={() => null} />}
      <primitive object={near} raycast={() => null} />
      <ScreenSized position={cur}>
        <group
          onPointerOver={(e) => (e.stopPropagation(), setHover(true))}
          onPointerOut={() => setHover(false)}
          onPointerDown={(e) => {
            drag.current = { raw: props.value, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
            setDragging(true);
            down(e);
          }}
          userData={{ testId: props.testId }}
        >
          <mesh renderOrder={21}>
            <sphereGeometry args={[show ? 12 : 10, 16, 12]} />
            <meshBasicMaterial color={hover ? '#0f5d59' : ZONE_COLOR[zone]} {...onTop} />
          </mesh>
          <mesh renderOrder={22} raycast={() => null}>
            <torusGeometry args={[5, 1.4, 6, 18, Math.PI * 1.5]} />
            <meshBasicMaterial color="white" {...onTop} />
          </mesh>
          {/* larger invisible grab area */}
          <mesh renderOrder={17}>
            <sphereGeometry args={[20, 8, 6]} />
            <meshBasicMaterial color="white" opacity={0} {...onTop} />
          </mesh>
        </group>
      </ScreenSized>
      <StageHtml position={cur} zIndexRange={HTML_Z} style={{ pointerEvents: 'none' }}>
        <span className={`w-dim ghost hinge-label zone-${zone}`} style={{ transform: 'translate(18px, -125%)' }}>
          {props.label}
          {showWhy && <span className="why">{props.message}</span>}
        </span>
      </StageHtml>
    </group>
  );
}

/** Dimension label at a world point; click to type an exact value. */
export function DimLabel(props: { at: V3; k: string; value: number; unit: string; onCommit?: (v: number) => void; ghost?: boolean; testId?: string; min?: number }) {
  const [edit, setEdit] = useState<string | null>(null);
  const commit = (raw: string) => {
    setEdit(null);
    const v = evalNumber(raw);
    if (v === null || !props.onCommit) return;
    const c = Math.max(props.min ?? 5, v);
    if (Math.abs(c - props.value) > 1e-9) props.onCommit(c);
  };
  return (
    <StageHtml position={props.at} zIndexRange={HTML_Z}>
      <span className={`w-dim ${props.ghost ? 'ghost' : ''}`} dir="ltr" onClick={() => props.onCommit && edit === null && setEdit(fmtNum(props.value))} data-testid={props.testId}>
        <span className="k">{props.k}</span>
        {edit === null ? (
          <span>
            {fmtNum(props.value)} {props.unit}
          </span>
        ) : (
          <input
            autoFocus
            value={edit}
            onChange={(e) => setEdit(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commit(e.currentTarget.value);
              if (e.key === 'Escape') setEdit(null);
            }}
            data-testid={props.testId ? `${props.testId}-input` : undefined}
          />
        )}
      </span>
    </StageHtml>
  );
}

/** A dimension line with end ticks, drawn on top. */
export function DimLine({ a, b, tick }: { a: V3; b: V3; tick: V3 }) {
  const obj = useMemo(() => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), T = new THREE.Vector3(...tick);
    const pts = [A, B, A.clone().add(T), A.clone().sub(T), B.clone().add(T), B.clone().sub(T)];
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#6e655b', ...onTop, opacity: 0.85 }));
    l.renderOrder = 15;
    l.userData.noAO = true;
    return l;
  }, [a.join(), b.join(), tick.join()]);
  useEffect(() => () => (obj.geometry.dispose(), (obj.material as THREE.Material).dispose()), [obj]);
  return <primitive object={obj} raycast={() => null} />;
}

// ---------------------------------------------------------------------------
// Move and rotate gizmo (milestone 17), for shapes (in their panel's plane)
// and floor panels (on the floor). A centre pad moves freely in the plane, two
// arrows move along one axis, the ring turns. Rotation snaps to 15° steps,
// Shift gives 1°, Alt turns snapping off. While dragging, the angle or offset
// shows next to the gizmo and can be typed (digits, then Enter).

export type GizmoMode = 'pad' | 'x' | 'y' | 'ring';

/** Snap a raw angle (degrees): 15° steps, Shift 1°, Alt free (0.1°). */
export function snapAngle(raw: number, ev: { shiftKey: boolean; altKey: boolean }): number {
  const step = ev.altKey ? 0.1 : ev.shiftKey ? 1 : 15;
  return Math.round(Math.round(raw / step) * step * 10) / 10;
}

export function Gizmo(props: {
  at: V3;
  /** In-plane unit axes (display space) and the plane normal. */
  ax: V3;
  ay: V3;
  n: V3;
  /** Which handles to show (default: all). */
  modes?: GizmoMode[];
  /** Live move: offsets along ax and ay (mm, unsnapped); return the offsets actually used (after snapping). */
  onMove?: (du: number, dv: number, ev: PointerEvent | null) => { du: number; dv: number } | void;
  /** Live turn by `deg` (snapped) from where the drag started. */
  onRotate?: (deg: number) => void;
  onEnd: (cancel: boolean) => void;
  testId?: string;
}) {
  const { camera, gl } = useThree();
  const [hover, setHover] = useState<GizmoMode | null>(null);
  const [active, setActive] = useState<GizmoMode | null>(null);
  const [readout, setReadout] = useState<string>('');
  const [typed, setTyped] = useState<string | null>(null);
  const modes = props.modes ?? ['pad', 'x', 'y', 'ring'];
  const center = useMemo(() => new THREE.Vector3(...props.at), [props.at[0], props.at[1], props.at[2]]);
  const AX = useMemo(() => new THREE.Vector3(...props.ax).normalize(), [props.ax[0], props.ax[1], props.ax[2]]);
  const AY = useMemo(() => new THREE.Vector3(...props.ay).normalize(), [props.ay[0], props.ay[1], props.ay[2]]);
  const N = useMemo(() => new THREE.Vector3(...props.n).normalize(), [props.n[0], props.n[1], props.n[2]]);
  const quat = useMemo(() => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(AX, AY, N)), [AX, AY, N]);
  const ray = useRayFromScreen();
  const st = useRef<{ mode: GizmoMode; base: THREE.Vector3; grab: number; a0: number; last: number; du: number; dv: number; deg: number } | null>(null);
  const toScreen = (p: THREE.Vector3) => {
    const r = gl.domElement.getBoundingClientRect();
    const v = p.clone().project(camera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  };
  // turning sense on screen: the ring seen from its normal's side turns counter-clockwise for positive angles
  const screenAngle = (ev: { clientX: number; clientY: number }) => {
    const c = toScreen(center);
    const facing = N.dot(camera.position.clone().sub(center)) >= 0 ? 1 : -1;
    return (facing * Math.atan2(-(ev.clientY - c.y), ev.clientX - c.x) * 180) / Math.PI;
  };
  const planeHit = (ev: { clientX: number; clientY: number }) => ray(ev.clientX, ev.clientY).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(N, center), new THREE.Vector3());
  const fmt = (x: number) => fmtNum(Math.round(x * 10) / 10);
  const show = (s: NonNullable<typeof st.current>) => setReadout(s.mode === 'ring' ? `${fmt(s.deg)}°` : s.mode === 'pad' ? `${fmt(s.du)}, ${fmt(s.dv)}` : fmt(s.mode === 'x' ? s.du : s.dv));
  const drag = useHandleDrag({
    move: (ev) => {
      const s = st.current;
      if (!s) return;
      if (s.mode === 'ring') {
        let a = screenAngle(ev);
        // unwrap so a drag past ±180° keeps turning
        while (a - s.last > 180) a -= 360;
        while (a - s.last < -180) a += 360;
        s.last = a;
        const deg = snapAngle(a - s.a0, ev);
        if (deg !== s.deg) {
          s.deg = deg;
          props.onRotate?.(deg);
        }
      } else {
        let du = 0, dv = 0;
        if (s.mode === 'pad') {
          const hit = planeHit(ev);
          if (!hit) return;
          const dvec = hit.sub(s.base);
          du = dvec.dot(AX);
          dv = dvec.dot(AY);
        } else {
          const axis = s.mode === 'x' ? AX : AY;
          const t = closestOnLine(ray(ev.clientX, ev.clientY), s.base, axis) - s.grab;
          if (s.mode === 'x') du = t;
          else dv = t;
        }
        const used = props.onMove?.(du, dv, ev) || { du, dv };
        s.du = used.du;
        s.dv = used.dv;
      }
      show(s);
    },
    end: (cancel) => {
      st.current = null;
      setActive(null);
      setTypedBoth(null);
      props.onEnd(cancel);
    },
  });
  // typed values while dragging: digits (and . , - space), Enter applies and ends the drag
  const typedRef = useRef<string | null>(null);
  const setTypedBoth = (x: string | null) => {
    typedRef.current = x;
    setTyped(x);
  };
  useEffect(() => {
    if (!active) return;
    const key = (ev: KeyboardEvent) => {
      const s = st.current;
      if (!s) return;
      if (/^[0-9.,\- ]$/.test(ev.key)) {
        ev.preventDefault();
        ev.stopPropagation();
        setTypedBoth((typedRef.current ?? '') + ev.key);
      } else if (ev.key === 'Backspace') {
        ev.preventDefault();
        setTypedBoth(typedRef.current ? typedRef.current.slice(0, -1) : typedRef.current);
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        const nums = (typedRef.current ?? '').split(/[ ,]+/).filter(Boolean).map(Number);
        if (nums.length && nums.every(Number.isFinite)) {
          if (s.mode === 'ring') props.onRotate?.(nums[0]);
          else if (s.mode === 'pad') props.onMove?.(nums[0], nums[1] ?? 0, null);
          else if (s.mode === 'x') props.onMove?.(nums[0], 0, null);
          else props.onMove?.(0, nums[0], null);
        }
        setTypedBoth(null);
        // finish as if the pointer was released
        window.dispatchEvent(new PointerEvent('pointerup'));
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [active]);
  const begin = (mode: GizmoMode) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const base = center.clone();
    const ne = e.nativeEvent;
    let grab = 0;
    if (mode === 'pad') {
      const hit = planeHit(ne);
      if (hit) base.copy(hit);
    } else if (mode === 'x' || mode === 'y') grab = closestOnLine(e.ray, base, mode === 'x' ? AX : AY);
    const a0 = screenAngle(ne);
    st.current = { mode, base, grab, a0, last: a0, du: 0, dv: 0, deg: 0 };
    setActive(mode);
    show(st.current);
    drag(e);
  };
  const lit = (m: GizmoMode) => active === m || (!active && hover === m);
  const col = (m: GizmoMode, c: string) => (lit(m) ? '#0f5d59' : c);
  const handlers = (m: GizmoMode) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), setHover(m)),
    onPointerOut: () => setHover((h) => (h === m ? null : h)),
    onPointerDown: begin(m),
  });
  const R = 64;
  return (
    <group userData={{ noAO: true }}>
      <ScreenSized position={props.at} quaternion={quat}>
        {modes.includes('ring') && (
          <group {...handlers('ring')} userData={{ testId: props.testId ? `${props.testId}-ring` : undefined }}>
            <mesh renderOrder={22} raycast={() => null}>
              <torusGeometry args={[R, lit('ring') ? 3.2 : 2.2, 6, 64]} />
              <meshBasicMaterial color={col('ring', '#e0a21b')} {...onTop} />
            </mesh>
            <mesh renderOrder={21} raycast={priorityRaycast}>
              <torusGeometry args={[R, 9, 6, 48]} />
              <meshBasicMaterial color="white" opacity={0} {...onTop} />
            </mesh>
          </group>
        )}
        {(['x', 'y'] as const)
          .filter((m) => modes.includes(m))
          .map((m) => (
            <group key={m} rotation={[0, 0, m === 'x' ? -Math.PI / 2 : 0]} {...handlers(m)} userData={{ testId: props.testId ? `${props.testId}-${m}` : undefined }}>
              <mesh position={[0, 30, 0]} renderOrder={23} raycast={priorityRaycast}>
                <cylinderGeometry args={[2, 2, 26, 8]} />
                <meshBasicMaterial color={col(m, m === 'x' ? '#d4543c' : '#2f6feb')} {...onTop} />
              </mesh>
              <mesh position={[0, 47, 0]} renderOrder={23} raycast={priorityRaycast}>
                <coneGeometry args={[6, 12, 14]} />
                <meshBasicMaterial color={col(m, m === 'x' ? '#d4543c' : '#2f6feb')} {...onTop} />
              </mesh>
            </group>
          ))}
        {modes.includes('pad') && (
          <mesh renderOrder={24} raycast={priorityRaycast} {...handlers('pad')} userData={{ testId: props.testId ? `${props.testId}-pad` : undefined }}>
            <boxGeometry args={[18, 18, 2]} />
            <meshBasicMaterial color={col('pad', '#1fb8ac')} opacity={0.9} {...onTop} />
          </mesh>
        )}
      </ScreenSized>
      {active && (
        <StageHtml position={props.at} zIndexRange={HTML_Z} style={{ pointerEvents: 'none' }}>
          <span className="w-dim ghost gizmo-readout" style={{ transform: 'translate(78px, -50%)' }} data-testid={props.testId ? `${props.testId}-readout` : undefined}>
            {typed !== null ? <b>{typed}▏</b> : readout}
          </span>
        </StageHtml>
      )}
    </group>
  );
}
