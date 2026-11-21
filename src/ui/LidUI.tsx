// A box's *Lid* section (LIDS_LINES_PROJECTS_PLAN.md §4, §10.4; milestone 73),
// on the box's card and on its lid's card, in both modes: *None · Lifts off ·
// Hinged* as pictures (Workshop adds *Arched*, and shows *Fixed* when the box
// has one). One that cannot be made here is greyed; tapping it says why. And a
// carton's *Bottom* as pictures, where its lists are hidden (Quick build).
import { useMemo, useState } from 'react';
import { useStore, useT } from '../store/store';
import { setLidHasps, setTrayEnds } from '../model/ops';
import { HASP_HOLES } from '../model/lid';
import { matOf } from '../model/materials';
import { autoStyle, boxLid, locksWhy, boxOfPanel, capRimOf, lidParts, lidStyleWhy, lidWhy, lidWhyVars, LID_STYLES, setBoxLid, setCapRim, type BoxLid, type CapRim, type LidChoice, type LidStyle } from '../easy/lid';
import { Segmented } from './NumField';
import { shown, useFeature } from '../easy/features';
import { PictureChoice, type PictureOption } from './Pictures';
import type { MsgKey } from '../i18n';
import type { Tray } from '../model/types';
import { endSpec } from '../model/cartons';

/** The help line under the *Lid* row: what the box's lid is. */
function lidHelp(lid: BoxLid, plywood: boolean, carton: boolean): MsgKey {
  if (lid.kind === 'liftoff') return lid.style === 'flat' ? 'lid.help.flat' : lid.style === 'dropin' ? 'lid.help.dropin' : 'lid.help.cap';
  if (lid.kind === 'hinged') return lid.living || plywood ? 'lid.help.living' : carton ? 'lid.help.carton' : 'lid.help.hinged';
  if (lid.kind === 'arched') return 'tray.archHelp';
  if (lid.kind === 'fixed') return 'lid.help.fixed';
  if (lid.kind === 'flaps') return 'lid.help.flaps';
  return 'lid.help.none';
}

