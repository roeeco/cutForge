// The presets' contact sheet (milestone 146, PRESETS_OVERHAUL.md §5.4; development only: `?presets&mat=<id>`):
// every list a student picks a preset from (the sentence's first word from the welcome screen's first sentence,
// Guided's gallery, the missions), each entry drawn as the app draws it, under its card's name. Each picture is
// also hashed at list size (96 × 64, a difference hash) and the pairs in one list that look alike are listed: the
// browser spec (tests/e2e/preset-sheet.spec.ts) reads them from `data-pairs` and screenshots the sheet.
import { useEffect, useMemo, useState } from 'react';
import { MATERIALS } from '../model/materials';
import type { Design, MaterialProfile } from '../model/types';
import { defaults, generate, templateById } from '../templates/registry';
import { catalogueMissions, entryChoice, guidedCan, guidedEntries, sentenceEntries, variantOfValue, cardOfDesign } from '../templates/catalogue';
import { guidedDesign } from '../templates/guidedDesigns';
import { styleById, styleName, styleOf } from '../templates/styles';
import { startMission } from '../easy/missions';
import { designPicture, MISSION_PROP } from '../views/picture';
import { useT } from '../store/store';
import type { MsgKey } from '../i18n';
import type { Prop } from '../views/illustrate';

type Tile = { list: 'sentence' | 'guided' | 'missions'; id: string; card: MsgKey | null; name: string; src: string | null };

/** The hash distance at or under which two pictures count as looking alike (64 bits). */
export const LOOKALIKE_BITS = 6;

/** A difference hash of a picture drawn at 96 × 64 (the sentence list's size): 64 bits as a string of 0 and 1. */
function dHash(src: string): Promise<string> {
  return new Promise((done) => {
    const img = new Image();
    img.onload = () => {
      const big = document.createElement('canvas');
      big.width = 96;
      big.height = 64;
      big.getContext('2d')!.drawImage(img, 0, 0, 96, 64);
      const c = document.createElement('canvas');
      c.width = 9;
      c.height = 8;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(big, 0, 0, 9, 8);
      const px = g.getImageData(0, 0, 9, 8).data;
      // transparent (the background) counts as white
      const lum = (i: number) => {
        const a = px[i + 3] / 255;
        return (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * a + 255 * (1 - a);
      };
      let bits = '';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += lum((y * 9 + x) * 4) > lum((y * 9 + x + 1) * 4) ? '1' : '0';
      done(bits);
    };
    img.onerror = () => done('');
    img.src = src;
  });
}

const distance = (a: string, b: string) => [...a].filter((c, i) => c !== b[i]).length;

function tiles(m: MaterialProfile, t: (k: MsgKey) => string): Tile[] {
  const out: Tile[] = [];
  const draw = (d: Design | null, prop?: Prop) => {
    try {
      return d ? designPicture(d, 300, 200, { prop }) : null;
    } catch {
      return null;
    }
  };
  // the sentence's first word, from the welcome screen's first sentence
  const BOX = defaults(templateById('box')!);
  for (const v of sentenceEntries(m, BOX, 'box')) {
    const at = variantOfValue(v);
    const r = entryChoice(v, m, BOX, 'box');
    if (!at || !r) continue;
    const s = styleOf(r.id, r.params);
    const name = String(v).startsWith('style:') ? t(styleName(styleById(String(v).slice(6))!)) : t(templateById(r.id)!.word ?? templateById(r.id)!.name);
    out.push({ list: 'sentence', id: at.v.id, card: at.card.title, name: s && s.id !== at.v.id ? `${name} (${s.id})` : name, src: draw(generate(templateById(r.id)!, m, r.params), r.id === 'tray' ? 'sweets' : undefined) });
  }
  // Guided's plain things and ready shapes (its missions are the missions below)
  for (const { card, v, g } of guidedEntries()) {
    if (!guidedCan(v, g, m)) continue;
    out.push({ list: 'guided', id: g.id, card: card.title, name: t(g.title), src: draw(guidedDesign(v, g, m)) });
  }
  for (const ms of catalogueMissions()) {
    if (!ms.materials.includes(m.kind)) continue;
    const d = startMission(ms, m);
    out.push({ list: 'missions', id: ms.id, card: cardOfDesign(d)?.card.title ?? null, name: t(ms.title), src: draw(d, MISSION_PROP[ms.id]) });
  }
  return out;
}

export function PresetsDev() {
  const t = useT();
  const matId = new URLSearchParams(location.search).get('mat') ?? 'card-0.5';
  const m = MATERIALS.find((x) => x.id === matId) ?? MATERIALS[0];
  const all = useMemo(() => tiles(m, t), [m, t]);
  const [pairs, setPairs] = useState<{ list: string; a: string; b: string; bits: number }[] | null>(null);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void Promise.all(all.map((x) => (x.src ? dHash(x.src) : Promise.resolve('')))).then((h) => {
      if (!live) return;
      setHashes(Object.fromEntries(all.map((x, i) => [`${x.list}:${x.id}`, h[i]])));
      const out: { list: string; a: string; b: string; bits: number }[] = [];
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          if (all[i].list !== all[j].list || !h[i] || !h[j]) continue;
          const bits = distance(h[i], h[j]);
          if (bits <= LOOKALIKE_BITS) out.push({ list: all[i].list, a: all[i].id, b: all[j].id, bits });
        }
      setPairs(out);
    });
    return () => {
      live = false;
    };
  }, [all]);
  const lists = ['sentence', 'guided', 'missions'] as const;
  return (
    <div className="presets-dev" data-testid="presets-dev" data-ready={pairs ? '1' : '0'} data-pairs={JSON.stringify(pairs ?? [])} data-hashes={JSON.stringify(hashes)}>
      <style>{`
        .presets-dev { padding: 20px; font: 13px system-ui; background: #f7f2ea; min-height: 100vh; }
        .presets-dev h2 { font-size: 15px; margin: 18px 0 8px; }
        .presets-dev .grid { display: grid; grid-template-columns: repeat(6, 200px); gap: 10px; }
        .presets-dev figure { margin: 0; background: #fff; border-radius: 10px; padding: 6px; }
        .presets-dev img { width: 188px; height: 125px; display: block; background: #eef1f5; border-radius: 6px; }
        .presets-dev figcaption { padding: 4px 2px 0; line-height: 1.3; }
        .presets-dev figcaption b { display: block; }
        .presets-dev figcaption small { color: #6e655b; }
        .presets-dev .pairs { color: #9a3412; }
      `}</style>
      <h1>{`${t(m.nameKey as MsgKey)} · ${all.length}`}</h1>
      {lists.map((l) => (
        <section key={l}>
          <h2>{l}</h2>
          <div className="grid">
            {all
              .filter((x) => x.list === l)
              .map((x) => (
                <figure key={x.id} data-testid={`preset-${l}-${x.id}`}>
                  {x.src ? <img src={x.src} alt="" /> : <div className="img" />}
                  <figcaption>
                    <b>{x.card ? t(x.card) : x.id}</b>
                    <small>{`${x.name} · ${x.id}`}</small>
                  </figcaption>
                </figure>
              ))}
          </div>
        </section>
      ))}
      <p className="pairs" data-testid="presets-pairs">
        {(pairs ?? []).map((p) => `${p.list}: ${p.a} ~ ${p.b} (${p.bits})`).join(' · ')}
      </p>
    </div>
  );
}
