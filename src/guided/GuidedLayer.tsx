// What Guided draws inside the 3D scene (milestones 105, 107): View3D renders it through its `layer` slot,
// so the stage never imports Guided. In Build: three arrows (wider, deeper, taller; sizes are the inside),
// a grip on each divider, and the spaces, each tapped to select it. One drag is one undo step.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore, useT } from '../store/store';
import type { Design, V3 } from '../model/types';
import { DimLabel, PushPull } from '../views/widgets';
import { dividerRow, dividersOn, isDivider } from '../model/dividers';
import { validate } from '../model/validate';
import { contentFit, inCell } from '../easy/objects';
import { guidedCommit } from './apply';
import { boxTrayOf, insideSize, kindOf, moveDivider, setInsideSize, spaces } from './box';

type Basis = { o: V3; u: V3; v: V3; up: V3; top: number };
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** The base's frame in the world, and the height of the box's rim above it. */
function basisOf(d: Design, trayId: string): Basis | null {
  const t = d.trays[trayId];
  const b = t && d.panels[t.baseId];
  if (!b) return null;
  const f = b.frame;
  const n: V3 = [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]];
  const up: V3 = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
  let top = 0;
  for (const c of Object.values(d.connections)) {
    if (!c.grown || c.trayId !== trayId) continue;
    const w = d.panels[c.b.panelId];
    if (!w) continue;
    for (const [x, y] of [[0, 0], [w.w, 0], [w.w, w.h], [0, w.h]]) {
      const q = add(add(w.frame.o, w.frame.u, x), w.frame.v, y);
      top = Math.max(top, (q[0] - f.o[0]) * up[0] + (q[1] - f.o[1]) * up[1] + (q[2] - f.o[2]) * up[2]);
    }
  }
  return { o: f.o, u: f.u, v: f.v, up, top };
}
const at = (B: Basis, x: number, y: number, z: number): V3 => add(add(add(B.o, B.u, x), B.v, y), B.up, z);

const tooBig = (d: Design) => validate(d).some((i) => i.key === 'val.tooBig' || i.key === 'val.tooBigGrain');

/** Commit a size drag: when the box no longer fits the sheet, step back to the largest that does (at most six tries). */
function commitSize(key: 'w' | 'd' | 'h', from: number, to: number) {
  const st = useStore.getState();
  if (!tooBig(st.design)) return void guidedCommit();
  const base = st.txnBase;
  if (!base) return st.commit();
  let lo = from, hi = to;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    const c: Design = JSON.parse(JSON.stringify(base));
    setInsideSize(c, { [key]: mid });
    if (tooBig(c)) hi = mid;
    else lo = mid;
  }
  const v = Math.floor(lo);
  st.preview((dd) => setInsideSize(dd as Design, { [key]: v }));
  if (guidedCommit()) useStore.setState({ guidedNote: { key: 'g.size.sheetMax', at: Date.now() } });
}

function Arrows({ d, trayId, B }: { d: Design; trayId: string; B: Basis }) {
  const t = useT();
  const size = insideSize(d);
  const base = d.panels[d.trays[trayId].baseId];
  const start = useRef<number>(0);
  if (!size || !base) return null;
  const mid = B.top / 2;
  // the sides that move: the box grows from its base's corner, so the arrows are on the far sides
  const arrows: { key: 'w' | 'd' | 'h'; pos: V3; axis: V3; value: number; label: string }[] = [
    { key: 'w', pos: at(B, base.w + 6, base.h / 2, mid), axis: B.u, value: size.w, label: t('g.size.wide') },
    { key: 'd', pos: at(B, base.w * 0.85, base.h + 6, mid), axis: B.v, value: size.d, label: t('g.size.deep') },
    { key: 'h', pos: at(B, base.w * 0.15, 0, B.top + 6), axis: B.up, value: size.h, label: t('g.size.tall') },
  ];
  return (
    <>
      {arrows.map((a) => (
        <group key={a.key}>
          <PushPull
            at={a.pos}
            axis={a.axis}
            value={a.value}
            min={10}
            max={1200}
            testId={`g-arrow-${a.key}`}
            onPreview={(v) => {
              const st = useStore.getState();
              if (!st.txnBase) start.current = a.value;
              st.preview((dd) => setInsideSize(dd as Design, { [a.key]: v }));
            }}
            onCommit={() => commitSize(a.key, start.current, insideSize(useStore.getState().design)![a.key])}
            onCancel={() => useStore.getState().cancel()}
          />
          <DimLabel
            at={add(a.pos, a.axis, 22)}
            k={a.label}
            value={Math.round(a.value * 10) / 10}
            unit={t('unit.mm')}
            min={10}
            testId={`g-size-${a.key}`}
            onCommit={(v) => {
              const st = useStore.getState();
              const from = a.value;
              st.preview((dd) => setInsideSize(dd as Design, { [a.key]: v }));
              commitSize(a.key, from, v);
            }}
          />
        </group>
      ))}
    </>
  );
}

/** The faces a divider's slab can slide between: the board before it and the board after it in its row. */
function neighbours(lo: number, hi: number, others: number[], pos: number, th: number): { before: number; after: number } {
  let before = lo, after = hi;
  for (const o of others) {
    if (o < pos) before = Math.max(before, o + th);
    else if (o > pos) after = Math.min(after, o);
  }
  return { before, after };
}

