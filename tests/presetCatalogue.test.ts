// Milestone 146 (PRESETS_OVERHAUL.md §3, §5.1): the presets as one catalogue. Every structure, style, mission and
// Guided thing is on exactly one card; a saved design finds its card; no list shows the same design twice (checked
// on the cut geometry, which the lists' cheap key must agree with); and look-alikes are only those listed in
// tests/presetLookalikes.ts.
import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../src/model/materials';
import { TEMPLATES, defaults, generate, templateById } from '../src/templates/registry';
import { STYLES, chooseStyle, isAlias } from '../src/templates/styles';
import { MISSIONS, startMission } from '../src/easy/missions';
import { thingsFor } from '../src/guided/things';
import { CATALOGUE, cardOfDesign, catalogueMissions, entryChoice, guidedEntries, sentenceCandidates, sentenceEntries, variants } from '../src/templates/catalogue';
import { styleOf } from '../src/templates/styles';
import { prepareExport } from '../src/export/prepare';
import { flattenContour } from '../src/geom/vec';
import { recordKey, recordOf } from '../src/templates/records';
import type { Design, MaterialProfile } from '../src/model/types';
import type { Params } from '../src/templates/types';
import type { Value } from '../src/sentence/resolve';
import { STRUCTURAL } from './presetLookalikes';

/** The four boards the welcome screen offers first (the others are grades of these, milestone 116). */
const BASE = ['card-0.5', 'corr-1.6', 'corr-4', 'ply-3'].map((id) => MATERIALS.find((m) => m.id === id)!);
const BOX: Params = defaults(templateById('box')!);

/** What is cut, piece by piece, up to where each piece lies and a quarter turn: two designs with the same key cut the same. */
export function cutKey(d: Design): string {
  const pieces = new Map<string, { op: string; pts: { x: number; y: number }[] }[]>();
  for (const sh of prepareExport(d).sheets)
    for (const c of sh.contours) {
      const k = c.ref?.pieceKey ?? '?';
      if (!pieces.has(k)) pieces.set(k, []);
      pieces.get(k)!.push({ op: `${c.op}:${c.role}`, pts: flattenContour(c.contour, 0.05) });
    }
  const out: string[] = [];
  for (const cs of pieces.values()) {
    let best: string | null = null;
    for (let r = 0; r < 4; r++) {
      const rot = (q: { x: number; y: number }) => (r === 0 ? q : r === 1 ? { x: -q.y, y: q.x } : r === 2 ? { x: -q.x, y: -q.y } : { x: q.y, y: -q.x });
      const all = cs.flatMap((c) => c.pts.map(rot));
      const x0 = Math.min(...all.map((q) => q.x)), y0 = Math.min(...all.map((q) => q.y));
      const s = cs
        .map((c) => `${c.op}:${c.pts.map(rot).map((q) => `${(q.x - x0).toFixed(1)},${(q.y - y0).toFixed(1)}`).sort().join(' ')}`)
        .sort()
        .join('/');
      if (best === null || s < best) best = s;
    }
    out.push(best!);
  }
  return out.sort().join('|');
}

/**
 * The structural fingerprint (milestone 150): the design's record (records.ts) — what it is made of, not its sizes.
 * Two presets in one list with the same record are look-alikes in structure.
 */
export function structuralFingerprint(d: Design): string {
  return recordKey(recordOf(d));
}

/** A sentence entry's design, as Start makes it. */
const build = (m: MaterialProfile, c: { id: string; params: Params }) => generate(templateById(c.id)!, m, c.params);

