// Grow card: shown while an edge is selected (the inspector card steps
// aside). Angle and direction are also on the stage (dial at the hinge, flip
// badge on the ghost); height also has a push-pull arrow there.
import { growKind, useStore, useT } from '../store/store';
import { NumField } from './NumField';
import { connectionsFor } from '../model/materials';
import { addSideWalls, edgeConnection, growPanel, hasSideWalls } from '../model/ops';
import type { ConnectionKind } from '../model/types';
import { AngleDial } from './AngleDial';
import { Icon } from './icons';
import { panelLabel } from '../model/names';

export function EdgeBar({ panelId, edge }: { panelId: string; edge: number }) {
  const t = useT();
  const design = useStore((s) => s.design);
  const grow = useStore((s) => s.grow);
  const setGrow = useStore((s) => s.setGrow);
  const panel = design.panels[panelId];
  if (!panel) return null;
  const options = connectionsFor(design.material, grow.angle);
  const effKind = growKind(design, grow);
  const used = !!edgeConnection(design, panelId, edge);
  const needsWalls = effKind === 'lean' && !hasSideWalls(design, panelId, edge);
  const doGrow = () => {
    let res: ReturnType<typeof growPanel> = null;
    useStore.getState().apply((d) => {
      res = growPanel(d, panelId, edge, { height: grow.height, angle: grow.angle, dir: grow.dir, kind: effKind });
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
            <div className="field">
              <span className="label" title={t('edge.angleNote')}>
                {t('edge.angle')}
              </span>
              <AngleDial value={grow.angle} label={t('edge.angle')} title={t('edge.angleNote')} testIdPrefix="grow-angle-" onChange={(a) => setGrow({ angle: a })} />
            </div>
            <NumField label={t('edge.height')} value={grow.height} unit={t('unit.mm')} min={5} max={2000} onCommit={(v) => setGrow({ height: v })} testId="grow-height" />
            <div className="field">
              <span className="label">{t('edge.dir')}</span>
              <button className="ghost" onClick={() => setGrow({ dir: grow.dir === 'up' ? 'down' : 'up' })} title={t('edge.flip')} data-testid="grow-flip-card">
                <Icon name="flip" size={16} /> {grow.dir === 'up' ? t('edge.dir.up') : t('edge.dir.down')}
              </button>
            </div>
            <div className="field">
              <label htmlFor="grow-kind">{t('edge.connection')}</label>
              <select id="grow-kind" value={effKind} onChange={(e) => setGrow({ kind: e.target.value as ConnectionKind })} data-testid="grow-kind">
                {options.map((o) => (
                  <option key={o} value={o} disabled={o === 'lean' && needsWalls}>
                    {t(`conn.${o}` as 'conn.fold')}
                  </option>
                ))}
              </select>
            </div>
            {needsWalls && (
              <div className="warn" data-testid="lean-needs-walls">
                <strong>{t('edge.leanNeedsWalls')}</strong>
                <p className="note">{t('edge.leanHelp')}</p>
                <button onClick={() => useStore.getState().apply((d) => addSideWalls(d, panelId, edge, grow.angle, grow.height))} data-testid="add-side-walls">
                  {t('edge.addSideWalls')}
                </button>
              </div>
            )}
            <button className="primary full" onClick={doGrow} data-testid="grow-go" disabled={needsWalls}>
              <Icon name="grow" size={16} /> {t('edge.grow')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
