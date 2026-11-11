// First screen of a new design: what are you making? Step 1 the material,
// step 2 a template (drawn by the real renderer), then Start.
import { useMemo, useState } from 'react';
import { TOUR_OFFERED } from '../tour/TourNudge';
import { tourDone, useStore, useT } from '../store/store';
import { TEMPLATES, defaults, generate, templateById } from '../templates/registry';
import { DEFAULT_MATERIAL, MATERIALS } from '../model/materials';
import { setMaterial } from '../model/ops';
import type { MaterialProfile } from '../model/types';
import { Icon, Logo } from './icons';
import { MaterialArt } from './MaterialArt';
import { renderThumbnail } from '../views/thumbnail';
import { MISSIONS, missionById, startMission } from '../easy/missions';
import { useMode } from '../easy/features';

const thumbCache = new Map<string, string | null>();
function thumb(tplId: string, m: MaterialProfile): string | null {
  const key = `${tplId}:${m.id}`;
  if (!thumbCache.has(key)) {
    const tp = templateById(tplId);
    thumbCache.set(key, tp ? renderThumbnail(generate(tp, m, defaults(tp)), 520, 300) : null);
  }
  return thumbCache.get(key) ?? null;
}
function missionThumb(id: string, m: MaterialProfile): string | null {
  const key = `mission:${id}:${m.id}`;
  if (!thumbCache.has(key)) {
    const ms = missionById(id);
    thumbCache.set(key, ms ? renderThumbnail(startMission(ms, m), 520, 300) : null);
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

/** The tour's picture: the small box it builds, on the same grid as Blank's. */
function TourArt() {
  return (
    <svg viewBox="0 0 260 150" aria-hidden>
      <defs>
        <pattern id="iso-tour" width="22" height="12.7" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)">
          <path d="M0 0H22M0 0V12.7" stroke="#e4dccf" strokeWidth="1" fill="none" />
        </pattern>
      </defs>
      <rect width="260" height="150" fill="#fbf8f3" />
      <rect width="260" height="150" fill="url(#iso-tour)" />
      <g stroke="#9a7a4f" strokeWidth="2" strokeLinejoin="round" fill="#e7cfa6">
        <path d="M80 70 130 50 180 70 130 90Z" />
        <path d="M80 70v34l50 20V90Z" fill="#d9bb8a" />
        <path d="M130 90v34l50-20V70Z" fill="#cfae7a" />
        <path d="M105 80 155 60" fill="none" />
      </g>
      <circle cx="155" cy="100" r="8" fill="#fbf8f3" stroke="#9a7a4f" strokeWidth="2" />
    </svg>
  );
}

export function StartScreen() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const [matId, setMatId] = useState(DEFAULT_MATERIAL.id);
  const [tpl, setTpl] = useState('');
  // the first-use tour (milestone 43): a card until it was taken or ended, then a link; not when the class locks Quick build
  const [toured] = useState(tourDone);
  const tourOk = useStore((s) => TOUR_OFFERED && !(s.viewPrefs.modeLocked && s.viewPrefs.mode === 'quick'));
  // Quick build offers missions next to the templates (milestone 40); a class may choose which
  const quick = useMode() === 'quick';
  const offered = useStore((s) => s.viewPrefs.missions);
  const missions = quick ? MISSIONS.filter((m) => !offered || offered.includes(m.id)) : [];
  const mat = MATERIALS.find((m) => m.id === matId)!;
  const tplOk = (id: string) => !id || (id.startsWith('mission:') ? !!missionById(id.slice(8))?.materials.includes(mat.kind) : !!templateById(id)?.materials.includes(mat.kind));
  const effTpl = tplOk(tpl) ? tpl : '';
  const thumbs = useMemo(() => Object.fromEntries(TEMPLATES.map((tp) => [tp.id, tp.materials.includes(mat.kind) ? thumb(tp.id, mat) : null])), [mat]);
  const start = () => {
    const s = useStore.getState();
    const ms = effTpl.startsWith('mission:') ? missionById(effTpl.slice(8)) : undefined;
    const tp = effTpl && templateById(effTpl);
    if (ms) s.replaceDesign(startMission(ms, mat), false);
    else if (tp) s.replaceDesign(generate(tp, mat, defaults(tp)), false);
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

      {tourOk && !toured && (
        <div className="tour-offer" data-testid="tour-offer">
          <span className="art">
            <TourArt />
          </span>
          <span className="cap">
            <strong>{t('tour.cardTitle')}</strong>
            <small>{t('tour.pitch')}</small>
          </span>
          <button className="primary" onClick={() => useStore.getState().startTour()} data-testid="tour-start">
            {t('tour.take')}
          </button>
        </div>
      )}

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
      {missions.length > 0 && (
        <>
          <p className="step-label">{t('start.missions')}</p>
          <div className="tpl-grid" role="radiogroup" aria-label={t('start.missions')}>
            {missions.map((m) => (
              <button key={m.id} className="pick-card mission-card" role="radio" aria-checked={effTpl === `mission:${m.id}`} disabled={!tplOk(`mission:${m.id}`)} onClick={() => setTpl(`mission:${m.id}`)} data-testid={`mission-${m.id}`}>
                <span className="art">{m.materials.includes(mat.kind) ? <MissionArt id={m.id} mat={mat} /> : null}</span>
                <span className="cap">
                  <strong>{t(m.title)}</strong>
                  <small>{t(m.description)}</small>
                  <ul className="goal-list" aria-label={t('start.missionGoals')}>
                    {m.goals.map((g) => (
                      <li key={g.id}>{t(g.label, g.vars)}</li>
                    ))}
                  </ul>
                </span>
                <span className="tick-mark">
                  <Icon name="check" size={16} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="start-foot">
        <p className="note">
          {t('mat.calibrate')}
          {tourOk && toured && (
            <button className="link tour-link" onClick={() => useStore.getState().startTour()} data-testid="tour-link">
              {t('tour.link')}
            </button>
          )}
        </p>
        <button className="primary go" onClick={start} data-testid="start-go">
          {t('start.go')}
        </button>
      </div>
    </div>
  );
}

function MissionArt({ id, mat }: { id: string; mat: MaterialProfile }) {
  const src = useMemo(() => missionThumb(id, mat), [id, mat]);
  return src ? <img src={src} alt="" /> : null;
}
