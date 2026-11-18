// A box's lid, one way (LIDS_LINES_PROJECTS_PLAN.md §4, §10.4; milestone 73).
// The engine has several kinds of lid, each stored its own way: a telescoping
// cap (a second tray, `Tray.lidOf`, milestone 71), a lid folded off the back
// wall (`Tray.top 'tuck'`, 67–68: a tuck lid on card and corrugated, a living
// hinge on plywood), an arched lid (71), the four flaps of a carton's top (68),
// or a board grown across the top with a plywood joint (*Fixed*: it cannot
// open). `boxLid` reads what a box has; `setBoxLid` replaces it with another,
// in one edit, carrying the shapes on the old lid's top to the new one. Both
// modes and Quick build's Wall / lid use these, so a lid is made one way.
import type { ClosureStyle, Design, Detail, Panel } from '../model/types';
import type { CloseAs } from '../store/store';
import { addArchedLid, addFlatLid, addLid, parentConnection, setClosure, setTrayEnds, setTrayHeight, solve } from '../model/ops';
import { flatLidsOf, flatOnFrame, lidOn, lidOnFrame } from '../model/lid';
import { archLids, closureStyles, reachFor, sealFor, sealOf } from '../model/closures';
import { topLidId, trayRing } from '../model/cartons';
import { matOf } from '../model/materials';
import { removePanelRecord } from '../model/place';
import { toLocal, toWorld } from '../model/frame';
import { bandOf, foldRadius } from '../model/bands';
import type { MsgKey } from '../i18n';

/** What a box's lid is. */
export type BoxLid =
  | { kind: 'none' }
  /** A lid of its own that lifts off: in milestone 73 the cap (a shallow tray over the box). */
  | { kind: 'liftoff'; style: LidStyle; tray?: string; top: string }
  /** Folded off the back wall's top: a tuck or tab lid on card and corrugated, a living hinge on plywood. */
  | { kind: 'hinged'; lid: string; living: boolean }
  | { kind: 'arched'; lid: string; flap: string }
  /** A board grown across the top with a joint that does not fold: it closes the box for good. */
  | { kind: 'fixed'; lid: string }
  /** A carton's top closed by four flaps. */
  | { kind: 'flaps' };

/** What can be chosen in the *Lid* section. */
export type LidChoice = 'none' | 'liftoff' | 'hinged' | 'arched';
/** The kinds of lid that lifts off (milestone 79): a shallow tray over the box, or one board resting on its walls. */
export type LidStyle = 'cap' | 'flat';
export const LID_STYLES: LidStyle[] = ['cap', 'flat'];

const topEdge = (edge: string | number) => (typeof edge === 'number' ? `e${edge}` : String(edge)).split('#')[0] === 'e2';

/** The boards grown off `id`, and theirs (not `id` itself). */
function grownOff(d: Design, id: string): string[] {
  const out: string[] = [];
  const todo = [id];
  while (todo.length) {
    const p = todo.pop()!;
    for (const c of Object.values(d.connections))
      if (c.grown && c.a.panelId === p && d.panels[c.b.panelId] && !out.includes(c.b.panelId)) {
        out.push(c.b.panelId);
        todo.push(c.b.panelId);
      }
  }
  return out;
}

/** The lid a box's tray has. */
export function boxLid(d: Design, trayId: string): BoxLid {
  const t = d.trays?.[trayId];
  if (!t || t.lidOf) return { kind: 'none' };
  const cap = lidOn(d, trayId);
  if (cap && d.panels[cap.baseId]) return { kind: 'liftoff', style: 'cap', tray: cap.id, top: cap.baseId };
  const flat = flatLidsOf(d, trayId)[0];
  if (flat) return { kind: 'liftoff', style: 'flat', top: flat.id };
  if (t.top === 'tuck' && d.panels[topLidId(t)]) return { kind: 'hinged', lid: topLidId(t), living: matOf(d, topLidId(t)).kind === 'plywood' };
  if (t.top === 'seal') return { kind: 'flaps' };
  const ring = trayRing(d, t).map((r) => r.wall);
  for (const a of archLids(d)) {
    const hinge = parentConnection(d, a.lid);
    if (hinge && ring.includes(hinge.a.panelId)) return { kind: 'arched', lid: a.lid, flap: a.flap };
  }
  // a board grown from a wall's top edge, square, across to the far wall
  for (const c of Object.values(d.connections)) {
    if (!c.grown || !ring.includes(c.a.panelId) || !topEdge(c.a.edge) || Math.abs(c.angle - 90) > 1e-6) continue;
    const L = d.panels[c.b.panelId];
    if (!L) continue;
    if (c.kind === 'fold' && sealOf(d, L.id)) return { kind: 'hinged', lid: L.id, living: matOf(d, L.id).kind === 'plywood' };
    if (c.kind !== 'fold' && sealFor(d, L, c.a.panelId, c.id)) return { kind: 'fixed', lid: L.id };
  }
  return { kind: 'none' };
}

