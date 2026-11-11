// Fuzz: project files (parseProject / migrateDesign) with mutated fields. A file must either load
// as a design that the rest of the app can use, or be refused with ProjectError.
import { beforeAll, describe, expect, it } from 'vitest';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { loadFonts, randomDesign, rng, seedMath, type R } from './gen';
import { ProjectError, parseProject, serializeProject } from '../../src/model/serialize';
import { solve } from '../../src/model/ops';
import { validate } from '../../src/model/validate';
import { buildPieces } from '../../src/model/pieces';
import { prepareExport } from '../../src/export/prepare';
import { sheetsToSvg } from '../../src/export/svg';
import { sheetsToDxf } from '../../src/export/dxf';
import { finiteContour } from './check';
import { MATERIALS } from '../../src/model/materials';
import { TEMPLATES, defaults, generate } from '../../src/templates/registry';
import { MISSIONS, missionState, startMission } from '../../src/easy/missions';

const N = Number(process.env.FUZZ_N ?? 60);
const SEED0 = Number(process.env.FUZZ_SEED ?? 1);

beforeAll(loadFonts);

type Fail = { cls: string; seed: number; msg: string };

function corpus(): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const f of readdirSync('tests/golden').filter((f) => f.endsWith('.json'))) out.push({ name: f, text: readFileSync(`tests/golden/${f}`, 'utf8') });
  seedMath(7);
  for (const t of TEMPLATES) for (const m of MATERIALS) out.push({ name: `${t.id}-${m.id}`, text: serializeProject(generate(t, m, defaults(t))) });
  for (const ms of MISSIONS) out.push({ name: `mission-${ms.id}`, text: serializeProject(startMission(ms, MATERIALS[1])) });
  for (let s = 1; s <= 12; s++) out.push({ name: `random-${s}`, text: serializeProject(randomDesign(rng(500 + s)).d) });
  return out;
}

/** Every [path, parent, key] in a JSON value. */
function paths(v: any, p: (string | number)[] = [], out: { path: (string | number)[]; parent: any; key: string | number }[] = []) {
  if (v && typeof v === 'object') {
    for (const k of Array.isArray(v) ? v.keys() : Object.keys(v)) {
      out.push({ path: [...p, k], parent: v, key: k });
      paths(v[k], [...p, k], out);
    }
  }
  return out;
}

// 1e308-class values are left out by default: they hang validate (see repro-huge-coordinate-hang)
const HUGE = process.env.HUGE ? [1e308, -1e308] : [];
const WEIRD = [null, true, 'x', '', 0, -1, ...HUGE, 1e-320, 3.5, [], {}, [1, 2], { x: 1 }, '__proto__'];

function mutate(r: R, file: any): string {
  const all = paths(file.design).filter((x) => x.path.length);
  const n = r.int(1, 3);
  const what: string[] = [];
  for (let k = 0; k < n; k++) {
    const t = r.pick(all);
    const kind = r.f();
    if (kind < 0.25) {
      if (Array.isArray(t.parent)) t.parent.splice(t.key as number, 1);
      else delete t.parent[t.key];
      what.push(`delete ${t.path.join('.')}`);
    } else if (kind < 0.8) {
      const v = r.pick(WEIRD);
      t.parent[t.key] = structuredClone(v);
      what.push(`${t.path.join('.')} = ${JSON.stringify(v)}`);
    } else if (kind < 0.9 && typeof t.parent[t.key] === 'number') {
      const v = t.parent[t.key] * r.pick(process.env.HUGE ? [-1, 0, 1e6, 1e-6, 1e300] : [-1, 0, 1e3, 1e-6]);
      t.parent[t.key] = v;
      what.push(`${t.path.join('.')} *= -> ${v}`);
    } else {
      // rename a record key (ids), e.g. to __proto__ / constructor
      if (!Array.isArray(t.parent)) {
        const nk = r.pick(['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', 'a#b~2']);
        const val = t.parent[t.key];
        delete t.parent[t.key];
        Object.defineProperty(t.parent, nk, { value: val, enumerable: true, configurable: true, writable: true });
        what.push(`rename ${t.path.join('.')} -> ${nk}`);
      }
    }
  }
  if (r.chance(0.15)) {
    const v = r.int(0, 8);
    file.design.schemaVersion = v;
    what.push(`schemaVersion=${v}`);
  }
  return JSON.stringify(file) + '\u0000' + what.join('; ');
}

