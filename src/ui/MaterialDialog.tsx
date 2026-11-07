import { useStore, useT } from '../store/store';
import { MATERIALS } from '../model/materials';
import { setMaterial } from '../model/ops';
import { fmtNum } from '../i18n';

/** First step of a new design: choose the material. */
export function MaterialDialog() {
  const t = useT();
  const lang = useStore((s) => s.lang);
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
        <div className="mat-grid">
          {MATERIALS.map((m) => (
            <button
              key={m.id}
              className={`mat-card mat-${m.kind}`}
              data-testid={`mat-${m.id}`}
              onClick={() => {
                const s = useStore.getState();
                s.apply((d) => setMaterial(d, m));
                useStore.setState({ past: [], future: [], needsMaterial: false });
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
