// Splitting and nesting in the interface (milestone 69, PACKAGING_PLAN.md §9):
// a fold's Keep whole / Cut here, the cut plan's yield report with Nest and
// Save material, and the design's split setting.
import { useDeferredValue, useMemo, useState } from 'react';
import { useStore, useT } from '../store/store';
import { Segmented } from './NumField';
import { canCut, boxPlan, measureYield, planSaveMaterial, splitMode, yieldReport, type SavePlan } from '../model/split';
import { nest } from '../model/nest';
import { applySavePlan, setFoldCut, solve } from '../model/ops';
import type { Connection } from '../model/types';
import { fmtNum } from '../i18n';

/** A fold's cut choice: let the app decide, keep the net whole here, or cut it here. */
export function CutChoice({ c }: { c: Connection }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  if (!canCut(d, c)) return null;
  const v = c.cut ?? 'auto';
  return (
    <div className="cut-choice" data-testid="cut-choice">
      <Segmented
        label={t('split.fold')}
        value={v}
        options={[
          { value: 'auto', label: t('split.auto'), title: t('split.autoHelp'), testId: 'cut-auto' },
          { value: 'keep', label: t('split.keep'), testId: 'cut-keep' },
          { value: 'cut', label: t('split.cut'), testId: 'cut-cut' },
        ]}
        onChange={(x) => apply((dd) => setFoldCut(dd, c.id, x as 'auto' | 'cut' | 'keep'))}
      />
      {c.split && (
        <p className="note" data-testid="cut-note">
          {t(c.autoCut && !c.cut ? 'split.cutToFit' : 'split.cutHere', { joint: t(`conn.${c.kind}`) })}
        </p>
      )}
    </div>
  );
}

/** The cut plan's yield report (§9.3), with Nest and Save material. */
export function YieldBar() {
  const t = useT();
  const live = useStore((s) => s.design);
  const d = useDeferredValue(live);
  const y = useMemo(() => (d.order.length ? yieldReport(d) : null), [d]);
  const [plan, setPlan] = useState<SavePlan | null | 'none'>(null);
  if (!y) return null;
  const nested = Object.values(d.placements).some((p) => p.nested);
  const doNest = () => useStore.getState().apply((x) => void (x.placements = nest(x)));
  const look = () => {
    const st = useStore.getState().design;
    const p = planSaveMaterial(st, solve, (x) => measureYield(x, boxPlan));
    setPlan(p ?? 'none');
  };
  const sheetsText = (n: number) => (n === 1 ? t('yield.sheet1') : t('yield.sheets', { n }));
  return (
    <div className="yield-bar" dir="auto" data-testid="yield" data-sheets={y.sheets} data-pieces={y.pieces}>
      <span className="yield-text" title={t('yield.title')}>
        {t('yield.line', { sheets: sheetsText(y.sheets), pct: y.pct, cut: fmtNum(y.cut / 1000, 1), pieces: y.pieces, glue: y.glue })}
      </span>
      <button onClick={doNest} title={t('yield.nestHelp')} data-testid="nest" className={nested ? 'on' : ''}>
        {t('yield.nest')}
      </button>
      {splitMode(d) !== 'never' && (
        <button onClick={look} title={t('yield.saveHelp')} data-testid="save-material">
          {t('yield.save')}
        </button>
      )}
      {plan && (
        <div className="save-pop card" role="dialog" aria-label={t('yield.save')} data-testid="save-pop">
          {plan === 'none' ? (
            <p className="note" data-testid="save-none">
              {t('yield.saveNone')}
            </p>
          ) : (
            <p data-testid="save-text">
              {t('yield.savePieces', { a: plan.after.pieces, b: plan.before.pieces })}{' '}
              {plan.after.sheets < plan.before.sheets ? t('yield.saveSheets', { a: sheetsText(plan.after.sheets), b: sheetsText(plan.before.sheets) }) : t('yield.saveArea', { pct: Math.round((100 * (plan.before.area - plan.after.area)) / plan.before.area) })}{' '}
              {plan.after.glue - plan.before.glue === 1 ? t('yield.saveGlue1') : t('yield.saveGlue', { n: plan.after.glue - plan.before.glue })}
            </p>
          )}
          <span className="row">
            {plan !== 'none' && (
              <button
                className="primary"
                onClick={() => {
                  useStore.getState().apply((x) => applySavePlan(x, plan.cuts));
                  setPlan(null);
                }}
                data-testid="save-apply"
              >
                {t('yield.apply')}
              </button>
            )}
            <button onClick={() => setPlan(null)} data-testid="save-close">
              {t(plan === 'none' ? 'yield.close' : 'yield.cancel')}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** The design's split setting, in *Material & sheet*. */
export function SplitSetting() {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  return (
    <Segmented
      label={t('split.mode')}
      value={splitMode(d)}
      options={[
        { value: 'must', label: t('split.must'), title: t('split.mustHelp'), testId: 'split-must' },
        { value: 'save', label: t('split.save'), title: t('split.saveHelp'), testId: 'split-save' },
        { value: 'never', label: t('split.never'), testId: 'split-never' },
      ]}
      onChange={(v) => apply((x) => void (v === 'must' ? delete x.split : (x.split = v as 'save' | 'never')))}
      testId="split-mode"
    />
  );
}
