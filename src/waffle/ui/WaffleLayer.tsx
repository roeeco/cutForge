// Stage 2 on the stage (WAFFLE_MODE.md §6.1): the solid see-through, the slices
// as slabs (A and B in two colours, with their slots), the selected slice's
// arrow, and the ring that turns both families.
import { useEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { issueSelection, useStore, useT } from '../../store/store';
import { validate } from '../../model/validate';
import type { WaffleIssue } from '../checks';
import { StageHtml } from '../../views/widgets';
import type { Design } from '../../model/types';
import { Gizmo, PushPull } from '../../views/widgets';
import { planePoint, type FamFrame } from '../derive';
import type { CutPart } from '../finish';
import { familyPositions } from '../derive';
import { deleteSlice, moveSlice, setBase, setTurn } from '../ops';
import { waffleParts } from '../pieces';
import { baseModel, useWaffle } from './model';
import { StepsLayer } from './StepsLayer';


export const FAM_COLOR = { a: '#e8a33d', b: '#4f9fd9' } as const;
const st = () => useStore.getState();

/** Plane (x along the slice, y up, z along the normal) → world. */
export function planeMatrix4(f: FamFrame, at: number): THREE.Matrix4 {
  const o = planePoint(f, at, { x: 0, y: 0 });
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.s), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...f.n)).setPosition(o[0], 0, o[2]);
}

/** A part as a slab t thick, centred on its plane. */
export function slabGeometry(p: CutPart, t: number): THREE.BufferGeometry {
  const ring = (r: [number, number][]) => r.map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape(ring(p.polys[0]));
  for (const h of p.polys.slice(1)) shape.holes.push(new THREE.Path(ring(h)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -t / 2);
  return g;
}

function Slab({ p, f, t, selected, dim, onDown, offset = 0 }: { p: CutPart; f: FamFrame; t: number; selected: boolean; dim: boolean; onDown?: (e: ThreeEvent<PointerEvent>) => void; offset?: number }) {
  const geo = useMemo(() => slabGeometry(p, t), [p, t]);
  useEffect(() => () => geo.dispose(), [geo]);
  const m = useMemo(() => planeMatrix4(f, p.at).premultiply(new THREE.Matrix4().makeTranslation(0, offset, 0)), [f, p.at, offset]);
  return (
    <group matrixAutoUpdate={false} matrix={m}>
      <mesh geometry={geo} onPointerDown={onDown} userData={{ part: p.key }}>
        <meshStandardMaterial color={selected ? '#1fb8ac' : FAM_COLOR[p.fam]} roughness={0.8} transparent={dim} opacity={dim ? 0.18 : 1} emissive={selected ? '#0b4f4a' : '#000'} emissiveIntensity={selected ? 0.3 : 0} />
      </mesh>
      {!dim && (
        <lineSegments raycast={() => null}>
          <edgesGeometry args={[geo, 30]} />
          <lineBasicMaterial color="#3a3530" transparent opacity={0.45} />
        </lineSegments>
      )}
    </group>
  );
}

function SliceArrow() {
  const sel = useStore((s) => s.selection);
  const { model } = useWaffle();
  const start = useRef<number | null>(null);
  if (!model || sel?.kind !== 'slice') return null;
  const sl = model.slices.find((s) => s.fam === sel.family && s.id === sel.id);
  if (!sl) return null;
  const f = model.frames[sl.fam];
  const top = planePoint(f, sl.at, { x: 0, y: model.y1 + 12 });
  return (
    <PushPull
      at={top}
      axis={f.n}
      value={sl.at}
      min={-5000}
      max={5000}
      onPreview={(v) => {
        const m = baseModel();
        if (!m) return;
        start.current ??= sl.at;
        // 1 mm steps, snapping to the equal-spacing positions and to the solid's centre
        const even = familyPositions(sl.fam, { spacing: m.spec[sl.fam].spacing }, m.ext[sl.fam]).map((p) => p.at);
        let at = v;
        for (const x of [0, ...even]) if (Math.abs(x - v) < 2) at = x;
        st().preview((d) => moveSlice(d as Design, m, sl.fam, sl.id, at));
      }}
      onCommit={() => ((start.current = null), st().commit())}
      onCancel={() => ((start.current = null), st().cancel())}
      testId="slice-move"
    />
  );
}

/** The base plate under the sculpture, with an arrow that raises where the sculpture is cut flat. */
export function PlateView({ arrow = true }: { arrow?: boolean }) {
  const { model } = useWaffle();
  const plate = useStore((s) => waffleParts(s.design).plate);
  const geo = useMemo(() => {
    if (!plate) return null;
    const ring = (r: [number, number][]) => r.map(([x, y]) => new THREE.Vector2(x, y));
    const shape = new THREE.Shape(ring(plate.polys[0]));
    for (const h of plate.polys.slice(1)) shape.holes.push(new THREE.Path(ring(h)));
    return new THREE.ExtrudeGeometry(shape, { depth: model?.t ?? 3, bevelEnabled: false, curveSegments: 1 });
  }, [plate, model?.t]);
  useEffect(() => () => geo?.dispose(), [geo]);
  const start = useRef<number | null>(null);
  if (!model || !plate || !geo || model.plateY === null) return null;
  const base = useStore.getState().design.waffle?.base;
  const low = model.plateY - (base?.flat ?? 0);
  const c = model.frames.a.c;
  return (
    <>
      <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, model.plateY - model.t, 0]} raycast={() => null}>
        <meshStandardMaterial color="#c9a46a" roughness={0.85} />
      </mesh>
      {arrow && <PushPull
        at={[c[0] + (plate.bbox.x1 - plate.bbox.x0) / 2 + 12, model.plateY, c[2]]}
        axis={[0, 1, 0]}
        value={base?.flat ?? 0}
        min={0}
        max={Math.max(1, model.y1 - low - 1)}
        color="#e0a21b"
        onPreview={(v) => {
          const m = baseModel();
          if (m) st().preview((d) => setBase(d as Design, m, { flat: Math.max(0, v) }));
        }}
        onCommit={() => st().commit()}
        onCancel={() => st().cancel()}
        testId="plate-flat-arrow"
      />}
    </>
  );
}

