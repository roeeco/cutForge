// The Bend section of a fold's card (milestone 63, PACKAGING_PLAN.md §5): its
// radius, the pattern (each one the material offers, greyed with its reason
// where it cannot work here), how dense, and what that makes.
import { useStore, useT } from '../store/store';
import { NumField, Segmented } from './NumField';
import { bandOf, foldRadius } from '../model/bands';
import { patternsFor, patternWhy, type PatternWhy } from '../model/bendPatterns';
import { bendOf, matOf } from '../model/materials';
import { setConnection } from '../model/ops';
import type { BendDensity, Connection, PatternId } from '../model/types';
import { fmtNum } from '../i18n';
import { shown, useFeature } from '../easy/features';

export function BendSection({ c }: { c: Connection }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const f = shown(useFeature('bend'));
  if (!f || (!c.wing && (!c.grown || c.kind !== 'fold'))) return null;
  const m = matOf(d, c.a.panelId);
  const mm = t('unit.mm');
  const b = bandOf(d, c);
  const r = c.wing ? (b?.r ?? 0) : foldRadius(d, c);
  const why = (w: PatternWhy | null) =>
    !w ? undefined : w.key === 'radius' ? t('bend.why.radius', { r: fmtNum(w.value ?? 0, 1) }) : w.key === 'short' ? t('bend.why.short', { len: fmtNum(w.value ?? 0, 0) }) : t('bend.why.material');
  const ctx = b && { m, r: b.r, len: b.span[1] - b.span[0], width: b.lb, turn: b.phi };
  const choice = c.bend?.pattern ?? 'auto';
  return (
    <div className="subsection bend" data-testid="bend-section">
      <h4>{t(m.kind === 'plywood' ? 'bend.hinge' : 'bend.title')}</h4>
      {c.wing ? (
        // a tray's rounded corner (milestone 64): its radius is the base's corner's
        <p className="note" data-testid="bend-corner">{t('bend.corner', { r: fmtNum(r, 1) })}</p>
      ) : (
        <NumField label={t('bend.radius')} value={r} unit={mm} min={0} max={500} onCommit={(v) => apply((x) => setConnection(x, c.id, { radius: v }))} testId="bend-radius" />
      )}
      {!b && !c.wing && m.kind !== 'plywood' && <p className="note" data-testid="bend-crease">{t('bend.crease')}</p>}
      {b && ctx && (
        <>
          <Segmented
            label={t('bend.pattern')}
            value={choice}
            options={[
              { value: 'auto' as const, label: t('bend.auto'), testId: 'bend-pattern-auto' },
              ...patternsFor(m.kind).map((id) => {
                const w = patternWhy(id, ctx);
                return { value: id as PatternId | 'auto', label: t(`bend.p.${id}`), testId: `bend-pattern-${id}`, disabled: !!w && choice !== id, title: why(w) };
              }),
            ]}
            onChange={(v) => apply((x) => setConnection(x, c.id, { bend: { pattern: v } }))}
            testId="bend-pattern"
          />
          {b.pattern.id !== 'smooth' && (
            <Segmented
              label={t('bend.density')}
              value={c.bend?.density ?? 1}
              options={([1, 0.75, 0.5] as BendDensity[]).map((v) => ({ value: v, label: t(`bend.density.${v === 1 ? 'auto' : v === 0.75 ? 'denser' : 'densest'}`), testId: `bend-density-${v}` }))}
              onChange={(v) => apply((x) => setConnection(x, c.id, { bend: { density: v } }))}
              testId="bend-density"
            />
          )}
          <p className="note" data-testid="bend-makes">
            {b.pattern.id === 'smooth'
              ? t('bend.makes.smooth', { w: fmtNum(b.lb, 1) })
              : t('bend.makes', { pattern: t(`bend.p.${b.pattern.id}`), n: b.pattern.count, sp: fmtNum(b.pattern.spacing, 1), w: fmtNum(b.lb, 1) })}
            {b.pattern.auto && choice === 'auto' && ' ' + t('bend.autoChose')}
          </p>
          {b.pattern.why && <p className="note warn" data-testid="bend-why">{why(b.pattern.why)}</p>}
          {!b.fits && <p className="note warn" data-testid="bend-room">{t('bend.room')}</p>}
        </>
      )}
      {m.kind === 'plywood' && !c.wing && r <= 1e-6 && <p className="note warn">{t('bend.why.radius', { r: fmtNum(bendOf(m).patternR, 1) })}</p>}
    </div>
  );
}
