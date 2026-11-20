// The sentence (milestone 97, SENTENCE_BUILDER_PLAN.md §4): one whole
// sentence per language with its words as buttons and number fields, the
// add-on clauses with × and *+ more*, a line of values measured on the built
// design, the change notes (read out from a live region), and a picture
// rebuilt 150 ms after the last change. Under 600 px wide the same words are
// labelled rows. The material is the welcome screen's step 1.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import { useStore, useT } from '../store/store';
import { STRUCTURES, templateById } from '../templates/registry';
import { makes, type ParamDef, type TemplateDef } from '../templates/types';
import { choose, chooseStructure, listOf, rangeNow, resolve, type Change, type Value } from './resolve';
import { addable, clausesOf, parts, readout, type Readout, type SentenceValue } from './model';
import { Word } from './Word';
import { NumberWord, type NumRange } from './NumberWord';
import { designPicture } from '../views/picture';
import { builtFor } from '../templates/structures/box';
import { GROUPS, STRUCTURE_GROUP, STYLES, chooseStyle, isAlias, styleById, styleDesc, styleListed, styleName, styleOf, styleWord } from '../templates/styles';

const pics = new Map<string, string | null>();
function picture(def: TemplateDef, m: MaterialProfile, p: Record<string, Value>, w = 96, h = 64): string | null {
  const key = JSON.stringify([def.id, m.id, m.thickness, p, w]);
  if (!pics.has(key)) {
    let src: string | null = null;
    try {
      // a tray in the list holds a few sweets, so it reads as what it is for
      src = designPicture(builtFor(def, m, p), w, h, { prop: def.id === 'tray' ? 'sweets' : undefined });
    } catch {
      src = null;
    }
    if (pics.size > 300) pics.delete(pics.keys().next().value!);
    pics.set(key, src);
  }
  return pics.get(key) ?? null;
}

/** Narrow screens show the words as labelled rows. */
function useNarrow(): boolean {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 600px)') : null;
  const [n, setN] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return;
    const f = () => setN(q.matches);
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, [q]);
  return n;
}

/**
 * `top` and `actions` go above and below the words (the welcome composer's material chips and its Start), and
 * `picture` is the size the picture is drawn at.
 */
