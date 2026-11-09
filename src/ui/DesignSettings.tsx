// The card when nothing is selected (milestone 24): the template's sizes (if
// any), then design-wide joint kinds, the material's fit values and snapping.
// View options stay in View settings.
import { useState } from 'react';
import { useStore, useT } from '../store/store';
import { NumField } from './NumField';
import { setAllJoints, setDefaultFlap } from '../model/ops';
import { groupKinds, groupShown, type JointGroup } from '../model/jointDefaults';
import { autoFlap } from '../model/seams';
import type { ConnectionKind } from '../model/types';
import { fmtNum } from '../i18n';
import { TemplateSection } from './TemplateUI';
import { useMaterialEdit } from './MaterialDrawer';

export function DesignSettings() {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const prefs = useStore((s) => s.viewPrefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setM = useMaterialEdit();
  const [result, setResult] = useState<{ group: JointGroup; changed: number; kept: number } | null>(null);
  const m = d.material;
  const mm = t('unit.mm');
  const paper = m.kind !== 'plywood';
  const choose = (group: JointGroup, kind: ConnectionKind) => {
    let r = { changed: 0, kept: 0 };
    apply((x) => void (r = setAllJoints(x, group, kind)));
    setResult({ group, ...r });
  };
  const list = (group: JointGroup, label: string) => {
    const kinds = groupKinds(d, group);
    const shown = groupShown(d, group);
    return (
      <>
        <div className="field">
          <label htmlFor={`joints-${group}`}>{label}</label>
          <select id={`joints-${group}`} value={shown ?? ''} onChange={(e) => choose(group, e.target.value as ConnectionKind)} data-testid={`joints-${group}`}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t(`conn.${k}` as 'conn.fold')}
              </option>
            ))}
          </select>
        </div>
        {result?.group === group && (
          <p className="note" data-testid={`joints-${group}-result`} data-changed={result.changed} data-kept={result.kept}>
            {result.kept ? t('settings.kept', { n: result.changed, k: result.kept }) : t('settings.changed', { n: result.changed })}
          </p>
        )}
      </>
    );
  };
  return (
    <section data-testid="inspector-design">
      <p className="kicker">{t('settings.kicker')}</p>
      <h3>{t('settings.title')}</h3>
      <TemplateSection />
      <div className="subsection" data-testid="settings-joints">
        <h4>{t('settings.joints')}</h4>
        {list('base', t('settings.jointsBase'))}
        {list('corner', t('settings.jointsCorner'))}
        {paper && (
          <NumField
            label={t('settings.flap')}
            value={d.joints?.flap ?? autoFlap(m)}
            unit={mm}
            min={3}
            max={100}
            onCommit={(v) => apply((x) => setDefaultFlap(x, v))}
            testId="settings-flap"
          />
        )}
        {paper && d.joints?.flap !== undefined && (
          <button className="link" onClick={() => apply((x) => setDefaultFlap(x, null))} data-testid="settings-flap-auto">
            {t('settings.flapAuto', { n: fmtNum(autoFlap(m), 1) })}
          </button>
        )}
        <p className="note">{t('settings.jointsHelp')}</p>
      </div>
      <div className="subsection" data-testid="settings-material">
        <h4>{t('settings.material')}</h4>
        <p className="note">{t(m.nameKey as 'mat.ply3')}</p>
        <NumField label={t('mat.thickness')} value={m.thickness} decimals={2} unit={mm} min={0.1} max={20} onCommit={(v) => setM({ thickness: v })} testId="settings-thickness" />
        <NumField label={t('mat.kerf')} value={m.kerf} decimals={2} unit={mm} min={0} max={2} onCommit={(v) => setM({ kerf: v })} testId="settings-kerf" />
        <NumField label={t('mat.clearance')} value={m.clearance} decimals={2} unit={mm} min={0} max={2} onCommit={(v) => setM({ clearance: v })} testId="settings-clearance" />
        <button onClick={() => useStore.getState().set({ drawerOpen: true })} data-testid="open-drawer">
          {t('settings.changeMaterial')}
        </button>
      </div>
      <div className="subsection" data-testid="settings-snapping">
        <h4>{t('settings.snapping')}</h4>
        <label className="check" title={t('settings.smartSnapHelp')}>
          <input type="checkbox" checked={prefs.snap} onChange={(e) => setPrefs({ snap: e.target.checked })} data-testid="settings-snap" /> {t('settings.smartSnap')}
        </label>
        <NumField label={t('settings.grid')} value={prefs.gridStep} unit={mm} min={0.1} max={50} onCommit={(v) => setPrefs({ gridStep: v })} testId="settings-grid" />
        <NumField label={t('settings.turn')} value={prefs.turnStep} decimals={0} unit={t('unit.deg')} min={1} max={90} onCommit={(v) => setPrefs({ turnStep: v })} testId="settings-turn" />
        <p className="note">{t('settings.smartSnapHelp')}</p>
      </div>
    </section>
  );
}
