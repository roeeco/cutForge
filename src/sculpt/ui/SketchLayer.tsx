// The sketch tool, Edit sketch and the radius tool on the stage (WAFFLE_MODE.md §5.5–5.6).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { gridSnap, noSmartSnap, selectedShapeIds, shapeSel, useStore, useT } from '../../store/store';
import type { Design, P2, Shape3, SketchGraph, V3 } from '../../model/types';
import { sketchPolylines } from '../../sketch/regions';
import { cornerCut, segAt } from '../../sketch/flatten';
import { bounds } from '../../sketch/model';
import { fmtNum } from '../../i18n';
import { actualRadii } from '../round';
import { addShape, parentMatrix, startHeight, worldPose } from '../ops';
import { footprint, shapeMatrix } from '../build';
import { cornerHeight, deleteSketchPoint, fromSketch, insertSketchPoint, moveSketchPoint, planeMatrix, revolveSuits, roundable, roundCorner, sketchMatrix, sketchNormal, sketchOk, sketchShape, toSketch, type SketchPlane } from '../sketch';
import { m4Apply, m4Mul, type M4 } from '../xform';
import { nextPolyPoint, typedPoint } from '../../views/polyDraw';
import { Gizmo, PushPull, ScreenSized, StageHtml, mmPerPx, priorityRaycast, useHandleDrag, useRayFromScreen } from '../../views/widgets';
import { STAGE } from '../../views/palette';
import { shapeColor } from './geom';
import { visibleShapes } from './SculptView3D';

const STEP30 = Math.PI / 6;
const st = () => useStore.getState();
const v3 = (p: V3) => new THREE.Vector3(...p);

/** The plane through M's origin with M's z as its normal. */
function planeOf(M: M4) {
  return new THREE.Plane().setFromNormalAndCoplanarPoint(v3(sketchNormal(M)).normalize(), v3([M[12], M[13], M[14]]));
}

/** An upright plane on the stage: a grid, its dashed axis, an arrow to move it and a ring to turn it in 30° steps. */
function UprightPlane({ pl }: { pl: Extract<SketchPlane, { kind: 'upright' }> }) {
  const M = planeMatrix(pl);
  const m = useMemo(() => new THREE.Matrix4().fromArray(M), [pl.o[0], pl.o[1], pl.o[2], pl.ang]);
  const n = sketchNormal(M);
  const start = useRef<SketchPlane | null>(null);
  const setPlane = (p: SketchPlane) => st().setSculpt({ plane: p });
  return (
    <>
      <group matrixAutoUpdate={false} matrix={m}>
        <mesh position={[0, 120, 0]} raycast={() => null} renderOrder={1}>
          <planeGeometry args={[400, 240]} />
          <meshBasicMaterial color={STAGE.ghost} transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <gridHelper args={[400, 40, '#9fb7c9', '#c8d6e0']} rotation={[Math.PI / 2, 0, 0]} position={[0, 120, 0.05]} scale={[1, 1, 0.6]} raycast={() => null} />
        <Line points={[[0, -10, 0.2], [0, 250, 0.2]]} color="#e0a21b" lineWidth={2} dashed dashSize={6} gapSize={4} raycast={() => null} />
      </group>
      <PushPull
        at={fromSketch(M, { x: 200, y: 0 }, 0)}
        axis={n}
        value={0}
        min={-2000}
        max={2000}
        onPreview={(v) => {
          start.current ??= pl;
          const s0 = start.current as typeof pl;
          setPlane({ ...s0, o: [s0.o[0] + n[0] * v, 0, s0.o[2] + n[2] * v] });
        }}
        onCommit={() => (start.current = null)}
        onCancel={() => (start.current && setPlane(start.current), (start.current = null))}
        testId="plane-move"
      />
      <Gizmo
        at={pl.o}
        ax={[1, 0, 0]}
        ay={[0, 0, -1]}
        n={[0, 1, 0]}
        modes={['ring']}
        onRotate={(deg) => {
          start.current ??= pl;
          const s0 = start.current as typeof pl;
          setPlane({ ...s0, ang: (((s0.ang + Math.round(deg / 30) * 30) % 360) + 360) % 360 });
        }}
        onEnd={(cancel) => {
          if (cancel && start.current) setPlane(start.current);
          start.current = null;
        }}
        testId="plane-turn"
      />
    </>
  );
}

type Draft = { pts: P2[]; cur: P2 | null; typed: string; alt: boolean };

