// Quick build's feature table (LIDS_LINES_PROJECTS_PLAN.md §10.1 rule 3,
// milestone 73): every section a card can render names a feature, every
// feature in the table is used, and what Quick build shows is listed here, so
// adding a control to it is a visible change in review.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURES, GUIDED, SECTIONS } from '../src/easy/features';

/**
 * Guided hides these by not mounting what holds them (milestone 105): the card (Inspector), the Workshop
 * dock, the fold bar and the 3D gizmos. Each names where its control lives and the row or shell that hides it.
 */
const GUIDED_BY_SHELL: Record<string, string> = {
  outline: 'Inspector (Edit outline): not mounted in Guided',
  'tray.wallIt': 'Inspector (Wall it): not mounted in Guided',
  arrays: 'Inspector (Copies in a row): not mounted in Guided',
  align: 'Inspector (Align): not mounted in Guided',
  copies: 'Inspector (Copies to cut): not mounted in Guided',
  gizmo: 'the stage gizmos: stage.floorGizmo, stage.placedGizmo, stage.shapeGizmo',
  foldSlider: 'the fold bar: stage.foldBar',
  viewSettings: 'the dock: stage.dock',
};

/** The two columns that are not Workshop's (milestone 105: Guided has its own). */
const TABLES = { quick: FEATURES, guided: GUIDED } as Record<string, Record<string, string>>;

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

  it.each(Object.keys(TABLES))('a section whose feature %s hides or chooses asks for it (in its own file, or where the card places it)', (mode) => {
    const T = TABLES[mode];
    const asks = (src: string, f: string) => new RegExp(`(useFeature|featureState)\\('${f.replace(/\./g, '\\.')}'\\)|<Gate f="${f.replace(/\./g, '\\.')}"`).test(src);
    const inspector = SRC.find((x) => x.f.endsWith('Inspector.tsx'))!.src;
    const bad = sections().filter((s) => {
      const f = s.id && !s.id.includes('${') ? SECTIONS[s.id] : null;
      if (!f || T[f] === 'show' || (mode === 'guided' && f in GUIDED_BY_SHELL)) return false;
      return !asks(SRC.find((x) => x.f === s.f)!.src, f) && !asks(inspector, f);
    });
    expect(bad.map((s) => `${s.f}: ${s.id} (${SECTIONS[s.id!]})`)).toEqual([]);
  });

  it.each(Object.keys(TABLES))('every feature %s does not simply show is asked for somewhere in the interface', (mode) => {
    const T = TABLES[mode];
    const all = SRC.filter((x) => !x.f.endsWith('features.ts')).map((x) => x.src).join('\n');
    // rows that only document what Quick build shows need no question; the op dots live on the Workshop rail (rail.tools)
    const implied = new Set(['rail.ops', ...(mode === 'guided' ? Object.keys(GUIDED_BY_SHELL) : [])]);
    const unused = Object.keys(T).filter((k) => {
      if (T[k] === 'show' || implied.has(k)) return false;
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
      'export.spec',
      'foldSlider',
      'gizmo',
      'joints.noGlue',
      'keys.clipboard',
      'lid',
      'outline',
      'plan.edit',
      'saveBoard',
      'settings.joints',
      'stage.dividerButton',
      'stage.dividerSlide',
      'stage.dock',
      'stage.edges',
      'stage.floorGizmo',
      'stage.foldBar',
      'stage.hint',
      'stage.pan',
      'stage.panelWidgets',
      'stage.placedGizmo',
      'stage.shapeGizmo',
      'tray.wallIt',
      'viewSettings',
    ]);
    expect(by('readonly')).toEqual(['drawer', 'settings.material']);
    expect(by('auto')).toEqual(['bend', 'crease', 'export.annotations', 'export.kerf', 'grow.advanced', 'hinge', 'joints', 'lid.advanced', 'settings.snapping', 'split', 'tray.corners', 'tray.joints']);
    expect(by('hide')).toEqual([
      'boardMaterial',
      'construction',
      'curves',
      'edgeFlap',
      'edit2d',
      'exportCheck',
      'foldover',
      'hints',
      'keys.tools',
      'match',
      'op.scoreAdd',
      'outline.mode',
      'rail.ops',
      'rail.tools',
      'saveBoard.steps',
      'size.as',
      'sizes',
      'transform.sides',
      'tray.ends',
      'tray.keepWhole',
      'tray.ownHeight',
      'yield',
    ]);
  });

  it('what Guided shows (milestone 105; a change here is a change for every beginner)', () => {
    const by = (v: string) => Object.entries(GUIDED).filter(([, x]) => x === v).map(([k]) => k).sort();
    expect(Object.keys(GUIDED).sort()).toEqual(Object.keys(FEATURES).sort());
    expect(by('show')).toEqual(['cutplan', 'export.spec', 'joints.noGlue', 'lid', 'saveBoard', 'settings.joints']);
    expect(by('readonly')).toEqual([]);
    expect(by('auto')).toEqual(['bend', 'crease', 'export.annotations', 'export.kerf', 'hinge', 'joints', 'lid.advanced', 'size.as', 'split', 'tray.corners', 'tray.joints']);
    // everything else, every Workshop-only control and every stage handle Guided replaces, is hidden
    expect(by('hide').length).toBe(Object.keys(GUIDED).length - 17);
  });
});
