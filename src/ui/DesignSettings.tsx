// The card when nothing is selected (milestone 24): the template's sizes (if
// any), then design-wide joint kinds, the material's fit values and snapping.
// View options stay in View settings. Joints, material and snapping are
// collapsible (milestone 27), each header summing up what is set, so the card
// fits a short stage; which are open is kept per viewer with the view options.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useStore, useT, type SettingsSection } from '../store/store';
import { NumField } from './NumField';
import { setAllJoints, setDefaultFlap } from '../model/ops';
import { groupKinds, groupShown, inactiveChoice, jointsOf, type JointGroup } from '../model/jointDefaults';
import { autoFlap } from '../model/seams';
import type { ConnectionKind } from '../model/types';
import { fmtNum } from '../i18n';
import { TemplateSection, templateSummary } from './TemplateUI';
import { useMaterialEdit } from './MaterialDrawer';
import { Icon } from './icons';

const SECTIONS: SettingsSection[] = ['template', 'joints', 'material', 'snapping'];
/** Below this stage height (px) the sections start closed. */
const SHORT_STAGE = 700;

export function DesignSettings() {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const prefs = useStore((s) => s.viewPrefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setM = useMaterialEdit();
  const [result, setResult] = useState<{ group: JointGroup; changed: number; kept: number } | null>(null);
  // Until the viewer opens or closes one, the template's sizes start open, and Joints too as long as
  // the card fits without scrolling (a short stage, under SHORT_STAGE px, starts with it closed).
  // A long template keeps its sizes open even when the card then scrolls: they are what it is for.
  const ref = useRef<HTMLElement>(null);
  const [auto, setAuto] = useState<SettingsSection[]>(['template', 'joints']);
  const saved = prefs.sections;
  const check = () => {
    const stage = ref.current?.closest('.card-dock')?.parentElement;
    const card = ref.current?.closest('.inspector');
    if (!stage || !card || !stage.clientHeight) return;
    if (stage.clientHeight < SHORT_STAGE || card.scrollHeight > card.clientHeight + 1) setAuto((a) => (a.includes('joints') ? ['template'] : a));
  };
  // a new design or template: start again from the defaults
  const key = `${d.id}|${d.template?.id ?? ''}`;
  useLayoutEffect(() => setAuto(['template', 'joints']), [key]);
  useLayoutEffect(() => {
    if (saved) return;
    check();
    // the stage settles after the start screen: check again when it changes size (not when the content
    // grows, which would close Joints while it is being used)
    const stage = ref.current?.closest('.card-dock')?.parentElement;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [saved, key, auto.length]);
  const isOpen = (k: SettingsSection) => saved?.[k] ?? auto.includes(k);
  const toggle = (k: SettingsSection) => {
    const all = Object.fromEntries(SECTIONS.map((x) => [x, isOpen(x)])) as Record<SettingsSection, boolean>;
    setPrefs({ sections: { ...all, [k]: !all[k] } });
  };
  const section = (k: SettingsSection, title: string, summary: string, body: ReactNode) => (
    <div className="subsection" data-testid={`settings-${k}`}>
      <button className="collapse-head settings-head" aria-expanded={isOpen(k)} onClick={() => toggle(k)} data-testid={`settings-head-${k}`}>
        <span className="chev">
          <Icon name="chevRight" size={14} />
        </span>
        <span className="head-title">{title}</span>
        <span className="head-sum" dir="auto" data-testid={`settings-sum-${k}`}>
          {summary}
        </span>
      </button>
      {isOpen(k) && <div className="section-body">{body}</div>}
    </div>
  );
  const tplSum = templateSummary(t, d);
  const short_ = (k: ConnectionKind | undefined) => (k ? t(`conn.short.${k}` as 'conn.short.fold') : '–');
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
        {(() => {
          const off = inactiveChoice(d, group);
          if (!off) return null;
          const kind = t(`conn.${off.kind}` as 'conn.fold');
          const used = off.used ? t(`conn.${off.used}` as 'conn.fold') : '–';
          return (
            <p className="note" data-testid={`joints-${group}-inactive`}>
              {off.material
                ? t('settings.inactiveOther', { kind, used, here: t(`settings.matIn.${d.material.kind}` as 'settings.matIn.card'), there: t(`settings.matIn.${off.material}` as 'settings.matIn.card') })
                : t('settings.inactiveHere', { kind, used })}
            </p>
          );
        })()}
        {result?.group === group && (
          <p className="note" data-testid={`joints-${group}-result`} data-changed={result.changed} data-kept={result.kept}>
            {result.kept ? t('settings.kept', { n: result.changed, k: result.kept }) : t('settings.changed', { n: result.changed })}
          </p>
        )}
      </>
    );
  };
  return (
    <section ref={ref} data-testid="inspector-design">
      <p className="kicker">{t('settings.kicker')}</p>
      <h3>{t('settings.title')}</h3>
      {tplSum !== null && section('template', t('tpl.title'), tplSum, <TemplateSection bare />)}
      {section(
        'joints',
        t('settings.joints'),
        `${short_(groupShown(d, 'base'))} · ${short_(groupShown(d, 'corner'))}`,
        <>
          {list('base', t('settings.jointsBase'))}
          {list('corner', t('settings.jointsCorner'))}
          {paper && (
            <NumField
              label={t('settings.flap')}
              value={jointsOf(d)?.flap ?? autoFlap(m)}
              unit={mm}
              min={3}
              max={100}
              onCommit={(v) => apply((x) => setDefaultFlap(x, v))}
              testId="settings-flap"
            />
          )}
          {paper && jointsOf(d)?.flap !== undefined && (
            <button className="link" onClick={() => apply((x) => setDefaultFlap(x, null))} data-testid="settings-flap-auto">
              {t('settings.flapAuto', { n: fmtNum(autoFlap(m), 1) })}
            </button>
          )}
          <p className="note" title={t('settings.jointsHelp')}>
            {t('settings.jointsShort')}
          </p>
        </>,
      )}
      {section(
        'material',
        t('settings.material'),
        t('settings.sumMaterial', { kind: t(`settings.kind.${m.kind}` as 'settings.kind.card'), t: fmtNum(m.thickness, 2), c: fmtNum(m.clearance, 2) }),
        <>
          <p className="note">{t(m.nameKey as 'mat.ply3')}</p>
          <NumField label={t('mat.thickness')} value={m.thickness} decimals={2} unit={mm} min={0.1} max={20} onCommit={(v) => setM({ thickness: v })} testId="settings-thickness" />
          <NumField label={t('mat.kerf')} value={m.kerf} decimals={2} unit={mm} min={0} max={2} onCommit={(v) => setM({ kerf: v })} testId="settings-kerf" />
          <NumField label={t('mat.clearance')} value={m.clearance} decimals={2} unit={mm} min={0} max={2} onCommit={(v) => setM({ clearance: v })} testId="settings-clearance" />
          <button onClick={() => useStore.getState().set({ drawerOpen: true })} data-testid="open-drawer">
            {t('settings.changeMaterial')}
          </button>
        </>,
      )}
      {section(
        'snapping',
        t('settings.snapping'),
        [prefs.snap ? t('settings.sumSmart') : t('settings.sumSmartOff'), prefs.grid ? t('settings.sumGrid', { n: fmtNum(prefs.gridStep, 1) }) : t('settings.sumGridOff'), `${fmtNum(prefs.turnStep, 0)}°`].join(' · '),
        <>
          <div className="snap-toggles">
            <button className={prefs.snap ? 'on' : ''} aria-pressed={prefs.snap} title={t('settings.smartSnapHelp')} onClick={() => setPrefs({ snap: !prefs.snap })} data-testid="settings-snap">
              <Icon name="magnet" size={16} /> {t('settings.smartSnap')}
            </button>
            <button className={prefs.grid ? 'on' : ''} aria-pressed={prefs.grid} title={t('settings.gridSnapHelp')} onClick={() => setPrefs({ grid: !prefs.grid })} data-testid="settings-grid-snap">
              <Icon name="grid" size={16} /> {t('settings.gridSnap')}
            </button>
          </div>
          <NumField label={t('settings.grid')} value={prefs.gridStep} unit={mm} min={0.1} max={50} disabled={!prefs.grid} onCommit={(v) => setPrefs({ gridStep: v })} testId="settings-grid" />
          <NumField label={t('settings.turn')} value={prefs.turnStep} decimals={0} unit={t('unit.deg')} min={1} max={90} onCommit={(v) => setPrefs({ turnStep: v })} testId="settings-turn" />
          <p className="note">{t('settings.altHelp')}</p>
        </>,
      )}
    </section>
  );
}
