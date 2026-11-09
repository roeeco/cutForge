// Portable project file: JSON with a schemaVersion and forward migrations.
import type { Design } from './types';
import { SCHEMA_VERSION } from './types';
import { solve } from './ops';

export const PROJECT_FORMAT = 'cutforge-project';

export type ProjectFile = { format: typeof PROJECT_FORMAT; schemaVersion: number; savedAt: string; design: Design };

export class ProjectError extends Error {
  constructor(public code: 'notProject' | 'newerVersion') {
    super(code);
  }
}

/** Migrations from version N to N+1, keyed by N. */
const MIGRATIONS: Record<number, (d: any) => any> = {
  // v1 -> v2: connections gain grown/offset/tabs/flap/foldDir.
  1: (d) => {
    for (const c of Object.values<any>(d.connections ?? {})) {
      c.grown = true;
      c.offset = 0;
      c.tabs = null;
      c.flap = null;
      c.foldDir = 'valley';
    }
    return d;
  },
  // v2 -> v3: details may carry a live array (optional field, nothing to convert).
  2: (d) => d,
  // v3 -> v4: text and imported path shapes (new optional fields); sheet settings.
  3: (d) => {
    d.allowRotate ??= false;
    return d;
  },
  // v4 -> v5: optional template reference (nothing to convert).
  4: (d) => d,
  // v5 -> v6: sketches and edge keys. Root panels become 4-point polygons and
  // grown panels plain wall sketches; edge n becomes `e<n>` and the face
  // (-1) becomes `face`, in connections and their stored joint geometry.
  5: (d) => {
    const key = (e: any) => (typeof e === 'number' ? (e < 0 ? 'face' : `e${e}`) : e);
    const conns = Object.values<any>(d.connections ?? {});
    const children = new Set(conns.filter((c) => c.grown).map((c) => c.b?.panelId));
    for (const p of Object.values<any>(d.panels ?? {})) {
      p.sketch ??= children.has(p.id)
        ? { kind: 'wall' }
        : { kind: 'poly', pts: [{ x: 0, y: 0 }, { x: p.w, y: 0 }, { x: p.w, y: p.h }, { x: 0, y: p.h }], edgeIds: ['e0', 'e1', 'e2', 'e3'] };
    }
    for (const c of conns) {
      if (c.a) c.a.edge = key(c.a.edge);
      if (c.b) c.b.edge = key(c.b.edge);
      for (const e of c.geom?.edges ?? []) e.edge = key(e.edge);
    }
    d.trays ??= {};
    return d;
  },
  // v6 -> v7: shapes may turn (`rot`, degrees; missing means 0) and floor panels
  // may turn about the vertical (their frame's u and v). v6 has neither, so
  // nothing is converted and every export stays the same.
  6: (d) => d,
};

export function serializeProject(d: Design): string {
  const f: ProjectFile = { format: PROJECT_FORMAT, schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), design: d };
  return JSON.stringify(f, null, 1);
}

export function migrateDesign(raw: any): Design {
  if (!raw || typeof raw !== 'object' || typeof raw.schemaVersion !== 'number' || typeof raw.panels !== 'object') throw new ProjectError('notProject');
  if (raw.schemaVersion > SCHEMA_VERSION) throw new ProjectError('newerVersion');
  let d = structuredClone(raw);
  while (d.schemaVersion < SCHEMA_VERSION) {
    const m = MIGRATIONS[d.schemaVersion];
    if (!m) throw new ProjectError('notProject');
    d = m(d);
    d.schemaVersion++;
  }
  d.order = (Array.isArray(d.order) ? d.order : Object.keys(d.panels)).filter((id: string) => d.panels[id]);
  d.connections ??= {};
  d.pieces ??= {};
  d.placements ??= {};
  for (const id of d.order) d.pieces[id] ??= { quantity: 1 };
  // older files keep one flat set of joint choices: it belongs to the file's material (`solve` reads it in)
  solve(d);
  return d as Design;
}

export function parseProject(text: string): Design {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new ProjectError('notProject');
  }
  if (j?.format !== PROJECT_FORMAT) throw new ProjectError('notProject');
  return migrateDesign(j.design);
}
