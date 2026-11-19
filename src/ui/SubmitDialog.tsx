// "Submit to class": class code + display name (remembered locally). If the
// network or server fails, say so plainly and offer the download instead;
// the student's local work is never touched by a failed submission.
// The sending itself is in src/net/submit.ts (milestone 109), shared with Guided's Send.
import { applyClassMode } from '../easy/mode';
import { useMemo, useState } from 'react';
import { useStore, useT } from '../store/store';
import { api, type ApiError, type ClassInfo } from '../net/api';
import { validate } from '../model/validate';
import { fmtNum, type MsgKey } from '../i18n';
import type { Design } from '../model/types';
import { matIdOf, matOf, mixedMaterials } from '../model/materials';
import { materialName } from './materialName';
import { issueVars, panelLabel } from '../model/names';
import { CODE_KEY, NAME_KEY, differs, errKeyOf, profileMismatch, remember, submitDesign, switchToClassMaterial } from '../net/submit';

export function SubmitDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const [code, setCode] = useState(() => remember(CODE_KEY));
  const [name, setName] = useState(() => remember(NAME_KEY));
  const [title, setTitle] = useState(d.name);
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'done' | 'error' | 'profile'; error?: string; cls?: ClassInfo }>({ kind: 'idle' });
  const issues = useMemo(() => validate(d), [d]);

  const send = async (design: Design) => {
    setState({ kind: 'sending' });
    const r = await submitDesign({ code, name, title, design });
    setState(r.ok ? { kind: 'done' } : { kind: 'error', error: r.error });
  };

  const start = async () => {
    if (!code.trim() || !name.trim()) return setState({ kind: 'error', error: 'badRequest' });
    remember(CODE_KEY, code.trim().toUpperCase());
    remember(NAME_KEY, name.trim());
    setState({ kind: 'sending' });
    let cls: ClassInfo;
    try {
      cls = await api.classInfo(code);
    } catch (e) {
      return setState({ kind: 'error', error: (e as ApiError).code ?? 'network' });
    }
    // the class's mode (milestone 37): its default, and kept when the teacher locks it
    applyClassMode(cls.mode ?? null, !!cls.modeLocked);
    if (!cls.open) return setState({ kind: 'error', error: 'closed' });
    // the class's profile against the working material, and boards in other materials
    if (profileMismatch(cls, d)) return setState({ kind: 'profile', cls });
    await send(d);
  };

  const useClassProfile = async () => {
    const m = state.cls!.material!;
    const st = useStore.getState();
    const next = switchToClassMaterial(st.design, m);
    st.apply((x) => void Object.assign(x, JSON.parse(JSON.stringify(next))));
    await send(useStore.getState().design);
  };

  const errKey = (e: string): MsgKey => errKeyOf(e);
  const m = state.cls?.material;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sub-title" onClick={(e) => e.stopPropagation()} data-testid="submit-dialog">
        <h2 id="sub-title">{t('sub.title')}</h2>
        {state.kind === 'done' ? (
          <p className="ok-text" data-testid="submit-done">
            {t('sub.done', { title: title.trim() || d.name || '—' })}
          </p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="sub-code">{t('sub.code')}</label>
              <input id="sub-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} autoComplete="off" data-testid="sub-code" />
            </div>
            <div className="field">
              <label htmlFor="sub-name">{t('sub.name')}</label>
              <input id="sub-name" dir="auto" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} data-testid="sub-name" />
            </div>
            <div className="field">
              <label htmlFor="sub-design">{t('sub.designTitle')}</label>
              <input id="sub-design" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            </div>
            <p className="note">{t('sub.privacy')}</p>
            {issues.length > 0 && (
              <div className="issues">
                <strong>{t('sub.issues')}</strong>
                <ul>
                  {issues.slice(0, 5).map((i, k) => (
                    <li key={k}>{t(i.key, issueVars(d, i, t))}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {state.kind === 'profile' && m && (
          <div className="warn" data-testid="submit-profile">
            {mixedMaterials(d) && (
              <p data-testid="submit-other-mats">
                {t('sub.otherMats', {
                  list: d.order
                    .filter((id) => d.panels[id] && matIdOf(d, id) !== d.material.id)
                    .map((id) => `${panelLabel(d, id, t)} (${materialName(t, matOf(d, id))})`)
                    .join(', '),
                })}
              </p>
            )}
            {differs(m, d.material) && <p>
              {t('sub.profileDiff', {
                mat: t(m.nameKey as MsgKey),
                t: fmtNum(m.thickness, 2),
                k: fmtNum(m.kerf, 2),
                c: fmtNum(m.clearance, 2),
                t2: fmtNum(d.material.thickness, 2),
                k2: fmtNum(d.material.kerf, 2),
                c2: fmtNum(d.material.clearance, 2),
              })}
            </p>}
            <div className="modal-actions">
              <button onClick={() => send(d)} data-testid="submit-anyway">
                {t('sub.anyway')}
              </button>
              <button className="primary" onClick={useClassProfile} data-testid="submit-use-class">
                {t('sub.useClass')}
              </button>
            </div>
          </div>
        )}
        {state.kind === 'error' && (
          <div className="issues" role="alert" data-testid="submit-error">
            <p>{t(errKey(state.error ?? 'network'))}</p>
            <button
              className="primary"
              onClick={() => {
                onClose();
                useStore.getState().set({ exportOpen: true });
              }}
              data-testid="submit-fallback-download"
            >
              {t('sub.download')}
            </button>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>{t('sub.close')}</button>
          {state.kind !== 'done' && state.kind !== 'profile' && (
            <button className="primary" onClick={start} disabled={state.kind === 'sending' || !d.order.length} data-testid="submit-go">
              {state.kind === 'sending' ? t('sub.sending') : t('sub.send')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