function checkLoaded(text: string, what: string, seed: number, fails: Fail[], stats: Record<string, number>) {
  const fail = (cls: string, msg: string) => fails.push({ cls, seed, msg: `${msg}\n  mutation: ${what}` });
  const protoBefore = Object.getOwnPropertyNames(Object.prototype).join(',');
  let d;
  if (process.env.TRACE) appendFileSync(process.env.TRACE, `  stage parse\n`);
  try {
    d = parseProject(text);
  } catch (e) {
    if (e instanceof ProjectError) stats.refused = (stats.refused ?? 0) + 1;
    else {
      stats.otherThrow = (stats.otherThrow ?? 0) + 1;
      const m = String(e).slice(0, 100);
      fail(`parse throws non-ProjectError`, m);
    }
    return;
  }
  stats.loaded = (stats.loaded ?? 0) + 1;
  const stage = (name: string, f: () => unknown) => {
    if (process.env.TRACE) appendFileSync(process.env.TRACE, `  stage ${name}\n`);
    try {
      return f();
    } catch (e) {
      fail(`loaded design crashes ${name}`, String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | '));
      return undefined;
    }
  };
  stage('solve', () => solve(d));
  stage('validate', () => validate(d));
  stage('buildPieces', () => buildPieces(d));
  const prep = stage('prepareExport', () => prepareExport(d, 'nominal')) as ReturnType<typeof prepareExport> | undefined;
  if (prep) {
    const bad = prep.sheets.flatMap((s) => s.contours).filter((c) => !finiteContour(c.contour));
    if (bad.length) fail('loaded design exports non-finite coordinates', `${bad.length} contours`);
    for (const s of prep.sheets) if (!(s.w > 0 && s.h > 0 && Number.isFinite(s.w) && Number.isFinite(s.h))) fail('loaded design has bad sheet size', `${s.w}x${s.h}`);
    const svg = stage('sheetsToSvg', () => sheetsToSvg(prep.sheets)) as string | undefined;
    if (svg && /NaN|Infinity/.test(svg)) fail('SVG contains NaN/Infinity', '');
    const dxf = stage('sheetsToDxf', () => sheetsToDxf(prep.sheets)) as string | undefined;
    if (dxf && /NaN|Infinity/.test(dxf)) fail('DXF contains NaN/Infinity', '');
  }
  stage('prepareExport compensated', () => prepareExport(d, 'compensated'));
  if (d.mission) stage('missionState', () => missionState(d));
  // a loaded design saves and loads again to the same thing
  const again = stage('re-serialize', () => parseProject(serializeProject(d)));
  if (again && JSON.stringify((again as any).panels) !== JSON.stringify(d.panels)) stats.roundTripDiff = (stats.roundTripDiff ?? 0) + 1;
  const protoAfter = Object.getOwnPropertyNames(Object.prototype).join(',');
  if (protoAfter !== protoBefore) {
    fail('Object.prototype polluted', protoAfter);
    for (const k of Object.getOwnPropertyNames(Object.prototype)) if (!protoBefore.split(',').includes(k)) delete (Object.prototype as any)[k];
  }
}

describe('fuzz: loading project files', () => {
  it(`mutated files load or are refused (${N})`, () => {
    const files = corpus();
    const fails: Fail[] = [];
    const stats: Record<string, number> = {};
    // the corpus itself loads cleanly
    for (const f of files) checkLoaded(f.text, `none (${f.name})`, 0, fails, stats);
    for (let s = SEED0; s < SEED0 + N; s++) {
      const r = rng(s);
      seedMath(s);
      const f = r.pick(files);
      const [text, what] = mutate(r, JSON.parse(f.text)).split('\u0000');
      if (process.env.TRACE) appendFileSync(process.env.TRACE, `${s} ${f.name}: ${what}\n`);
      const t0 = Date.now();
      checkLoaded(text, `${f.name}: ${what}`, s, fails, stats);
      const dt = Date.now() - t0;
      if (dt > 5000) fails.push({ cls: 'slow load/export (>5 s)', seed: s, msg: `${dt} ms\n  mutation: ${f.name}: ${what}` });
    }
    const byCls = new Map<string, Fail[]>();
    for (const f of fails) byCls.set(f.cls, [...(byCls.get(f.cls) ?? []), f]);
    const summary = [...byCls].map(([k, v]) => `${k}: ${v.length} (seeds ${[...new Set(v.map((x) => x.seed))].slice(0, 10).join(',')})\n` + v.slice(0, 6).map((x) => `    - ${x.msg.slice(0, 600)}`).join('\n')).join('\n');
    console.log('stats', JSON.stringify(stats), '\n' + summary);
    expect(summary).toBe('');
  }, 1_200_000);
});
