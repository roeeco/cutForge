// Material & sheet drawer: the material, its calibration values and the sheet
// settings. This is the only place these appear, so the inspector stays about
// the thing that is selected.
import { useEffect } from 'react';
import { useStore, useT } from '../store/store';
import { NumField } from './NumField';
import { MATERIALS, materialsInUse, mixedMaterials } from '../model/materials';
import { materialName } from './materialName';
import { editMaterial, setMaterial, solve } from '../model/ops';
import { changeMaterial } from '../templates/registry';
import type { Design, MaterialProfile } from '../model/types';
import { fmtNum } from '../i18n';
import { Icon } from './icons';
import { MaterialArt } from './MaterialArt';
import { useFeature } from '../easy/features';

/** Edit the material's values (thickness, kerf, clearance, …): the drawer and the settings card share it. */
export function useMaterialEdit() {
  const apply = useStore((s) => s.apply);
  return (patch: Partial<MaterialProfile>) =>
    apply((x) => {
      // Edited values make this a custom profile, still based on the same material kind.
      const id = x.material.id.endsWith('-custom') ? x.material.id : `${x.material.id}-custom`;
      const nm = { ...x.material, ...patch, id };
      if (x.template) Object.assign(x, JSON.parse(JSON.stringify(changeMaterial(x as Design, nm).design)));
      else {
        Object.assign(x.material, nm);
        solve(x);
      }
    });
}

export function MaterialDrawer() {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const close = () => useStore.getState().set({ drawerOpen: false });
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const m = d.material;
  const mm = t('unit.mm');
  const base = MATERIALS.find((x) => x.id === m.id || `${x.id}-custom` === m.id);
  const choose = (mat: MaterialProfile) => {
    if (d.template) {
      const r = changeMaterial(d, mat);
      apply((dd) => void Object.assign(dd, JSON.parse(JSON.stringify(r.design))));
    } else apply((dd) => setMaterial(dd, mat));
  };
  const setM0 = useMaterialEdit();
  // Quick build: the material can be changed; its kerf, clearance and sheet are shown, not changed
  const ro = useFeature('drawer') === 'readonly';
  const setM = (patch: Parameters<typeof setM0>[0]) => !ro && setM0(patch);
  return (
    <>
      <div className="drawer-back" onClick={close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" data-testid="material-drawer">
        <div className="card-head">
          <h2 id="drawer-title">{t('drawer.title')}</h2>
          <button className="ghost icon-btn" onClick={close} aria-label={t('sub.close')} data-testid="drawer-close">
            <Icon name="close" />
          </button>
        </div>
        {mixedMaterials(d) && <p className="note" data-testid="drawer-working-note">{t('drawer.workingNote')}</p>}
        <div className="mats" role="radiogroup" aria-label={t('top.material')}>
          {MATERIALS.map((x) => (
            <button key={x.id} role="radio" aria-checked={base?.id === x.id} className={`mat-mini ${base?.id === x.id ? 'on' : ''}`} onClick={() => base?.id !== x.id && choose(x)} data-testid={`drawer-mat-${x.id}`}>
              <MaterialArt kind={x.kind} thickness={x.thickness} />
              <span>{t(x.nameKey as 'mat.ply3')}</span>
            </button>
          ))}
        </div>
        <p className="note">{m.kind === 'plywood' ? t('mat.joints.ply') : t('mat.joints.paper')}</p>
        <div className="subsection">
          <h4>{t('drawer.calibration')}</h4>
          <NumField label={t('mat.thickness')} value={m.thickness} decimals={2} unit={mm} min={0.1} max={20} onCommit={(v) => setM({ thickness: v })} testId="mat-thickness" />
          <NumField label={t('mat.kerf')} value={m.kerf} decimals={2} unit={mm} min={0} max={2} onCommit={(v) => setM({ kerf: v })} testId="mat-kerf" />
          <NumField label={t('mat.clearance')} value={m.clearance} decimals={2} unit={mm} min={0} max={2} onCommit={(v) => setM({ clearance: v })} testId="mat-clearance" />
          {m.kind !== 'plywood' && <NumField label={t('mat.foldAllowance')} value={m.foldAllowance} decimals={2} unit={mm} min={0} max={20} onCommit={(v) => setM({ foldAllowance: v })} />}
          <p className="note">{t('mat.calibrate')}</p>
        </div>
        <MaterialsInUse />
        <div className="subsection">
          <h4>{t('drawer.sheet')}</h4>
          <NumField label={t('mat.sheetW')} value={m.sheetW} decimals={0} unit={mm} min={50} max={3000} onCommit={(v) => setM({ sheetW: v })} />
          <NumField label={t('mat.sheetH')} value={m.sheetH} decimals={0} unit={mm} min={50} max={3000} onCommit={(v) => setM({ sheetH: v })} />
          <NumField label={t('insp.margin')} value={d.sheetMargin} unit={mm} min={0} max={100} onCommit={(v) => apply((x) => void (x.sheetMargin = v))} />
          <NumField label={t('insp.spacing')} value={d.sheetSpacing} unit={mm} min={0} max={50} onCommit={(v) => apply((x) => void (x.sheetSpacing = v))} />
          <label className="check">
            <input type="checkbox" checked={!!d.allowRotate} onChange={(e) => apply((x) => void (x.allowRotate = e.target.checked))} data-testid="allow-rotate" /> {t('pack.allowRotate')}
          </label>
          <p className="note" dir="auto">
            {t('drawer.summary', { w: fmtNum(m.sheetW, 0), h: fmtNum(m.sheetH, 0), t: fmtNum(m.thickness, 2) })}
          </p>
        </div>
      </aside>
    </>
  );
}

/** Every other material the design's boards use, with their board counts; their kerf and clearance can be edited here. */
function MaterialsInUse() {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const mm = t('unit.mm');
  const others = materialsInUse(d).filter((m) => !m.working);
  if (!others.length) return null;
  const working = materialsInUse(d)[0];
  return (
    <div className="subsection" data-testid="drawer-in-use">
      <h4>{t('drawer.inUse')}</h4>
      <p className="note">{t('drawer.inUseRow', { name: `${materialName(t, d.material)} (${t('drawer.working')})`, n: working.count })}</p>
      {others.map((m) => (
        <div className="mat-row" key={m.id} data-testid={`drawer-mat-row-${m.id}`}>
          <strong>{t('drawer.inUseRow', { name: materialName(t, m.profile), n: m.count })}</strong>
          <NumField label={t('mat.kerf')} value={m.profile.kerf} decimals={2} unit={mm} min={0} max={2} onCommit={(v) => apply((x) => editMaterial(x, m.id, { kerf: v }))} testId={`drawer-kerf-${m.id}`} />
          <NumField label={t('mat.clearance')} value={m.profile.clearance} decimals={2} unit={mm} min={0} max={2} onCommit={(v) => apply((x) => editMaterial(x, m.id, { clearance: v }))} testId={`drawer-clearance-${m.id}`} />
        </div>
      ))}
    </div>
  );
}
