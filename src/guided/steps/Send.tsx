// Send (milestone 109, GUIDED_MODE.md §3.5): the sheet as the laser will cut it (a picture), the check in plain
// words with *Fix*, *Use less board*, the mission's goals, *Watch it go together*, and one button: *Send to my
// teacher* with a class, else *Download the file*. The button waits until the check is clear.
import { useDeferredValue, useMemo, useState } from 'react';
import { useStore, useT } from '../../store/store';
import type { Design } from '../../model/types';
import type { MsgKey } from '../../i18n';
import { validate, type Issue } from '../../model/validate';
import { issueVars } from '../../model/names';
import { blocking, canFix, fixIssue } from '../../easy/fix';
import { missionState } from '../../easy/missions';
import { sheetUse } from '../../easy/sheet';
import { playAssembly } from '../../easy/assemble';
import { workshopOnly, setMode } from '../../easy/mode';
import { lessBoard } from '../../ui/SplitUI';
import { printPlan } from '../../ui/printPlan';
import { downloadNominalSvg } from '../../export/files';
import { NAME_KEY, CODE_KEY, errKeyOf, lookupClass, profileMismatch, remember, submitDesign, switchToClassMaterial } from '../../net/submit';
import type { ClassInfo } from '../../net/api';
import { MATERIALS } from '../../model/materials';
import { Icon } from '../../ui/icons';
import { SideSheet } from '../SideSheet';
import { AddBar } from '../AddBar';
import { guidedApply } from '../apply';
import { shown, useFeature } from '../../easy/features';

/** The blocking problems now. */
export const blockers = (d: Design) => validate(d).filter(blocking);

function CheckList({ d }: { d: Design }) {
  const t = useT();
  const locked = useStore((s) => !!s.viewPrefs.modeLocked);
  const list = useMemo(() => blockers(d), [d]);
  if (!list.length)
    return (
      <p className="g-ready ok-text" data-testid="g-ready" data-ok="true">
        {t('g.send.ready')}
      </p>
    );
  const words = (i: Issue) => {
    const v = issueVars(d, i, t);
    return canFix(i) ? t(`g.${i.key}` as MsgKey, { ...v, part: v.panel ?? '' }) : t('g.send.askTeacher');
  };
  return (
    <ul className="g-check" data-testid="g-ready" data-ok="false">
      {list.map((i, k) => (
        <li key={k} data-testid={`g-issue-${i.key}`}>
          <span dir="auto">{words(i)}</span>
          {canFix(i) ? (
            <button className="primary" onClick={() => guidedApply((x) => void fixIssue(x as Design, i))} data-testid={`g-fix-${i.key}`}>
              {t('g.send.fix')}
            </button>
          ) : (
            !locked && (
              <button onClick={() => setMode(d.order.some((id) => workshopOnly(d, id)) ? 'workshop' : 'quick')} data-testid="g-open-more">
                {t('g.send.openMore')}
              </button>
            )
          )}
        </li>
      ))}
    </ul>
  );
}

function Mission({ d }: { d: Design }) {
  const t = useT();
  const st = useMemo(() => missionState(d), [d]);
  if (!st) return null;
  return (
    <div className="subsection g-goals" data-testid="g-goals" data-stars={st.stars}>
      <h4>
        {t('g.send.mission')} <span className="stars">{'★'.repeat(st.stars) + '☆'.repeat(3 - st.stars)}</span>
      </h4>
      <ul>
        {st.goals.map((g) => (
          <li key={g.goal.id} className={g.ok ? 'ok' : ''}>
            <span className="mark">{g.ok ? '✓' : ''}</span> {t(g.goal.label, g.goal.vars)}
          </li>
        ))}
      </ul>
    </div>
  );
}

type Sending = { kind: 'idle' } | { kind: 'name' } | { kind: 'code' } | { kind: 'sending' } | { kind: 'switch'; cls: ClassInfo } | { kind: 'sent' } | { kind: 'downloaded' } | { kind: 'error'; key: MsgKey };

