// The welcome screen's card grid (milestone C1): the same named styles as the
// sentence's first word, as cards with a picture, a name, a line and what
// each is for. Picking a card fills in the sentence's words, so switching
// back to the sentence shows the same thing; only what the material can make
// is listed. The sentence is the default; the grid is a toggle beside it.
import { useEffect, useMemo, useState } from 'react';
import type { MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import { useT } from '../store/store';
import { templateById } from '../templates/registry';
import { STYLES, chooseStyle, styleDesc, styleListed, styleName, styleOf, type StyleDef } from '../templates/styles';
import type { Change } from './resolve';
import type { SentenceValue } from './model';
import { renderThumbnail } from '../views/thumbnail';
import { builtFor } from '../templates/structures/box';
import { Icon } from '../ui/icons';

const TINTS = ['#c9eedd', '#f8d3bd', '#ddd6f7', '#fbe8a8', '#c4e3f8', '#f6cddd'];
const pics = new Map<string, string | null>();

export function StyleCards(props: { m: MaterialProfile; value: SentenceValue; selected: boolean; onChange: (v: SentenceValue, changes: Change[]) => void }) {
  const t = useT();
  const { m, value } = props;
  const listed = useMemo(() => STYLES.filter((s) => styleListed(s, m, value.params, templateById)), [m, value.params]);
  const cur = props.selected ? styleOf(value.id, value.params) : null;
  // each card's picture at the sentence's current sizes, one after another so the grid shows at once
  const [imgs, setImgs] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let live = true;
    let k = 0;
    const next = () => {
      if (!live || k >= listed.length) return;
      const s = listed[k++];
      const r = chooseStyle(s, m, value.params, templateById);
      const key = JSON.stringify([s.id, m.id, r?.params]);
      if (!pics.has(key)) {
        let src: string | null = null;
        try {
          src = r ? renderThumbnail(builtFor(templateById(r.id)!, m, r.params), 260, 170) : null;
        } catch {
          src = null;
        }
        if (pics.size > 200) pics.delete(pics.keys().next().value!);
        pics.set(key, src);
      }
      setImgs((x) => ({ ...x, [s.id]: pics.get(key) ?? null }));
      setTimeout(next, 0);
    };
    const h = setTimeout(next, 0);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [listed, m, value.params]);

  const pick = (s: StyleDef) => {
    const r = chooseStyle(s, m, value.params, templateById);
    if (r) props.onChange({ id: r.id, params: r.params }, r.changes);
  };
  if (!listed.length) return <p className="note">{t('start.cardsNone')}</p>;
  return (
    <div className="tpl-grid style-grid" role="radiogroup" aria-label={t('start.cards')} data-testid="style-cards">
      {listed.map((s, i) => (
        <button key={s.id} className="pick-card style-card" role="radio" aria-checked={cur?.id === s.id} onClick={() => pick(s)} data-testid={`style-${s.id}`}>
          <span className="art" style={{ background: TINTS[i % TINTS.length] }}>
            {imgs[s.id] ? <img src={imgs[s.id]!} alt="" /> : null}
          </span>
          <span className="cap">
            <strong>{t(styleName(s))}</strong>
            <small>{t(styleDesc(s))}</small>
            <span className="style-tags">
              {s.uses.map((u) => (
                <span key={u} className="style-tag">
                  {t(`style.use.${u}` as MsgKey)}
                </span>
              ))}
            </span>
          </span>
          <span className="tick-mark">
            <Icon name="check" size={16} />
          </span>
        </button>
      ))}
    </div>
  );
}
