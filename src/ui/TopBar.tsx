import { useEffect, useRef, useState } from 'react';
import { SubmitDialog } from './SubmitDialog';
import { useStore, useT } from '../store/store';
import { MATERIALS } from '../model/materials';
import { createDesign } from '../model/ops';
import { parseProject, serializeProject, ProjectError } from '../model/serialize';
import { downloadText, safeName } from './download';
import { Icon, Logo } from './icons';
import { setMode } from '../easy/mode';
import { ReadyBadge } from '../easy/ReadyBadge';
import { shown, useFeature } from '../easy/features';

export function TopBar() {
  const mode = useStore((x) => x.viewPrefs.mode ?? 'workshop');
  // Quick build's Ready to cut badge replaces the export check (milestone 39)
  const badge = !shown(useFeature('exportCheck'));
  const t = useT();
  const s = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const d = s.design;
  const builtIn = MATERIALS.find((m) => m.id === d.material.id);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [menu]);
  const open = async (f: File) => {
    try {
      const design = parseProject(await f.text());
      useStore.getState().replaceDesign(design);
    } catch (e) {
      // a friendly reason for any failure, never a raw error message
      const code = e instanceof ProjectError ? e.code : 'damaged';
      const reason = t(code === 'newerVersion' ? 'err.newerVersion' : code === 'notProject' ? 'err.notProject' : 'err.damaged');
      alert(t('dlg.openFailed', { reason }));
    }
  };
  const item = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const saveIcon = s.saveState === 'failed' ? 'alert' : s.saveState === 'saving' ? 'saving' : 'saved';
  const saveText = s.saveState === 'saving' ? t('top.saving') : s.saveState === 'failed' ? t('top.saveFailed') : t('top.saved');
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span className="hide-narrow">{t('app.name')}</span>
      </div>
      <span className="sep" />
      <div className="proj" ref={menuRef}>
        <input
          className="design-name"
          aria-label={t('top.designName')}
          placeholder={t('top.untitled')}
          value={d.name}
          onChange={(e) => s.preview((dd) => void (dd.name = e.target.value))}
          onBlur={() => s.commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            e.stopPropagation();
          }}
          dir="auto"
        />
        <button className="ghost icon-btn" aria-haspopup="menu" aria-expanded={menu} aria-label={t('top.projectMenu')} title={t('top.projectMenu')} onClick={() => setMenu((m) => !m)} data-testid="project-menu">
          <Icon name="chevDown" />
        </button>
        {menu && (
          <div className="menu" role="menu">
            <button
              role="menuitem"
              onClick={item(() => {
                if (!d.order.length || confirm(t('dlg.newConfirm'))) useStore.getState().replaceDesign(createDesign(d.material), true);
              })}
              data-testid="new-design"
            >
              <Icon name="file" /> {t('top.new')}
            </button>
            <button role="menuitem" onClick={item(() => fileRef.current?.click())}>
              <Icon name="open" /> {t('top.openProject')}
            </button>
            <button role="menuitem" onClick={item(() => downloadText(`${safeName(d.name)}.cutforge.json`, serializeProject(d), 'application/json'))} data-testid="save-project">
              <Icon name="save" /> {t('top.saveProject')}
            </button>
            <hr />
            <button role="menuitem" className="muted" onClick={item(() => (location.hash = '#/teacher'))} data-testid="open-teacher">
              <Icon name="teacher" /> {t('teach.open')}
            </button>
          </div>
        )}
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
      </div>
      <button className="mat-pill" onClick={() => s.set({ drawerOpen: true })} aria-label={t('drawer.open')} title={t('drawer.open')} data-testid="material-pill">
        <span className={`swatch ${d.material.kind}`} />
        <span>{builtIn ? t(builtIn.nameKey as 'mat.ply3') : t('mat.customNamed', { mm: d.material.thickness })}</span>
        <Icon name="chevDown" size={16} />
      </button>
      {!s.viewPrefs.modeLocked && (
        <div className="seg mode-seg" role="radiogroup" aria-label={t('mode.label')} data-testid="mode-toggle">
          {(['quick', 'workshop'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} title={t(m === 'quick' ? 'mode.quickHelp' : 'mode.workshopHelp')} onClick={() => setMode(m)} data-testid={`mode-${m}`}>
              {t(m === 'quick' ? 'mode.quick' : 'mode.workshop')}
            </button>
          ))}
        </div>
      )}
      {badge && <ReadyBadge />}
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={s.view === '3d'} className={s.view === '3d' ? 'on' : ''} onClick={() => s.setView('3d')} data-testid="view-3d">
          {t('top.view3d')}
        </button>
        <button role="tab" aria-selected={s.view === '2d'} className={s.view === '2d' ? 'on' : ''} onClick={() => s.setView('2d')} data-testid="view-2d">
          {t('top.view2d')}
        </button>
      </div>
      <button className="ghost icon-btn" onClick={s.undo} disabled={!s.past.length} title="Ctrl+Z" aria-label={t('top.undo')} data-testid="undo">
        <Icon name="undo" />
      </button>
      <button className="ghost icon-btn" onClick={s.redo} disabled={!s.future.length} title="Ctrl+Shift+Z" aria-label={t('top.redo')} data-testid="redo">
        <Icon name="redo" />
      </button>
      <div className="spacer" />
      <span className={`save-state ${s.saveState}`} role="status" title={saveText} aria-label={saveText} data-testid="save-state">
        {s.saveState !== 'idle' && <Icon name={saveIcon} />}
        <span className="sr-only">{s.saveState !== 'idle' ? saveText : ''}</span>
      </span>
      <button onClick={() => setSubmitOpen(true)} data-testid="open-submit">
        {t('sub.button')}
      </button>
      <button className="primary" onClick={() => s.set({ exportOpen: true })} data-testid="open-export">
        {t('top.download')}
      </button>
      {submitOpen && <SubmitDialog onClose={() => setSubmitOpen(false)} />}
      <button className="lang" onClick={() => s.setLang(s.lang === 'en' ? 'he' : 'en')} title={t('lang.toggleTitle')} data-testid="lang-toggle" lang={s.lang === 'en' ? 'he' : 'en'}>
        {t('lang.toggle')}
      </button>
    </header>
  );
}
