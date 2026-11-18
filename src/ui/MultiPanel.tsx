// Several boards selected (milestone 31): align and distribute them when they
// share a surface (floor panels, or panels placed on one face), distribute
// parallel dividers into equal compartments, and give them all one material.
import { panelSel, useStore, useT } from '../store/store';
import { alignPanels, commonPlane, distributeDividers, distributePanels, dividerGroup } from '../model/arrange';
import type { AlignMode, DistributeMode } from '../model/edit';
import { Icon } from './icons';
import { BoardMaterial } from './BoardMaterial';
import { panelLabel } from '../model/names';
import type { MsgKey } from '../i18n';

const ALIGN: AlignMode[] = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'];
const DIST: DistributeMode[] = ['hgap', 'vgap', 'hcenter', 'vcenter'];

export function MultiPanel({ ids }: { ids: string[] }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const live = ids.filter((id) => d.panels[id]);
  const c = commonPlane(d, live);
  const ok = 'surface' in c;
  const why = !ok ? (`multi.why.${c.why}` as MsgKey) : null;
  const divs = dividerGroup(d, live);
  return (
    <section data-testid="inspector-multi-panel">
      <p className="kicker">{t('insp.part')}</p>
      <div className="card-head">
        <h3>{t('multiPanel.title', { n: live.length })}</h3>
      </div>
      <p className="note" dir="auto">{live.map((id) => panelLabel(d, id, t)).join(', ')}</p>
      <div className="subsection" data-testid="multi-panel-align">
        <h4>{t('multi.align')}</h4>
        {why && <p className="warn-text" data-testid="panel-align-unavailable">{t(why)}</p>}
        {ok && (
          <div className="btn-grid icons">
            {ALIGN.map((m) => (
              <button key={m} onClick={() => apply((x) => void alignPanels(x, live, m))} data-testid={`panel-align-${m}`} aria-label={t(`align.${m}`)} title={t(`align.${m}`)}>
                <Icon name={`align-${m}`} />
              </button>
            ))}
          </div>
        )}
      </div>
      {/* boards that share no surface: the reason above is enough, no grids of greyed buttons */}
      {ok && (
        <div className="subsection" data-testid="multi-panel-distribute">
          <h4>{t('multi.distribute')}</h4>
          {live.length < 3 ? (
            <p className="note">{t('multiPanel.needThree')}</p>
          ) : (
            <div className="btn-grid">
              {DIST.map((m) => (
                <button key={m} onClick={() => apply((x) => void distributePanels(x, live, m))} data-testid={`panel-dist-${m}`}>
                  {t(`dist.${m}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {divs && (
        <div className="subsection" data-testid="multi-panel-dividers">
          <button onClick={() => apply((x) => void distributeDividers(x, live))} data-testid="dividers-distribute">
            {t('multiPanel.dividers')}
          </button>
          <p className="note">{t('multiPanel.dividersNote')}</p>
        </div>
      )}
      <BoardMaterial ids={live} />
      <div className="card-actions">
        <button className="link" onClick={() => useStore.getState().select(panelSel([live[live.length - 1]]))}>
          {t('multiPanel.justOne')}
        </button>
      </div>
    </section>
  );
}
