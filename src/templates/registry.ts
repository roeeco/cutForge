// Template registry and regeneration. Generated entities get stable ids
// (`t:<role>`), so user-added shapes stay attached to their panels when a
// parameter changes; edits that cannot be kept are listed.
import { pieceRoot, placementPiece } from '../model/keys';
import type { Design, Detail, Frame, MaterialProfile, V3 } from '../model/types';
import { v3add, v3cross, v3dot, v3len, v3mul, v3norm, v3sub } from '../geom/v3';
import type { Params, TemplateDef, TemplateIssue } from './types';
import { organiser } from './organiser';
import { stand } from './stand';
import { box, cleanAll, tray } from './structures/box';
import { carton, sleeve } from './structures/carton';
import { drawer } from './structures/drawer';
import { cardHolder, envelope, folder } from './structures/flat';
import { insert } from './structures/insert';
import { diceTower, magazineFile, mailer } from './structures/shaped';
import { birdHouse, bookend, frontOpen, penHolder, scoopTray, slideBox } from './structures/boardBoxes';
import { bottleRack, gridInsert, laptopStand, shelf } from './structures/boardSlots';
import { deskSign, slantedShelf } from './structures/boardStands';
import { binRack, wallRack } from './structures/boardRacks';
import { frame, spool } from './structures/boardLayers';
import { gameBoard, gearbox } from './structures/boardGears';
import { sieveStack, stackBin } from './structures/boardStacks';
import { chamferBox, coffinBox, starBox, tetrominoBox } from './structures/boardOutlines';
import { heartBox, roundPolyBox, roundTrapBox, uBox } from './structures/boardBends';
import { dividerTray, scoopOrganiser } from './structures/boardTrays';
import { caddy, castle, consoleBox, dispenser, gridfinityBase } from './structures/boardCases';
import { flyerStand, honeycombRack, motorBracket, pegboard, recordRack } from './structures/boardMounts';
import { flexDoor, rollTop } from './structures/boardFlex';
import { drillStand, hopper, pinRow, pliersHolder, rollHolder, toolHolder, wallHooks, wallSteps } from './structures/boardWall';
import { bookCover, bottleStack, canDispenser, clockFace, jarRack, louvreBox, showcase } from './structures/boardShow';
import { applyJointChoices, createDesign, setMaterial, solve } from '../model/ops';
import { normalizeJoints } from '../model/jointDefaults';
import { chooseMaterial } from '../sentence/resolve';
import { dividerRow, dividersOn, MIN_COMPARTMENT, setDividerPos } from '../model/dividers';
import { chest, diceBox } from './structures/boardHinges';

// the card stand in the sentence (milestone 98): a change the engine would not cut clean (a stand bigger than a sheet) is refused
stand.accepts = (m, p) => (cleanAll(stand, m, p) ? null : 'sen.why.engineSize');
export const TEMPLATES: TemplateDef[] = [organiser, stand, box, tray, carton, sleeve, drawer, envelope, folder, cardHolder, insert, magazineFile, diceTower, mailer, frontOpen, penHolder, scoopTray, birdHouse, laptopStand, gridInsert, shelf, bottleRack, deskSign, slantedShelf, bookend, slideBox, binRack, wallRack, frame, spool, stackBin, sieveStack, chamferBox, coffinBox, tetrominoBox, starBox, uBox, roundPolyBox, roundTrapBox, heartBox, dividerTray, scoopOrganiser, consoleBox, dispenser, castle, gridfinityBase, caddy, recordRack, flyerStand, motorBracket, pegboard, honeycombRack, diceBox, chest, rollTop, flexDoor, gearbox, gameBoard, toolHolder, pliersHolder, wallHooks, pinRow, rollHolder, hopper, wallSteps, drillStand, showcase, louvreBox, canDispenser, bottleStack, jarRack, bookCover, clockFace];
/** The sentence's structures (milestone 95): templates with a word of their own, never `planned` ones. */
export const STRUCTURES = (): TemplateDef[] => TEMPLATES.filter((t) => t.word && t.status !== 'planned');
/** The preset cards of the welcome screen's older grid: templates that are not sentence structures. */
export const PRESET_CARDS = (): TemplateDef[] => TEMPLATES.filter((t) => !t.word);
export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
export const PREFIX = 't:';