function SendButton({ ready }: { ready: boolean }) {
  const t = useT();
  const [code, setCode] = useState(() => remember(CODE_KEY));
  const [name, setName] = useState(() => remember(NAME_KEY));
  const [state, setState] = useState<Sending>({ kind: 'idle' });
  const kiss = { kissUp: t('export.kissUp'), kissUpShort: t('export.kissUpShort') };
  const send = async (design: Design) => {
    setState({ kind: 'sending' });
    const r = await submitDesign({ code, name, title: design.name, design });
    setState(r.ok ? { kind: 'sent' } : { kind: 'error', key: errKeyOf(r.error) });
  };
  const go = async () => {
    if (!name.trim()) return setState({ kind: 'name' });
    remember(NAME_KEY, name.trim());
    remember(CODE_KEY, code.trim().toUpperCase());
    setState({ kind: 'sending' });
    const c = await lookupClass(code.trim().toUpperCase());
    if (!c.ok) return setState({ kind: 'error', key: errKeyOf(c.error) });
    const d = useStore.getState().design;
    if (profileMismatch(c.cls, d)) return setState({ kind: 'switch', cls: c.cls });
    await send(d);
  };
  const matName = (m: ClassInfo['material']) => (m ? (MATERIALS.some((b) => b.nameKey === m.nameKey) ? t(m.nameKey as 'mat.ply3') : t('mat.customNamed', { mm: m.thickness })) : '');
  return (
    <div className="g-send" data-testid="g-send">
      {(state.kind === 'name' || (code && !name)) && (
        <label className="field">
          <span>{t('g.send.askName')}</span>
          <input value={name} dir="auto" maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-testid="g-send-name" />
        </label>
      )}
      {state.kind === 'code' && (
        <label className="field">
          <span>{t('g.send.code')}</span>
          <input value={code} dir="ltr" maxLength={10} autoComplete="off" onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.stopPropagation()} data-testid="g-send-code" />
        </label>
      )}
      {state.kind === 'switch' && (
        <div className="warn" data-testid="g-send-switch">
          <p>{t('g.send.switchMaterial', { material: matName(state.cls.material) })}</p>
          <div className="g-row">
            <button
              className="primary"
              onClick={() => {
                const st = useStore.getState();
                const next = switchToClassMaterial(st.design, state.cls.material!);
                st.apply((x) => void Object.assign(x, JSON.parse(JSON.stringify(next))));
                // the check runs again on the switched design; sending waits for it
                if (blockers(useStore.getState().design).length) return setState({ kind: 'idle' });
                void send(useStore.getState().design);
              }}
              data-testid="g-send-switch-yes"
            >
              {t('g.send.switch')}
            </button>
            <button onClick={() => void send(useStore.getState().design)} data-testid="g-send-switch-no">
              {t('g.send.keep')}
            </button>
          </div>
        </div>
      )}
      {state.kind === 'sent' && (
        <p className="ok-text" data-testid="g-sent">
          {t('g.send.sent')}
        </p>
      )}
      {state.kind === 'downloaded' && <p className="ok-text">{t('g.send.downloaded')}</p>}
      {state.kind === 'error' && (
        <p className="warn-text" role="alert" data-testid="g-send-error">
          {t(state.key)}
        </p>
      )}
      {!ready && <p className="note">{t('g.send.waits')}</p>}
      {code || state.kind === 'code' ? (
        <button className="primary g-big" disabled={!ready || state.kind === 'sending' || !code.trim()} onClick={() => void go()} data-testid="g-send-teacher">
          <Icon name="send" /> {state.kind === 'sending' ? t('g.send.sending') : t('g.send.toTeacher')}
        </button>
      ) : (
        <button
          className="primary g-big"
          disabled={!ready}
          onClick={() => {
            downloadNominalSvg(useStore.getState().design, kiss);
            setState({ kind: 'downloaded' });
          }}
          data-testid="g-download"
        >
          <Icon name="download" /> {t('g.send.download')}
        </button>
      )}
      <div className="g-row g-send-more">
        {!code && state.kind !== 'code' && (
          <button className="link" onClick={() => setState({ kind: 'code' })} data-testid="g-have-code">
            {t('g.send.haveCode')}
          </button>
        )}
        <button className="link" onClick={() => useStore.getState().set({ exportOpen: true })} data-testid="g-more-download">
          {t('g.send.moreOptions')}
        </button>
      </div>
    </div>
  );
}

export function Send() {
  const t = useT();
  const live = useStore((s) => s.design);
  const d = useDeferredValue(live);
  const view = useStore((s) => s.view);
  const lang = useStore((s) => s.lang);
  const foldT = useStore((s) => s.foldT);
  const ready = useMemo(() => blockers(d).length === 0, [d]);
  const use = useMemo(() => sheetUse(d), [d]);
  const [less, setLess] = useState<number | null>(null);
  const printable = shown(useFeature('export.spec'));
  return (
    <>
      <SideSheet>
        <div className="subsection" data-testid="g-check">
          <h4>{t('g.send.title')}</h4>
          <CheckList d={d} />
          <p className="note" data-testid="g-sheets">
            {use.sheets === 1 ? t('g.send.sheet1') : t('g.send.sheets', { n: use.sheets })}
          </p>
          {use.sheets > 1 && (
            <button onClick={() => setLess(lessBoard().now)} data-testid="g-less-board">
              {t('g.send.lessBoard')}
            </button>
          )}
          {less !== null && <p className="note">{t('g.send.lessDone', { n: less })}</p>}
        </div>
        <Mission d={d} />
        <div className="subsection" data-testid="g-send-section">
          <SendButton ready={ready} />
          {printable && (
            <button className="link g-print" onClick={() => printPlan(useStore.getState().design, 'A4', t, lang)} data-testid="g-print">
              {t('g.send.print')}
            </button>
          )}
        </div>
      </SideSheet>
      <AddBar>
        {view !== '2d' ? (
          <button
            onClick={() => {
              useStore.getState().set({ foldT: 1 });
              useStore.getState().setView('2d');
            }}
            data-testid="g-show-sheet"
          >
            <Icon name="repack" />
            <span>{t('g.send.showSheet')}</span>
          </button>
        ) : null}
        <button
          onClick={() => {
            useStore.getState().set({ foldT: 1 });
            useStore.getState().setView('3d');
            requestAnimationFrame(() => playAssembly());
          }}
          data-testid="g-watch"
        >
          <Icon name="play" />
          <span>{t('g.send.watch')}</span>
        </button>
        {d.material.kind !== 'plywood' && (
          <button
            className={view === '3d' && foldT < 0.5 ? 'on' : ''}
            onClick={() => {
              useStore.getState().setView('3d');
              useStore.getState().set({ foldT: 0 });
            }}
            data-testid="g-flat"
          >
            <Icon name="fold" />
            <span>{t('g.send.flat')}</span>
          </button>
        )}
      </AddBar>
    </>
  );
}
