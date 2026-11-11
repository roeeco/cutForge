// Template registry and regeneration. Generated entities get stable ids
// (`t:<role>`), so user-added shapes stay attached to their panels when a
// parameter changes; edits that cannot be kept are listed.
import { pieceRoot, placementPiece } from '../model/keys';
import type { Design, MaterialProfile } from '../model/types';
import type { Params, TemplateDef, TemplateIssue } from './types';
import { organiser } from './organiser';
import { stand } from './stand';
import { applyJointChoices, createDesign, setMaterial, solve } from '../model/ops';
import { normalizeJoints } from '../model/jointDefaults';

export const TEMPLATES: TemplateDef[] = [organiser, stand];
export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
export const PREFIX = 't:';

export function defaults(t: TemplateDef): Params {
  return Object.fromEntries(t.params.map((p) => [p.key, p.default]));
}

/** Rename panel and connection ids throughout a design. */
function renameIds(d: Design, map: Map<string, string>) {
  const r = (id: string) => map.get(id) ?? id;
  const panels: Design['panels'] = {};
  for (const [id, p] of Object.entries(d.panels)) panels[r(id)] = { ...p, id: r(id), ...(p.place?.host ? { place: { ...p.place, host: r(p.place.host) } } : {}) };
  d.panels = panels;
  for (const t of Object.values(d.trays ?? {})) t.baseId = r(t.baseId);
  d.order = d.order.map(r);
  const pieces: Design['pieces'] = {};
  for (const [id, q] of Object.entries(d.pieces)) pieces[r(id)] = q;
  d.pieces = pieces;
  const conns: Design['connections'] = {};
  for (const c of Object.values(d.connections)) {
    c.a = { ...c.a, panelId: r(c.a.panelId) };
    c.b = { ...c.b, panelId: r(c.b.panelId) };
    if (c.geom)
      c.geom = JSON.parse(JSON.stringify(c.geom), (k, v) => (k === 'panelId' && typeof v === 'string' ? r(v) : v));
    // stable connection id from its two ends
    // (edge keys written as the old edge numbers, so ids stay the same across schema versions)
    const n = (e: string) => (e === 'face' ? '-1' : e.replace(/^e(\d+)$/, '$1'));
    const id = c.a.panelId.startsWith(PREFIX) && c.b.panelId.startsWith(PREFIX) ? `${PREFIX}c:${c.a.panelId.slice(2)}.${n(c.a.edge)}-${c.b.panelId.slice(2)}.${n(c.b.edge)}` : c.id;
    conns[id] = { ...c, id };
  }
  d.connections = conns;
}

/** Generate a fresh design for a template (stable ids, panels named by role). */
export function generate(t: TemplateDef, material: MaterialProfile, params: Params): Design {
  const d = createDesign(material);
  const map = new Map<string, string>();
  t.generate(d, params, (name, id) => map.set(id, PREFIX + name));
  renameIds(d, map);
  d.template = { id: t.id, version: t.version, params: { ...params } };
  solve(d);
  return d;
}

export type Lost = { panel: string; shapes: number };

/**
 * Regenerate a template design with new parameters or material, keeping
 * user edits by id: shapes on template panels that still exist, user-added
 * panels and their connections, panel names, quantities, hand placements,
 * and where the student moved (or turned) the box. Returns what could not be kept.
 */
export function regenerate(old: Design, params: Params, material: MaterialProfile = old.material): { design: Design; lost: Lost[] } {
  const t = old.template && templateById(old.template.id);
  if (!t) return { design: old, lost: [] };
  const d = generate(t, material, params);
  d.id = old.id;
  d.name = old.name;
  d.sheetMargin = old.sheetMargin;
  d.sheetSpacing = old.sheetSpacing;
  d.allowRotate = old.allowRotate;
  // the mission and what goes inside stay (milestone 40)
  if (old.mission) d.mission = { ...old.mission };
  if (old.contents) d.contents = old.contents.filter((c) => d.panels[c.baseId]).map((c) => ({ ...c }));
  const lost: Lost[] = [];
  // keep where root panels were moved to
  for (const id of d.order) {
    const o = old.panels[id];
    if (o && !Object.values(old.connections).some((c) => c.grown && c.b.panelId === id) && !Object.values(d.connections).some((c) => c.grown && c.b.panelId === id))
      // its position and its turn about the vertical (a turned box stays turned)
      d.panels[id].frame = { ...d.panels[id].frame, o: [...o.frame.o], u: [...o.frame.u], v: [...o.frame.v] };
  }
  for (const id of old.order) {
    const o = old.panels[id];
    if (!o) continue;
    if (id.startsWith(PREFIX)) {
      const n = d.panels[id];
      if (n) {
        n.details = JSON.parse(JSON.stringify(o.details));
        n.name = o.name;
        // a board's own material stays (its sizes are worked out in the working material)
        if (o.material && o.material !== material.id) n.material = o.material;
      } else if (o.details.length) lost.push({ panel: o.name, shapes: o.details.length });
    } else {
      // a panel the student added: keep it (and its connections below)
      d.panels[id] = JSON.parse(JSON.stringify(o));
      d.order.push(id);
    }
  }
  for (const c of Object.values(old.connections)) {
    const user = !c.a.panelId.startsWith(PREFIX) || !c.b.panelId.startsWith(PREFIX);
    if (user && d.panels[c.a.panelId] && d.panels[c.b.panelId]) d.connections[c.id] = JSON.parse(JSON.stringify(c));
  }
  if (old.materials) d.materials = JSON.parse(JSON.stringify(old.materials));
  // boards naming the old working material keep it
  if (old.material.id !== material.id && Object.values(d.panels).some((p) => p.material === old.material.id)) d.materials = { ...(d.materials ?? {}), [old.material.id]: { ...old.material } };
  for (const id of d.order) if (old.pieces[id]) d.pieces[id] = { ...old.pieces[id] };
  for (const [k, p] of Object.entries(old.placements)) if (p.manual && d.panels[pieceRoot(placementPiece(k))]) d.placements[k] = { ...p };
  // the design-wide joint choices (every material's) are kept, and the new material's apply to the regenerated joints
  if (old.joints) {
    d.joints = JSON.parse(JSON.stringify(old.joints));
    normalizeJoints(d);
    applyJointChoices(d);
  }
  solve(d);
  return { design: d, lost };
}

/** Change the material (or its values); a template design regenerates so lids, slots and sizes follow. */
export function changeMaterial(d: Design, m: MaterialProfile): { design: Design; lost: Lost[] } {
  if (d.template) return regenerate(d, d.template.params, m);
  const copy: Design = JSON.parse(JSON.stringify(d));
  setMaterial(copy, m);
  return { design: copy, lost: [] };
}

export function templateIssues(d: Design): TemplateIssue[] {
  const t = d.template && templateById(d.template.id);
  return t?.check ? t.check(d, d.template!.params) : [];
}