export function defaults(t: TemplateDef): Params {
  return Object.fromEntries(t.params.map((p) => [p.key, p.default]));
}

/**
 * Rename panel and connection ids throughout a design: every key and every
 * string value that is exactly an old id, wherever it is (a closure keyed by
 * its lid, a lid's tray, a divider's ends, a joint's geometry), so a
 * structure's own references follow (milestone 95). A connection between two
 * generated panels gets a stable id from its two ends.
 */
function renameIds(d: Design, map: Map<string, string>) {
  const r = (id: string) => map.get(id) ?? id;
  const all = new Map(map);
  // (edge keys written as the old edge numbers, so ids stay the same across schema versions)
  const n = (e: string) => (e === 'face' ? '-1' : e.replace(/^e(\d+)$/, '$1'));
  for (const c of Object.values(d.connections)) {
    const a = r(c.a.panelId), b = r(c.b.panelId);
    // a joint the engine derives (a Flat lid's tabs `lidtab:…`, a closure `close:…`, a wing, a split `~n`) is made again by `solve` under its own id
    if (/[:/~|]/.test(c.id)) continue;
    if (a.startsWith(PREFIX) && b.startsWith(PREFIX)) all.set(c.id, `${PREFIX}c:${a.slice(2)}.${n(c.a.edge)}-${b.slice(2)}.${n(c.b.edge)}`);
  }
  // trays get stable ids too, and every id built from a tray's (a carton's top `<tray>/top`, its fold `<tray>/top/c`, an end `end:<tray>:top`) follows
  const trays = Object.keys(d.trays ?? {});
  const trayIds = new Map(trays.map((id, k) => [id, `${PREFIX}tray${k + 1}`]));
  const sub = (x: string) => {
    if (all.has(x)) return all.get(x)!;
    for (const [o, n2] of trayIds) if (x.includes(o)) return x.split(o).join(n2);
    return x;
  };
  const deep = (x: unknown): unknown => {
    if (typeof x === 'string') return sub(x);
    if (Array.isArray(x)) return x.map(deep);
    if (x && typeof x === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(x)) o[sub(k)] = deep(v);
      return o;
    }
    return x;
  };
  const next = deep(d) as Design;
  for (const k of Object.keys(next) as (keyof Design)[]) (d as Record<string, unknown>)[k] = next[k];
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
  // what the template made last time, to tell its own shapes from the student's
  const fresh = generate(t, old.material, old.template!.params);
  keepMove(old, fresh, d);
  for (const id of old.order) {
    const o = old.panels[id];
    if (!o) continue;
    if (id.startsWith(PREFIX)) {
      const n = d.panels[id];
      if (n) {
        n.details = keepDetails(o.details, fresh.panels[id]?.details ?? [], n.details);
        n.name = o.name;
        // a board's own material stays (its sizes are worked out in the working material)
        if (o.material && o.material !== material.id) n.material = o.material;
        // milestone 184: a board the student asked to split with keys stays asked
        if (o.keyed) n.keyed = true;
      } else {
        const mine = studentDetails(o.details, fresh.panels[id]?.details ?? []).mine;
        if (mine.length) lost.push({ panel: o.name, shapes: mine.length });
      }
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
  keepDividerPlaces(old, d, fresh);
  solve(d);
  return { design: d, lost };
}

const isRoot = (x: Design, id: string) => !!x.panels[id] && !Object.values(x.connections).some((c) => c.grown && c.b.panelId === id);
const unit = (f: Frame): [V3, V3, V3] => {
  const u = v3norm(f.u), v = v3norm(f.v);
  return [u, v, v3norm(v3cross(u, v))];
};

/**
 * Where the student moved or turned the design stays, as one move of the whole design (exploratory test report, a
 * sweep of the variant switches): the move is read off one board the old and the new design share (the template's
 * place for it at the old settings, `fresh`, against where it is now) and applied to every board standing on its own
 * in the new design. Each board used to keep its own old place, so a design of several boards placed against each
 * other (a ramp, stacked layers, a panel in slots, a roll top's shells) came apart when a size or variant moved them,
 * and a board new to the variant stood where the template puts it, away from a moved box.
 */
function keepMove(old: Design, fresh: Design, d: Design) {
  const anchor = fresh.order.find((id) => isRoot(fresh, id) && isRoot(old, id) && d.panels[id]);
  if (!anchor) return;
  const F = fresh.panels[anchor].frame, O = old.panels[anchor].frame;
  const bf = unit(F), bo = unit(O);
  // the turn taking the template's axes to the moved board's, then the shift
  const turn = (x: V3): V3 => bf.reduce<V3>((s, b, i) => v3add(s, v3mul(bo[i], v3dot(x, b))), [0, 0, 0]);
  const still = v3len(v3sub(F.o, O.o)) < 1e-9 && bf.every((b, i) => v3len(v3sub(b, bo[i])) < 1e-9);
  if (still) return;
  for (const id of d.order) {
    if (!isRoot(d, id)) continue;
    const f = d.panels[id].frame;
    d.panels[id].frame = { ...f, o: v3add(O.o, turn(v3sub(f.o, F.o))), u: turn(f.u), v: turn(f.v) };
  }
}

/** A shape's content without its id (ids are new each time a template is generated). */
const shapeSig = (x: Detail) => JSON.stringify({ ...x, id: undefined }, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v));

