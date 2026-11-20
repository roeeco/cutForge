// The assembly steps of a made model (milestone 131, SHAPES_TO_DIELINES_PLAN.md R12): its
// seams in the order they close, each numbered as on the cut plan's guide layer. *Show*
// selects the seam's two boards on the 3D stage; *Next* and *Back* walk through them, the
// model folded up.
import { useMemo, useState } from 'react';
import { useStore, useT } from '../store/store';
import { assemblySteps } from '../model/assembly';
import { panelLabel } from '../model/names';
import type { MsgKey } from '../i18n';

const KIND: Record<string, MsgKey> = { glue: 'make.step.glue', lock: 'make.step.lock', tabslot: 'make.step.tabs', finger: 'make.step.fingers', butt: 'make.step.butt' };

export function StepsSection() {
  const t = useT();
  const d = useStore((s) => s.design);
  const steps = useMemo(() => assemblySteps(d), [d]);
  const [at, setAt] = useState<number | null>(null);
  if (!steps.length) return null;
  const show = (i: number) => {
    const s = steps[i];
    setAt(i);
    const st = useStore.getState();
    st.set({ foldT: 1 });
    st.select({ kind: 'panel', id: s.b, ids: [s.a, s.b] });
  };
  const cur = at !== null ? steps[at] : null;
  return (
    <div className="make-steps" data-testid="make-steps">
      <h4>{t('make.steps', { n: steps.length })}</h4>
      {cur ? (
        <p className="note" data-testid="make-step-now">
          {t('make.stepLine', { n: cur.n, kind: t(KIND[cur.kind] ?? 'make.step.glue'), a: panelLabel(d, cur.a, t), b: panelLabel(d, cur.b, t) })}
        </p>
      ) : (
        <p className="note">{t('make.stepsHelp')}</p>
      )}
      <div className="row-buttons">
        <button disabled={at === null || at <= 0} onClick={() => show((at ?? 1) - 1)} data-testid="make-step-back">
          {t('steps.back')}
        </button>
        <button disabled={at !== null && at >= steps.length - 1} onClick={() => show(at === null ? 0 : at + 1)} data-testid="make-step-next">
          {t(at === null ? 'steps.start' : 'steps.next')}
        </button>
      </div>
    </div>
  );
}
