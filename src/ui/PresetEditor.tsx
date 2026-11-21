// Custom presets in the app (milestone 158, src/templates/custom.ts). In Workshop's settings card, *Make it a preset*:
// the open box or carton as a record, each slot a row of picture choices (one slot open at a time, so only its choices
// are built); a choice the engine refuses is greyed and says why; what the catalogue calls it; *Save as preset* into
// the library. On the start screen, *Your presets*: each saved preset a card of its own, started in the board chosen.
import { useEffect, useMemo, useState } from 'react';
import { useStore, useT } from '../store/store';
import type { MsgKey } from '../i18n';
import type { Design, MaterialProfile } from '../model/types';
import { checked, choicesFor, customCard, customOf, nameOf, setCorner, sizesOf, slotsOf, startFromPreset, withSlot, wordsOf, type Choice, type CustomRecord, type SavedPreset, type Slot } from '../templates/custom';
import { regenerate } from '../templates/registry';
import { styleById, styleName } from '../templates/styles';
import type { Card, Variant } from '../templates/catalogue';
import { deletePreset, listPresets, savePreset } from '../store/persist';
import { designPicture } from '../views/picture';
import { newId } from '../model/ops';

type Translate = ReturnType<typeof useT>;

/** A choice's words. */
function valueText(t: Translate, slot: Slot, v: string | number): string {
  switch (slot) {
    case 'body':
      return t(`custom.body.${v}` as MsgKey);
    case 'footprint':
      return t(`custom.footprint.${v}` as MsgKey);
    case 'sides':
      return String(v);
    case 'lid':
      return t(`sen.lid.${v}` as MsgKey);
    case 'corner':
      return t(`conn.${v}` as MsgKey);
    case 'top':
      return t(`sen.top.${v}` as MsgKey);
    case 'bottom':
      return t(`sen.bottom.${v}` as MsgKey);
    case 'window':
      return t(`sen.window.${v}` as MsgKey);
  }
}

/** A catalogue variant's name (its style's, else its card's). */
export function variantName(t: Translate, card: Card, v: Variant): string {
  const s = v.style ? styleById(v.style) : undefined;
  return card.name ?? (s ? t(styleName(s)) : t(card.title));
}

const pics = new Map<string, string | null>();
/** A record's picture at these sizes, small (cached). */
function recordPicture(m: MaterialProfile, r: CustomRecord, s: { width: number; depth: number; height: number }): string | null {
  const key = JSON.stringify([m.id, m.thickness, r, s]);
  if (!pics.has(key)) {
    let src: string | null = null;
    try {
      const d = checked(m, r, s).d;
      src = d ? designPicture(d, 96, 64) : null;
    } catch {
      src = null;
    }
    if (pics.size > 150) pics.clear();
    pics.set(key, src);
  }
  return pics.get(key) ?? null;
}

/** One line for the settings card's header. */
export function presetSummary(t: Translate, d: Design): string | null {
  const r = customOf(d);
  if (!r) return null;
  return slotsOf(r)
    .filter((s) => s !== 'window' || (r.window && r.window !== 'none'))
    .slice(0, 4)
    .map((s) => valueText(t, s, (r as Record<string, string | number>)[s] ?? ''))
    .join(' · ');
}

