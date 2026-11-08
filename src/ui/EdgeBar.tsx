// Grow card: shown while an edge is selected (the inspector card steps
// aside). The hinge angle (0–360°) is also on the stage as a ring with a
// handle at the hinge; height also has a push-pull arrow there.
import { growKind, useStore, useT } from '../store/store';
import { NumField } from './NumField';
import { addSideWalls, edgeConnection, growPanel } from '../model/ops';
import { connectionsFor } from '../model/materials';
import { checkHinge, fromHinge } from '../model/hinge';
import type { ConnectionKind } from '../model/types';
import { AngleDial, hingeText } from './AngleDial';
import { Icon } from './icons';
import { panelLabel } from '../model/names';

export function EdgeBar({ panelId, edge }: { panelId: string; edge: number }) {
  const t = useT();
  const design = useStore((s) => s.design);
  const grow = useStore((s) => s.grow);
  const setGrow = useStore((s) => s.setGrow);
  const panel = design.panels[panelId];
  if (!panel) return null;
  const check = checkHinge(design, panelId, edge, grow.angle, grow.height);
  const options = check.kinds;
  const effKind = growKind(design, grow);
  const used = !!edgeConnection(design, panelId, edge);
  const { angle, dir } = fromHinge(grow.angle);
  const doGrow = () => {
    let res: ReturnType<typeof growPanel> = null;
    useStore.getState().apply((d) => {
      // a joint the student did not pick follows the material's default (fingers / fold) whenever the angle allows
      const pref = grow.kind && grow.kind === effKind ? effKind : connectionsFor(d.material, 90)[0];
      res = growPanel(d, panelId, edge, { height: grow.height, angle, dir, kind: effKind, pref });
    });
    const r = res as ReturnType<typeof growPanel>;
    if (r) useStore.getState().select({ kind: 'panel', id: r.panelId });
  };
  return (
    <div className="card-dock">
      <div className="card inspector grow-card-inner" role="toolbar" aria-label={t('edge.grow')} data-testid="edgebar">
        <p className="kicker">{t('edge.kicker')}</p>
        <div className="card-head">
          <h3 dir="auto">{t('edge.title', { edge: t(`edge.name.${edge}` as 'edge.name.0'), panel: panelLabel(design, panelId, t) })}</h3>
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
            {check.sideWalls && effKind === 'lean' && (
              <div className="warn" data-testid="lean-needs-walls">
                <strong>{hingeText(t, check)}</strong>
                {check.reason === 'needsWalls' && <p className="note">{t('edge.leanHelp')}</p>}
                <button onClick={() => useStore.getState().apply((d) => addSideWalls(d, panelId, edge, angle, grow.height, dir))} data-testid="add-side-walls">
                  {t('edge.addSideWalls')}
                </button>
              </div>
            )}
            <button className="primary full" onClick={doGrow} data-testid="grow-go" disabled={check.blocking}>
              <Icon name="grow" size={16} /> {t('edge.grow')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
