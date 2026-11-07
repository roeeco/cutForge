// Stage widgets: handles drawn on top of the model at a constant screen size.
//  - PushPull: an arrow you drag along an axis (panel width/height, ghost height)
//  - AngleArc: the angle dial at a hinge, with detents at the allowed angles
//  - DimLabel: an in-place dimension; click to type an exact value
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { V3 } from '../model/types';
import { evalNumber } from '../ui/NumField';
import { fmtNum } from '../i18n';

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

/** Arrow handle at `at`, pointing along `axis`; dragging changes `value` (the distance from at − axis·value). */
export function PushPull(props: {
  at: V3;
  axis: V3;
  value: number;
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
          const base = new THREE.Vector3(...props.at).addScaledVector(axis, -props.value);
          const grab = closestOnLine(e.ray, base, axis) - props.value;
          start.current = { base, grab };
          down(e);
        }}
        userData={{ noAO: true, testId: props.testId }}
      >
        <mesh position={[0, 8, 0]} renderOrder={20}>
          <coneGeometry args={[7, 14, 18]} />
          <meshBasicMaterial color={color} {...onTop} />
        </mesh>
        <mesh position={[0, -1, 0]} renderOrder={20}>
          <cylinderGeometry args={[2.2, 2.2, 6, 10]} />
          <meshBasicMaterial color={color} {...onTop} />
        </mesh>
        <mesh renderOrder={19}>
          <sphereGeometry args={[14, 12, 10]} />
          <meshBasicMaterial color="white" opacity={hover ? 0.55 : 0} {...onTop} />
        </mesh>
      </group>
    </ScreenSized>
  );
}

/**
 * Angle dial at a hinge: an arc through the far edge positions of each angle,
 * detents at `angles`. `pointAt(a)` is the handle position for angle a.
 */
export function AngleArc(props: { pointAt: (a: number) => V3; angles: readonly number[]; value: number; onChange: (a: number) => void; onEnd?: (cancel: boolean) => void; label: string }) {
  const { camera, gl } = useThree();
  const [hover, setHover] = useState(false);
  const arc = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const lo = Math.min(...props.angles), hi = Math.max(...props.angles);
    for (let a = lo; a <= hi + 1e-9; a += 2.5) pts.push(new THREE.Vector3(...props.pointAt(a)));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [props.pointAt]);
  const line = useMemo(() => new THREE.Line(arc, new THREE.LineBasicMaterial({ color: '#1fb8ac', ...onTop, opacity: 0.85 })), [arc]);
  useEffect(() => () => (arc.dispose(), (line.material as THREE.Material).dispose()), [arc, line]);
  const nearest = (clientX: number, clientY: number) => {
    const r = gl.domElement.getBoundingClientRect();
    let best = props.value, bd = Infinity;
    for (const a of props.angles) {
      const v = new THREE.Vector3(...props.pointAt(a)).project(camera);
      const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height;
      const dd = (x - clientX) ** 2 + (y - clientY) ** 2;
      if (dd < bd) (bd = dd), (best = a);
    }
    return best;
  };
  const down = useHandleDrag({
    move: (ev) => {
      const a = nearest(ev.clientX, ev.clientY);
      if (a !== props.value) props.onChange(a);
    },
    end: (cancel) => props.onEnd?.(cancel),
  });
  const cur = props.pointAt(props.value);
  return (
    <group userData={{ noAO: true }}>
      <primitive object={line} renderOrder={18} raycast={() => null} />
      {props.angles
        .filter((a) => a !== props.value)
        .map((a) => (
          <ScreenSized key={a} position={props.pointAt(a)}>
            <mesh renderOrder={19} onPointerDown={(e) => (e.stopPropagation(), props.onChange(a), down(e))}>
              <sphereGeometry args={[4, 12, 10]} />
              <meshBasicMaterial color="white" {...onTop} />
            </mesh>
            <mesh renderOrder={18} raycast={() => null}>
              <sphereGeometry args={[5.5, 12, 10]} />
              <meshBasicMaterial color="#1fb8ac" {...onTop} />
            </mesh>
          </ScreenSized>
        ))}
      <ScreenSized position={cur}>
        <group onPointerOver={(e) => (e.stopPropagation(), setHover(true))} onPointerOut={() => setHover(false)} onPointerDown={down}>
          <mesh renderOrder={21}>
            <sphereGeometry args={[hover ? 10 : 8.5, 16, 12]} />
            <meshBasicMaterial color={hover ? '#0f5d59' : '#1fb8ac'} {...onTop} />
          </mesh>
          <mesh renderOrder={22}>
            <sphereGeometry args={[3.5, 12, 10]} />
            <meshBasicMaterial color="white" {...onTop} />
          </mesh>
        </group>
      </ScreenSized>
      <StageHtml position={cur} zIndexRange={HTML_Z} style={{ pointerEvents: 'none' }}>
        <span className="w-dim ghost" style={{ transform: 'translate(14px, -130%)' }}>
          {props.label}
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
