// First screen of a new design (the welcome redesign of 20 November, docs/welcome-ux-review-2026-11-20): *Keep working*
// on the last design; the material as chips, for every way in; then three equal ways in: *Describe it* (the sentence, its
// picture and Start), *Start blank*, and *Build from shapes* (Workshop) or *Follow a mission* (Quick build, which shows
// its missions in the composer); then the designs kept in this browser. No gallery: the sentence's lists hold the styles,
// and only one picture is drawn at a time. Guided has its own gallery (GuidedStart).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { TOUR_OFFERED } from '../tour/TourNudge';
import { tourDone, useStore, useT } from '../store/store';
import { defaults, generate, templateById } from '../templates/registry';
import { Sentence } from '../sentence/Sentence';
import { chooseMaterial, type Change } from '../sentence/resolve';
import type { SentenceValue } from '../sentence/model';
import { DEFAULT_MATERIAL, MATERIALS } from '../model/materials';
import { createDesign, setMaterial } from '../model/ops';
import { createWaffleDesign } from '../sculpt/ops';
import { Library, openFromLibrary } from './Library';
import type { MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import { Icon, Logo } from './icons';
import { designPicture, MISSION_PROP } from '../views/picture';
import { listDesigns, loadDesign, type DesignMeta } from '../store/persist';
import { migrateDesign } from '../model/serialize';
import { missionById, startMission, type Mission } from '../easy/missions';
import { CATALOGUE, catalogueMissions } from '../templates/catalogue';
import { shown, useFeature, useMode } from '../easy/features';

const thumbCache = new Map<string, string | null>();
function missionThumb(id: string, m: MaterialProfile, w: number, h: number): string | null {
  const key = `mission:${id}:${m.id}:${w}`;
  if (!thumbCache.has(key)) {
    const ms = missionById(id);
    let src: string | null = null;
    try {
      src = ms ? designPicture(startMission(ms, m), w, h, { prop: MISSION_PROP[id] }) : null;
    } catch {
      src = null;
    }
    thumbCache.set(key, src);
  }
  return thumbCache.get(key) ?? null;
}

/** The welcome screen's pictures (public/welcome; made from the prompts in docs/welcome-ux-review-2026-11-20 §8). */
const pic = (name: string) => `${import.meta.env.BASE_URL}welcome/${name}`;
/** A material's chip picture: its cut edge close up (*mat.corr16* → mat-corr16.jpg). */
const chipPic = (m: MaterialProfile) => pic(`${m.nameKey.replace(/^mat\./, 'mat-')}.jpg`);

/** A material's short name for its chip (*Corrugated 1.6*); the full one is its label. */
const shortName = (m: MaterialProfile) => m.nameKey.replace(/^mat\./, 'mat.short.') as MsgKey;

export function StartScreen() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const [matId, setMatId] = useState(DEFAULT_MATERIAL.id);
  const [sentence, setSentence] = useState<SentenceValue>(() => ({ id: 'box', params: defaults(templateById('box')!) }));
  const [notes, setNotes] = useState<Change[]>([]);
  // Quick build's *Follow a mission*: the mission shown in the composer until Start mission or *Back to the sentence*
  const [missionId, setMissionId] = useState<string | null>(null);
  // opened from the project menu over a design: *Continue* goes back to it
  const open = useStore((s) => (s.design.order.length > 0 ? s.design : null));
  // the first-use tour (milestone 43): offered until it was taken or ended; not when the class locks Quick build
  const [toured] = useState(tourDone);
  const tourOk = useStore((s) => TOUR_OFFERED && !(s.viewPrefs.modeLocked && s.viewPrefs.mode === 'quick'));
  // Quick build offers missions (milestone 40); a class may choose which
  const quick = useMode() === 'quick';
  const offered = useStore((s) => s.viewPrefs.missions);
  const mat = MATERIALS.find((m) => m.id === matId)!;
  // only what this material can make is offered (hidden, never greyed)
  const missions = quick ? catalogueMissions().filter((m) => (!offered || offered.includes(m.id)) && m.materials.includes(mat.kind)) : [];
  const mission = missions.find((m) => m.id === missionId);
  // milestone 120: a sculpture design (Workshop only)
  const shapesOk = shown(useFeature('start.shapes'));

  // the newest design kept in this browser, for *Keep working* when no design is open
  const [recent, setRecent] = useState<DesignMeta | null>(null);
  const [hasLibrary, setHasLibrary] = useState(false);
  useEffect(() => {
    listDesigns()
      .then((l) => {
        setHasLibrary(l.live.length > 0 || l.deleted.length > 0);
        setRecent(l.live.filter((x) => x.boards > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null);
      })
      .catch(() => setRecent(null));
  }, []);
  const openThumb = useMemo(() => {
    if (!open) return null;
    try {
      return designPicture(open, 240, 140);
    } catch {
      return null;
    }
  }, [open]);
  // the kept design's card has no picture (autosave stores none), so it is drawn here from the design itself
  const [recentThumb, setRecentThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!recent || open) return;
    if (recent.thumb) return setRecentThumb(recent.thumb);
    let live = true;
    loadDesign(recent.id)
      .then((raw) => {
        if (live && raw) setRecentThumb(designPicture(migrateDesign(raw), 240, 140));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [recent, open]);

  // the material sets what the sentence can say: a word this material cannot make becomes what it can, with a note
  const pickMaterial = (id: string) => {
    const m = MATERIALS.find((x) => x.id === id)!;
    const r = chooseMaterial(templateById(sentence.id)!, m, sentence.params, templateById);
    setMatId(id);
    setSentence({ id: r.def.id, params: r.params });
    setNotes(r.changes);
  };
  const start = (what: string) => {
    const s = useStore.getState();
    const ms = what.startsWith('mission:') ? missionById(what.slice(8)) : undefined;
    const tp = what === 'sentence' ? templateById(sentence.id) : null;
    if (what === 'shapes') s.replaceDesign(createWaffleDesign(mat), false);
    else if (ms) s.replaceDesign(startMission(ms, mat), false);
    else if (tp) s.replaceDesign(generate(tp, mat, sentence.params), false);
    else if (s.design.order.length) {
      // a design is open: a new blank one beside it (the open one is saved)
      s.replaceDesign(createDesign(mat), false);
    } else {
      s.apply((d) => setMaterial(d, mat));
      useStore.setState({ past: [], future: [], needsMaterial: false });
    }
  };
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' });
  const toLibrary = () => document.getElementById('start-library')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const chips = (
    <div className="mat-chips" role="radiogroup" aria-label={t('start.material')}>
      {MATERIALS.map((m) => (
        <button
          key={m.id}
          type="button"
          className="mat-chip"
          role="radio"
          aria-checked={m.id === matId}
          aria-label={t(m.nameKey as 'mat.ply3')}
          title={m.kind === 'plywood' ? t('mat.joints.ply') : t('mat.joints.paper')}
          onClick={() => pickMaterial(m.id)}
          onDoubleClick={() => start('')}
          data-testid={`mat-${m.id}`}
        >
          <span className="swatch" aria-hidden>
            <img src={chipPic(m)} alt="" />
          </span>
          {t(shortName(m))}
        </button>
      ))}
    </div>
  );
  // the three ways in, equal: describe it (the composer), start blank, build from shapes (Workshop), all in the material chosen above
  const way = (testId: string, art: ReactNode, title: string, line: string, go: () => void) => (
    <button type="button" className="way-card" onClick={go} data-testid={testId}>
      <span className="art" aria-hidden>
        {art}
      </span>
      <span className="cap">
        <strong>{title}</strong>
        <small>{line}</small>
      </span>
      <span className="way-go" aria-hidden>
        <Icon name="chevRight" size={18} />
      </span>
    </button>
  );
  const keepImg = open ? openThumb : recentThumb;

  return (
    <div className="start cs" role="dialog" aria-modal="true" aria-labelledby="start-title" data-testid="material-dialog">
      <div className="cs-wrap">
        <div className="start-head">
          <div className="brand">
            <Logo />
            <span>{t('app.name')}</span>
          </div>
          <div className="spacer" />
          {(hasLibrary || open) && (
            <button className="link cs-head-link" onClick={toLibrary} data-testid="start-designs">
              {t('lib.title')}
            </button>
          )}
          <button className="lang" onClick={() => setLang(lang === 'en' ? 'he' : 'en')} title={t('lang.toggleTitle')} data-testid="lang-toggle-dialog">
            {t('lang.toggle')}
          </button>
        </div>

        {/* keep working: the design open now (opened from the project menu), else the newest one kept here */}
        {(open || recent) && (
          <div className="keep-strip" data-testid="keep-strip">
            <span className="art" aria-hidden>
              {keepImg && <img src={keepImg} alt="" />}
            </span>
            <span className="cap">
              <strong dir="auto">{(open ? open.name : recent!.name) || t('top.untitled')}</strong>
              <small>{open ? t('start.openNow', { material: t(open.material.nameKey as 'mat.ply3') }) : t('start.edited', { date: date(recent!.updatedAt) })}</small>
            </span>
            {open ? (
              <button className="primary" onClick={() => useStore.setState({ needsMaterial: false })} data-testid="lib-back">
                {t('start.continue')}
              </button>
            ) : (
              <button className="primary" onClick={() => void openFromLibrary(recent!.id)} data-testid="keep-open">
                {t('start.continue')}
              </button>
            )}
          </div>
        )}

        <h1 id="start-title">{t('start.title')}</h1>
        <div className="cs-mats">
          <span className="cs-mats-label" aria-hidden>
            {t('start.material')}
          </span>
          {chips}
        </div>

        <div className="cs-top">
        <section className="composer" aria-labelledby="start-title" data-testid="sentence-row">
          {mission ? (
            <MissionView m={mission} all={missions} mat={mat} onPick={setMissionId} onStart={() => start(`mission:${mission.id}`)} onBack={() => setMissionId(null)} />
          ) : (
            <Sentence
              m={mat}
              value={sentence}
              onChange={(v) => setSentence(v)}
              notes={notes}
              picture={[520, 380]}
              top={<h2 className="cs-way-title">{t('start.describe')}</h2>}
              actions={
                <div className="composer-actions">
                  <button className="primary go" onClick={() => start('sentence')} data-testid="start-sentence">
                    {t('start.go')}
                  </button>
                </div>
              }
            />
          )}
        </section>
        <div className="cs-ways">
          {way('start-go', <img src={pic('way-blank.jpg')} alt="" />, t('start.blank'), t('start.blankIn', { material: t(mat.nameKey as 'mat.ply3') }), () => start(''))}
          {shapesOk && way('tpl-shapes', <img src={pic('way-shapes.jpg')} alt="" />, t('start.shapesLink'), t('start.shapesLine'), () => start('shapes'))}
          {missions.length > 0 && way('start-missions', <img src={pic('way-mission.jpg')} alt="" />, t('start.missionsWay'), t('start.missionsLine'), () => setMissionId(missions[0].id))}
        </div>
        </div>

        {/* milestone 86: the designs kept in this browser; *Your designs* in the header scrolls here */}
        <div id="start-library" className="cs-library">
          <Library />
        </div>

        <div className="start-foot">
          <p className="note">{t('mat.calibrate')}</p>
          <span className="cs-foot-links">
            {tourOk && (
              <button className="link" onClick={() => useStore.getState().startTour()} data-testid={toured ? 'tour-link' : 'tour-start'}>
                {t(toured ? 'tour.link' : 'tour.take')}
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * *Follow a mission* in the composer: the missions as a row of names (one picture drawn, the one picked), then its
 * name, line and goals, *Start mission* and the way back to the sentence.
 */
function MissionView(props: { m: Mission; all: Mission[]; mat: MaterialProfile; onPick: (id: string) => void; onStart: () => void; onBack: () => void }) {
  const t = useT();
  const { m } = props;
  return (
    <div className="sentence mission-view" data-testid="start-mission-panel" data-mission={m.id}>
      <div className="sen-picture" role="img" aria-label={t(m.title)}>
        <MissionArt id={m.id} mat={props.mat} />
      </div>
      <div className="sen-body">
        <h2 className="cs-way-title">{t('start.missionsWay')}</h2>
        <div className="mission-chips" role="radiogroup" aria-label={t('start.missionsWay')}>
          {props.all.map((x) => (
            <button key={x.id} type="button" className="mat-chip" role="radio" aria-checked={x.id === m.id} onClick={() => props.onPick(x.id)} data-testid={`mission-${x.id}`}>
              {t(x.title)}
            </button>
          ))}
        </div>
        <h3>{t(m.title)}</h3>
        {/* milestone 153: a mission is a challenge on one of the catalogue's cards */}
        {challengeCard(m.id) && (
          <p className="note" data-testid="mission-card">
            {t('start.challengeOf', { card: t(challengeCard(m.id)!) })}
          </p>
        )}
        <p>{t(m.description)}</p>
        <ul className="goal-list" aria-label={t('start.missionGoals')}>
          {m.goals.map((g) => (
            <li key={g.id}>{t(g.label, g.vars)}</li>
          ))}
        </ul>
        <div className="composer-actions">
          <button className="primary go" onClick={props.onStart} data-testid="start-mission">
            {t('start.startMission')}
          </button>
          <button type="button" className="link" onClick={props.onBack} data-testid="start-mission-back">
            <span className="back-chev"><Icon name="chevRight" size={14} /></span> {t('start.backToSentence')}
          </button>
        </div>
      </div>
    </div>
  );
}




function MissionArt({ id, mat }: { id: string; mat: MaterialProfile }) {
  const src = useMemo(() => missionThumb(id, mat, 520, 380), [id, mat]);
  return src ? <img src={src} alt="" /> : null;
}

/** The card a mission is a challenge on (milestone 153). */
const challengeCard = (id: string) => CATALOGUE.find((c) => c.challenges.includes(id))?.title;