describe('the catalogue (milestone 146)', () => {
  it('every structure, style, mission and Guided thing is on exactly one card', () => {
    const ids = variants().map((x) => x.v.id);
    expect(new Set(ids).size, 'variant ids are unique').toBe(ids.length);
    expect(new Set(CATALOGUE.map((c) => c.id)).size).toBe(CATALOGUE.length);
    for (const t of TEMPLATES) {
      if (t.status === 'planned') continue;
      const own = variants().filter((x) => x.v.structure === t.id && !x.v.style && !x.v.words);
      expect(own.length, `structure ${t.id}`).toBe(1);
    }
    for (const s of STYLES) {
      // a style with no words of its own is its structure's entry (milestone C1)
      const on = isAlias(s) ? variants().filter((x) => x.v.structure === s.structure && !x.v.style && !x.v.words) : variants().filter((x) => x.v.style === s.id);
      expect(on.length, `style ${s.id}`).toBe(1);
      expect(on[0].v.structure, `style ${s.id}`).toBe(s.structure);
    }
    for (const ms of MISSIONS) expect(CATALOGUE.filter((c) => c.challenges.includes(ms.id)).length, `mission ${ms.id}`).toBe(1);
    expect(catalogueMissions().map((x) => x.id)).toEqual(MISSIONS.map((x) => x.id));
    const guided = guidedEntries().map((x) => x.g.id);
    expect(new Set(guided).size).toBe(guided.length);
    for (const th of thingsFor(null)) expect(guided.includes(th.id) || !!th.mission, `thing ${th.id}`).toBe(true);
    // Guided's gallery in the order it always had: missions, the plain things, the ready shapes
    expect(thingsFor(null).map((x) => x.id)).toEqual([...MISSIONS.filter((x) => !x.levels || x.levels.includes('guided')).map((x) => x.id), 'box', 'box-lid', 'round-box', 'carton', 'pyramid', 'diamond']);
    // every card has a name in both languages (i18n.test checks the Hebrew)
    for (const c of CATALOGUE) expect(c.title.startsWith('card.')).toBe(true);
  });

  it('a design finds the card it was started from', () => {
    for (const m of BASE) {
      for (const t of TEMPLATES) {
        if (t.status === 'planned' || !(t.canMake ? t.canMake(m) : t.materials.includes(m.kind))) continue;
        const d = generate(t, m, defaults(t));
        const at = cardOfDesign(d);
        expect(at, `${t.id} ${m.id}`).not.toBeNull();
        // the style its words are, when they are one, is the variant found
        const s = styleOf(t.id, d.template!.params);
        if (s && !isAlias(s)) expect(at!.v?.style, `${t.id} ${m.id}`).toBe(s.id);
      }
      for (const s of STYLES) {
        const r = s.status !== 'planned' && chooseStyle(s, m, BOX, templateById);
        if (!r || styleOf(r.id, r.params)?.id !== s.id) continue;
        expect(cardOfDesign(build(m, r))?.card.variants.some((v) => (isAlias(s) ? v.structure === s.structure : v.style === s.id)), `${s.id} ${m.id}`).toBe(true);
      }
      for (const ms of MISSIONS) if (ms.materials.includes(m.kind)) expect(cardOfDesign(startMission(ms, m))?.card.challenges, ms.id).toContain(ms.id);
    }
    // a free design has none
    expect(cardOfDesign({})).toBeNull();
  }, 120_000);

  it('a variant picked from another of its card starts at its own sizes, with a note; from another card it keeps them', () => {
    const m = BASE[3];
    const r = entryChoice('tray', m, BOX, 'box')!;
    expect(r.params.height).toBe(30);
    expect(r.changes.some((c) => c.key === 'height' && c.why === 'sen.why.ownSize')).toBe(true);
    const back = entryChoice('box', m, r.params, 'tray')!;
    expect(back.params.height).toBe(45);
    // from a stand (another card) the box keeps what it can of the words, as before
    const carton = entryChoice('carton', BASE[0], BOX, 'box')!;
    expect(entryChoice('box', BASE[0], { ...carton.params, height: 70 }, 'style:tuckSnap')!.params.height).toBe(70);
  }, 60_000);

  // the sentences the lists are checked from: the welcome screen's first one, and one of each kind
  const starts = (m: MaterialProfile): { name: string; p: Params; current: Value }[] => {
    const out: { name: string; p: Params; current: Value }[] = [{ name: 'box', p: BOX, current: 'box' }, { name: 'low box', p: { ...BOX, height: 30 }, current: 'box' }];
    const tray = entryChoice('tray', m, BOX, 'box');
    if (tray) out.push({ name: 'tray', p: tray.params, current: 'tray' });
    for (const id of ['carton', 'envelope']) {
      const c = entryChoice(id, m, BOX, 'box');
      if (!c) continue;
      const s = styleOf(c.id, c.params);
      out.push({ name: id, p: c.params, current: s && !isAlias(s) ? `style:${s.id}` : c.id });
    }
    return out;
  };

  it('no list shows the same design twice; the lists’ key agrees with what is cut', () => {
    for (const m of BASE)
      for (const st of starts(m)) {
        const cands = sentenceCandidates(m, st.p, st.current);
        const cut = new Map(cands.map((c) => [c.value, cutKey(build(m, c.choice))]));
        // the cheap key never calls two different designs the same
        for (const a of cands) for (const b of cands) if (a.key === b.key) expect(cut.get(a.value), `${m.id} from ${st.name}: ${a.value} / ${b.value}`).toBe(cut.get(b.value));
        const shown = sentenceEntries(m, st.p, st.current);
        // the word's own entry is always there
        if (cands.some((c) => c.value === st.current)) expect(shown, `${m.id} from ${st.name}`).toContain(st.current);
        const seen = new Map<string, Value>();
        for (const v of shown) {
          const k = cut.get(v)!;
          expect(seen.get(k), `${m.id} from ${st.name}: ${v} is ${seen.get(k)}`).toBeUndefined();
          seen.set(k, v);
        }
      }
  }, 600_000);

  it('Guided’s gallery and the missions show each design once', () => {
    for (const m of BASE) {
      const things = thingsFor(null).filter((x) => x.can(m));
      const keys = things.map((x) => cutKey(x.start(m)));
      expect(new Set(keys).size, `Guided in ${m.id}`).toBe(keys.length);
      const ms = catalogueMissions().filter((x) => x.materials.includes(m.kind));
      const mk = ms.map((x) => cutKey(startMission(x, m)));
      expect(new Set(mk).size, `missions in ${m.id}`).toBe(mk.length);
    }
  }, 300_000);

  it('look-alikes are only the known ones (tests/presetLookalikes.ts), and each known one still is', () => {
    const found: string[] = [];
    const pairs = (list: 'sentence' | 'guided' | 'missions', items: { name: string; d: Design }[]) => {
      const fp = items.map((x) => ({ name: x.name, f: structuralFingerprint(x.d) }));
      for (let i = 0; i < fp.length; i++) for (let j = i + 1; j < fp.length; j++) if (fp[i].f === fp[j].f) found.push([list, ...[fp[i].name, fp[j].name].sort()].join(' '));
    };
    for (const m of BASE) {
      const cands = sentenceCandidates(m, BOX, 'box');
      const shown = new Set(sentenceEntries(m, BOX, 'box'));
      pairs('sentence', cands.filter((c) => shown.has(c.value)).map((c) => ({ name: c.v.id, d: build(m, c.choice) })));
      pairs('guided', thingsFor(null).filter((x) => x.can(m) && !x.mission).map((x) => ({ name: x.id, d: x.start(m) })));
      pairs('missions', catalogueMissions().filter((x) => x.materials.includes(m.kind)).map((x) => ({ name: x.id, d: startMission(x, m) })));
    }
    const known = new Set(STRUCTURAL.map((x) => [x.list, ...[x.a, x.b].sort()].join(' ')));
    const got = new Set(found);
    expect([...got].filter((x) => !known.has(x)).sort(), 'new look-alikes').toEqual([]);
    expect([...known].filter((x) => !got.has(x)).sort(), 'look-alikes that no longer are (remove them)').toEqual([]);
  }, 600_000);
});
