// The assembly steps view on the stage (WAFFLE_MODE.md §6.7): parts appear
// step by step; a B slice is shown above the sculpture with a down arrow,
// then dropped into place in a short animation. View only.
import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore, useT } from '../../store/store';
import type { WaffleModel } from '../derive';
import type { CutPart } from '../finish';
import { planePoint } from '../derive';
import { waffleParts } from '../pieces';
import { assemblySteps, type Step } from '../steps';
import { PlateView, Slab } from './WaffleLayer';
import { Icon } from '../../ui/icons';

const DROP_MS = 900;

export function StepsLayer({ model, parts }: { model: WaffleModel; parts: CutPart[] }) {
  const d = useStore((s) => s.design);
  const step = useStore((s) => s.steps) ?? 0;
  const steps = assemblySteps(model, waffleParts(d));
  const { invalidate } = useThree();
  const [lift, setLift] = useState(0);
  const t0 = useRef(0);
  const cur = steps[Math.min(step, steps.length - 1)];
  const rise = model.y1 - model.y0 + 40;
  useEffect(() => {
    t0.current = performance.now();
    setLift(cur?.kind === 'b' ? rise : 0);
    invalidate();
  }, [step]);
  useFrame(() => {
    if (cur?.kind !== 'b') return;
    // shown above first, then dropped
    const e = performance.now() - t0.current - 500;
    const k = Math.max(0, Math.min(1, e / DROP_MS));
    const v = rise * (1 - k * k);
    if (Math.abs(v - lift) > 0.01) setLift(v);
    if (k < 1) invalidate();
  });
  const shown = (_s: Step, i: number) => step - i >= 0;
  const placed = steps.map((s, i) => ({ s, i })).filter(({ s, i }) => shown(s, i) && s.kind !== 'plate');
  const slabs = parts.filter((p) => placed.some(({ s }) => s.kind === p.fam && s.sliceId === p.sliceId));
  const arrowAt = cur?.kind === 'b' ? planePoint(model.frames.b, model.slices.find((x) => x.fam === 'b' && x.id === cur.sliceId)?.at ?? 0, { x: 0, y: model.y1 + lift + 18 }) : null;
  return (
    <>
      {steps[0]?.kind === 'plate' && <PlateView arrow={false} />}
      {slabs.map((p) => (
        <Slab key={p.key} p={p} f={model.frames[p.fam]} t={model.t} selected={cur?.kind === p.fam && cur.sliceId === p.sliceId} dim={false} offset={cur?.kind === 'b' && p.fam === 'b' && p.sliceId === cur.sliceId ? lift : 0} />
      ))}
      {arrowAt && lift > 0.5 && (
        <mesh position={arrowAt} rotation={[Math.PI, 0, 0]} raycast={() => null}>
          <coneGeometry args={[6, 14, 16]} />
          <meshBasicMaterial color="#1fb8ac" />
        </mesh>
      )}
    </>
  );
}

/** The step slider: ‹ Step n of N › and the step's line. */
export function StepsBar() {
  const t = useT();
  const d = useStore((s) => s.design);
  const step = useStore((s) => s.steps);
  if (step === null || d.kind !== 'waffle') return null;
  const f = waffleParts(d);
  const k = useStore.getState().sculpt.ready ? f : null;
  if (!k) return null;
  // the model is the one the parts came from
  const steps = assemblySteps(modelFor(d), f);
  if (!steps.length) return null;
  const n = Math.min(step, steps.length - 1);
  const s = steps[n];
  const line = s.kind === 'plate' ? t('steps.plate') : s.kind === 'a' ? t(f.plate ? 'steps.aPlate' : 'steps.a', { part: s.label }) : s.over ? t('steps.b', { part: s.label, over: s.over }) : t('steps.bAlone', { part: s.label });
  const go = (i: number) => useStore.setState({ steps: Math.max(0, Math.min(steps.length - 1, i)) });
  return (
    <div className="steps-bar" role="group" aria-label={t('steps.open')} data-testid="steps-bar" dir="auto">
      <button className="ghost icon-btn flip" onClick={() => go(n - 1)} disabled={n === 0} aria-label={t('steps.prev')} title={t('steps.prev')} data-testid="steps-prev">
        <Icon name="chevRight" />
      </button>
      <span data-testid="steps-count">{t('steps.of', { n: n + 1, total: steps.length })}</span>
      <strong data-testid="steps-line">{line}</strong>
      <button className="ghost icon-btn" onClick={() => go(n + 1)} disabled={n >= steps.length - 1} aria-label={t('steps.next')} title={t('steps.next')} data-testid="steps-next">
        <Icon name="chevRight" />
      </button>
      <button onClick={() => useStore.setState({ steps: null })} data-testid="steps-close">
        {t('steps.close')}
      </button>
    </div>
  );
}

import { modelOf } from './model';
const modelFor = (d: Parameters<typeof modelOf>[0]) => modelOf(d)!;
