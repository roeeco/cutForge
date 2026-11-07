// Template choice for a new design, and the template's parameter controls
// (derived from its schema) in the inspector.
import { useState } from 'react';
import { useStore, useT } from '../store/store';
import { NumField, Stepper } from './NumField';
import { regenerate, templateById, type Lost } from '../templates/registry';

export function lostText(t: ReturnType<typeof useT>, lost: Lost[]) {
  return t('tpl.lost', { list: lost.map((l) => t('tpl.lostItem', { n: l.shapes, panel: l.panel })).join(', ') });
}

export function TemplateSection() {
  const t = useT();
  const d = useStore((s) => s.design);
  const [lost, setLost] = useState<Lost[]>([]);
  const tpl = d.template && templateById(d.template.id);
  if (!tpl || !d.template) return null;
  const params = d.template.params;
  const set = (key: string, v: number | string) => {
    const st = useStore.getState();
    const r = regenerate(st.design, { ...params, [key]: v });
    st.apply((x) => {
      // replace the whole design (one undo step)
      Object.assign(x, JSON.parse(JSON.stringify(r.design)));
    });
    setLost(r.lost);
  };
  const mm = t('unit.mm');
  return (
    <div data-testid="template-section">
      <p className="kicker">{t('tpl.title')}</p>
      <div className="card-head">
        <h3>{t(tpl.name)}</h3>
      </div>
      {tpl.params
        .filter((p) => !p.only || p.only.includes(d.material.kind))
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
                {p.options.map((o) => (
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
      <p className="note">{t('tpl.note')}</p>
      {lost.length > 0 && (
        <p className="warn-text" data-testid="template-lost">
          {lostText(t, lost)}
        </p>
      )}
    </div>
  );
}
