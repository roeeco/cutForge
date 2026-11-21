// Edge endings on a grown board's card (milestone 161, GROW_ENDINGS_PLAN.md):
// one row per edge it ends on. A free edge picks what it ends in (pictures),
// its length (automatic until set) and, for a flap, how far it folds on the
// grown fold's dial; an edge meeting another board shows its lip (offered
// first) or the seam's other joint, and the lip's width. The same values are
// on the stage as handles (EndingHandles in View3D.tsx).
import { useStore, useT } from '../store/store';
import { boardEndings, ENDINGS, LIP, type Ending, type FreeEnding, type MeetEnding } from '../model/endings';
import { setEnding, setEndingHinge, setEndingJoint, setEndingLength } from '../model/ops';
import { edgeLabel, panelLabel } from '../model/names';
import { NumField } from './NumField';
import { AngleDial } from './AngleDial';
import { PictureChoice, type PicName } from './Pictures';
import { Icon } from './icons';
import { shown, useFeature } from '../easy/features';
import type { MsgKey } from '../i18n';
import type { ConnectionKind } from '../model/types';

export const ENDING_PICS: Record<Ending, PicName> = { none: 'endNone', plain: 'flapPlain', tuck: 'flapTuck', dust: 'flapDust', glue: 'flapGlue', hang: 'flapHang', foldover: 'foldOver' };

/** The words for a joint where two edges meet: a glue flap is the lip. */
export const jointWord = (k: ConnectionKind): MsgKey => (k === LIP ? 'endings.lip' : (`conn.${k}` as MsgKey));

export function EndingsSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const shut = useStore((s) => s.viewPrefs.endingsShut);
  const on = shown(useFeature('endings'));
  if (!on) return null;
  const rows = boardEndings(d, panelId);
  if (!rows.length) return null;
  return (
    <div className="subsection endings" data-testid="endings-section">
      <button className="sub-toggle" aria-expanded={!shut} onClick={() => useStore.getState().setPrefs({ endingsShut: !shut })} data-testid="endings-toggle" title={t('endings.help')}>
        <Icon name={shut ? 'chevRight' : 'chevDown'} size={14} /> {t('endings.title')} <span className="count">{rows.filter((r) => r.kind === 'meets' || r.ending !== 'none').length}</span>
      </button>
      {!shut && (
        <>
          <p className="note">{t('endings.help')}</p>
          {rows.map((r) => (r.kind === 'free' ? <FreeRow key={r.edge} panelId={panelId} r={r} /> : <MeetRow key={r.edge} panelId={panelId} r={r} />))}
        </>
      )}
    </div>
  );
}

const tid = (edge: string) => edge.replace('#', '-');

function RowHead({ panelId, edge, extra }: { panelId: string; edge: string; extra?: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  return (
    <p className="ending-head">
      <strong>{t('endings.edge', { edge: edgeLabel(d, panelId, edge, t) })}</strong>
      {extra && <span className="note"> · {extra}</span>}
    </p>
  );
}

/** A length that is automatic until set: the field, and *Automatic* to give it back. */
function LengthField({ label, value, auto, onSet, testId, max }: { label: string; value: number; auto: boolean; onSet: (v: number | null) => void; testId: string; max: number }) {
  const t = useT();
  return (
    <>
      <NumField label={label} value={Math.round(value * 10) / 10} unit={t('unit.mm')} min={2} max={max} onCommit={(v) => onSet(v)} testId={testId} />
      {auto ? (
        <p className="note" data-testid={`${testId}-auto`}>{t('endings.autoOn')}</p>
      ) : (
        <button className="link" onClick={() => onSet(null)} data-testid={`${testId}-reset`}>
          {t('endings.auto')}
        </button>
      )}
    </>
  );
}

function FreeRow({ panelId, r }: { panelId: string; r: FreeEnding }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const p = d.panels[panelId];
  const id = tid(r.edge);
  return (
    <div className="ending-row" data-testid={`ending-${id}`} data-ending={r.ending}>
      <RowHead panelId={panelId} edge={r.edge} />
      <div className="ending-pictures">
        <PictureChoice
          label={t('endings.edge', { edge: edgeLabel(d, panelId, r.edge, t) })}
          hideLabel
          value={r.ending}
          options={ENDINGS.map((k) => ({ value: k, label: t(`endings.ending.${k}` as MsgKey), pic: ENDING_PICS[k], testId: `ending-${id}-${k}`, why: r.why[k] ? t(r.why[k]!) : undefined }))}
          onChange={(k) => apply((x) => void setEnding(x, panelId, r.edge, k))}
          testId={`ending-${id}-choice`}
        />
      </div>
      {r.ending !== 'none' && (
        <LengthField
          label={t(r.ending === 'foldover' ? 'endings.liner' : 'endings.len')}
          value={r.len}
          auto={r.auto}
          max={r.ending === 'foldover' ? p.h : 200}
          onSet={(v) => apply((x) => void setEndingLength(x, panelId, r.edge, v))}
          testId={`ending-len-${id}`}
        />
      )}
      {r.hinge !== null && <HingeDial panelId={panelId} edge={r.edge} value={r.hinge} testId={`ending-hinge-${id}-`} />}
    </div>
  );
}

/** A flap's fold on the grown fold's dial: previewed while dragged, one undo step when let go. */
function HingeDial({ panelId, edge, value, testId }: { panelId: string; edge: string; value: number; testId: string }) {
  const t = useT();
  const st = useStore.getState;
  return (
    <div className="field dial-field" data-testid={`${testId}field`}>
      <span className="label" title={t('endings.foldNote')}>
        {t('endings.fold')}
      </span>
      <AngleDial
        value={value}
        label={t('endings.fold')}
        title={t('endings.foldNote')}
        testIdPrefix={testId}
        onChange={(a, final) => {
          st().preview((x) => void setEndingHinge(x, panelId, edge, a));
          if (final) st().commit();
        }}
      />
    </div>
  );
}

function MeetRow({ panelId, r }: { panelId: string; r: MeetEnding }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const id = tid(r.edge);
  const other = panelLabel(d, r.other, t);
  return (
    <div className="ending-row" data-testid={`ending-${id}`} data-ending={r.joint === LIP ? 'lip' : r.joint}>
      <RowHead panelId={panelId} edge={r.edge} extra={t('endings.meets', { board: other })} />
      <div className="field">
        <label htmlFor={`ending-joint-${id}`}>{t('endings.joint')}</label>
        <select id={`ending-joint-${id}`} value={r.joint} onChange={(e) => apply((x) => void setEndingJoint(x, panelId, r.edge, e.target.value as ConnectionKind))} data-testid={`ending-joint-${id}`}>
          {r.options.map((k) => (
            <option key={k} value={k}>
              {t(jointWord(k))}
            </option>
          ))}
        </select>
      </div>
      {r.joint === LIP && r.width !== null && (
        <>
          <LengthField label={t('endings.width')} value={r.width} auto={r.auto} max={100} onSet={(v) => apply((x) => void setEndingLength(x, panelId, r.edge, v))} testId={`ending-len-${id}`} />
          <p className="note" data-testid={`ending-lip-on-${id}`}>{t('endings.lipOn', { board: r.owner === panelId ? panelLabel(d, panelId, t) : other })}</p>
        </>
      )}
    </div>
  );
}
