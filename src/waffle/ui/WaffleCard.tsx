// Stage 2's card (WAFFLE_MODE.md §6.1): both families' spacing, the turn,
// the clearance, + Slice, equal spacing, the selected slice, and what was left out.
import { useStore, useT } from '../../store/store';
import type { Design, WaffleFamily } from '../../model/types';
import { NumField, Segmented, Stepper } from '../../ui/NumField';
import { Icon } from '../../ui/icons';
import { fmtNum } from '../../i18n';
import { LETTER, type Fam } from '../derive';
import { addSlice, deleteSlice, equalSpacing, moveSlice, setClearance, setSpacing, setTurn } from '../ops';
import { baseModel, useWaffle } from './model';
import { WaffleChecks } from './WaffleChecks';
import { PlateFields } from './PlateFields';

const st = () => useStore.getState();
/** An edit with the model of the design it applies to. */
function edit(fn: (d: Design, m: NonNullable<ReturnType<typeof baseModel>>) => void) {
  const m = baseModel();
  if (m) st().apply((d) => fn(d as Design, m));
}

function FamilyFields({ fam }: { fam: Fam }) {
  const t = useT();
  const { model } = useWaffle();
  if (!model) return null;
  const sp = model.spec[fam].spacing;
  const n = model.slices.filter((s) => s.fam === fam).length;
  const byHand = !!model.spec[fam].slices;
  const set = (spacing: WaffleFamily['spacing']) => edit((d, m) => setSpacing(d, m, fam, spacing));
  return (
    <div className="subsection" data-testid={`family-${fam}`}>
      <p className="kicker">{t('waffle.family', { f: LETTER[fam] })}</p>
      <Segmented
        label={t('waffle.spacing')}
        value={sp.by}
        options={[
          { value: 'count', label: t('waffle.count'), testId: `family-${fam}-count` },
          { value: 'gap', label: t('waffle.gap'), testId: `family-${fam}-gap` },
        ]}
        onChange={(v) => set(v === 'count' ? { by: 'count', n } : { by: 'gap', mm: Math.round((model.ext[fam][1] - model.ext[fam][0]) / Math.max(1, n)) })}
      />
      {sp.by === 'count' ? (
        <Stepper label={t('waffle.slices')} value={byHand ? n : sp.n} min={1} max={30} onCommit={(v) => set({ by: 'count', n: v })} testId={`family-${fam}-n`} />
      ) : (
        <NumField label={t('waffle.gapMm')} value={sp.mm} unit={t('unit.mm')} min={model.t + 2} onCommit={(v) => set({ by: 'gap', mm: Math.max(model.t + 2, v) })} testId={`family-${fam}-mm`} />
      )}
      <button className="inline-btn" onClick={() => edit((d, m) => void addSlice(d, m, fam))} data-testid={`add-slice-${fam}`}>
        <Icon name="plus" /> {t('waffle.addSlice', { f: LETTER[fam] })}
      </button>
    </div>
  );
}

function SliceFields() {
  const t = useT();
  const sel = useStore((s) => s.selection);
  const { model } = useWaffle();
  if (!model || sel?.kind !== 'slice') return null;
  const sl = model.slices.find((s) => s.fam === sel.family && s.id === sel.id);
  if (!sl) return null;
  return (
    <div className="subsection" data-testid="slice-card">
      <div className="card-head">
        <h3>{t('waffle.slice', { label: sl.label })}</h3>
        <button className="ghost icon-btn danger" onClick={() => (edit((d, m) => deleteSlice(d, m, sl.fam, sl.id)), st().select(null))} aria-label={t('insp.delete')} title={t('insp.delete')} data-testid="slice-delete">
          <Icon name="trash" />
        </button>
      </div>
      <NumField label={t('waffle.position')} value={sl.at} unit={t('unit.mm')} onCommit={(v) => edit((d, m) => moveSlice(d, m, sl.fam, sl.id, v))} testId="slice-at" />
    </div>
  );
}

export function WaffleCard() {
  const t = useT();
  const { model } = useWaffle();
  const mat = useStore((s) => s.design.material);
  const clearance = useStore((s) => s.design.waffle?.clearance);
  if (!model) return <p className="note">{t('sculpt.loading')}</p>;
  const byHand = !!(model.spec.a.slices || model.spec.b.slices);
  return (
    <section data-testid="waffle-card">
      <div className="card-head">
        <h3>{t('stage.waffle')}</h3>
      </div>
      <SliceFields />
      <FamilyFields fam="a" />
      <FamilyFields fam="b" />
      {byHand && (
        <button onClick={() => edit((d, m) => equalSpacing(d, m))} data-testid="equal-spacing">
          {t('waffle.equal')}
        </button>
      )}
      <NumField label={t('waffle.turn')} value={model.spec.turn} unit="°" min={0} max={90} onCommit={(v) => edit((d, m) => setTurn(d, m, v))} testId="waffle-turn-field" />
      <NumField label={t('waffle.clearance')} value={clearance ?? mat.clearance} unit={t('unit.mm')} decimals={2} onCommit={(v) => edit((d, m) => setClearance(d, m, v))} testId="waffle-clearance" />
      {clearance !== undefined && (
        <button className="link" onClick={() => edit((d, m) => setClearance(d, m, undefined))} data-testid="clearance-reset">
          {t('waffle.clearanceReset', { mm: fmtNum(mat.clearance, 2) })}
        </button>
      )}
      <PlateFields />
      {model.tiny > 0 && (
        <p className="note" data-testid="tiny-note">
          {t('waffle.tiny', { n: model.tiny })}
        </p>
      )}
      <WaffleChecks />
      <div className="row-buttons">
        <button className="inline-btn" onClick={() => useStore.setState({ steps: 0 })} data-testid="steps-open">
          <Icon name="play" /> {t('steps.open')}
        </button>
        <button className="link" onClick={() => (st().setSculpt({ stage: 'shape' }), st().select(null))} data-testid="to-shape">
          {t('sculpt.toShape')}
        </button>
      </div>
    </section>
  );
}
