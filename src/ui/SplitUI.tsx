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
import { shown, useFeature } from '../easy/features';

/** A fold's cut choice: let the app decide, keep the net whole here, or cut it here. */
export function CutChoice({ c }: { c: Connection }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const f = shown(useFeature('split'));
  if (!f || !canCut(d, c)) return null;
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
  const [less, setLess] = useState<LessBoard | null>(null);
  const fYield = shown(useFeature('yield')), fSteps = shown(useFeature('saveBoard.steps')), fLess = shown(useFeature('saveBoard'));
  if (!y) return null;
  const nested = Object.values(d.placements).some((p) => p.nested);
  const doNest = () => useStore.getState().apply((x) => void (x.placements = nest(x)));
  const look = () => {
    const st = useStore.getState().design;
    const p = planSaveMaterial(st, solve, (x) => measureYield(x, boxPlan));
    setPlan(p ?? 'none');
  };
  const sheetsText = (n: number) => (n === 1 ? t('yield.sheet1') : t('yield.sheets', { n }));
  const glueText = (n: number) => (n === 1 ? t('less.glue1') : t('less.glue', { n }));
  return (
    <div className="yield-bar" dir="auto" data-testid="yield" data-sheets={y.sheets} data-pieces={y.pieces}>
      {fYield && (
        <span className="yield-text" title={t('yield.title')}>
          {t('yield.line', { sheets: sheetsText(y.sheets), pct: y.pct, cut: fmtNum(y.cut / 1000, 1), pieces: y.pieces === 1 ? t('yield.piece1') : t('yield.pieces', { n: y.pieces }), glue: y.glue === 1 ? t('yield.glue1') : t('yield.glues', { n: y.glue }) })}
        </span>
      )}
      {fLess && (
        <button onClick={() => (setPlan(null), setLess(lessBoard()))} title={t('less.help')} data-testid="use-less">
          {t('less.button')}
        </button>
      )}
      {fSteps && (
        <button onClick={doNest} title={t('yield.nestHelp')} data-testid="nest" className={nested ? 'on' : ''}>
          {t('yield.nest')}
        </button>
      )}
      {fSteps && splitMode(d) !== 'never' && (
        <button onClick={() => (setLess(null), look())} title={t('yield.saveHelp')} data-testid="save-material">
          {t('yield.save')}
        </button>
      )}
      {less && (
        <div className="save-pop card" role="dialog" aria-label={t('less.button')} data-testid="less-pop">
          <p data-testid="less-text">
            {less.plan
              ? less.plan.after.sheets < less.now
                ? t('less.canSheets', { now: sheetsText(less.now), can: sheetsText(less.plan.after.sheets), glue: glueText(less.plan.after.glue - less.plan.before.glue) })
                : t('less.canArea', { now: sheetsText(less.now), pct: Math.round((100 * (less.plan.before.area - less.plan.after.area)) / less.plan.before.area), glue: glueText(less.plan.after.glue - less.plan.before.glue) })
              : less.now < less.was
                ? t('less.nested', { now: sheetsText(less.now), was: sheetsText(less.was) })
                : t('less.least')}
          </p>
          <span className="row">
            {less.plan && (
              <button
                className="primary"
                onClick={() => {
                  const cuts = less.plan!.cuts;
                  useStore.getState().apply((x) => {
                    applySavePlan(x, cuts);
                    x.placements = nest(x);
                  });
                  setLess(null);
                }}
                data-testid="less-apply"
              >
                {t('less.apply')}
              </button>
            )}
            <button onClick={() => setLess(null)} data-testid="less-close">
              {t(less.plan ? 'less.leave' : 'yield.close')}
            </button>
          </span>
        </div>
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

/** What *Use less board* found: the sheets before and after nesting, and the folds that would save more. */
export type LessBoard = { was: number; now: number; plan: SavePlan | null };

/**
 * *Use less board* (LIDS_LINES_PROJECTS_PLAN.md §10.6): nest the pieces (one
 * undo step), then look for folds to cut. The cuts are only offered: *Do it*
 * applies them.
 */
export function lessBoard(): LessBoard {
  const st = useStore.getState();
  const was = yieldReport(st.design).sheets;
  st.apply((x) => void (x.placements = nest(x)));
  const d = useStore.getState().design;
  const now = yieldReport(d).sheets;
  const plan = splitMode(d) === 'never' ? null : planSaveMaterial(d, solve, (x) => measureYield(x, boxPlan));
  // a plan worth offering: fewer sheets, or less of them
  return { was, now, plan: plan && (plan.after.sheets < now || plan.after.area < plan.before.area) ? plan : null };
}

/** The design's split setting, in *Material & sheet*. */
export function SplitSetting() {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  if (!shown(useFeature('split'))) return null;
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
