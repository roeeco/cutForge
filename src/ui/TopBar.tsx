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
import { TOUR_OFFERED, startTourConfirmed } from '../tour/TourNudge';
import { SketchTopBar } from './SketchTopBar';

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
  // narrow windows (BUGFIX_PLAN U1): the less-used items move into a ⋯ menu
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!more) return;
    const close = (e: PointerEvent) => !moreRef.current?.contains(e.target as Node) && setMore(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [more]);
  const d = s.design;
  const waffle = d.kind === 'waffle';
  const sketching = s.view === 'sketch' && !!s.sketch;
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
            {/* the first-use tour (milestone 43): the same confirm as New design guards the current work */}
            {TOUR_OFFERED && !(s.viewPrefs.modeLocked && mode === 'quick') && (
              <button role="menuitem" onClick={item(() => startTourConfirmed())} data-testid="menu-tour">
                <Icon name="play" /> {t('top.tour')}
              </button>
            )}
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
        <span className="mat-name">{builtIn ? t(builtIn.nameKey as 'mat.ply3') : t('mat.customNamed', { mm: d.material.thickness })}</span>
        <Icon name="chevDown" size={16} />
      </button>
      {waffle && (
        // waffle designs (milestone 49): the stage stepper instead of the mode switch
        <div className="seg stage-seg" role="radiogroup" aria-label={t('stage.label')} data-testid="stage-stepper">
          {(['shape', 'waffle'] as const).map((k) => (
            <button key={k} role="radio" aria-checked={s.sculpt.stage === k} className={s.sculpt.stage === k ? 'on' : ''} disabled={sketching || (k === 'waffle' && !d.sculpt?.order.length)} onClick={() => (s.setSculpt({ stage: k }), s.setTool('select'), s.select(null))} data-testid={`stage-${k}`}>
              {t(k === 'shape' ? 'stage.shape' : 'stage.waffle')}
            </button>
          ))}
        </div>
      )}
      {!s.viewPrefs.modeLocked && !waffle && (
        <div className="seg mode-seg tablet-hide" role="radiogroup" aria-label={t('mode.label')} data-testid="mode-toggle">
          {(['quick', 'workshop'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} title={t(m === 'quick' ? 'mode.quickHelp' : 'mode.workshopHelp')} onClick={() => setMode(m)} data-testid={`mode-${m}`}>
              {t(m === 'quick' ? 'mode.quick' : 'mode.workshop')}
            </button>
          ))}
        </div>
      )}
      {badge && <ReadyBadge />}
      {sketching ? (
        <SketchTopBar />
      ) : (
        <>
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
        </>
      )}
      <div className="spacer" />
      <span className={`save-state ${s.saveState}`} role="status" title={saveText} aria-label={saveText} data-testid="save-state">
        {s.saveState !== 'idle' && <Icon name={saveIcon} />}
        <span className="sr-only">{s.saveState !== 'idle' ? saveText : ''}</span>
      </span>
      <button className="submit-btn tablet-hide" onClick={() => setSubmitOpen(true)} title={t('sub.button')} aria-label={t('sub.button')} data-testid="open-submit">
        <Icon name="send" />
        <span className="full">{t('sub.button')}</span>
        <span className="short">{t('sub.short')}</span>
      </button>
      <button className="primary dl-btn" onClick={() => s.set({ exportOpen: true })} title={t('top.download')} aria-label={t('top.download')} data-testid="open-export">
        <span className="full">{t('top.download')}</span>
        <span className="short">{t('top.downloadShort')}</span>
      </button>
      {submitOpen && <SubmitDialog onClose={() => setSubmitOpen(false)} />}
      <button className="lang tablet-hide" onClick={() => s.setLang(s.lang === 'en' ? 'he' : 'en')} title={t('lang.toggleTitle')} data-testid="lang-toggle" lang={s.lang === 'en' ? 'he' : 'en'}>
        {t('lang.toggle')}
      </button>
      <div className="more-wrap tablet-only" ref={moreRef}>
        <button className="ghost icon-btn" aria-haspopup="menu" aria-expanded={more} aria-label={t('top.more')} title={t('top.more')} onClick={() => setMore((m) => !m)} data-testid="top-more">
          <Icon name="more" />
        </button>
        {more && (
          <div className="menu more-menu" role="menu">
            <button role="menuitem" onClick={() => (setMore(false), setSubmitOpen(true))} data-testid="more-submit">
              <Icon name="send" /> {t('sub.button')}
            </button>
            {!s.viewPrefs.modeLocked &&
              !waffle &&
              (['quick', 'workshop'] as const).map((m) => (
                <button key={m} role="menuitemradio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => (setMore(false), setMode(m))} data-testid={`more-mode-${m}`}>
                  <Icon name={mode === m ? 'check' : 'box'} /> {t(m === 'quick' ? 'mode.quick' : 'mode.workshop')}
                </button>
              ))}
            <hr />
            <button role="menuitem" onClick={() => (setMore(false), s.setLang(s.lang === 'en' ? 'he' : 'en'))} lang={s.lang === 'en' ? 'he' : 'en'} data-testid="more-lang">
              {t('lang.toggle')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
