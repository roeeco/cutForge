// Grow card: shown while an edge is selected (the inspector card steps
// aside). The hinge angle (0–360°) is also on the stage as a ring with a
// handle at the hinge; height also has a push-pull arrow there.
import { designKind } from '../model/jointDefaults';
import { growKind, useStore, useT } from '../store/store';
import { NumField } from './NumField';
import { addSideWalls, growPanel } from '../model/ops';
import { edgeHasRoom } from '../model/adapt';
import { effectiveGrow } from '../views/ghost';
import { edgeLength } from '../model/frame';
import { connectionsFor } from '../model/materials';
import { checkHinge, fromHinge } from '../model/hinge';
import type { ConnectionKind } from '../model/types';
import { AngleDial, hingeText } from './AngleDial';
import { Icon } from './icons';
import { edgeLabel, panelLabel } from '../model/names';

export function EdgeBar({ panelId, edge }: { panelId: string; edge: string }) {
  const t = useT();
  const design = useStore((s) => s.design);
  const grow = useStore((s) => s.grow);
  const setGrow = useStore((s) => s.setGrow);
  const panel = design.panels[panelId];
  if (!panel) return null;
  const check = checkHinge(design, panelId, edge, grow.angle, grow.height);
  const options = check.kinds;
  const effKind = growKind(design, grow, panelId);
  const used = !edgeHasRoom(design, panelId, edge);
  const eg = effectiveGrow(design, panelId, edge, grow);
  const L = edgeLength(panel, edge);
  const span = eg.span ?? [0, L];
  const { angle, dir } = fromHinge(grow.angle);
  return (
    <div className="card-dock">
      <div className="card inspector grow-card-inner" role="toolbar" aria-label={t('edge.grow')} data-testid="edgebar">
        <p className="kicker">{t('edge.kicker')}</p>
        <div className="card-head">
          <h3 dir="auto">{t('edge.title', { edge: edgeLabel(design, panelId, edge, t), panel: panelLabel(design, panelId, t) })}</h3>
          <button className="ghost icon-btn" onClick={() => useStore.getState().select({ kind: 'panel', id: panelId })} aria-label={t('sub.close')} title={t('sub.close')}>
            <Icon name="close" />
          </button>
        </div>
        {used ? (
          <p className="note">{t('edge.used')}</p>
        ) : (
          <>
            <div className="field dial-field">
              <span className="label" title={t('edge.angleNote')}>
                {t('edge.angle')}
              </span>
              <AngleDial
                value={grow.angle}
                label={t('edge.angle')}
                title={t('edge.angleNote')}
                testIdPrefix="grow-angle-"
                zoneAt={(a) => checkHinge(design, panelId, edge, a, grow.height).zone}
                message={check.reason === 'needsWalls' ? undefined : hingeText(t, check)}
                onChange={(a) => setGrow({ angle: a })}
              />
            </div>
            <NumField label={t('edge.height')} value={grow.height} unit={t('unit.mm')} min={5} max={2000} onCommit={(v) => setGrow({ height: v })} testId="grow-height" />
            {options.length > 0 && (
              <div className="field">
                <label htmlFor="grow-kind">{t('edge.connection')}</label>
                <select id="grow-kind" value={effKind} onChange={(e) => setGrow({ kind: e.target.value as ConnectionKind })} data-testid="grow-kind">
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {t(`conn.${o}` as 'conn.fold')}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {eg.offset === 0 && (
              <div className="span-row">
                <NumField label={t('grow.spanStart')} value={Math.round(span[0] * 10) / 10} unit={t('unit.mm')} min={0} max={L} onCommit={(v) => setGrow({ span: [Math.min(v, span[1] - 5), span[1]], sketch: null })} testId="grow-span-start" />
                <NumField label={t('grow.spanEnd')} value={Math.round(span[1] * 10) / 10} unit={t('unit.mm')} min={0} max={L} onCommit={(v) => setGrow({ span: [span[0], Math.max(v, span[0] + 5)], sketch: null })} testId="grow-span-end" />
              </div>
            )}
            <label className="check" title={t('grow.adaptHelp')}>
              <input type="checkbox" checked={grow.adapt !== false} onChange={(e) => setGrow({ adapt: e.target.checked, sketch: null })} data-testid="grow-adapt" />
              {t('grow.adapt')}
            </label>
            {eg.adaptive && !grow.sketch && <p className="note" data-testid="grow-adapted">{t('grow.adapted')}</p>}
            <button
              className={grow.editGhost ? 'on' : ''}
              aria-pressed={!!grow.editGhost}
              onClick={() => setGrow({ editGhost: !grow.editGhost, sketch: grow.editGhost ? grow.sketch : (grow.sketch ?? eg.adaptive ?? { kind: 'wall' }) })}
              data-testid="grow-edit-outline"
            >
              <Icon name="polygon" size={16} /> {t(grow.editGhost ? 'outline.done' : 'outline.edit')}
            </button>
            {check.sideWalls && effKind === 'lean' && (
              <div className="warn" data-testid="lean-needs-walls">
                <strong>{hingeText(t, check)}</strong>
                {check.reason === 'needsWalls' && <p className="note">{t('edge.leanHelp')}</p>}
                <button onClick={() => useStore.getState().apply((d) => addSideWalls(d, panelId, edge, angle, grow.height, dir))} data-testid="add-side-walls">
                  {t('edge.addSideWalls')}
                </button>
              </div>
            )}
            <p className="note">{t('edge.confirmOnStage')}</p>
          </>
        )}
      </div>
    </div>
  );
}
