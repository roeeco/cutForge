// Guided's top bar (milestone 105): home, the thing's name, the three steps, Undo and Redo with their
// words, and a menu. Nothing else is there.
import { useEffect, useRef, useState } from 'react';
import { useStore, useT, type GuidedStep } from '../store/store';
import { createDesign, duplicateDesign } from '../model/ops';
import { storeDesign } from '../store/persist';
import { setMode } from '../easy/mode';
import { openProjectFile } from '../ui/openFile';
import { Icon, Logo } from '../ui/icons';

const STEPS: GuidedStep[] = ['build', 'decorate', 'send'];

export function GuidedTopBar() {
  const t = useT();
  const d = useStore((s) => s.design);
  const step = useStore((s) => s.guidedStep);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const locked = useStore((s) => !!s.viewPrefs.modeLocked);
  const lang = useStore((s) => s.lang);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
  const st = useStore.getState;
  const item = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  // the open design stays in the library (milestone 86): starting something new asks nothing
  const startNew = () => st().replaceDesign(createDesign(st().design.material), true);
  return (
    <header className="topbar g-topbar" data-testid="g-topbar">
      <button className="ghost g-home" onClick={startNew} title={t('g.home')} aria-label={t('g.home')} data-testid="g-home">
        <Logo />
      </button>
      <input
        className="design-name g-name"
        aria-label={t('g.name')}
        placeholder={t('g.untitled')}
        value={d.name}
        onChange={(e) => st().preview((dd) => void (dd.name = e.target.value))}
        onBlur={() => st().commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          e.stopPropagation();
        }}
        dir="auto"
        data-testid="g-name"
      />
      <div className="spacer" />
      <div className="seg g-steps" role="tablist" aria-label={t('g.step.label')} data-testid="g-steps">
        {STEPS.map((s, i) => (
          <button key={s} role="tab" aria-selected={step === s} className={step === s ? 'on' : ''} onClick={() => st().setGuidedStep(s)} data-testid={`g-step-${s}`}>
            <span className="g-step-n">{i + 1}</span> {t(`g.step.${s}`)}
          </button>
        ))}
      </div>
      <div className="spacer" />
      <button className="ghost g-word-btn" onClick={() => st().undo()} disabled={!canUndo} data-testid="g-undo">
        <Icon name="undo" /> <span>{t('g.undo')}</span>
      </button>
      <button className="ghost g-word-btn" onClick={() => st().redo()} disabled={!canRedo} data-testid="g-redo">
        <Icon name="redo" /> <span>{t('g.redo')}</span>
      </button>
      <div className="g-menu-wrap" ref={menuRef}>
        <button className="ghost g-word-btn" aria-haspopup="menu" aria-expanded={menu} title={t('g.menu')} aria-label={t('g.menu')} onClick={() => setMenu((m) => !m)} data-testid="g-menu">
          <Icon name="menu" />
        </button>
        {menu && (
          <div className="menu g-menu" role="menu">
            <button role="menuitem" onClick={item(startNew)} data-testid="g-menu-new">
              <Icon name="file" /> {t('g.menu.new')}
            </button>
            <button role="menuitem" onClick={item(() => fileRef.current?.click())} data-testid="g-menu-open">
              <Icon name="open" /> {t('g.menu.open')}
            </button>
            <button
              role="menuitem"
              onClick={item(async () => {
                const c = duplicateDesign(st().design, t('lib.copySuffix'));
                await storeDesign(c).catch(() => undefined);
                st().replaceDesign(c, false);
              })}
              data-testid="g-menu-copy"
            >
              <Icon name="copy" /> {t('g.menu.saveCopy')}
            </button>
            <button role="menuitem" onClick={item(() => st().setLang(lang === 'en' ? 'he' : 'en'))} lang={lang === 'en' ? 'he' : 'en'} data-testid="g-menu-lang">
              {t('lang.toggle')}
            </button>
            {!locked && (
              <>
                <hr />
                <button role="menuitem" onClick={item(() => setMode('quick'))} data-testid="g-menu-quick">
                  <Icon name="box" /> {t('g.menu.quick')}
                </button>
                <button role="menuitem" onClick={item(() => setMode('workshop'))} data-testid="g-menu-workshop">
                  <Icon name="settings" /> {t('g.menu.workshop')}
                </button>
              </>
            )}
            <hr />
            <button role="menuitem" className="muted" onClick={item(() => (location.hash = '#/teacher'))} data-testid="g-menu-teacher">
              <Icon name="teacher" /> {t('g.menu.teacher')}
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,.cutforge.json,application/json"
          hidden
          data-testid="g-open-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openProjectFile(f, t);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