/** Drawing an outline on the sketch plane: click corners, close on the first point or with Enter. */
function SketchDraw({ pl }: { pl: SketchPlane }) {
  const t = useT();
  const { camera, gl } = useThree();
  const ray = useRayFromScreen();
  const [draft, setDraftState] = useState<Draft | null>(null);
  const dr = useRef<Draft | null>(null);
  const setDraft = (d: Draft | null) => {
    dr.current = d;
    setDraftState(d);
  };
  const M = planeMatrix(pl);
  const mRef = useRef(M);
  mRef.current = M;
  const local = (ev: { clientX: number; clientY: number }): P2 | null => {
    const hit = ray(ev.clientX, ev.clientY).intersectPlane(planeOf(mRef.current), new THREE.Vector3());
    return hit ? toSketch(mRef.current, [hit.x, hit.y, hit.z]) : null;
  };
  const tol = (p: P2) => 10 * mmPerPx(camera, gl.domElement.clientHeight || 600, v3(fromSketch(mRef.current, p)));
  const next = (pts: P2[], raw: P2, ev: { altKey: boolean }): P2 =>
    nextPolyPoint(pts, raw, {
      angle: ev.altKey ? null : STEP30,
      grid: (x) => gridSnap(x, ev),
      closeTol: tol(raw),
      // points also snap to the plane's axis line
      extra: (p) => (pl.kind === 'upright' && !noSmartSnap(ev as { altKey: boolean }) && Math.abs(p.x) < tol(p) ? { x: 0, y: p.y } : p),
    });
  const finish = (pts: P2[]) => {
    if (!sketchOk(pts)) return false;
    const s = st();
    const mode = pl.kind === 'upright' && revolveSuits(pts) ? 'revolve' : 'extrude';
    let id = '';
    s.setTool('select');
    s.apply((x) => void (id = addShape(x as Design, { ...sketchShape(pl, pts, mode, startHeight('extrude', s.sculpt.heights)), color: shapeColor(Object.keys(x.sculpt?.shapes ?? {}).length) }, s.sculpt.focus)));
    if (!id) return true;
    s.select(shapeSel([id]));
    s.beginPending({ kind: 'sculpt', ids: [id], panelId: '' });
    setDraft(null);
    return true;
  };
  useEffect(() => {
    const el = gl.domElement;
    let downAt: { x: number; y: number } | null = null;
    const down = (ev: PointerEvent) => {
      if (ev.button === 0) downAt = { x: ev.clientX, y: ev.clientY };
    };
    const up = (ev: PointerEvent) => {
      if (ev.button !== 0 || !downAt || Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 4) return;
      downAt = null;
      const raw = local(ev);
      if (!raw) return;
      const d = dr.current;
      if (!d) {
        st().cancelPending();
        return setDraft({ pts: [{ x: gridSnap(raw.x, ev), y: gridSnap(raw.y, ev) }], cur: null, typed: '', alt: ev.altKey });
      }
      const p = next(d.pts, raw, ev);
      if (d.pts.length >= 3 && p === d.pts[0]) {
        if (!finish(d.pts)) setDraft({ ...d });
        return;
      }
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.5) return;
      setDraft({ ...d, pts: [...d.pts, p], typed: '' });
    };
    const move = (ev: PointerEvent) => {
      const d = dr.current;
      if (!d) return;
      const raw = local(ev);
      if (raw) setDraft({ ...d, cur: next(d.pts, raw, ev), alt: ev.altKey });
    };
    const key = (ev: KeyboardEvent) => {
      const d = dr.current;
      if (!d) return;
      const tg = ev.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
      const stop = () => (ev.preventDefault(), ev.stopPropagation());
      if (ev.key === 'Escape') {
        stop();
        setDraft(null);
      } else if (/^[0-9.]$/.test(ev.key)) {
        stop();
        setDraft({ ...d, typed: d.typed + ev.key });
      } else if (ev.key === 'Backspace') {
        stop();
        if (d.typed) setDraft({ ...d, typed: d.typed.slice(0, -1) });
        else if (d.pts.length > 1) setDraft({ ...d, pts: d.pts.slice(0, -1) });
        else setDraft(null);
      } else if (ev.key === 'Enter') {
        stop();
        const q = typedPoint(d.pts, d.cur, d.typed);
        if (q) setDraft({ ...d, pts: [...d.pts, q], typed: '' });
        else if (d.pts.length >= 3) finish(d.pts);
      }
    };
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointerup', up, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
    return () => {
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', key, true);
    };
  }, [pl.kind, pl.kind === 'upright' ? `${pl.o.join(',')}|${pl.ang}` : '']);
  if (!draft) return null;
  const pts = [...draft.pts, ...(draft.cur ? [draft.cur] : [])];
  const ok = pts.length < 3 || sketchOk(pts);
  const W = pts.map((p) => fromSketch(M, p, 0.3));
  const last = draft.pts[draft.pts.length - 1];
  const seg = draft.cur && last ? Math.hypot(draft.cur.x - last.x, draft.cur.y - last.y) : null;
  return (
    <group userData={{ noAO: true }}>
      {W.length >= 2 && <Line points={W} color={STAGE.selected} lineWidth={2} depthTest={false} />}
      {W.length >= 3 && <Line points={[W[W.length - 1], W[0]]} color={ok ? STAGE.selected : '#d1372b'} lineWidth={1.5} transparent opacity={0.6} depthTest={false} />}
      {W.slice(0, draft.pts.length).map((p, i) => (
        <mesh key={i} position={p} renderOrder={8} raycast={() => null}>
          <sphereGeometry args={[i === 0 ? 1.8 : 1.2, 10, 8]} />
          <meshBasicMaterial color={i === 0 ? '#ffffff' : STAGE.selected} depthTest={false} />
        </mesh>
      ))}
      <StageHtml position={W[W.length - 1]} style={{ pointerEvents: 'none' }}>
        <span className="dim-label poly-label" data-testid="sketch-label" dir="ltr">
          {draft.typed ? `${draft.typed}▍ ${t('unit.mm')}` : seg !== null ? `${fmtNum(seg)} ${t('unit.mm')}` : ''}
          {!ok ? ` · ${t('poly.crosses')}` : ''}
        </span>
      </StageHtml>
    </group>
  );
}

