// An insert (milestone 156, DIELINE_GENERATOR_ANALYSIS.md §3.1; FEFCO 09's liners and pads): one strip of card or
// corrugated folded along parallel creases, built with the strip builder (model/builders.ts). Its profile is a word:
// a U liner (a floor with two legs), a Z profile, an angle guard, or an accordion pad.
import type { Design, MaterialProfile } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { addStrip, addWrap } from '../../model/builders';
import { foldsAsCarton } from '../../model/materials';

const folds = (m: MaterialProfile) => foldsAsCarton(m, 4);
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });

function generateInsert(d: Design, p: Params, role: (name: string, id: string) => void) {
  const L = Number(p.length), W = Number(p.width), H = Number(p.height);
  let ids: string[] | null = null;
  if (p.profile === 'u') ids = addWrap(d, { length: L, root: 1, sections: [{ depth: H, bend: 0 }, { depth: W, bend: 90 }, { depth: H, bend: 90 }] })?.sections ?? null;
  else if (p.profile === 'z') ids = addWrap(d, { length: L, root: 1, sections: [{ depth: H, bend: 0 }, { depth: W, bend: 90 }, { depth: H, bend: -90 }] })?.sections ?? null;
  else if (p.profile === 'l') ids = addStrip(d, { widths: [W, H], length: L, bends: [90] });
  else {
    // an accordion: panels as deep as the height, folded back and forth at 60° (a pad that springs)
    const n = Math.max(2, Math.round(Number(p.panels)));
    ids = addStrip(d, { widths: Array.from({ length: n }, () => H), length: L, bends: Array.from({ length: n - 1 }, (_, i) => (i % 2 ? -60 : 60)) });
  }
  (ids ?? []).forEach((id, i) => role(`panel-${i + 1}`, id));
}

export const insert: TemplateDef = {
  id: 'insert',
  version: 1,
  name: 'sen.insert',
  description: 'sen.insert.desc',
  word: 'sen.insert',
  status: 'stable',
  materials: ['card', 'corrugated'],
  canMake: folds,
  fallback: () => 'box',
  params: [
    {
      key: 'profile', label: 'sen.profile', type: 'choice', default: 'u',
      options: [{ value: 'u', label: 'sen.profile.u' }, { value: 'z', label: 'sen.profile.z' }, { value: 'l', label: 'sen.profile.l' }, { value: 'accordion', label: 'sen.profile.accordion' }],
    },
    num('length', 'sen.length', 20, 300, 120),
    num('width', 'sen.width', 10, 300, 60),
    num('height', 'sen.height', 10, 200, 30),
    { key: 'panels', label: 'sen.panels', type: 'int', min: 3, max: 9, default: 5, when: (p) => p.profile === 'accordion' },
  ],
  generate: generateInsert,
  sentence: { main: 'sen.s.insert' },
};
