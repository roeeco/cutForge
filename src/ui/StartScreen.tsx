// First screen of a new design: what are you making? Step 1 the material, with *New blank design* in the same row;
// step 2 a sentence or a card of styles, each with its own Start, and (Quick build) missions that start on a click.
import { useMemo, useState } from 'react';
import { TOUR_OFFERED } from '../tour/TourNudge';
import { tourDone, useStore, useT } from '../store/store';
import { defaults, generate, templateById } from '../templates/registry';
import { Sentence } from '../sentence/Sentence';
import { StyleCards } from '../sentence/StyleCards';
import { chooseMaterial, type Change } from '../sentence/resolve';
import type { SentenceValue } from '../sentence/model';
import { DEFAULT_MATERIAL, MATERIALS } from '../model/materials';
import { createDesign, setMaterial } from '../model/ops';
import { createWaffleDesign } from '../sculpt/ops';
import { Library } from './Library';
import type { MaterialProfile } from '../model/types';
import { Icon, Logo } from './icons';
import { MaterialArt } from './MaterialArt';
import { renderThumbnail } from '../views/thumbnail';
import { MISSIONS, missionById, startMission } from '../easy/missions';
import { shown, useFeature, useMode } from '../easy/features';

const thumbCache = new Map<string, string | null>();
function missionThumb(id: string, m: MaterialProfile): string | null {
  const key = `mission:${id}:${m.id}`;
  if (!thumbCache.has(key)) {
    const ms = missionById(id);
    thumbCache.set(key, ms ? renderThumbnail(startMission(ms, m), 520, 300) : null);
  }
  return thumbCache.get(key) ?? null;
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
  const [sentence, setSentence] = useState<SentenceValue>(() => ({ id: 'box', params: defaults(templateById('box')!) }));
  const [notes, setNotes] = useState<Change[]>([]);
  // milestone C1: step 2 as the sentence (the default) or as cards of the same styles
  const cardsOk = shown(useFeature('start.cards'));
  const setPrefs = useStore((s) => s.setPrefs);
  const startView = useStore((s) => (cardsOk ? (s.viewPrefs.startView ?? 'sentence') : 'sentence'));
  // opened from the project menu over a design: a way back to it
  const back = useStore((s) => s.design.order.length > 0);
  // the first-use tour (milestone 43): a card until it was taken or ended, then a link; not when the class locks Quick build
  const [toured] = useState(tourDone);
  const tourOk = useStore((s) => TOUR_OFFERED && !(s.viewPrefs.modeLocked && s.viewPrefs.mode === 'quick'));
  // Quick build offers missions next to the templates (milestone 40); a class may choose which
  const quick = useMode() === 'quick';
  const offered = useStore((s) => s.viewPrefs.missions);
  const missions = quick ? MISSIONS.filter((m) => !offered || offered.includes(m.id)) : [];
  const mat = MATERIALS.find((m) => m.id === matId)!;
  // milestone 120: a sculpture design (Workshop only)
  const shapesOk = shown(useFeature('start.shapes'));
  const tplOk = (id: string) => !id || id === 'sentence' || (id === 'shapes' && shapesOk) || (id.startsWith('mission:') ? !!missionById(id.slice(8))?.materials.includes(mat.kind) : !!templateById(id)?.materials.includes(mat.kind));
  // step 1 sets what the sentence can say: a word this material cannot make becomes what it can, with a note
  const pickMaterial = (id: string) => {
    const m = MATERIALS.find((x) => x.id === id)!;
    const r = chooseMaterial(templateById(sentence.id)!, m, sentence.params, templateById);
    setMatId(id);
    setSentence({ id: r.def.id, params: r.params });
    setNotes(r.changes);
  };
  // each way in starts itself (the welcome screen's redesign, 20 November): no choice to make first, then Start
  const start = (what: string) => {
    const s = useStore.getState();
    const ms = what.startsWith('mission:') ? missionById(what.slice(8)) : undefined;
    const tp = what === 'sentence' ? templateById(sentence.id) : null;
    if (what === 'shapes') s.replaceDesign(createWaffleDesign(mat), false);
    else if (ms) s.replaceDesign(startMission(ms, mat), false);
    else if (tp) s.replaceDesign(generate(tp, mat, sentence.params), false);
    else if (s.design.order.length) {
      // from the library with a design open: a new one beside it (the open one is saved)
      s.replaceDesign(createDesign(mat), false);
    } else {
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
      {/* milestone 86: the designs kept in this browser, above starting a new one */}
      <Library />
      {back && (
        <button className="lib-back" onClick={() => useStore.setState({ needsMaterial: false })} data-testid="lib-back">
          {t('lib.back')}
        </button>
      )}
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
          <button key={m.id} className="pick-card" role="radio" aria-checked={m.id === matId} aria-label={t(m.nameKey as 'mat.ply3')} onClick={() => pickMaterial(m.id)} onDoubleClick={() => start('')} data-testid={`mat-${m.id}`} title={m.kind === 'plywood' ? t('mat.joints.ply') : t('mat.joints.paper')}>
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
        {/* a blank design in the material chosen, in the materials' own row */}
        <button className="pick-card start-blank primary" onClick={() => start('')} title={t('start.blankDesc')} data-testid="start-go">
          <span className="art" aria-hidden>
            <Icon name="plus" size={36} />
          </span>
          <span className="cap">
            <strong>{t('start.newBlank')}</strong>
            <small>{t('start.newBlankIn', { material: t(mat.nameKey as 'mat.ply3') })}</small>
          </span>
        </button>
      </div>

      <p className="step-label">
        <b>{t('start.step', { n: 2 })}</b> {t('start.template')}
      </p>
      <div className="start-from" aria-label={t('start.template')}>
        {shapesOk && (
          // milestone 120: build a form from shapes, then fold it or build it from boards; nothing to set, so it starts
          <button className="pick-row start-row" onClick={() => start('shapes')} data-testid="tpl-shapes">
            <span className="cap">
              <strong>{t('start.shapes')}</strong>
              <small>{t('start.shapesDesc')}</small>
            </span>
            <Icon name="chevRight" size={18} />
          </button>
        )}
        {/* milestone 98: presets said instead of picked (SENTENCE_BUILDER_PLAN.md); milestone C1: or picked from cards of named styles */}
        {cardsOk && (
          <div className="start-view" role="group" aria-label={t('start.view')}>
            <span className="seg">
              {(['sentence', 'cards'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={startView === v} className={startView === v ? 'on' : ''} onClick={() => setPrefs({ startView: v === 'sentence' ? undefined : v })} data-testid={`start-view-${v}`}>
                  {t(`start.view.${v}`)}
                </button>
              ))}
            </span>
          </div>
        )}
        <div className={`pick-row sentence-row${startView === 'cards' ? ' cards' : ''}`} role="group" aria-label={startView === 'cards' ? t('start.cards') : t('sen.legend')} data-testid="sentence-row">
          {startView === 'cards' ? (
            <StyleCards m={mat} value={sentence} selected onChange={(v, ch) => (setSentence(v), setNotes(ch))} />
          ) : (
            <Sentence m={mat} value={sentence} onChange={(v) => setSentence(v)} notes={notes} />
          )}
          {/* its own, smaller Start: the sentence as it reads, or the style card picked */}
          <button className="primary start-small" onClick={() => start('sentence')} data-testid={startView === 'cards' ? 'start-cards' : 'start-sentence'}>
            {t('start.go')}
          </button>
        </div>
      </div>
      {missions.length > 0 && (
        <>
          <p className="step-label">{t('start.missions')}</p>
          <div className="tpl-grid" aria-label={t('start.missions')}>
            {missions.map((m) => (
              <button key={m.id} className="pick-card mission-card" disabled={!tplOk(`mission:${m.id}`)} onClick={() => start(`mission:${m.id}`)} data-testid={`mission-${m.id}`}>
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
      </div>
    </div>
  );
}

function MissionArt({ id, mat }: { id: string; mat: MaterialProfile }) {
  const src = useMemo(() => missionThumb(id, mat), [id, mat]);
  return src ? <img src={src} alt="" /> : null;
}