export function Sentence(props: { m: MaterialProfile; value: SentenceValue; onChange: (v: SentenceValue, changes: Change[]) => void; notes?: Change[]; top?: ReactNode; actions?: ReactNode; picture?: [number, number] }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const narrow = useNarrow();
  const { m, value } = props;
  const def = templateById(value.id)!;
  const p = value.params;
  const words = useMemo(() => resolve(def, m, p, { lists: false, ranges: false }), [def, m, p]);
  const [notes, setNotes] = useState<Change[]>([]);
  const [refusedChoice, setRefusedChoice] = useState<MsgKey | null>(null);
  const [out, setOut] = useState<Readout | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef<HTMLDivElement>(null);
  const [pw, ph] = props.picture ?? [300, 210];

  useEffect(() => {
    if (props.notes?.length) setNotes(props.notes);
  }, [props.notes]);
  // the line of values and the picture, 150 ms after the last change
  useEffect(() => {
    setBusy(true);
    const h = setTimeout(() => {
      const r = readout(def, m, p);
      setOut(r);
      setBusy(false);
      setImg(r.design ? designPicture(r.design, pw, ph) : null);
    }, 150);
    return () => clearTimeout(h);
  }, [def, m, p, pw, ph]);

  const word = (key: string) => words.find((w) => w.key === key);
  const pdef = (key: string) => def.params.find((x) => x.key === key) as ParamDef | undefined;
  const optText = (key: string, v: Value): string => {
    const d = pdef(key);
    const o = d?.type === 'choice' ? d.options.find((x) => x.value === v) : undefined;
    return o ? t(o.label) : String(v);
  };
  const apply = (r: ReturnType<typeof choose>) => {
    if ('refused' in r) return r.refused;
    setRefusedChoice(null);
    setNotes(r.changes);
    props.onChange({ id: def.id, params: r.params }, r.changes);
    return null;
  };
  const pick = (key: string, v: Value) => {
    const r = choose(def, m, p, key, v);
    if ('refused' in r) setRefusedChoice(r.refused.why ?? 'sen.why.engine');
    else apply(r);
  };

  // the first word (milestone C1): the structures and the named styles of each group; the word shows the style its words match
  const style = styleOf(def.id, p);
  const structureValue: Value = style && !isAlias(style) ? `style:${style.id}` : def.id;
  const entryText = (v: Value) => {
    const k = String(v);
    if (k.startsWith('style:')) return t(styleWord(styleById(k.slice(6))!));
    return t(templateById(k)!.word!);
  };
  const entryOf = (v: Value) => {
    const k = String(v);
    return k.startsWith('style:') ? { style: styleById(k.slice(6))! } : { def: templateById(k)! };
  };
  const entryGroup = (v: Value) => {
    const e = entryOf(v);
    return t(`style.group.${e.style ? e.style.group : (STRUCTURE_GROUP[e.def!.id] ?? 'more')}` as MsgKey);
  };
  const entryDetail = (v: Value) => {
    const e = entryOf(v);
    if (e.style) return t(styleDesc(e.style));
    const alias = STYLES.find((x) => x.structure === e.def!.id && isAlias(x));
    return alias ? `${t(styleName(alias))} · ${t(styleDesc(alias))}` : null;
  };
  const entries = (): Value[] => {
    const structs = STRUCTURES().filter((x) => makes(x, m));
    const out: Value[] = [];
    for (const g of GROUPS) {
      for (const x of structs) if ((STRUCTURE_GROUP[x.id] ?? 'more') === g) out.push(x.id);
      for (const st of STYLES) if (st.group === g && !isAlias(st) && styleListed(st, m, p, templateById)) out.push(`style:${st.id}`);
    }
    return out;
  };
  const structureWord = (
    <Word
      name={t('sen.structure')}
      value={structureValue}
      text={entryText}
      options={entries}
      group={entryGroup}
      detail={entryDetail}
      picture={(v) => {
        const e = entryOf(v);
        if (e.style) {
          const r = chooseStyle(e.style, m, p, templateById);
          return r ? picture(templateById(r.id)!, m, r.params) : null;
        }
        return picture(e.def!, m, chooseStructure(e.def!, m, p).params);
      }}
      onPick={(v) => {
        const e = entryOf(v);
        const r = e.style ? chooseStyle(e.style, m, p, templateById) : { id: e.def!.id, ...chooseStructure(e.def!, m, p) };
        if (!r) return;
        setNotes(r.changes);
        props.onChange({ id: r.id, params: r.params }, r.changes);
      }}
      testId="sen-structure"
    />
  );

  const slot = (key: string) => {
    if (key === 'structure') return structureWord;
    const w = word(key), d = pdef(key);
    if (!w || !d || !w.shown) return null;
    if (d.type === 'choice')
      return (
        <Word
          name={t(d.label)}
          value={w.value}
          text={(v) => optText(key, v)}
          options={() => listOf(def, m, p, key)}
          picture={['shape', 'lid', 'top', 'bottom'].includes(key) ? (v) => picture(def, m, { ...p, [key]: v }) : undefined}
          onPick={(v) => pick(key, v)}
          testId={`sen-${key}`}
        />
      );
    const own = d as Extract<ParamDef, { min: number }>;
    return (
      <NumberWord
        name={t(d.label)}
        value={Number(w.value)}
        int={d.type === 'int'}
        quick={{ min: own.min, max: own.max }}
        full={(): NumRange => {
          const r = rangeNow(def, d, p, m);
          return { min: r.min, max: r.max, why: r.why };
        }}
        onCommit={(v) => apply(choose(def, m, p, key, v))}
        testId={`sen-${key}`}
      />
    );
  };

  const clauses = clausesOf(def, m, p);
  const more = addable(def, m, p);
  const main = parts(t(def.sentence!.main));
  const note = notes[notes.length - 1];
  const noteText = (c: Change) =>
    t('sen.note', {
      what: c.key === 'structure' ? `${t('sen.structure')}: ${t(templateById(String(c.to))?.word ?? 'sen.box')}` : `${t(pdef(c.key)?.label ?? 'sen.structure')}: ${optText(c.key, c.to)}`,
      why: t(c.why),
    });

  const addMore = (
    <Word
      name={t('sen.more')}
      value=""
      text={(k) => (k === '' ? t('sen.more') : t(pdef(String(k))!.label))}
      options={() => more.filter((d) => listOf(def, m, p, d.key).some((v) => v !== d.addon!.off)).map((d) => d.key)}
      onPick={(k) => {
        const d = pdef(String(k))!;
        const first = listOf(def, m, p, d.key).find((v) => v !== d.addon!.off);
        if (first !== undefined) pick(d.key, first);
      }}
      testId="sen-more"
    />
  );

  const removeBtn = (key: string) => {
    const d = pdef(key)!;
    return (
      <button type="button" className="sen-x" aria-label={t('sen.remove', { name: t(d.label) })} onClick={() => pick(key, d.addon!.off)} data-testid={`sen-remove-${key}`}>
        ×
      </button>
    );
  };

  const readoutLine = (
    <p className="sen-out" data-testid="sen-out">
      {busy || !out ? (
        t('sen.out.checking')
      ) : (
        <>
          {out.lines.map((l, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              <bdi>{t(l.key, l.vars)}</bdi>
            </span>
          ))}
          {out.problem && (
            <span className="warn-text" data-testid="sen-problem">
              {' · '}
              {t('sen.out.problem', { issue: t(out.problem.key, out.problem.vars) })}
            </span>
          )}
        </>
      )}
    </p>
  );

  // the words in sentence order, for the narrow layout
  const rowKeys = [...main.flatMap((x) => ('slot' in x ? [x.slot] : [])), ...clauses.flatMap((c) => parts(t(c.text)).flatMap((x) => ('slot' in x ? [x.slot] : [])))];

  return (
    <div className={`sentence${narrow ? ' narrow' : ''}`} data-testid="sentence" data-structure={def.id} lang={lang}>
      <div className="sen-picture" aria-label={t('sen.picture')} role="img" data-testid="sen-picture">
        {img && <img src={img} alt="" />}
      </div>
      <fieldset className="sen-body">
        <legend className="sr-only">{t('sen.legend')}</legend>
        {props.top}
        {narrow ? (
          <div className="sen-rows">
            {rowKeys.map((k) => (
              <div key={k} className="sen-row">
                <span className="label">{k === 'structure' ? t('sen.structure') : t(pdef(k)?.label ?? 'sen.structure')}</span>
                {slot(k)}
                {clauses.some((c) => c.key === k && c.removable) && removeBtn(k)}
              </div>
            ))}
            {more.length > 0 && <div className="sen-row">{addMore}</div>}
          </div>
        ) : (
          <div className="sen-text">
            {main.map((x, i) => ('slot' in x ? <span key={i}>{slot(x.slot)}</span> : <span key={i}>{x.text}</span>))}
            {clauses.map((c) => (
              <span key={c.key} className="sen-clause" data-testid={`sen-clause-${c.key}`}>
                {t('sen.join')}
                {parts(t(c.text)).map((x, i) => ('slot' in x ? <span key={i}>{slot(x.slot)}</span> : <span key={i}>{x.text}</span>))}
                {c.removable && removeBtn(c.key)}
              </span>
            ))}
            {t('sen.end')} {more.length > 0 && addMore}
          </div>
        )}
        {readoutLine}
        {refusedChoice && (
          <p className="sen-note warn-text" data-testid="sen-refused">
            {t('sen.refusedChoice', { why: t(refusedChoice) })}
          </p>
        )}
        {note && (
          <p className="sen-note" data-testid="sen-note">
            ⓘ {noteText(note)}
          </p>
        )}
        <div ref={live} className="sr-only" aria-live="polite" data-testid="sen-live">
          {notes.map(noteText).join(' ')}
        </div>
        {props.actions}
      </fieldset>
    </div>
  );
}
