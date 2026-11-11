// Portable project file: JSON with a schemaVersion and forward migrations.
import type { Design } from './types';
import { SCHEMA_VERSION } from './types';
import { solve } from './ops';
import { checkDesign, checkSolved, DamagedError } from './check';
import { legacyDivider } from './dividers';
import { rectSketch, straightRing } from './edges';

export const PROJECT_FORMAT = 'cutforge-project';

export type ProjectFile = { format: typeof PROJECT_FORMAT; schemaVersion: number; savedAt: string; design: Design };

export class ProjectError extends Error {
  constructor(public code: 'notProject' | 'newerVersion' | 'damaged', detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
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
  // v7 -> v8: boards may have their own material (`Panel.material`, with the
  // profiles in `Design.materials`) and sheet placements name it (`mat`). v7
  // has neither: every board uses the working material, exactly as before.
  7: (d) => {
    // milestone 32: automatic divider sets are gone; their members stay where they are as ordinary dividers
    delete d.dividerSets;
    return d;
  },
  // v8 -> v9: a fragment a cut splits off a piece is keyed `<key>@n`, not `<key>~n`, which
  // wall-set members (`<wall>~n`) also use (BUGFIX_PLAN B5). Placements of fragments move to the
  // new keys, so manual placements survive; a key whose `<x>~n` is a panel id is a wall-set member.
  8: (d) => {
    const panels = d.panels && typeof d.panels === 'object' ? d.panels : {};
    const isPanel = (k: string) => Object.prototype.hasOwnProperty.call(panels, k);
    if (d.placements && typeof d.placements === 'object') {
      for (const k of Object.keys(d.placements)) {
        const i = k.lastIndexOf('#');
        if (i < 0) continue;
        const piece = k.slice(0, i);
        const m = /^(.*)~(\d+)$/.exec(piece);
        if (!m || isPanel(piece)) continue;
        const nk = `${m[1]}@${m[2]}${k.slice(i)}`;
        if (!(nk in d.placements)) d.placements[nk] = d.placements[k];
        delete d.placements[k];
      }
    }
    return d;
  },
  // v9 -> v10: dividers (milestone 44). A panel grown at 90° from a base's
  // edge, standing in from it further than its joint's own offset, was a
  // divider: it becomes a standing board on the base with a divider record
  // that puts it exactly where it was (same id, order, shapes and height), and
  // its joint with the base becomes the same joint as an edge on the base's
  // face (same kind and settings). Anything that does not fit stays as it was.
  9: (d) => migrateDividers(d),
  // v10 -> v11: rounded corners and round bases (`curve: 'round'` with `r`,
  // `Sketch.round`) and materials' bend limits (`bend`), all optional and
  // new (milestone 45): nothing to convert. The version keeps older editors
  // from opening a file whose round outlines they would read wrongly.
  10: (d) => d,
  // v11 -> v12: walls bent along curved edges (milestone 46): new joint kinds
  // ('teeth', 'wrap'), a tray's `curveKind`, matched walls (`WallSketch.match`);
  // nothing to convert. The version keeps older editors from misreading them.
  11: (d) => d,
  // v12 -> v13: bend patterns (milestone 47): a bent wall's `bend` choices
  // (style, line spacing, which face is up) and open cut lines in a joint's
  // geometry; nothing to convert.
  12: (d) => d,
  // v13 -> v14: strips (milestone 48): joint kinds 'inline' and 'key', a closed
  // strip's `bend.seamAt`, a tray's arched lid (`Tray.arch`); nothing to convert.
  13: (d) => d,
};

function migrateDividers(d: any): any {
  if (!d || typeof d !== 'object' || !d.panels || typeof d.panels !== 'object' || !d.connections || typeof d.connections !== 'object') return d;
  for (const c of Object.values<any>(d.connections)) {
    try {
      if (!c?.grown || !c.a || !c.b) continue;
      const p = d.panels[c.b.panelId], base = d.panels[c.a.panelId];
      const m = base?.material && d.materials?.[base.material] ? d.materials[base.material] : d.material;
      if (!p || !base || !m || typeof c.offset !== 'number') continue;
      // the joint's own offset (tab-and-slot walls stand a web in): further in than that is a divider
      const own = c.kind === 'tabslot' ? Math.max((m.kind === 'plywood' ? 2 : m.kind === 'corrugated' ? 3 : 1.5) + m.clearance / 2, m.thickness) : 0;
      if (c.offset <= own + 1e-6) continue;
      // nothing grown from it or placed on it is moved: those stay with it (its id is kept)
      const rec = legacyDivider(d, p.id);
      if (!rec) continue;
      const s = p.sketch;
      const plainWall = !s || (s.kind === 'wall' && !s.inserts?.length && !Object.values(s.corners ?? {}).some((k: any) => k && (k.dx || k.dy || k.curve)));
      if (plainWall) p.sketch = rectSketch(p.w, p.h);
      else if (s.kind === 'wall') {
        const ring = straightRing({ w: p.w, h: p.h, sketch: s });
        const curve = (key: string) => (key === 'e2' ? s.corners?.tr?.curve : key === 'e3' ? s.corners?.tl?.curve : s.inserts?.find((x: any) => x.id === key)?.curve);
        p.sketch = { kind: 'poly', pts: ring.map((e) => ({ x: e.a.x, y: e.a.y, ...(curve(e.key) ? { curve: curve(e.key) } : {}) })), edgeIds: ring.map((e) => e.key) };
      }
      delete p.ext;
      p.place = rec.place;
      p.divider = rec.divider;
      // the joint with the base: its edge on the base's face
      c.grown = false;
      c.a = { panelId: p.id, edge: 'e0' };
      c.b = { panelId: base.id, edge: 'face' };
      c.offset = 0;
      delete c.span;
      delete c.geom;
      delete c.broken;
    } catch {
      // a damaged connection is left for checkDesign to report
    }
  }
  return d;
}

export function serializeProject(d: Design): string {
  const f: ProjectFile = { format: PROJECT_FORMAT, schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), design: d };
  // bent walls' facets are derived (milestone 46): never saved
  return JSON.stringify(f, (k, v) => (k === 'bent' ? undefined : v), 1);
}