/** The flattened lines of a sketch (its segments with their corner cuts), for drawing. */
function sketchLines(sk: SketchGraph): P2[][] {
  return sketchPolylines(sk);
}

/** Edit sketch: the sketch on its plane with point handles, + on each segment, and the picked point. */
function SketchEdit({ d, id }: { d: Design; id: string }) {
  const sc = d.sculpt!;
  const s = sc.shapes[id];
  const ray = useRayFromScreen();
  const selPoint = useStore((x) => x.sculpt.selPoint);
  const drag = useRef<{ pt: string } | null>(null);
  const M = sketchMatrix(sc, id);
  const mRef = useRef(M);
  mRef.current = M;
  const down = useHandleDrag({
    move: (ev) => {
      const g = drag.current;
      if (!g) return;
      const hit = ray(ev.clientX, ev.clientY).intersectPlane(planeOf(mRef.current), new THREE.Vector3());
      if (!hit) return;
      const l = toSketch(mRef.current, [hit.x, hit.y, hit.z]);
      st().preview((x) => void moveSketchPoint(x as Design, id, g.pt, { x: gridSnap(l.x, ev), y: gridSnap(l.y, ev) }));
    },
    end: (cancel) => {
      drag.current = null;
      if (cancel) st().cancel();
      else st().commit();
    },
  });
  if (!s?.sketch) return null;
  const sk = s.sketch;
  return (
    <group userData={{ noAO: true }}>
      {sketchLines(sk).map((l, i) => (
        <Line key={`l${i}`} points={l.map((p) => fromSketch(M, p, 0.4))} color={STAGE.selected} lineWidth={2} depthTest={false} />
      ))}
      {Object.entries(sk.pts).map(([pid, p], i) => (
        <ScreenSized key={`p${pid}`} position={fromSketch(M, p, 0.4)}>
          <mesh
            renderOrder={22}
            raycast={priorityRaycast}
            onPointerDown={(e) => {
              st().setSculpt({ selPoint: pid });
              drag.current = { pt: pid };
              down(e);
            }}
            userData={{ testId: `sketch-point-${i}` }}
          >
            <sphereGeometry args={[selPoint === pid ? 7 : 5.5, 12, 10]} />
            <meshBasicMaterial color={selPoint === pid ? '#0f5d59' : p.r ? '#e0a21b' : p.smooth ? '#2f6feb' : '#ffffff'} depthTest={false} transparent />
          </mesh>
        </ScreenSized>
      ))}
      {sk.order.map((g, i) => {
        const mid = segAt(sk, g, 0.5);
        return (
          <ScreenSized key={`m${g}`} position={fromSketch(M, mid, 0.4)}>
            <mesh
              renderOrder={21}
              raycast={priorityRaycast}
              onPointerDown={(e) => {
                e.stopPropagation();
                const before = new Set(Object.keys(st().design.sculpt!.shapes[id].sketch!.pts));
                st().apply((x) => void insertSketchPoint(x as Design, id, g, 0.5));
                const added = Object.keys(st().design.sculpt!.shapes[id].sketch!.pts).find((p) => !before.has(p));
                st().setSculpt({ selPoint: added ?? null });
              }}
              userData={{ testId: `sketch-add-${i}` }}
            >
              <boxGeometry args={[7, 7, 7]} />
              <meshBasicMaterial color="#1fb8ac" depthTest={false} transparent opacity={0.85} />
            </mesh>
          </ScreenSized>
        );
      })}
    </group>
  );
}

