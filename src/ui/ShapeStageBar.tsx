// A sculpture's stage bar (milestone 120; SHAPES_TO_DIELINES_PLAN.md decision 0):
// 1 Shape, then the one-click buttons *Fold it* and *Build from boards*. An outcome's
// button works once its code has registered (`registerOutcomeUi` with `make`); until
// then it is greyed, *coming next*. Loaded with the top bar, so it never imports the kernel.
import { useEffect, useState } from 'react';
import { useStore, useT } from '../store/store';
import { onOutcomes, outcomeUi, PLANNED_OUTCOMES, type OutcomeId } from '../sculpt/outcomes';
import type { MsgKey } from '../i18n';

const NAME: Record<string, MsgKey> = { fold: 'make.fold', boards: 'make.boards' };
const HELP: Record<string, MsgKey> = { fold: 'make.foldHelp', boards: 'make.boardsHelp' };

export function ShapeStageBar() {
  const t = useT();
  const stage = useStore((s) => s.sculpt.stage);
  const outcome = useStore((s) => s.design.outcome ?? null);
  const empty = useStore((s) => !s.design.sculpt?.order.length);
  const sketching = useStore((s) => s.view === 'sketch' && !!s.sketch);
  // re-render when an outcome registers its code
  const [, bump] = useState(0);
  useEffect(() => onOutcomes(() => bump((n) => n + 1)), []);
  const st = useStore.getState;
  const toShape = () => (st().setSculpt({ stage: 'shape' }), st().setView('3d'), st().select(null));
  const press = (id: OutcomeId) => {
    if (outcome === id) return (st().setSculpt({ stage: 'make' }), st().select(null));
    outcomeUi(id)?.make?.();
  };
  return (
    <div className="seg stage-seg" role="radiogroup" aria-label={t('stage.label')} data-testid="stage-stepper">
      <button role="radio" aria-checked={stage === 'shape'} className={stage === 'shape' ? 'on' : ''} disabled={sketching} onClick={toShape} data-testid="stage-shape">
        {t('stage.shape')}
      </button>
      {PLANNED_OUTCOMES.map((id) => {
        const ready = !!outcomeUi(id)?.make;
        const on = stage === 'make' && outcome === id;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={on}
            className={on ? 'on' : ''}
            disabled={sketching || empty || !ready}
            title={ready ? t(HELP[id]) : t('make.comingNext')}
            onClick={() => press(id)}
            data-testid={`make-${id}`}
          >
            {t(NAME[id])}
            {!ready && <small className="soon"> · {t('make.comingNext')}</small>}
          </button>
        );
      })}
    </div>
  );
}
