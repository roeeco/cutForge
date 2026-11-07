import { useStore, useT } from '../store/store';
import { NumField } from './NumField';
import { ANGLES, connectionsFor } from '../model/materials';
import { addSideWalls, edgeConnection, growPanel, hasSideWalls } from '../model/ops';
import { useState } from 'react';
import type { ConnectionKind } from '../model/types';

/** Floating toolbar for a selected edge: grow a new panel from it. */
export function EdgeBar({ panelId, edge }: { panelId: string; edge: number }) {
  const t = useT();
  const design = useStore((s) => s.design);
  const grow = useStore((s) => s.grow);
  const setGrow = useStore((s) => s.setGrow);
  const panel = design.panels[panelId];
  const options = connectionsFor(design.material, grow.angle);
  const [kind, setKind] = useState<ConnectionKind>(options[0]);
  const effKind = options.includes(kind) ? kind : options[0];
  if (!panel) return null;
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
    <div className="edgebar" role="toolbar" aria-label={t('edge.grow')} data-testid="edgebar">
      <div className="edgebar-title">{t('edge.title', { edge: t(`edge.name.${edge}` as 'edge.name.0'), panel: panel.name })}</div>
      {used ? (
        <div className="note">{t('edge.used')}</div>
      ) : (
        <>
          <NumField label={t('edge.height')} value={grow.height} unit={t('unit.mm')} min={5} max={2000} onCommit={(v) => setGrow({ height: v })} testId="grow-height" />
          <div className="field">
            <span className="label">{t('edge.dir')}</span>
            <button onClick={() => setGrow({ dir: grow.dir === 'up' ? 'down' : 'up' })} data-testid="grow-flip" title={t('edge.flip')}>
              {grow.dir === 'up' ? '↑ ' + t('edge.dir.up') : '↓ ' + t('edge.dir.down')}
            </button>
          </div>
          <div className="field">
            <span className="label" title={t('edge.angleNote')}>
              {t('edge.angle')}
            </span>
            <span className="chips" dir="ltr" role="radiogroup" aria-label={t('edge.angle')}>
              {ANGLES.map((a) => (
                <button key={a} role="radio" aria-checked={grow.angle === a} className={grow.angle === a ? 'on chip' : 'chip'} onClick={() => setGrow({ angle: a })} data-testid={`grow-angle-${a}`}>
                  {a}°
                </button>
              ))}
            </span>
          </div>
          <div className="field">
            <label htmlFor="grow-kind">{t('edge.connection')}</label>
            <select id="grow-kind" value={effKind} onChange={(e) => setKind(e.target.value as ConnectionKind)} data-testid="grow-kind">
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
              <button
                onClick={() => useStore.getState().apply((d) => addSideWalls(d, panelId, edge, grow.angle, grow.height))}
                data-testid="add-side-walls"
              >
                {t('edge.addSideWalls')}
              </button>
            </div>
          )}
          <button className="primary" onClick={doGrow} data-testid="grow-go" disabled={needsWalls}>
            {t('edge.grow')}
          </button>
        </>
      )}
    </div>
  );
}
