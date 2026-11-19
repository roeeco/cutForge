// Template choice for a new design, and the template's parameter controls
// (derived from its schema) in the inspector.
import { useMemo, useState } from 'react';
import { useStore, useT } from '../store/store';
import { NumField, Stepper } from './NumField';
import { regenerate, templateById, type Lost } from '../templates/registry';
import type { Design } from '../model/types';
import { choose, optionsNow, shownNow, type Change } from '../sentence/resolve';
import { fmtNum, type MsgKey } from '../i18n';

type Translate = ReturnType<typeof useT>;

export function lostText(t: ReturnType<typeof useT>, lost: Lost[]) {
  return t('tpl.lost', { list: lost.map((l) => t('tpl.lostItem', { n: l.shapes, panel: l.panel })).join(', ') });
}

/** One line for the settings card's header: the template's name and its first three sizes. */
export function templateSummary(t: Translate, d: Design): string | null {
  const tpl = d.template && templateById(d.template.id);
  if (!tpl || !d.template) return null;
  const sizes = tpl.params.filter((p) => p.type === 'number' && (!p.only || p.only.includes(d.material.kind))).slice(0, 3);
  const nums = sizes.map((p) => String(Math.round(Number(d.template!.params[p.key] ?? p.default) * 10) / 10));
  return [t(tpl.name), nums.length ? `${nums.join(' × ')} ${t('unit.mm')}` : ''].filter(Boolean).join(' · ');
}

/** The template's sizes; `bare`: without its own heading (inside the settings card's collapsible section). */
export function TemplateSection({ bare = false }: { bare?: boolean }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const [lost, setLost] = useState<Lost[]>([]);
  // milestone 99: the same checks as the sentence; what a change dropped or moved, or why it was refused
  const [notes, setNotes] = useState<Change[]>([]);
  const [refused, setRefused] = useState<{ key: string; min: number; max: number; why?: MsgKey } | null>(null);
  const tpl = d.template && templateById(d.template.id);
  const params = d.template?.params;
  // the lists a word offers now (each can take a build to answer; worked out once per set of words)
  const lists = useMemo(() => (tpl && params ? Object.fromEntries(tpl.params.filter((p) => p.type === 'choice').map((p) => [p.key, optionsNow(p, params, d.material)])) : {}), [tpl, params, d.material]);
  if (!tpl || !d.template || !params) return null;
  const set = (key: string, v: number | string) => {
    const st = useStore.getState();
    const c = choose(tpl, st.design.material, params, key, v);
    if ('refused' in c) {
      setRefused({ key, ...c.refused });
      return;
    }
    setRefused(null);
    const r = regenerate(st.design, c.params);
    st.apply((x) => {
      // replace the whole design (one undo step)
      Object.assign(x, JSON.parse(JSON.stringify(r.design)));
    });
    setLost(r.lost);
    setNotes(c.changes);
  };
  const label = (key: string) => {
    const p = tpl.params.find((x) => x.key === key);
    return p ? t(p.label) : key;
  };
  const optText = (key: string, v: number | string) => {
    const p = tpl.params.find((x) => x.key === key);
    const o = p?.type === 'choice' ? p.options.find((x) => x.value === v) : undefined;
    return o ? t(o.label) : String(v);
  };
  const mm = t('unit.mm');
  return (
    <div data-testid="template-section">
      {!bare && (
        <>
          <p className="kicker">{t('tpl.title')}</p>
          <div className="card-head">
            <h3>{t(tpl.name)}</h3>
          </div>
        </>
      )}
      {tpl.params
        .filter((p) => shownNow(p, params, d.material))
        .map((p) =>
          p.type === 'choice' ? (
            <div className="field" key={p.key}>
              <label htmlFor={`tp-${p.key}`}>{t(p.label)}</label>
              <select
                id={`tp-${p.key}`}
                value={String(params[p.key] ?? p.default)}
                onChange={(e) => set(p.key, typeof p.default === 'number' ? Number(e.target.value) : e.target.value)}
                data-testid={`tp-${p.key}`}
              >
                {p.options.filter((o) => (lists[p.key] ?? []).includes(o.value) || o.value === params[p.key]).map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {t(o.label)}
                  </option>
                ))}
              </select>
            </div>
          ) : p.type === 'int' ? (
            <Stepper
              key={p.key}
              label={t(p.label)}
              value={Number(params[p.key] ?? p.default)}
              min={p.min}
              max={p.max}
              onCommit={(v) => set(p.key, Math.round(v))}
              testId={`tp-${p.key}`}
            />
          ) : (
            <NumField
              key={p.key}
              label={t(p.label)}
              value={Number(params[p.key] ?? p.default)}
              unit={mm}
              min={p.min}
              max={p.max}
              onCommit={(v) => set(p.key, v)}
              testId={`tp-${p.key}`}
            />
          ),
        )}
      {bare ? (
        <p className="note" title={t('tpl.note')}>
          {t('tpl.noteShort')}
        </p>
      ) : (
        <p className="note">{t('tpl.note')}</p>
      )}
      {refused && (
        <p className="warn-text" data-testid="template-refused">
          {label(refused.key)}: {refused.max > refused.min ? t('sen.refused', { min: fmtNum(refused.min, 1), max: fmtNum(refused.max, 1), why: refused.why ? t(refused.why) : '' }) : t('sen.refusedChoice', { why: t(refused.why ?? 'sen.why.engine') })}
        </p>
      )}
      {notes.length > 0 && (
        <div className="template-notes" role="status" data-testid="template-notes">
          {notes.map((c, i) => (
            <p key={i} className="note">
              ⓘ {t('sen.note', { what: `${label(c.key)}: ${optText(c.key, c.to)}`, why: t(c.why) })}
            </p>
          ))}
        </div>
      )}
      {lost.length > 0 && (
        <p className="warn-text" data-testid="template-lost">
          {lostText(t, lost)}
        </p>
      )}
    </div>
  );
}