export function LidSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const f = shown(useFeature('lid'));
  const adv = shown(useFeature('lid.advanced'));
  const [dropped, setDropped] = useState(0);
  const [failed, setFailed] = useState<LidChoice | null>(null);
  const trayId = useMemo(() => boxOfPanel(d, panelId), [d, panelId]);
  const tray = trayId ? d.trays[trayId] : undefined;
  const choices: LidChoice[] = adv ? ['none', 'liftoff', 'hinged', 'arched'] : ['none', 'liftoff', 'hinged'];
  const whys = useMemo(() => (trayId ? Object.fromEntries(choices.map((c) => [c, lidWhy(d, trayId, c)])) : {}), [d, trayId, choices.length]) as Partial<Record<LidChoice, MsgKey | null>>;
  const shut = useStore((s) => (trayId ? !!s.lidShut[trayId] : false));
  const styleWhy = useMemo(() => (trayId ? Object.fromEntries(LID_STYLES.map((st) => [st, lidStyleWhy(d, trayId, st)])) : {}), [d, trayId]) as Partial<Record<LidStyle, MsgKey | null>>;
  const auto = trayId ? autoStyle(d, trayId) : 'cap';
  if (!f || !tray) return null;
  const lid = boxLid(d, tray.id);
  const parts = lidParts(d, lid);
  const plywood = matOf(d, tray.baseId).kind === 'plywood';
  const carton = tray.base === 'open';
  const onLid = parts.includes(panelId);
  const pic = { none: 'none', liftoff: 'liftoff', hinged: 'hinged', arched: 'arched' } as const;
  const options: PictureOption<LidChoice | 'fixed'>[] = choices.map((c) => ({
    value: c,
    label: t(`lid.kind.${c}`),
    pic: pic[c],
    testId: `lid-${c}`,
    why: whys[c] ? t(whys[c]!, trayId ? lidWhyVars(d, trayId, c) : undefined) : undefined,
  }));
  // a board grown across the top with a plywood joint: shown, not chosen (it is made by growing)
  if (lid.kind === 'fixed' && adv) options.push({ value: 'fixed', label: t('lid.kind.fixed'), pic: 'fixed', testId: 'lid-fixed' });
  const value = lid.kind === 'flaps' || (lid.kind === 'fixed' && !adv) ? null : lid.kind;
  const choose = (c: LidChoice | 'fixed') => {
    if (c === 'fixed') return;
    let r = { ok: true, dropped: 0 };
    apply((x) => void (r = setBoxLid(x, tray.id, c)));
    setDropped(r.dropped);
    // a lid that could not be made says so (milestone 138, REPORT.md I9: an arched lid changed nothing, silently)
    setFailed(r.ok ? null : c);
  };
  const locks = locksWhy(d, tray.id);
  const flatTop = lid.kind === 'liftoff' && lid.style === 'flat' ? lid.top : null;
  const hasps = flatTop ? d.panels[flatTop]?.lidOf?.hasps : undefined;
  const top = lid.kind === 'liftoff' ? lid.top : lid.kind === 'hinged' || lid.kind === 'arched' || lid.kind === 'fixed' ? lid.lid : null;
  return (
    <div className="subsection lid-section" data-testid="lid-section" data-lid={lid.kind}>
      <h4>{t('lid.title')}</h4>
      {onLid && <p className="note" data-testid="tray-is-lid">{t('tray.isLid')}</p>}
      <PictureChoice label={t('lid.title')} hideLabel value={value} options={options} onChange={choose} testId="lid-kind" />
      {failed && failed !== lid.kind && (
        <p className="note warn" data-testid="lid-failed">
          {t(whys[failed] ?? (failed === 'arched' ? 'lid.why.arch' : 'lid.why.cannot'), lidWhyVars(d, tray.id, failed))}
        </p>
      )}
      <p className="note" data-testid="lid-help">
        {t(lidHelp(lid, plywood, carton))}
      </p>
      {lid.kind === 'liftoff' && (
        // milestone 79: the kind of lid that lifts off, the one Automatic chooses first; one that cannot be made is greyed with why
        <PictureChoice
          label={t('lid.style')}
          value={lid.style}
          options={LID_STYLES.map((st) => ({ value: st, label: t(`lid.style.${st}`) + (st === auto ? ' ' + t('lid.style.auto') : ''), pic: st === 'cap' ? 'cap' : st === 'flat' ? 'flatLid' : 'dropinLid', testId: `lid-style-${st}`, why: styleWhy[st] ? t(styleWhy[st]!) : undefined }))}
          onChange={(st) => apply((x) => void setBoxLid(x, tray.id, 'liftoff', st))}
          testId="lid-style"
        />
      )}
      {lid.kind === 'liftoff' && lid.style === 'cap' && adv && (
        <Segmented
          label={t('lid.rim')}
          value={capRimOf(d, tray.id) ?? 'shallow'}
          options={(['shallow', 'half', 'full'] as const).map((r) => ({ value: r, label: t(`lid.rim.${r}`), testId: `lid-rim-${r}` }))}
          onChange={(r) => apply((x) => setCapRim(x, tray.id, r as CapRim))}
        />
      )}
      {(lid.kind === 'liftoff' || lid.kind === 'hinged') && (
        // milestone 82: padlock hasps through a Flat lid; greyed with why elsewhere
        <div className="field" data-testid="lid-locks">
          <Segmented
            label={t('lid.locks')}
            value={String(hasps?.n ?? 0)}
            options={['0', '1', '2', '3'].map((n) => ({ value: n, label: n === '0' ? t('lid.locks.none') : n, testId: `lid-locks-${n}`, disabled: !!locks }))}
            onChange={(v) => void (flatTop && apply((x) => setLidHasps(x, flatTop, v === '0' ? null : (Number(v) as 1 | 2 | 3))))}
          />
          {locks && <p className="note">{t(locks)}</p>}
          {hasps && adv && (
            <Segmented label={t('lid.hole')} value={String(hasps.hole)} options={HASP_HOLES.map((h) => ({ value: String(h), label: `${h} ${t('unit.mm')}`, testId: `lid-hole-${h}` }))} onChange={(v) => void (flatTop && apply((x) => setLidHasps(x, flatTop, hasps.n, Number(v))))} />
          )}
        </div>
      )}
      {(lid.kind === 'liftoff' || lid.kind === 'hinged' || lid.kind === 'arched' || (tray.top !== 'tuck' && !!endSpec(tray, 'top'))) && (
        // milestone 76: a lid of its own lies beside the box, a folded one is shown open; this shows it in place (view only)
        <div className="field lid-pose">
          <span className="note">{t(lid.kind === 'liftoff' ? (shut ? 'lid.on' : 'lid.beside') : shut ? 'lid.closed' : 'lid.shownOpen')}</span>
          <button className="pill" aria-pressed={shut} onClick={() => useStore.getState().setLidShut(tray.id, !shut)} data-testid="lid-pose">
            {t(lid.kind === 'liftoff' ? (shut ? 'lid.takeOff' : 'lid.putOn') : shut ? 'lid.open' : 'lid.close')}
          </button>
        </div>
      )}
      {dropped > 0 && (
        <p className="note warn-text" data-testid="lid-dropped">
          {t(dropped === 1 ? 'lid.dropped1' : 'lid.dropped', { n: dropped })}
        </p>
      )}
      {top && !onLid && (
        <button className="link" onClick={() => useStore.getState().select({ kind: 'panel', id: top })} data-testid="lid-select">
          {t('lid.select')}
        </button>
      )}
    </div>
  );
}

/** A carton's bottom as pictures (Quick build, where the *Base / Top / Bottom* lists are hidden). */
export function CartonBottom({ tray }: { tray: Tray }) {
  const t = useT();
  const apply = useStore((s) => s.apply);
  const lists = shown(useFeature('tray.ends'));
  const f = shown(useFeature('lid'));
  if (lists || !f || tray.base !== 'open') return null;
  return (
    <div className="subsection" data-testid="carton-bottom">
      <PictureChoice
        label={t('carton.bottom')}
        value={tray.bottom ?? null}
        options={[
          { value: 'snap', label: t('quick.bottom.snap'), pic: 'snap', testId: 'carton-bottom-snap' },
          { value: 'tuck', label: t('quick.bottom.tuck'), pic: 'tuck', testId: 'carton-bottom-tuck' },
          { value: 'seal', label: t('quick.bottom.seal'), pic: 'flaps', testId: 'carton-bottom-seal' },
        ]}
        onChange={(v) => apply((x) => setTrayEnds(x, tray.id, { bottom: v }))}
        testId="carton-bottom-kind"
      />
      {tray.bottom === 'snap' && <p className="note">{t('carton.snapHelp')}</p>}
    </div>
  );
}