/**
 * Split a template board's shapes into the ones its template made and the student left alone (`was`, the template's
 * shapes last time, matched by content) and the student's own: added, or a template shape the student changed.
 * `gone` are the template's shapes the student changed or deleted.
 */
function studentDetails(old: Detail[], was: Detail[]): { mine: Detail[]; gone: Detail[] } {
  const left = [...was];
  const mine: Detail[] = [];
  for (const x of old) {
    const k = left.findIndex((w) => shapeSig(w) === shapeSig(x));
    if (k >= 0) left.splice(k, 1);
    else mine.push(x);
  }
  return { mine, gone: left };
}

/**
 * A template board's shapes after its template is generated again (exploratory test report, finding 1): the shapes
 * the template makes now (`now`: a window, a finger notch, handle slots, at the new sizes), and the student's own.
 * A template shape the student changed stays as the student left it, and one the student deleted stays deleted: in
 * both cases the new shape of the same kind nearest to it is not added.
 */
function keepDetails(old: Detail[], was: Detail[], now: Detail[]): Detail[] {
  const { mine, gone } = studentDetails(old, was);
  const out = [...now];
  for (const g of gone) {
    let best = -1, bd = Infinity;
    out.forEach((x, k) => {
      const dd = Math.hypot(x.cx - g.cx, x.cy - g.cy);
      if (x.shape === g.shape && x.op === g.op && dd < bd) (best = k), (bd = dd);
    });
    if (best >= 0) out.splice(best, 1);
  }
  return [...out, ...JSON.parse(JSON.stringify(mine))];
}

/**
 * Dividers stay where the student put them when a template's sizes change
 * (milestone 92, GUIDED_MODE.md G1 item 2). In a row the student changed (a
 * divider moved from where the template put it, or one the student added),
 * each divider that is still there keeps its place as a share of the row; a
 * new one (the count went up) goes to the middle of the widest space. A row no
 * one moved keeps the template's even spacing. If any space would end smaller
 * than `MIN_COMPARTMENT`, the row keeps the template's places.
 */
