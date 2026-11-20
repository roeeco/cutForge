// Guided's gallery (milestone 106, GUIDED_MODE.md §3.1): *What do you want to make?* Large cards, each with
// the thing drawn by the real renderer; one tap starts it. No material step: the class's board, or four chips.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useT } from '../store/store';
import { DEFAULT_MATERIAL, MATERIALS } from '../model/materials';
import type { MaterialProfile } from '../model/types';
import { renderThumbnail } from '../views/thumbnail';
import { listDesigns, type DesignMeta } from '../store/persist';
import { openFromLibrary, Library } from '../ui/Library';
import { openProjectFile } from '../ui/openFile';
import { MaterialArt } from '../ui/MaterialArt';
import { Icon, Logo } from '../ui/icons';
import { setMode } from '../easy/mode';
import { thingsFor, type Thing } from './things';

const thumbs = new Map<string, string | null>();
function thumbOf(th: Thing, m: MaterialProfile): string | null {
  const key = `thing:${th.id}:${m.id}:${m.thickness}`;
  if (!thumbs.has(key)) {
    try {
      thumbs.set(key, renderThumbnail(th.start(m), 520, 300));
    } catch {
      thumbs.set(key, null);
    }
  }
  return thumbs.get(key) ?? null;
}

/** The board a thing starts in: the class's, else the one last chosen here, else plywood. */
export function guidedMaterial(p: { classMaterial?: MaterialProfile; guidedMaterial?: string }): MaterialProfile {
  return p.classMaterial ?? MATERIALS.find((m) => m.id === p.guidedMaterial) ?? DEFAULT_MATERIAL;
}

/** Start a thing: its design, named as its card, opened at Build, the gallery closed. */
export function startThing(th: Thing, m: MaterialProfile, name: string) {
  const st = useStore.getState();
  const d = th.start(m);
  if (!d.name) d.name = name;
  st.replaceDesign(d, false);
  useStore.setState({ guidedStep: 'build', view: '3d' });
}

function Card({ th, m }: { th: Thing; m: MaterialProfile }) {
  const t = useT();
  const ok = th.can(m);
  const [src, setSrc] = useState<string | null>(null);
  // drawn after the gallery shows, one card at a time
  useEffect(() => {
    if (!ok) return setSrc(null);
    const h = setTimeout(() => setSrc(thumbOf(th, m)), 0);
    return () => clearTimeout(h);
  }, [th.id, m.id, m.thickness, ok]);
  return (
    <button className={`g-card${ok ? '' : ' off'}`} disabled={!ok} onClick={() => startThing(th, m, t(th.title))} data-testid={`g-thing-${th.id}`} aria-describedby={ok ? undefined : `g-why-${th.id}`}>
      <span className="art">{src ? <img src={src} alt="" /> : null}</span>
      <span className="cap">
        {th.mission && <span className="g-tag">{t('g.start.mission')}</span>}
        <strong>{t(th.title)}</strong>
        <small>{ok ? t(th.blurb) : <span id={`g-why-${th.id}`}>{t(th.why ?? 'g.thing.cartonNo')}</span>}</small>
      </span>
    </button>
  );
}

export function GuidedStart() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const prefs = useStore((s) => s.viewPrefs);
  const hasOpen = useStore((s) => s.design.order.length > 0);
  // the open design's board while the student has not picked one here (milestone 137, REPORT.md B1: a plywood
  // design opened the gallery on card)
  const open = useStore((s) => (s.design.order.length ? s.design.material : null));
  const m = !prefs.classMaterial && !prefs.guidedMaterial && open ? (MATERIALS.find((x) => x.id === open.id) ?? guidedMaterial(prefs)) : guidedMaterial(prefs);
  const things = useMemo(() => thingsFor(prefs.missions), [prefs.missions]);
  const [recent, setRecent] = useState<DesignMeta[]>([]);
  const [all, setAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    listDesigns()
      .then((l) => setRecent(l.live.filter((x) => x.boards > 0).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3)))
      .catch(() => setRecent([]));
  }, []);
  const matName = (x: MaterialProfile) => (MATERIALS.some((b) => b.nameKey === x.nameKey) ? t(x.nameKey as 'mat.ply3') : t('mat.customNamed', { mm: x.thickness }));
  return (
    <div className="start g-start" role="dialog" aria-modal="true" aria-labelledby="g-start-title" data-testid="g-start">
      <div className="start-head">
        <div className="brand">
          <Logo />
        </div>
        <div className="spacer" />
        <button className="lang" onClick={() => useStore.getState().setLang(lang === 'en' ? 'he' : 'en')} lang={lang === 'en' ? 'he' : 'en'} data-testid="g-start-lang">
          {t('lang.toggle')}
        </button>
      </div>
      <h1 id="g-start-title">{t('g.start.title')}</h1>

      {recent.length > 0 && (
        <div className="g-recent" data-testid="g-recent">
          {recent.map((r) => (
            <button key={r.id} className="g-keep" onClick={() => void openFromLibrary(r.id)} data-testid={`g-keep-${r.id}`}>
              <span className="art">{r.thumb ? <img src={r.thumb} alt="" /> : null}</span>
              <span dir="auto">{t('g.start.keep', { name: r.name || t('g.untitled') })}</span>
            </button>
          ))}
          <button className="link g-all" onClick={() => setAll((a) => !a)} aria-expanded={all} data-testid="g-all">
            {t('g.start.all')}
          </button>
        </div>
      )}
      {all && <Library />}
      {hasOpen && !recent.length && (
        <button className="lib-back" onClick={() => useStore.setState({ needsMaterial: false })} data-testid="g-back">
          {t('g.start.back')}
        </button>
      )}

      {prefs.classMaterial ? (
        <p className="g-class-mat" data-testid="g-class-material">
          <span className="swatch-art">
            <MaterialArt kind={prefs.classMaterial.kind} thickness={prefs.classMaterial.thickness} />
          </span>
          {t('g.start.classMaterial', { material: matName(prefs.classMaterial) })}
        </p>
      ) : (
        <div className="g-chips" role="radiogroup" aria-label={t('g.start.material')} data-testid="g-materials">
          {MATERIALS.map((x) => (
            <button key={x.id} role="radio" aria-checked={x.id === m.id} className={x.id === m.id ? 'on' : ''} onClick={() => useStore.getState().setPrefs({ guidedMaterial: x.id })} data-testid={`g-mat-${x.id}`}>
              {t(x.nameKey as 'mat.ply3')}
            </button>
          ))}
        </div>
      )}

      <div className="g-cards" data-testid="g-cards">
        {things.map((th) => (
          <Card key={th.id} th={th} m={m} />
        ))}
      </div>

      <div className="g-start-foot">
        <button className="ghost" onClick={() => fileRef.current?.click()} data-testid="g-start-open">
          <Icon name="open" /> {t('g.start.open')}
        </button>
        {!prefs.modeLocked && (
          <button
            className="ghost"
            onClick={() => {
              setMode('quick');
              useStore.setState({ needsMaterial: true });
            }}
            data-testid="g-start-more"
          >
            <Icon name="box" /> {t('g.start.more')}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,.cutforge.json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openProjectFile(f, t);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