/** Where a slide stops to make the spaces either side equal (mm away). */
const SNAP = 3;

/** A divider's grip: on its top, a third of the way along it (its middle is where a space's objects are named). */
function gripAt(d: Design, id: string, B: Basis): V3 {
  const p = d.panels[id];
  const row = dividerRow(d, id);
  if (!isDivider(p) || !row) return B.o;
  const along = { x: -row.n.y, y: row.n.x };
  const k = p.w * 0.3;
  return at(B, p.divider.at.x + along.x * k, p.divider.at.y + along.y * k, B.top + 8);
}

function Grips({ d, baseId, B }: { d: Design; baseId: string; B: Basis }) {
  const t = useT();
  const selected = useStore((s) => (s.selection?.kind === 'panel' ? s.selection.id : null));
  return (
    <>
      {dividersOn(d, baseId).map((id) => {
        const p = d.panels[id];
        const row = dividerRow(d, id);
        if (!isDivider(p) || !row) return null;
        const axis = add(add([0, 0, 0], B.u, row.n.x), B.v, row.n.y);
        const th = row.t;
        // the slab can go from the board before it to the board after it, leaving the smallest space either side
        const { before, after } = neighbours(row.lo, row.hi, row.others, row.pos, th);
        const min = before + 5, max = after - th - 5;
        const equal = (before + after - th) / 2;
        const sel = selected === id;
        return (
          <group key={id}>
            <PushPull
              at={gripAt(d, id, B)}
              axis={axis}
              value={row.pos}
              min={min}
              max={max}
              color="#e0a21b"
              testId={`g-grip-${id}`}
              onPreview={(v) => useStore.getState().preview((dd) => moveDivider(dd as Design, id, Math.abs(v - equal) < SNAP ? equal : v))}
              onCommit={() => guidedCommit()}
              onCancel={() => useStore.getState().cancel()}
            />
            {sel && <DimLabel at={add(gripAt(d, id, B), B.up, 22)} k={t('g.space.left')} value={Math.round((row.pos - before) * 10) / 10} unit={t('unit.mm')} ghost testId={`g-grip-${id}-a`} />}
          </group>
        );
      })}
    </>
  );
}

const SPACE = { sel: '#1fb8ac', ok: '#2e9d63', need: '#e0a21b' } as const;

function Spaces({ d, B }: { d: Design; B: Basis }) {
  const sel = useStore((s) => s.guidedSpace);
  const ks = useMemo(() => spaces(d), [d]);
  const tb = d.material.thickness;
  return (
    <>
      {ks.map((k, i) => {
        const lots = (d.contents ?? []).filter((c) => c.baseId === k.baseId && inCell(k, c));
        const bad = lots.some((c) => !contentFit(d, c).ok);
        const on = sel === i;
        const color = on ? SPACE.sel : lots.length ? (bad ? SPACE.need : SPACE.ok) : SPACE.sel;
        const w = k.x1 - k.x0, h = k.y1 - k.y0;
        const c = at(B, (k.x0 + k.x1) / 2, (k.y0 + k.y1) / 2, tb + 0.6);
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...B.u), new THREE.Vector3(...B.v), new THREE.Vector3(...B.up)));
        return (
          <mesh
            key={i}
            position={c}
            quaternion={q}
            renderOrder={5}
            userData={{ noAO: true, testId: `g-space-${i}` }}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              useStore.setState({ guidedSpace: on ? null : i, selection: null });
            }}
          >
            <planeGeometry args={[Math.max(1, w - 2), Math.max(1, h - 2)]} />
            <meshBasicMaterial color={color} transparent opacity={on ? 0.35 : lots.length ? 0.18 : 0.001} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </>
  );
}

export function GuidedLayer() {
  const step = useStore((s) => s.guidedStep);
  const d = useStore((s) => s.design);
  const foldT = useStore((s) => s.foldT);
  const kind = useMemo(() => kindOf(d), [d]);
  const tray = boxTrayOf(d);
  const B = useMemo(() => (tray ? basisOf(d, tray) : null), [d, tray]);
  const on = step === 'build' && kind === 'box' && !!tray && !!B && foldT >= 0.999;
  // test hook: where the handles are in the world (projected by the stage's own hook)
  useEffect(() => {
    const w = window as unknown as { __cutforge?: Record<string, unknown> };
    if (!w.__cutforge) return;
    if (!on || !tray || !B) return void (w.__cutforge.guided = null);
    const base = d.panels[d.trays[tray].baseId];
    const ks = spaces(d);
    w.__cutforge.guided = {
      arrows: { w: at(B, base.w + 6, base.h / 2, B.top / 2), d: at(B, base.w * 0.85, base.h + 6, B.top / 2), h: at(B, base.w * 0.15, 0, B.top + 6) },
      grips: Object.fromEntries(dividersOn(d, base.id).map((id) => [id, gripAt(d, id, B)])),
      spaces: ks.map((k) => at(B, (k.x0 + k.x1) / 2, (k.y0 + k.y1) / 2, d.material.thickness + 0.6)),
    };
  }, [on, d, B, tray]);
  if (!on || !tray || !B) return <group name="guided-layer" />;
  return (
    <group name="guided-layer">
      <Arrows d={d} trayId={tray} B={B} />
      <Grips d={d} baseId={d.trays[tray].baseId} B={B} />
      <Spaces d={d} B={B} />
    </group>
  );
}
