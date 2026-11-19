// Quick build's feature table (LIDS_LINES_PROJECTS_PLAN.md §10.1 rule 3,
// milestone 73): every section a card can render names a feature, every
// feature in the table is used, and what Quick build shows is listed here, so
// adding a control to it is a visible change in review.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURES, SECTIONS } from '../src/easy/features';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}
const SRC = files('src').map((f) => ({ f, src: readFileSync(f, 'utf8') }));

/** Every card section in the interface: an element whose class starts with `subsection`, with its test id. */
function sections(): { f: string; id: string | null; line: string }[] {
  const out: { f: string; id: string | null; line: string }[] = [];
  for (const { f, src } of SRC) {
    if (!f.endsWith('.tsx')) continue;
    for (const m of src.matchAll(/<div\s+className=(?:"subsection[^"]*"|\{`subsection[^`]*`\})([^>]*)>/g)) {
      const id = /data-testid=(?:"([^"]+)"|\{`([^`]+)`\})/.exec(m[1]);
      out.push({ f, id: id ? (id[1] ?? id[2]) : null, line: m[0] });
    }
  }
  return out;
}

describe('the feature table (rule 3)', () => {
  it('every card section has a test id and is listed with its feature', () => {
    const found = sections();
    expect(found.length).toBeGreaterThan(30);
    const missing = found.filter((s) => {
      if (!s.id) return true;
      // a test id made from a template (`settings-${k}`): some listed section starts with its fixed part
      if (s.id.includes('${')) return !Object.keys(SECTIONS).some((k) => k.startsWith(s.id!.split('${')[0]));
      return !(s.id in SECTIONS);
    });
    expect(missing.map((s) => `${s.f}: ${s.line}`)).toEqual([]);
  });

  it('every listed section exists, and names a feature of the table', () => {
    const ids = new Set(sections().flatMap((s) => (s.id ? [s.id] : [])));
    for (const [id, f] of Object.entries(SECTIONS)) {
      const templated = [...ids].some((x) => x.includes('${') && id.startsWith(x.split('${')[0]));
      expect(ids.has(id) || templated, id).toBe(true);
      if (f !== null) expect(Object.keys(FEATURES), id).toContain(f);
    }
  });

  it('a section whose feature Quick build hides or chooses asks for it (in its own file, or where the card places it)', () => {
    const asks = (src: string, f: string) => new RegExp(`(useFeature|featureState)\\('${f.replace(/\./g, '\\.')}'\\)|<Gate f="${f.replace(/\./g, '\\.')}"`).test(src);
    const inspector = SRC.find((x) => x.f.endsWith('Inspector.tsx'))!.src;
    const bad = sections().filter((s) => {
      const f = s.id && !s.id.includes('${') ? SECTIONS[s.id] : null;
      if (!f || FEATURES[f] === 'show') return false;
      return !asks(SRC.find((x) => x.f === s.f)!.src, f) && !asks(inspector, f);
    });
    expect(bad.map((s) => `${s.f}: ${s.id} (${SECTIONS[s.id!]})`)).toEqual([]);
  });

  it('every feature Quick build does not simply show is asked for somewhere in the interface', () => {
    const all = SRC.filter((x) => !x.f.endsWith('features.ts')).map((x) => x.src).join('\n');
    // rows that only document what Quick build shows need no question; the op dots live on the Workshop rail (rail.tools)
    const implied = new Set(['rail.ops']);
    const unused = Object.keys(FEATURES).filter((k) => {
      if (FEATURES[k as keyof typeof FEATURES] === 'show' || implied.has(k)) return false;
      const q = k.replace(/\./g, '\\.');
      return !new RegExp(`(useFeature|featureState)\\('${q}'\\)|<Gate f="${q}"`).test(all);
    });
    expect(unused).toEqual([]);
  });

  it('what Quick build shows (a change here is a change for every student)', () => {
    const by = (s: string) => Object.entries(FEATURES).filter(([, v]) => v === s).map(([k]) => k).sort();
    expect(by('show')).toEqual([
      'align',
      'arrays',
      'copies',
      'cutplan',
      'foldSlider',
      'gizmo',
      'joints.noGlue',
      'lid',
      'outline',
      'saveBoard',
      'settings.joints',
      'tray.wallIt',
      'viewSettings',
    ]);
    expect(by('readonly')).toEqual(['drawer', 'settings.material']);
    expect(by('auto')).toEqual(['bend', 'crease', 'export.kerf', 'grow.advanced', 'hinge', 'joints', 'lid.advanced', 'settings.snapping', 'split', 'tray.corners', 'tray.joints']);
    expect(by('hide')).toEqual([
      'boardMaterial',
      'construction',
      'curves',
      'edgeFlap',
      'exportCheck',
      'foldover',
      'hints',
      'match',
      'op.scoreAdd',
      'rail.ops',
      'rail.tools',
      'saveBoard.steps',
      'tray.ends',
      'tray.keepWhole',
      'tray.ownHeight',
      'yield',
    ]);
  });
});
