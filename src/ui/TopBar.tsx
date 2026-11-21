import { projectDesigns, projectOf, storeDesign } from '../store/persist';
import { profileById } from '../model/boards';
import { openProjectFile } from './openFile';
import { migrateDesign } from '../model/serialize';
import { useEffect, useRef, useState } from 'react';
import { SubmitDialog } from './SubmitDialog';
import { useStore, useT } from '../store/store';
import { duplicateDesign, createDesign } from '../model/ops';
import { serializeProject, serializeProjectGroup } from '../model/serialize';
import { downloadText, safeName } from './download';
import { Icon, Logo } from './icons';
import { levels, MODE_HELP, MODE_NAME, setMode } from '../easy/mode';
import { ReadyBadge } from '../easy/ReadyBadge';
import { shown, useFeature } from '../easy/features';
import { TOUR_OFFERED, startTourConfirmed } from '../tour/TourNudge';
import { SketchTopBar } from './SketchTopBar';
import { ShapeStageBar } from './ShapeStageBar';

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
  // the level as one menu (the editor review, 20 November: three buttons of it crowded the bar)
  const [level, setLevel] = useState(false);
  const levelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!level) return;
    const close = (e: PointerEvent) => !levelRef.current?.contains(e.target as Node) && setLevel(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setLevel(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [level]);
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
  const sketching = s.view === 'sketch' && !!s.sketch;
  const builtIn = profileById(d.material.id);
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
  const open = (f: File) => openProjectFile(f, t);
  const item = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const saveIcon = s.saveState === 'failed' || s.saveState === 'paused' ? 'alert' : s.saveState === 'saving' ? 'saving' : 'saved';
  const saveText = s.saveState === 'saving' ? t('top.saving') : s.saveState === 'failed' ? t('top.saveFailed') : s.saveState === 'paused' ? t('top.savePaused') : t('top.saved');
  return (
    <header className="topbar" inert={s.needsMaterial || undefined}>
      {/* the logo takes you to the welcome screen, as in Guided; the open design stays open and saved */}
      <button className="ghost brand brand-home" onClick={() => useStore.setState({ needsMaterial: true })} title={t('g.home')} aria-label={t('g.home')} data-testid="brand-home">
        <Logo />
      </button>
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
                // the open design stays in the library (milestone 86): nothing to confirm
                useStore.getState().replaceDesign(createDesign(d.material), true);
              })}
              data-testid="new-design"
            >
              <Icon name="file" /> {t('top.new')}
            </button>
            <button role="menuitem" onClick={item(() => useStore.setState({ needsMaterial: true }))} data-testid="menu-designs">
              <Icon name="open" /> {t('lib.menu')}
            </button>
            <button
              role="menuitem"
              onClick={item(async () => {
                const c = duplicateDesign(d, t('lib.copySuffix'));
                await storeDesign(c).catch(() => undefined);
                useStore.getState().replaceDesign(c, false);
              })}
              data-testid="menu-duplicate"
            >
              <Icon name="copy" /> {t('lib.duplicate')}
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
            <button
              role="menuitem"
              onClick={item(async () => {
                // the design's whole project in one file (milestone 87); a design in no project is saved alone
                const pj = await projectOf(d.id).catch(() => null);
                if (!pj) return downloadText(`${safeName(d.name)}.cutforge.json`, serializeProject(d), 'application/json');
                const raws = await projectDesigns(pj.id);
                const designs = raws.map((r) => migrateDesign(r)).map((x) => (x.id === d.id ? d : x));
                downloadText(`${safeName(pj.name)}.cutforge.json`, serializeProjectGroup(pj.name, designs), 'application/json');
              })}
              data-testid="save-whole-project"
            >
              <Icon name="save" /> {t('proj.saveWhole')}
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
      {/* a sculpture (milestone 120): the stage bar instead of the level switch */}
      {d.kind === 'waffle' && !sketching && <ShapeStageBar />}
      {/* one place for the level switch in every level and state, the Shapes stage included (milestone 140,
          REPORT.md #3, H1: it moved into ⋯ once Quick build's badge showed, and the Shapes stage had none) */}
      {!s.viewPrefs.modeLocked && (
        <div className="level-wrap" ref={levelRef}>
          <button className="level-btn" aria-haspopup="menu" aria-expanded={level} title={t('mode.label')} onClick={() => setLevel((v) => !v)} data-testid="mode-toggle">
            {t(MODE_NAME[mode])}
            <Icon name="chevDown" size={16} />
          </button>
          {/* kept in the page while closed, so the level chosen can be read (aria-checked) */}
          <div className="menu level-menu" role="menu" aria-label={t('mode.label')} hidden={!level}>
            {levels(s.viewPrefs).map((m) => (
              <button
                key={m}
                role="menuitemradio"
                aria-checked={mode === m}
                onClick={() => {
                  setLevel(false);
                  setMode(m);
                }}
                data-testid={`mode-${m}`}
              >
                <span className="tick" aria-hidden>
                  {mode === m && <Icon name="check" size={16} />}
                </span>
                <span className="cap">
                  <strong>{t(MODE_NAME[m])}</strong>
                  {/* the help without its level's name before it (*Guided: pick a thing…*) */}
                  <small>{t(MODE_HELP[m]).replace(/^[^:]+:\s*/, '')}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="spacer" />
      {sketching ? (
        <SketchTopBar />
      ) : (
        <div className="seg view-seg" role="tablist">
          <button role="tab" aria-selected={s.view === '3d'} className={s.view === '3d' ? 'on' : ''} onClick={() => s.setView('3d')} data-testid="view-3d">
            <span className="full">{t('top.view3d')}</span>
            <span className="short">{t('top.view3dShort')}</span>
          </button>
          <button role="tab" aria-selected={s.view === '2d'} className={s.view === '2d' ? 'on' : ''} onClick={() => s.setView('2d')} data-testid="view-2d">
            <span className="full">{t('top.view2d')}</span>
            <span className="short">{t('top.view2dShort')}</span>
          </button>
        </div>
      )}
      <div className="spacer" />
      {badge ? <ReadyBadge /> : mode === 'workshop' && <ReadyBadge problemsOnly />}
      {!sketching && (
        <span className="undo-pair">
          <button className="ghost icon-btn" onClick={s.undo} disabled={!s.past.length} title="Ctrl+Z" aria-label={t('top.undo')} data-testid="undo">
            <Icon name="undo" />
          </button>
          <button className="ghost icon-btn" onClick={s.redo} disabled={!s.future.length} title="Ctrl+Shift+Z" aria-label={t('top.redo')} data-testid="redo">
            <Icon name="redo" />
          </button>
        </span>
      )}
      <span className={`save-state ${s.saveState}`} role="status" title={saveText} aria-label={saveText} data-testid="save-state">
        {s.saveState !== 'idle' && <Icon name={saveIcon} />}
        <span className="sr-only">{s.saveState !== 'idle' ? saveText : ''}</span>
      </span>
      <button className="primary dl-btn" onClick={() => s.set({ exportOpen: true })} title={t('top.download')} aria-label={t('top.download')} data-testid="open-export">
        <span className="full">{t('top.download')}</span>
        <span className="short">{t('top.downloadShort')}</span>
      </button>
      {submitOpen && <SubmitDialog onClose={() => setSubmitOpen(false)} />}
      {/* Submit and the language: in ⋯ at every width (the editor review, 20 November) */}
      <div className="more-wrap" ref={moreRef}>
        <button className="ghost icon-btn" aria-haspopup="menu" aria-expanded={more} aria-label={t('top.more')} title={t('top.more')} onClick={() => setMore((m) => !m)} data-testid="top-more">
          <Icon name="more" />
        </button>
        {more && (
          <div className="menu more-menu" role="menu">
            <button role="menuitem" onClick={() => (setMore(false), setSubmitOpen(true))} data-testid="open-submit">
              <Icon name="send" /> {t('sub.button')}
            </button>
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