/** The boards that make a box's lid (to remove it, or to show its section on their cards). */
export function lidParts(d: Design, lid: BoxLid): string[] {
  if (lid.kind === 'none' || lid.kind === 'flaps') return [];
  if (lid.kind === 'liftoff') return [lid.top, ...grownOff(d, lid.top)];
  return [lid.lid, ...grownOff(d, lid.lid)];
}

/** The board that is a lid's top: where its shapes are. */
function lidTop(lid: BoxLid): string | null {
  return lid.kind === 'liftoff' ? lid.top : lid.kind === 'hinged' || lid.kind === 'arched' || lid.kind === 'fixed' ? lid.lid : null;
}

/** The box tray a board belongs to as a box or as its lid (null when it is neither). */
export function boxOfPanel(d: Design, panelId: string): string | null {
  for (const t of Object.values(d.trays ?? {})) {
    if (t.lidOf) continue;
    if (t.baseId === panelId) return t.id;
    if (lidParts(d, boxLid(d, t.id)).includes(panelId)) return t.id;
  }
  return null;
}


/** Where a lid's top is when the box is closed: a lid of its own lies beside its box (milestone 76), so its pose on the box. */
function topPose(d: Design, trayId: string, lid: BoxLid, P: Panel): Panel['frame'] {
  if (lid.kind === 'liftoff' && lid.style === 'flat') return flatOnFrame(d, P, d.trays[trayId]) ?? P.frame;
  return (lid.kind === 'liftoff' && lidOnFrame(d, P, d.trays[trayId])) || P.frame;
}

/** Take a box's lid off; the shapes on its top are returned in world space with their own settings. */
function removeLid(d: Design, trayId: string, lid: BoxLid): { dt: Detail; at: [number, number, number] }[] {
  const t = d.trays[trayId];
  const top = lidTop(lid);
  const P = top ? d.panels[top] : undefined;
  const F = P && topPose(d, trayId, lid, P);
  const carried = P && F ? P.details.map((dt) => ({ dt, at: toWorld(F, dt.cx, dt.cy) as [number, number, number] })) : [];
  if (P) P.details = [];
  // a tuck top is kept by its tray: what was grown off it goes first, then the tray lets it go
  if (lid.kind === 'hinged' && t.top === 'tuck') {
    for (const id of grownOff(d, lid.lid)) removePanelRecord(d, id);
    setTrayEnds(d, trayId, { top: 'open' });
  }
  else if (lid.kind === 'flaps') setTrayEnds(d, trayId, { top: 'open' });
  else if (lid.kind !== 'none') {
    if (lid.kind === 'liftoff' && lid.tray) delete d.trays[lid.tray];
    for (const id of lidParts(d, lid)) removePanelRecord(d, id);
    solve(d);
  }
  return carried;
}

/**
 * Give a box the lid chosen (one edit; the caller's `apply` makes it one undo
 * step). The lid it had goes, with every board and joint of it; the shapes on
 * its top go onto the new lid's top where they were (by their place above the
 * box), and those that do not fit are dropped and counted.
 */