/** Revolve about a segment: the sketch's straight segments as targets on the ghost or the selected revolve. */
function AxisPicker({ d, id }: { d: Design; id: string }) {
  const s = d.sculpt!.shapes[id];
  const [hover, setHover] = useState<string | null>(null);
  if (s?.kind !== 'revolve' || !s.sketch) return null;
  const M = sketchMatrix(d.sculpt!, id);
  const sk = s.sketch;
  return (
    <group userData={{ noAO: true }}>
      {sk.order.map((g, i) => {
        const seg = sk.segs[g];
        if (seg.k !== 'line') return null;
        const on = s.axis?.kind === 'seg' && s.axis.id === g;
        const a = fromSketch(M, sk.pts[seg.a], 0.5), b = fromSketch(M, sk.pts[seg.b], 0.5);
        const mid = v3(a).add(v3(b)).multiplyScalar(0.5);
        const len = v3(a).distanceTo(v3(b));
        const dir = v3(b).sub(v3(a)).normalize();
        return (
          <group key={g}>
            <Line points={[a, b]} color={on ? '#e0a21b' : hover === g ? '#0f5d59' : '#7aa9a5'} lineWidth={on || hover === g ? 4 : 2} dashed={!on} dashSize={4} gapSize={3} depthTest={false} />
            <mesh
              position={mid}
              quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)}
              onPointerOver={(e) => (e.stopPropagation(), setHover(g))}
              onPointerOut={() => setHover(null)}
              onPointerDown={(e) => {
                e.stopPropagation();
                st().apply((x) => {
                  const y = (x as Design).sculpt!.shapes[id];
                  if (y) y.axis = on ? { kind: 'plane' } : { kind: 'seg', id: g };
                });
              }}
              userData={{ testId: `axis-edge-${i}` }}
            >
              <cylinderGeometry args={[2.5, 2.5, len, 6]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** The radius a corner really got after the clamp (a sketch point's cut, or a footprint corner's fillet). */
function cornerRadius(s: Shape3, key: number | string): number {
  if (s.sketch && typeof key === 'string') return cornerCut(s.sketch, key)?.r ?? 0;
  if (typeof key === 'number') return actualRadii(footprint(s))[key] ?? 0;
  return 0;
}

/** The radius tool: every corner it can round lights up on hover; a click rounds it (Shift-click several). */
function RadiusMarks({ d }: { d: Design }) {
  const t = useT();
  const sc = d.sculpt!;
  const radius = useStore((x) => x.sculptRadius);
  const focus = useStore((x) => x.sculpt.focus);
  const [hover, setHover] = useState<string | null>(null);
  const [badge, setBadge] = useState<{ at: V3; asked: number; got: number } | null>(null);
  useEffect(() => {
    if (!badge) return;
    const tm = setTimeout(() => setBadge(null), 2600);
    return () => clearTimeout(tm);
  }, [badge]);
  const marks: { key: string; id: string; i: number | string; a: V3; b: V3 }[] = [];
  for (const { id, dim } of visibleShapes(d, focus)) {
    const s = sc.shapes[id];
    if (!s || dim) continue;
    const pts = roundable(s);
    if (!pts.length) continue;
    const M = m4Mul(parentMatrix(sc, id), shapeMatrix(s));
    const h = cornerHeight(s);
    pts.forEach((p) => marks.push({ key: `${id}:${p.key}`, id, i: p.key, a: m4Apply(M, [p.x, p.y, 0]), b: m4Apply(M, [p.x, p.y, h]) }));
  }
  return (
    <group userData={{ noAO: true }}>
      {marks.map((m) => {
        const on = hover === m.key;
        const mid: V3 = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2];
        const len = v3(m.a).distanceTo(v3(m.b));
        return (
          <group key={m.key}>
            {len >= 0.5 && <Line points={[m.a, m.b]} color={on ? '#e0a21b' : '#0f5d59'} lineWidth={on ? 5 : 1.5} depthTest={false} transparent opacity={on ? 1 : 0.6} />}
            <ScreenSized position={mid}>
              <mesh
                renderOrder={22}
                raycast={priorityRaycast}
                onPointerOver={(e) => (e.stopPropagation(), setHover(m.key))}
                onPointerOut={() => setHover((h) => (h === m.key ? null : h))}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  st().apply((x) => void roundCorner(x as Design, m.id, m.i, radius));
                  // the clamp: say what the corner really got
                  const s2 = st().design.sculpt!.shapes[m.id];
                  const got = cornerRadius(s2, m.i);
                  if (radius >= 0.01 && got < radius - 0.05) setBadge({ at: mid, asked: radius, got });
                  if (!e.nativeEvent.shiftKey) st().select(shapeSel([m.id]));
                }}
                userData={{ testId: `round-${m.id}-${m.i}` }}
              >
                <sphereGeometry args={[on ? 7 : 5, 12, 10]} />
                <meshBasicMaterial color={on ? '#e0a21b' : '#ffffff'} depthTest={false} transparent opacity={0.95} />
              </mesh>
            </ScreenSized>
          </group>
        );
      })}
      {badge && (
        <StageHtml position={badge.at} style={{ pointerEvents: 'none' }}>
          <span className="slice-badge" data-testid="radius-clamped">
            {t('radius.clamped', { asked: fmtNum(badge.asked), got: fmtNum(badge.got) })}
          </span>
        </StageHtml>
      )}
    </group>
  );
}

/** An extrusion's height arrow (towards the viewer on an upright plane; through the plane to the other side). */
export function ExtrudeArrow({ d, id, color }: { d: Design; id: string; color?: string }) {
  const s = d.sculpt!.shapes[id];
  if (s?.kind !== 'extrude' || !s.sketch) return null;
  const M = sketchMatrix(d.sculpt!, id);
  const H = s.height ?? 20;
  const b = bounds(s.sketch);
  const c = b ? { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 } : { x: 0, y: 0 };
  return (
    <PushPull
      at={fromSketch(M, c, H)}
      axis={sketchNormal(M)}
      value={H}
      min={-2000}
      max={2000}
      color={color}
      onPreview={(v) => st().preview((x) => void (x.sculpt!.shapes[id].height = Math.abs(v) < 1 ? (v < 0 ? -1 : 1) : v))}
      onCommit={() => st().commit()}
      onCancel={() => st().cancel()}
      testId="extrude-height"
    />
  );
}

export function SketchLayer() {
  const d = useStore((x) => x.design);
  const tool = useStore((x) => x.tool);
  const ui = useStore((x) => x.sculpt);
  const pending = useStore((x) => x.pending);
  const sel = useStore((x) => x.selection);
  const ghost = pending?.kind === 'sculpt' ? pending.ids[0] : null;
  const ids = selectedShapeIds(sel);
  const one = ids.length === 1 ? ids[0] : null;
  const editing = ui.editSketch && d.sculpt?.shapes[ui.editSketch]?.sketch ? ui.editSketch : null;
  // leave Edit sketch when the shape is no longer the one selected
  useEffect(() => {
    if (ui.editSketch && (one !== ui.editSketch || tool !== 'select')) st().setSculpt({ editSketch: null, selPoint: null });
  }, [one, tool]);
  const axisFor = ghost ?? (one && d.sculpt?.shapes[one]?.kind === 'revolve' ? one : null);
  const arrowFor = ghost ?? (one && tool === 'select' ? one : null);
  return (
    <>
      {tool === 'sketch' && ui.plane.kind === 'upright' && <UprightPlane pl={ui.plane} />}
      {tool === 'sketch' && <SketchDraw pl={ui.plane} />}
      {editing && <SketchEdit d={d} id={editing} />}
      {tool === 'radius' && <RadiusMarks d={d} />}
      {axisFor && <AxisPicker d={d} id={axisFor} />}
      {arrowFor && <ExtrudeArrow d={d} id={arrowFor} color={ghost ? STAGE.ghost : undefined} />}
    </>
  );
}

export { worldPose };
