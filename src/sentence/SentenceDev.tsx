// The sentence on its own (milestone 97): a development page, `?sentence`, with
// step 1's materials and the sentence, for trying and testing it apart from the
// welcome screen (the welcome screen uses it from milestone 98).
import { useState } from 'react';
import { MATERIALS } from '../model/materials';
import { useStore, useT } from '../store/store';
import { defaults, templateById } from '../templates/registry';
import { chooseMaterial, type Change } from './resolve';
import { Sentence } from './Sentence';
import type { SentenceValue } from './model';
import type { MsgKey } from '../i18n';

export function SentenceDev() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const [mat, setMat] = useState(MATERIALS[3]);
  const [v, setV] = useState<SentenceValue>({ id: 'box', params: defaults(templateById('box')!) });
  const [notes, setNotes] = useState<Change[]>([]);
  return (
    <div className="start sentence-dev" dir={lang === 'he' ? 'rtl' : 'ltr'} data-testid="sentence-dev">
      <div className="dev-mats" role="radiogroup" aria-label={t('start.material')}>
        {MATERIALS.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={m.id === mat.id}
            className={m.id === mat.id ? 'on' : ''}
            onClick={() => {
              const r = chooseMaterial(templateById(v.id)!, m, v.params, templateById);
              setMat(m);
              setV({ id: r.def.id, params: r.params });
              setNotes(r.changes);
            }}
            data-testid={`dev-mat-${m.id}`}
          >
            {t(m.nameKey as MsgKey)}
          </button>
        ))}
        <button onClick={() => useStore.getState().setLang(lang === 'en' ? 'he' : 'en')} data-testid="dev-lang">
          {t('lang.toggle')}
        </button>
      </div>
      <Sentence m={mat} value={v} onChange={(n) => setV(n)} notes={notes} />
    </div>
  );
}