export function setBoxLid(d: Design, trayId: string, choice: LidChoice, style?: LidStyle): { ok: boolean; dropped: number } {
  const t = d.trays?.[trayId];
  if (!t || t.lidOf) return { ok: false, dropped: 0 };
  const cur = boxLid(d, trayId);
  if (cur.kind === choice && (choice !== 'liftoff' || !style || (cur.kind === 'liftoff' && cur.style === style))) return { ok: true, dropped: 0 };
  // a carton closes with its tuck top or not at all
  if (t.base === 'open' && choice !== 'hinged' && choice !== 'none') return { ok: false, dropped: 0 };
  const carried = removeLid(d, trayId, cur);
  if (choice === 'liftoff') (style ?? autoStyle(d, trayId)) === 'flat' ? addFlatLid(d, trayId) : addLid(d, trayId);
  else if (choice === 'hinged') setTrayEnds(d, trayId, { top: 'tuck' });
  else if (choice === 'arched') addArchedLid(d, trayId);
  const now = boxLid(d, trayId);
  const top = lidTop(now);
  const P = top ? d.panels[top] : undefined;
  let dropped = 0;
  for (const { dt, at } of carried) {
    if (!P) {
      dropped++;
      continue;
    }
    const q = toLocal(topPose(d, trayId, now, P), at);
    const hw = dt.w / 2, hh = dt.h / 2;
    if (q.x - hw < 0 || q.y - hh < 0 || q.x + hw > P.w || q.y + hh > P.h) {
      dropped++;
      continue;
    }
    P.details.push({ ...dt, cx: q.x, cy: q.y });
  }
  if (carried.length) solve(d);
  return { ok: now.kind === choice, dropped };
}

/**
 * Why a lid cannot be chosen for this box (null when it can). A lid that
 * lifts off can always be made; one that folds is tried on a copy of the
 * design, and refused when it does not close the box or a bend of it does not
 * fit or reach (a living hinge too tight for a small plywood box). Only the
 * new lid's bends are checked, not the whole design: the card asks on every
 * edit.
 */
export function lidWhy(d: Design, trayId: string, choice: LidChoice): MsgKey | null {
  const t = d.trays?.[trayId];
  if (!t || t.lidOf) return 'lid.why.none';
  if (choice === 'none') return null;
  const carton = t.base === 'open';
  if (carton && choice !== 'hinged') return 'lid.why.carton';
  if (choice === 'arched' && t.top) return 'lid.why.arch';
  if (choice === 'liftoff' || boxLid(d, trayId).kind === choice) return null;
  // what the answer depends on: the box's base, walls, tray settings and material (not shapes, names or other boards)
  const key = boxKey(d, trayId) + '|' + choice;
  if (whyCache.has(key)) return whyCache.get(key)!;
  const why = probeWhy(d, trayId, choice);
  if (whyCache.size > 200) whyCache.delete(whyCache.keys().next().value!);
  whyCache.set(key, why);
  return why;
}

const whyCache = new Map<string, MsgKey | null>();

/** The box's own geometry and settings, as a key. */
function boxKey(d: Design, trayId: string): string {
  const t = d.trays[trayId];
  const B = d.panels[t.baseId];
  const walls = trayRing(d, t).map((r) => {
    const W = d.panels[r.wall];
    const c = parentConnection(d, r.wall);
    return W && [r.edge, W.w, W.h, W.sketch, W.customHeight, W.material, c?.kind, c?.offset];
  });
  const m = matOf(d, t.baseId);
  return JSON.stringify([{ ...t, fixes: undefined, fixPlan: undefined }, B.w, B.h, B.sketch, B.material, m, walls]);
}

function probeWhy(d: Design, trayId: string, choice: LidChoice): MsgKey | null {
  const t = d.trays[trayId];
  const no: MsgKey = choice === 'arched' ? 'lid.why.arch' : matOf(d, t.baseId).kind === 'plywood' ? 'lid.why.hingeSmall' : 'lid.why.cannot';
  const probe = structuredClone(d) as Design;
  if (!setBoxLid(probe, trayId, choice).ok) return no;
  const lid = boxLid(probe, trayId);
  // a hinged lid closes the box (it reaches the far wall)
  if (lid.kind === 'hinged' && !sealOf(probe, lid.lid)) return no;
  for (const id of lidParts(probe, lid)) {
    const c = parentConnection(probe, id);
    const b = c?.kind === 'fold' ? bandOf(probe, c) : null;
    if ((c?.kind === 'fold' && matOf(probe, id).kind === 'plywood' && foldRadius(probe, c) <= 1e-6) || (b && (!b.fits || b.pattern.why))) return no;
  }
  return null;
}