/** The checks as badges on the stage, over the slice they name; a click selects it. */
function ProblemBadges() {
  const t = useT();
  const d = useStore((s) => s.design);
  const { model } = useWaffle();
  if (!model) return null;
  const issues = validate(d) as WaffleIssue[];
  const seen = new Set<string>();
  return (
    <>
      {issues.map((i, n) => {
        if (i.target.kind !== 'slice') return null;
        const tg = i.target;
        const sl = model.slices.find((s) => s.fam === tg.family && s.id === tg.id);
        if (!sl || seen.has(sl.id)) return null;
        seen.add(sl.id);
        return (
          <StageHtml key={n} position={planePoint(model.frames[sl.fam], sl.at, { x: 0, y: model.y1 + 28 })} center>
            <span className="slice-badge" onClick={() => st().select(issueSelection(i))} data-testid="slice-badge">
              {t(i.key, i.vars)}
            </span>
          </StageHtml>
        );
      })}
    </>
  );
}

export function WaffleLayer() {
  const { model, parts } = useWaffle();
  const sel = useStore((s) => s.selection);
  const steps = useStore((s) => s.steps);
  if (!model || model.empty) return null;
  const c = model.frames.a.c;
  if (steps !== null) return <StepsLayer model={model} parts={parts} />;
  return (
    <>
      {parts.map((p) => (
        <Slab
          key={p.key}
          p={p}
          f={model.frames[p.fam]}
          t={model.t}
          selected={sel?.kind === 'slice' && sel.family === p.fam && sel.id === p.sliceId}
          dim={false}
          onDown={(e) => {
            if (e.button !== 0 || e.intersections[0]?.object !== e.object) return;
            e.stopPropagation();
            st().select({ kind: 'slice', family: p.fam, id: p.sliceId });
          }}
        />
      ))}
      <SliceArrow />
      <ProblemBadges />
      <PlateView />
      <Gizmo
        at={[c[0], model.y0, c[2]]}
        ax={[1, 0, 0]}
        ay={[0, 0, -1]}
        n={[0, 1, 0]}
        modes={['ring']}
        onRotate={(deg) => {
          const m = baseModel();
          if (m) st().preview((d) => setTurn(d as Design, m, m.spec.turn + deg));
        }}
        onEnd={(cancel) => (cancel ? st().cancel() : st().commit())}
        testId="waffle-turn"
      />
    </>
  );
}

export { Slab };
