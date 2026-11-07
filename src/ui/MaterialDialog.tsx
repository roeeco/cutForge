import { useState } from 'react';
import { useStore, useT } from '../store/store';
import { TemplatePicker } from './TemplateUI';
import { defaults, generate, templateById } from '../templates/registry';
import { MATERIALS } from '../model/materials';
import { setMaterial } from '../model/ops';
import { fmtNum } from '../i18n';

/** First step of a new design: choose the material. */
export function MaterialDialog() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const [tpl, setTpl] = useState('');
  const setLang = useStore((s) => s.setLang);
  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="mat-title" data-testid="material-dialog">
        <div className="modal-head">
          <h2 id="mat-title">{t('mat.choose')}</h2>
          <button className="lang" onClick={() => setLang(lang === 'en' ? 'he' : 'en')} title={t('lang.toggleTitle')} data-testid="lang-toggle-dialog">
            {t('lang.toggle')}
          </button>
        </div>
        <p>{t('mat.chooseHelp')}</p>
        <TemplatePicker value={tpl} onChange={setTpl} />
        <div className="mat-grid">
          {MATERIALS.map((m) => (
            <button
              key={m.id}
              className={`mat-card mat-${m.kind}`}
              data-testid={`mat-${m.id}`}
              disabled={!!tpl && !templateById(tpl)?.materials.includes(m.kind)}
              onClick={() => {
                const s = useStore.getState();
                const tp = tpl && templateById(tpl);
                if (tp && tp.materials.includes(m.kind)) {
                  const d = generate(tp, m, defaults(tp));
                  s.replaceDesign(d, false);
                } else {
                  s.apply((d) => setMaterial(d, m));
                  useStore.setState({ past: [], future: [], needsMaterial: false });
                }
              }}
            >
              <strong>{t(m.nameKey as 'mat.ply3')}</strong>
              <span dir="ltr">
                {fmtNum(m.thickness, 2)} {t('unit.mm')}
              </span>
              <small>{m.kind === 'plywood' ? t('mat.joints.ply') : t('mat.joints.paper')}</small>
            </button>
          ))}
        </div>
        <p className="note">{t('mat.calibrate')}</p>
      </div>
    </div>
  );
}