/** The lid Quick build's Wall / lid makes when its ghost would close a box: lifts off on plywood; hinged on card and corrugated where it can. */
export function wallLidChoice(d: Design, trayId: string): LidChoice {
  const t = d.trays?.[trayId];
  if (!t) return 'liftoff';
  if (t.base === 'open') return 'hinged';
  return matOf(d, t.baseId).kind !== 'plywood' && !lidWhy(d, trayId, 'hinged') ? 'hinged' : 'liftoff';
}

/**
 * Quick build's Wall / lid (milestone 73): does this ghost, grown off a box
 * wall's top edge, close the box? Then ✓ makes the box's lid (`setBoxLid`
 * with this choice) and never a board jointed shut. Null otherwise.
 */
export function wallClosesBox(d: Design, wallId: string, edge: string, ghost: Pick<Panel, 'id' | 'w' | 'h' | 'frame'> | null): { tray: string; choice: LidChoice } | null {
  const tr = ghost ? boxOfWallTop(d, wallId, edge) : null;
  return tr && sealFor(d, ghost!, wallId, 'ghost') ? { tray: tr, choice: wallLidChoice(d, tr) } : null;
}

/** The box a tray wall belongs to, when `edge` is its top edge (for Wall / lid). */
export function boxOfWallTop(d: Design, wallId: string, edge: string): string | null {
  if (!topEdge(edge)) return null;
  const c = parentConnection(d, wallId);
  const t = c?.trayId ? d.trays?.[c.trayId] : undefined;
  return t && !t.lidOf ? t.id : null;
}

/**
 * A grow that would close a box (milestone 77, UI_CLEANUP_PLAN.md Part 5):
 * what ✓ can make, the default first. Card and corrugated: the fold with each
 * closure style of the material, or a lid that lifts off. Plywood: a living
 * hinge where it fits, a lid that lifts off, or the board with its joint
 * (*Fixed*). A carton closes with its tuck top. Null when the ghost does not
 * close a box. Whatever the ghost's joint: the box is closed by where the
 * board reaches, not by how it is joined.
 */
export function closeChoices(d: Design, wallId: string, edge: string, ghost: Pick<Panel, 'id' | 'w' | 'h' | 'frame'> | null): { tray: string; options: CloseAs[]; why: Partial<Record<CloseAs, MsgKey>> } | null {
  const tr = ghost ? boxOfWallTop(d, wallId, edge) : null;
  if (!tr || !sealFor(d, ghost!, wallId, 'ghost')) return null;
  const t = d.trays[tr];
  if (t.base === 'open') return { tray: tr, options: ['hinged'], why: {} };
  const kind = matOf(d, t.baseId).kind;
  if (kind === 'plywood') {
    const why = lidWhy(d, tr, 'hinged');
    // one that opens comes first
    return { tray: tr, options: why ? ['liftoff', 'hinged', 'fixed'] : ['hinged', 'liftoff', 'fixed'], why: why ? { hinged: why } : {} };
  }
  return { tray: tr, options: [...closureStyles(kind).map((s) => `style:${s}` as CloseAs), 'liftoff'], why: {} };
}

/** Make what a grow that closes a box was chosen to make (one edit): the board made (a lid's top), or null. */
export function closeAsRecipe(d: Design, tray: string, choice: CloseAs, grow: () => string | null): string | null {
  if (choice === 'liftoff' || choice === 'hinged') {
    setBoxLid(d, tray, choice);
    const lid = boxLid(d, tray);
    return lid.kind === 'liftoff' ? lid.top : lid.kind === 'hinged' ? lid.lid : null;
  }
  const id = grow();
  if (id && choice.startsWith('style:')) setClosure(d, id, { style: choice.slice(6) as ClosureStyle });
  return id;
}

/** The choice in force: the one picked if it is still offered, else the default (the first). */
export function closeChoice(c: { options: CloseAs[]; why: Partial<Record<CloseAs, MsgKey>> }, picked: CloseAs | null | undefined): CloseAs {
  return picked && c.options.includes(picked) && !c.why[picked] ? picked : c.options.find((o) => !c.why[o]) ?? c.options[0];
}

