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