export function migrateDesign(raw: any): Design {
  if (!raw || typeof raw !== 'object' || typeof raw.schemaVersion !== 'number' || !raw.panels || typeof raw.panels !== 'object') throw new ProjectError('notProject');
  if (raw.schemaVersion > SCHEMA_VERSION) throw new ProjectError('newerVersion');
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) throw new ProjectError('notProject');
  try {
    let d = structuredClone(raw);
    while (d.schemaVersion < SCHEMA_VERSION) {
      const m = MIGRATIONS[d.schemaVersion];
      if (!m) throw new ProjectError('notProject');
      d = m(d);
      d.schemaVersion++;
    }
    d.order = Array.isArray(d.order) ? d.order : Object.keys(d.panels);
    d.connections ??= {};
    d.pieces ??= {};
    d.placements ??= {};
    d.trays ??= {};
    // every field the model reads, checked before solve sees it (BUGFIX_PLAN B3)
    checkDesign(d);
    for (const id of d.order) if (!Object.prototype.hasOwnProperty.call(d.pieces, id)) d.pieces[id] = { quantity: 1 };
    // older files keep one flat set of joint choices: it belongs to the file's material (`solve` reads it in)
    solve(d);
    checkSolved(d);
    return d as Design;
  } catch (e) {
    if (e instanceof ProjectError) throw e;
    // a damaged field, or a design the model cannot solve: never a raw TypeError
    throw new ProjectError('damaged', e instanceof DamagedError ? e.message : String((e as Error)?.message ?? e));
  }
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