/**
 * Heights that mean something for a grow (milestone 78, UI_CLEANUP_PLAN.md
 * Part 4): the far wall a lid reaches, and the height of the boards grown
 * beside it from the same board (the neighbouring walls, the opposite one).
 * The height arrow snaps to them and names the one it is on.
 */
export function heightMarks(d: Design, panelId: string, ghost: Pick<Panel, 'id' | 'w' | 'h' | 'frame'> | null): { y: number; key: MsgKey; vars?: Record<string, string> }[] {
  const out: { y: number; key: MsgKey; vars?: Record<string, string> }[] = [];
  if (!ghost) return out;
  const r = reachFor(d, ghost, panelId, 'ghost');
  if (r) out.push({ y: Math.round(r.yIn * 100) / 100, key: 'grow.mark.reach' });
  // the boards grown from the same board as the ghost: its neighbours and the one across
  for (const c of Object.values(d.connections)) {
    const P = c.grown && c.a.panelId === panelId ? d.panels[c.b.panelId] : undefined;
    if (P && P.id !== ghost.id && !out.some((m) => Math.abs(m.y - P.h) < 0.05)) out.push({ y: P.h, key: 'grow.mark.asTall', vars: { panel: P.id } });
  }
  return out;
}

/**
 * Why a lid that lifts off cannot be made in this style (milestone 79,
 * LIDS_LINES_PROJECTS_PLAN.md §3.2), or null when it can. A cap can always be
 * made. A Flat lid needs board that holds a tab (not card), straight walls
 * (not a round box), walls all round, and their tops level.
 */
export function lidStyleWhy(d: Design, trayId: string, style: LidStyle): MsgKey | null {
  const t = d.trays?.[trayId];
  if (!t || t.lidOf) return 'lid.why.none';
  if (t.base === 'open') return 'lid.why.carton';
  if (style === 'cap') return null;
  const B = d.panels[t.baseId];
  if (matOf(d, t.baseId).kind === 'card') return 'lid.why.flatCard';
  if (B?.sketch.kind === 'poly' && B.sketch.round) return 'lid.why.flatRound';
  const ring = trayRing(d, t);
  const edges = B?.sketch.kind === 'poly' ? B.sketch.edgeIds.length : 4;
  if (ring.length < edges || t.openEdges?.length) return 'lid.why.openSide';
  const hs = ring.map((r) => d.panels[r.wall]);
  if (hs.some((w) => w?.customHeight || (w?.sketch.kind === 'wall' && (Object.keys(w.sketch.corners ?? {}).length || w.sketch.inserts?.length)))) return 'lid.why.notLevel';
  if (Math.max(...hs.map((w) => w?.h ?? 0)) - Math.min(...hs.map((w) => w?.h ?? 0)) > 0.05) return 'lid.why.notLevel';
  return null;
}

/** The style *Automatic* makes (milestone 79): a Flat lid on plywood where one can be made (one board, no glue), else a cap. */
export function autoStyle(d: Design, trayId: string): LidStyle {
  const t = d.trays?.[trayId];
  return t && matOf(d, t.baseId).kind === 'plywood' && !lidStyleWhy(d, trayId, 'flat') ? 'flat' : 'cap';
}

/** A cap's rim (milestone 79): *Shallow* (12 mm), *Half* or *Full* the box's height. */
export type CapRim = 'shallow' | 'half' | 'full';
export function capRimOf(d: Design, trayId: string): CapRim | null {
  const cap = lidOn(d, trayId), box = d.trays?.[trayId];
  if (!cap || !box) return null;
  const rim = cap.height - matOf(d, cap.baseId).thickness;
  return Math.abs(rim - box.height) < 0.5 ? 'full' : Math.abs(rim - box.height / 2) < 0.5 ? 'half' : 'shallow';
}
export function setCapRim(d: Design, trayId: string, rim: CapRim) {
  const cap = lidOn(d, trayId), box = d.trays?.[trayId];
  if (!cap || !box) return;
  const t = matOf(d, cap.baseId).thickness;
  setTrayHeight(d, cap.id, (rim === 'full' ? box.height : rim === 'half' ? box.height / 2 : 12) + t);
}
