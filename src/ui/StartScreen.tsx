// First screen of a new design: what are you making? Step 1 the material,
// step 2 a template (drawn by the real renderer), then Start.
import { useMemo, useState } from 'react';
import { useStore, useT } from '../store/store';
import { TEMPLATES, defaults, generate, templateById } from '../templates/registry';
import { DEFAULT_MATERIAL, MATERIALS } from '../model/materials';
import { setMaterial } from '../model/ops';
import type { MaterialProfile } from '../model/types';
import { Icon, Logo } from './icons';
import { MaterialArt } from './MaterialArt';
import { renderThumbnail } from '../views/thumbnail';

const thumbCache = new Map<string, string | null>();
function thumb(tplId: string, m: MaterialProfile): string | null {
  const key = `${tplId}:${m.id}`;
  if (!thumbCache.has(key)) {
    const tp = templateById(tplId);
    thumbCache.set(key, tp ? renderThumbnail(generate(tp, m, defaults(tp)), 520, 300) : null);
  }
  return thumbCache.get(key) ?? null;
}

function BlankArt() {
  return (
    <svg viewBox="0 0 260 150" aria-hidden>
      <defs>
        <pattern id="iso" width="22" height="12.7" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)">
          <path d="M0 0H22M0 0V12.7" stroke="#e4dccf" strokeWidth="1" fill="none" />
        </pattern>
      </defs>
      <rect width="260" height="150" fill="#fbf8f3" />
      <rect width="260" height="150" fill="url(#iso)" />
      <circle cx="130" cy="75" r="26" fill="#f1ebe1" />
      <path d="M130 62v26M117 75h26" stroke="#b9ad9b" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function StartScreen() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const [matId, setMatId] = useState(DEFAULT_MATERIAL.id);
  const [tpl, setTpl] = useState('');
  const mat = MATERIALS.find((m) => m.id === matId)!;
  const tplOk = (id: string) => !id || !!templateById(id)?.materials.includes(mat.kind);
  const effTpl = tplOk(tpl) ? tpl : '';
  const thumbs = useMemo(() => Object.fromEntries(TEMPLATES.map((tp) => [tp.id, tp.materials.includes(mat.kind) ? thumb(tp.id, mat) : null])), [mat]);
  const start = () => {
    const s = useStore.getState();
    const tp = effTpl && templateById(effTpl);
    if (tp) s.replaceDesign(generate(tp, mat, defaults(tp)), false);
    else {
      s.apply((d) => setMaterial(d, mat));
      useStore.setState({ past: [], future: [], needsMaterial: false });
    }
  };
  return (
    <div className="start" role="dialog" aria-modal="true" aria-labelledby="start-title" data-testid="material-dialog">
      <div className="start-head">
        <div className="brand">
          <Logo />
          <span>{t('app.name')}</span>
        </div>
        <div className="spacer" />
        <button className="lang" onClick={() => setLang(lang === 'en' ? 'he' : 'en')} title={t('lang.toggleTitle')} data-testid="lang-toggle-dialog">
          {t('lang.toggle')}
        </button>
      </div>
      <h1 id="start-title">{t('start.title')}</h1>
      <p className="lead">{t('mat.chooseHelp')}</p>

      <p className="step-label">
        <b>{t('start.step', { n: 1 })}</b> {t('start.material')}
      </p>
      <div className="mat-grid" role="radiogroup" aria-label={t('start.material')}>
        {MATERIALS.map((m) => (
          <button key={m.id} className="pick-card" role="radio" aria-checked={m.id === matId} onClick={() => setMatId(m.id)} onDoubleClick={start} data-testid={`mat-${m.id}`} title={m.kind === 'plywood' ? t('mat.joints.ply') : t('mat.joints.paper')}>
            <span className="art">
              <MaterialArt kind={m.kind} thickness={m.thickness} />
            </span>
            <span className="cap">
              <strong>{t(m.nameKey as 'mat.ply3')}</strong>
              <small>{m.kind === 'plywood' ? t('start.ply') : m.kind === 'card' ? t('start.card') : t('start.corr')}</small>
            </span>
            <span className="tick-mark">
              <Icon name="check" size={16} />
            </span>
          </button>
        ))}
      </div>

      <p className="step-label">
        <b>{t('start.step', { n: 2 })}</b> {t('start.template')}
      </p>
      <div className="tpl-grid" role="radiogroup" aria-label={t('start.template')}>
        <button className="pick-card" role="radio" aria-checked={effTpl === ''} onClick={() => setTpl('')} data-testid="tpl-blank">
          <span className="art">
            <BlankArt />
          </span>
          <span className="cap">
            <strong>{t('tpl.blank')}</strong>
            <small>{t('start.blankDesc')}</small>
          </span>
          <span className="tick-mark">
            <Icon name="check" size={16} />
          </span>
        </button>
        {TEMPLATES.map((tp) => (
          <button key={tp.id} className="pick-card" role="radio" aria-checked={effTpl === tp.id} disabled={!tplOk(tp.id)} onClick={() => setTpl(tp.id)} data-testid={`tpl-${tp.id}`}>
            <span className="art">{thumbs[tp.id] ? <img src={thumbs[tp.id]!} alt="" /> : null}</span>
            <span className="cap">
              <strong>{t(tp.name)}</strong>
              <small>{t(tp.description)}</small>
            </span>
            <span className="tick-mark">
              <Icon name="check" size={16} />
            </span>
          </button>
        ))}
      </div>

      <div className="start-foot">
        <p className="note">{t('mat.calibrate')}</p>
        <button className="primary go" onClick={start} data-testid="start-go">
          {t('start.go')}
        </button>
      </div>
    </div>
  );
}
