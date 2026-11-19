// The sentence as text and numbers (milestone 97, SENTENCE_BUILDER_PLAN.md
// §3.4, §4.2): which clauses it has, where each word sits in a language's
// whole sentence, and the line of values under it, measured on the built
// design. Pure (no React), so it is tested without a browser.
import type { Design, MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import type { ParamDef, Params, TemplateDef } from '../templates/types';
import { shownNow } from './resolve';
import { generate } from '../templates/registry';
import { pieceCopies } from '../model/pack';
import { yieldReport } from '../model/split';
import { validate, type Issue } from '../model/validate';
import { NOTE_KEYS } from '../easy/notes';
import { compartments } from '../easy/objects';
import { boxSize } from '../model/boxSize';
import { mainTray } from '../templates/structures/box';

export type SentenceValue = { id: string; params: Params };

/** A sentence's text split at its slots: plain text and `{name}` slots, in order. */
export type Part = { text: string } | { slot: string };
export function parts(s: string): Part[] {
  const out: Part[] = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ text: s.slice(last, m.index) });
    out.push({ slot: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** The slot names in a sentence. */
export const slotsOf = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/** A clause after the main sentence: an add-on that is on, or a word that comes and goes (a polygon's sides). */
export type Clause = { key: string; text: MsgKey; removable: boolean };

/** The clauses the sentence has now, in order. */
export function clausesOf(def: TemplateDef, m: MaterialProfile, p: Params): Clause[] {
  const out: Clause[] = [];
  const main = def.sentence?.main;
  for (const d of def.params) {
    if (!shownNow(d, p, m)) continue;
    const v = p[d.key] ?? d.default;
    if (d.key === 'sides') out.push({ key: 'sides', text: 'sen.add.sides', removable: false });
    else if (d.key === 'spacesBy') {
      if (v !== 'none') out.push({ key: 'spacesBy', text: v === 'size' ? 'sen.add.spaces.size' : 'sen.add.spaces.count', removable: true });
    } else if (d.addon && v !== d.addon.off) out.push({ key: d.key, text: `sen.add.${d.key}` as MsgKey, removable: true });
    void main;
  }
  return out;
}

/** The add-ons that are off and could be added now (for *+ more*). */
export function addable(def: TemplateDef, m: MaterialProfile, p: Params): ParamDef[] {
  return def.params.filter((d) => d.addon && shownNow(d, p, m) && (p[d.key] ?? d.default) === d.addon.off);
}

/** The line under the sentence, as message keys and numbers (measured on the built design). */
export type Readout = { lines: { key: MsgKey; vars: Record<string, string | number> }[]; problem: Issue | null; design: Design | null };

const r1 = (v: number) => Math.round(v * 10) / 10;

export function readout(def: TemplateDef, m: MaterialProfile, p: Params): Readout {
  let d: Design;
  try {
    d = generate(def, m, p);
  } catch {
    return { lines: [], problem: null, design: null };
  }
  const lines: Readout['lines'] = [];
  const tr = mainTray(d);
  if (tr) {
    const base = d.trays[tr].baseId;
    const cs = p.spacesBy && p.spacesBy !== 'none' ? compartments(d, base) : [];
    if (cs.length > 1) {
      const ws = cs.map((c) => c.x1 - c.x0), ds = cs.map((c) => c.y1 - c.y0);
      const same = Math.max(...ws) - Math.min(...ws) < 0.11 && Math.max(...ds) - Math.min(...ds) < 0.11;
      if (!same) lines.push({ key: 'sen.out.spaceRange', vars: { a: r1(Math.min(...ws, ...ds)), b: r1(Math.max(...ws, ...ds)) } });
      else if (p.spacesBy === 'size') {
        const xs = new Set(cs.map((c) => Math.round(c.x0))).size, ys = new Set(cs.map((c) => Math.round(c.y0))).size;
        lines.push({ key: 'sen.out.spaces', vars: { nx: xs, ny: ys, w: r1(ws[0]), d: r1(ds[0]) } });
      } else lines.push({ key: 'sen.out.space', vars: { w: r1(ws[0]), d: r1(ds[0]) } });
    }
    const o = boxSize(d, tr, 'outside');
    if (o) lines.push({ key: 'sen.out.outside', vars: { w: r1(o.w), d: r1(o.d), h: r1(o.h) } });
  }
  lines.push({ key: 'sen.out.pieces', vars: { n: pieceCopies(d).length } });
  const y = yieldReport(d);
  lines.push({ key: y.sheets === 1 ? 'sen.out.sheet' : 'sen.out.sheets', vars: { n: y.sheets, pct: Math.round(y.pct) } });
  const problem = validate(d).find((i) => !NOTE_KEYS.has(i.key)) ?? null;
  return { lines, problem, design: d };
}