export function PresetEditor() {
  const t = useT();
  const d = useStore((s) => s.design);
  const rec = useMemo(() => customOf(d), [d]);
  const sizes = useMemo(() => sizesOf(d), [d]);
  const [open, setOpen] = useState<Slot>('body');
  const [why, setWhy] = useState<{ slot: Slot; text: string } | null>(null);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const m = d.material;
  const choices = useMemo(() => (rec ? choicesFor(m, rec, sizes, open) : []), [m, rec, sizes, open]);
  const named = useMemo(() => (rec ? nameOf(m, rec, sizes) : null), [m, rec, sizes]);
  if (!rec) return null;
  const pick = (slot: Slot, c: Choice) => {
    if (!c.ok) {
      setWhy({ slot, text: t(c.why ?? 'sen.why.engine') });
      return;
    }
    setWhy(null);
    setSaved(null);
    const next = withSlot(rec, slot, c.value);
    const st = useStore.getState();
    const cur = st.design;
    const w = wordsOf(next, sizes);
    if (slot === 'corner') {
      st.apply((x) => setCorner(x, c.value as Design['trays'][string]['cornerKind']));
      return;
    }
    // the same structure: its words changed, the student's work kept (as the template's own controls do)
    const built = cur.template?.id === w.structure ? regenerate(cur, { ...cur.template.params, ...w.params }).design : checked(m, next, sizes).d;
    if (!built) return;
    if (next.corner && slot !== 'body') setCorner(built, next.corner);
    st.apply((x) => {
      const keep = { id: x.id, name: x.name };
      Object.assign(x, JSON.parse(JSON.stringify(built)), keep);
    });
  };
  const save = async () => {
    const n = name.trim() || (named ? t('custom.near', { name: variantName(t, named.card, named.v) }) : t('card.custom'));
    const p: SavedPreset = { id: newId('pr'), name: n, record: rec, sizes, createdAt: Date.now() };
    try {
      await savePreset(p);
      setSaved(n);
      setName('');
    } catch {
      setSaved(null);
    }
  };
  return (
    <div className="preset-editor" data-testid="preset-editor">
      <p className="note">{t('custom.intro')}</p>
      {slotsOf(rec).map((slot) => {
        const cur = (rec as Record<string, string | number>)[slot];
        const isOpen = open === slot;
        return (
          <div className="field pictures-field" key={slot} data-testid={`preset-slot-${slot}`}>
            <button type="button" className="link preset-slot-head" aria-expanded={isOpen} onClick={() => setOpen(slot)} data-testid={`preset-head-${slot}`}>
              <span className="label">{t(`custom.slot.${slot}` as MsgKey)}</span> <span className="head-sum">{cur !== undefined ? valueText(t, slot, cur) : ''}</span>
            </button>
            {isOpen && (
              <span className="pictures" style={{ ['--n' as string]: Math.min(4, choices.length) }} role="radiogroup" aria-label={t(`custom.slot.${slot}` as MsgKey)}>
                {choices.map((c) => {
                  const label = valueText(t, slot, c.value);
                  const src = c.ok ? recordPicture(m, withSlot(rec, slot, c.value), sizes) : null;
                  return (
                    <button
                      key={String(c.value)}
                      type="button"
                      role="radio"
                      aria-checked={c.value === cur}
                      aria-disabled={!c.ok}
                      className={c.value === cur ? 'on' : c.ok ? '' : 'off'}
                      title={c.ok ? label : `${label}: ${t(c.why ?? 'sen.why.engine')}`}
                      onClick={() => pick(slot, c)}
                      data-testid={`preset-opt-${slot}-${c.value}`}
                      data-ok={c.ok}
                    >
                      {src ? <img src={src} alt="" width={96} height={64} /> : <span className="pic-blank" />}
                      <span className="pic-label">{label}</span>
                    </button>
                  );
                })}
              </span>
            )}
            {why?.slot === slot && (
              <p className="warn-text" role="status" data-testid="preset-why">
                {why.text}
              </p>
            )}
          </div>
        );
      })}
      {named && (
        <p className="note" data-testid="preset-name" data-same={named.same}>
          {t(named.same ? 'custom.same' : 'custom.near', { name: variantName(t, named.card, named.v) })}
        </p>
      )}
      {!named?.same && (
        <div className="field preset-save">
          <label htmlFor="preset-name-input">{t('custom.name')}</label>
          <input id="preset-name-input" dir="auto" value={name} onChange={(e) => setName(e.target.value)} data-testid="preset-name-input" />
          <button className="primary" onClick={() => void save()} data-testid="preset-save">
            {t('custom.save')}
          </button>
        </div>
      )}
      {saved && (
        <p className="note" role="status" data-testid="preset-saved">
          ✓ {t('custom.saved')}: {saved}
        </p>
      )}
    </div>
  );
}

/** The start screen's *Your presets*: each saved preset a card of its own, started in this board. */
export function MyPresets({ material }: { material: MaterialProfile }) {
  const t = useT();
  const [list, setList] = useState<SavedPreset[]>([]);
  const reload = () =>
    listPresets()
      .then(setList)
      .catch(() => setList([]));
  useEffect(() => void reload(), []);
  if (!list.length) return null;
  return (
    <section className="cs-presets" data-testid="my-presets">
      <h3 className="kicker">{t('custom.mine')}</h3>
      <div className="lib-grid">
        {list.map((p, i) => {
          const card = customCard(p, material);
          const d = checked(material, p.record, p.sizes).d;
          const src = d ? recordPicture(material, p.record, p.sizes) : null;
          return (
            <div className="lib-card" key={p.id} data-testid={`my-preset-${i}`} data-card={card.id}>
              <button
                className="lib-open"
                disabled={!d}
                title={d ? t('custom.open', { name: p.name }) : t('custom.why.board')}
                onClick={() => {
                  const start = startFromPreset(material, p);
                  if (start) useStore.getState().replaceDesign(start, false);
                }}
                data-testid={`my-preset-open-${i}`}
              >
                <span className="art">{src ? <img src={src} alt="" width={96} height={64} /> : <span className="pic-blank" />}</span>
                <span className="cap">
                  <strong dir="auto">{p.name}</strong>
                  <small>{t('card.custom')}</small>
                </span>
              </button>
              <div className="lib-actions">
                <button
                  className="ghost icon-btn"
                  title={t('custom.delete')}
                  aria-label={t('custom.delete')}
                  onClick={async () => {
                    await deletePreset(p.id);
                    await reload();
                  }}
                  data-testid={`my-preset-delete-${i}`}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
