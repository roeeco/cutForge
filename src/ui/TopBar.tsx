import { useRef, useState } from 'react';
import { SubmitDialog } from './SubmitDialog';
import { useStore, useT } from '../store/store';
import { MATERIALS } from '../model/materials';
import { setMaterial, createDesign } from '../model/ops';
import { changeMaterial } from '../templates/registry';
import { parseProject, serializeProject, ProjectError } from '../model/serialize';
import { downloadText, safeName } from './download';

export function TopBar() {
  const t = useT();
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const d = s.design;
  const builtIn = MATERIALS.find((m) => m.id === d.material.id);
  const open = async (f: File) => {
    try {
      const design = parseProject(await f.text());
      useStore.getState().replaceDesign(design);
    } catch (e) {
      const reason = e instanceof ProjectError ? t(e.code === 'newerVersion' ? 'err.newerVersion' : 'err.notProject') : String(e);
      alert(t('dlg.openFailed', { reason }));
    }
  };
  return (
    <header className="topbar">
      <div className="brand">
        <strong>{t('app.name')}</strong>
      </div>
      <input
        className="design-name"
        aria-label={t('top.designName')}
        placeholder={t('top.untitled')}
        value={d.name}
        onChange={(e) => s.preview((dd) => void (dd.name = e.target.value))}
        onBlur={() => s.commit()}
        dir="auto"
      />
      <div className="field inline">
        <label htmlFor="mat-select">{t('top.material')}</label>
        <select
          id="mat-select"
          data-testid="material-select"
          value={builtIn ? builtIn.id : 'custom'}
          onChange={(e) => {
            const m = MATERIALS.find((x) => x.id === e.target.value);
            if (!m) return;
            if (d.template) {
              const r = changeMaterial(d, m);
              s.apply((dd) => void Object.assign(dd, JSON.parse(JSON.stringify(r.design))));
            } else s.apply((dd) => setMaterial(dd, m));
          }}
        >
          {MATERIALS.map((m) => (
            <option key={m.id} value={m.id}>
              {t(m.nameKey as 'mat.ply3')}
            </option>
          ))}
          {!builtIn && <option value="custom">{t('mat.custom')}</option>}
        </select>
      </div>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={s.view === '3d'} className={s.view === '3d' ? 'on' : ''} onClick={() => s.setView('3d')} data-testid="view-3d">
          {t('top.view3d')}
        </button>
        <button role="tab" aria-selected={s.view === '2d'} className={s.view === '2d' ? 'on' : ''} onClick={() => s.setView('2d')} data-testid="view-2d">
          {t('top.view2d')}
        </button>
      </div>
      <div className="group">
        <button onClick={s.undo} disabled={!s.past.length} title="Ctrl+Z" data-testid="undo">
          {t('top.undo')}
        </button>
        <button onClick={s.redo} disabled={!s.future.length} title="Ctrl+Shift+Z" data-testid="redo">
          {t('top.redo')}
        </button>
      </div>
      <div className="spacer" />
      <span className={`save-state ${s.saveState}`} role="status" data-testid="save-state">
        {s.saveState === 'saving' ? t('top.saving') : s.saveState === 'saved' ? t('top.saved') : s.saveState === 'failed' ? t('top.saveFailed') : ''}
      </span>
      <div className="group">
        <button
          onClick={() => {
            if (!d.order.length || confirm(t('dlg.newConfirm'))) useStore.getState().replaceDesign(createDesign(d.material), true);
          }}
        >
          {t('top.new')}
        </button>
        <button onClick={() => fileRef.current?.click()}>{t('top.openProject')}</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.cutforge.json,application/json"
          hidden
          data-testid="open-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) open(f);
            e.target.value = '';
          }}
        />
        <button onClick={() => downloadText(`${safeName(d.name)}.cutforge.json`, serializeProject(d), 'application/json')} data-testid="save-project">
          {t('top.saveProject')}
        </button>
        <button onClick={() => setSubmitOpen(true)} data-testid="open-submit">
          {t('sub.button')}
        </button>
        <button className="primary" onClick={() => s.set({ exportOpen: true })} data-testid="open-export">
          {t('top.download')}
        </button>
      </div>
      <a href="#/teacher" className="btn subtle" data-testid="open-teacher">
        {t('teach.open')}
      </a>
      {submitOpen && <SubmitDialog onClose={() => setSubmitOpen(false)} />}
      <button className="lang" onClick={() => s.setLang(s.lang === 'en' ? 'he' : 'en')} title={t('lang.toggleTitle')} data-testid="lang-toggle" lang={s.lang === 'en' ? 'he' : 'en'}>
        {t('lang.toggle')}
      </button>
    </header>
  );
}