function keepDividerPlaces(old: Design, d: Design, fresh: Design) {
  const centre = (x: Design, id: string) => {
    const r = dividerRow(x, id);
    return r && { c: r.pos + r.t / 2, lo: r.lo, hi: r.hi, t: r.t };
  };
  for (const baseId of d.order) {
    const ids = dividersOn(d, baseId);
    if (!ids.length) continue;
    // rows: dividers on this base turned the same way
    const rows = new Map<number, string[]>();
    for (const id of ids) {
      const k = Math.round((((d.panels[id].divider!.rot % 180) + 180) % 180) * 1000);
      rows.set(k, [...(rows.get(k) ?? []), id]);
    }
    for (const row of rows.values()) {
      const kept = row.filter((id) => old.panels[id] && old.panels[id].divider && old.panels[id].place?.host === baseId);
      if (!kept.length) continue;
      const moved = kept.some((id) => {
        if (!id.startsWith(PREFIX)) return true;
        const a = old.panels[id].divider!.at, f = fresh?.panels[id]?.divider?.at;
        return !f || Math.hypot(a.x - f.x, a.y - f.y) > 0.01;
      });
      if (!moved) continue;
      const before = new Map(row.map((id) => [id, { ...d.panels[id].divider!.at }]));
      const placed: { c: number; t: number }[] = [];
      for (const id of kept) {
        const o = centre(old, id), n = centre(d, id);
        if (!o || !n || o.hi - o.lo <= 1e-9) continue;
        const c = n.lo + ((o.c - o.lo) / (o.hi - o.lo)) * (n.hi - n.lo);
        setDividerPos(d, id, c - n.t / 2);
        placed.push({ c, t: n.t });
      }
      for (const id of row.filter((x) => !kept.includes(x))) {
        const n = centre(d, id);
        if (!n) continue;
        const edges = [n.lo, ...placed.sort((p, q) => p.c - q.c).flatMap((p) => [p.c - p.t / 2, p.c + p.t / 2]), n.hi];
        let best = 0, at = (n.lo + n.hi) / 2;
        for (let i = 0; i + 1 < edges.length; i += 2) if (edges[i + 1] - edges[i] > best) [best, at] = [edges[i + 1] - edges[i], (edges[i] + edges[i + 1]) / 2];
        setDividerPos(d, id, at - n.t / 2);
        placed.push({ c: at, t: n.t });
      }
      // no space smaller than the smallest compartment: else the template's places
      const r0 = centre(d, row[0]);
      if (r0) {
        const edges = [r0.lo, ...placed.sort((p, q) => p.c - q.c).flatMap((p) => [p.c - p.t / 2, p.c + p.t / 2]), r0.hi];
        let ok = true;
        for (let i = 0; i + 1 < edges.length; i += 2) if (edges[i + 1] - edges[i] < MIN_COMPARTMENT - 1e-9) ok = false;
        if (!ok) for (const id of row) d.panels[id].divider = { ...d.panels[id].divider!, at: before.get(id)! };
      }
    }
  }
}

/** Change the material (or its values); a template design regenerates so lids, slots and sizes follow. */
export function changeMaterial(d: Design, m: MaterialProfile): { design: Design; lost: Lost[] } {
  const t = d.template && templateById(d.template.id);
  // a sentence's structure (milestone 99): its words checked for the new board first, as the welcome screen's
  // step 1 does (a carton on plywood becomes a box with a lid that lifts off; boards keep their roles)
  if (t && t.word && d.template) {
    const r = chooseMaterial(t, m, d.template.params, templateById);
    const from: Design = r.def.id === t.id ? d : { ...d, template: { id: r.def.id, version: r.def.version, params: r.params } };
    return regenerate(from, r.params, m);
  }
  if (d.template) return regenerate(d, d.template.params, m);
  const copy: Design = JSON.parse(JSON.stringify(d));
  setMaterial(copy, m);
  return { design: copy, lost: [] };
}

export function templateIssues(d: Design): TemplateIssue[] {
  const t = d.template && templateById(d.template.id);
  return t?.check ? t.check(d, d.template!.params) : [];
}
