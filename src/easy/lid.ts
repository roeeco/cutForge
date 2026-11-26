// A box's lid, one way (LIDS_LINES_PROJECTS_PLAN.md §4, §10.4; milestone 73).
// The engine has several kinds of lid, each stored its own way: a telescoping
// cap (a second tray, `Tray.lidOf`, milestone 71), a lid folded off the back
// wall (`Tray.top 'tuck'`, 67–68: a tuck lid on card and corrugated, a living
// hinge on plywood), an arched lid (71), the four flaps of a carton's top (68),
// or a board grown across the top with a plywood joint (*Fixed*: it cannot
// open). `boxLid` reads what a box has; `setBoxLid` replaces it with another,
// in one edit, carrying the shapes on the old lid's top to the new one. Both
// modes and Quick build's Wall / lid use these, so a lid is made one way.
import type { ClosureStyle, ConnectionKind, Design, Detail, Panel } from '../model/types';
import type { CloseAs } from '../store/store';
import { ARCH_STRIP, addArchedLid, addDropinLid, addFlatLid, addLayeredLid, addLid, autoConnect, defaultOffset, growPanel, parentConnection, seatingOf, setClosure, setTrayEnds, setTrayHeight, solve } from '../model/ops';
import { boxDividers, dropinOnFrame, flatLidsOf, flatOnFrame, lidOn, lidOnFrame } from '../model/lid';
import { knucklesOf, pinLidBoards } from '../model/pinHinge';
import { archLids, closureStyles, reachFor, sealFor, sealOf } from '../model/closures';
import { backAndFront, topLidId, trayRing } from '../model/cartons';
import { bendOf, connectionsFor, gluesByDefault, matOf } from '../model/materials';
import { designKind } from '../model/jointDefaults';
import { ghostPanel } from '../model/adapt';
import { validate } from '../model/validate';
import { NOTE_KEYS } from './notes';
import { keepingStatedSizes } from '../model/boxSize';
import { removePanelRecord } from '../model/place';
import { toLocal, toWorld } from '../model/frame';
import { bandOf, foldRadius } from '../model/bands';
import type { MsgKey } from '../i18n';

/** What a box's lid is. */
export type BoxLid =
  | { kind: 'none' }
  /** A lid of its own that lifts off: in milestone 73 the cap (a shallow tray over the box). */
  | { kind: 'liftoff'; style: LidStyle; tray?: string; top: string }
  /** Folded off the back wall's top: a tuck or tab lid on card and corrugated, a living hinge on plywood; or (milestone 176) a plywood lid hinged on pins. */
  | { kind: 'hinged'; lid: string; living: boolean; pins?: true }
  | { kind: 'arched'; lid: string; flap: string }
  /** A board grown across the top with a joint that does not fold: it closes the box for good. */
  | { kind: 'fixed'; lid: string }
  /** A carton's top closed by four flaps. */
  | { kind: 'flaps' };

/** What can be chosen in the *Lid* section (*Fixed*: the box closed for good, Workshop only). */
export type LidChoice = 'none' | 'liftoff' | 'hinged' | 'arched' | 'fixed';
/** The kinds of lid that lifts off (milestone 79): a shallow tray over the box, or one board resting on its walls. */
export type LidStyle = 'cap' | 'flat' | 'dropin' | 'plug' | 'brim';
export const LID_STYLES: LidStyle[] = ['cap', 'flat', 'dropin'];

const topEdge = (edge: string | number) => (typeof edge === 'number' ? `e${edge}` : String(edge)).split('#')[0] === 'e2';

/** The boards placed on `id` (milestone 173: a lid's plug, brim and handle), and every board grown off or placed on them. */
function placedOn(d: Design, id: string): string[] {
  const out: string[] = [];
  const todo = [id];
  while (todo.length) {
    const p = todo.pop()!;
    for (const q of d.order)
      if (d.panels[q]?.place?.host === p && !out.includes(q)) {
        out.push(q);
        todo.push(q, ...grownOff(d, q));
      }
  }
  for (const q of [...out]) for (const g of grownOff(d, q)) if (!out.includes(g)) out.push(g);
  return out;
}

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
  if (flat) return { kind: 'liftoff', style: flat.lidOf!.kind, top: flat.id };
  // milestone 176: a lid hinged on pins
  const pin = d.order.find((id) => d.panels[id]?.pinLid?.tray === trayId);
  if (pin) return { kind: 'hinged', lid: pin, living: false, pins: true };
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
  if (lid.kind === 'liftoff') return [lid.top, ...grownOff(d, lid.top), ...placedOn(d, lid.top)];
  // milestone 176: a pin-hinged lid and its hinges' knuckles, the lid's and the box's
  if (lid.kind === 'hinged' && lid.pins) return [...new Set([...pinLidBoards(d, lid.lid), ...knucklesOf(d, lid.lid).map((p) => p.id), ...placedOn(d, lid.lid)])];
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
  if (lid.kind === 'liftoff' && (lid.style === 'flat' || lid.style === 'plug' || lid.style === 'brim')) return flatOnFrame(d, P, d.trays[trayId]) ?? P.frame;
  if (lid.kind === 'liftoff' && lid.style === 'dropin') return dropinOnFrame(d, P, d.trays[trayId]) ?? P.frame;
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
  // a box stated by its inside keeps that size whatever lid it gets (milestone 138, REPORT.md C7: a hinged lid made
  // it 3 mm lower inside, with no note)
  let out = { ok: false, dropped: 0 };
  keepingStatedSizes(d, () => void (out = setBoxLidAs(d, trayId, choice, style)));
  return out;
}

function setBoxLidAs(d: Design, trayId: string, choice: LidChoice, style?: LidStyle): { ok: boolean; dropped: number } {
  const t = d.trays?.[trayId];
  if (!t || t.lidOf) return { ok: false, dropped: 0 };
  const cur = boxLid(d, trayId);
  if (cur.kind === choice && (choice !== 'liftoff' || !style || (cur.kind === 'liftoff' && cur.style === style))) return { ok: true, dropped: 0 };
  // a carton closes with its tuck top or not at all
  if (t.base === 'open' && choice !== 'hinged' && choice !== 'none') return { ok: false, dropped: 0 };
  const carried = removeLid(d, trayId, cur);
  if (choice === 'liftoff') {
    const st = style ?? autoStyle(d, trayId);
    if (st === 'flat') addFlatLid(d, trayId);
    else if (st === 'plug' || st === 'brim') addLayeredLid(d, trayId, st);
    else if (st === 'dropin') addDropinLid(d, trayId);
    else addLid(d, trayId);
  }
  else if (choice === 'hinged') setTrayEnds(d, trayId, { top: 'tuck' });
  else if (choice === 'arched') addArchedLid(d, trayId);
  else if (choice === 'fixed') addFixedTop(d, trayId);
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
 * The joint a board grown across a box's top to close it for good takes (26 November): the one the student picked
 * on the grow card when it does not fold, else the design's *Wall to base* choice that does not fold, else the
 * material's own: fingers on plywood, a glue flap on card and 1.6 mm board, tabs and slots on 4 mm board. A fold
 * would make it a lid that opens (`boxLid`: *hinged*).
 */
export function fixedKind(d: Design, wallId: string, picked?: ConnectionKind): ConnectionKind {
  const m = matOf(d, wallId);
  const ok: ConnectionKind[] = connectionsFor(m, 90).filter((k) => k !== 'fold');
  if (picked && ok.includes(picked)) return picked;
  return designKind(d, 'base', ok, m.kind) ?? (m.kind === 'plywood' ? ok[0] : gluesByDefault(m) ? 'glue' : 'tabslot');
}

/**
 * A top fixed on, in any material (26 November; milestone 171's closed top was plywood only): a board grown off the
 * back wall's top edge with `fixedKind`, as deep as the front wall's outside face, then joined to every wall it meets
 * (the other three take the design's corner joint: glue flaps on card and 1.6 mm board). It does not open.
 */
export function addFixedTop(d: Design, trayId: string, picked?: ConnectionKind): string | null {
  const t = d.trays?.[trayId];
  const back = t && backAndFront(d, t).back;
  if (!t || !back || !d.panels[back.wall]) return null;
  const kind = fixedKind(d, back.wall, picked);
  // where the front wall's faces are along a board of this joint (a tab-and-slot board stands in by its offset)
  const offset = defaultOffset(d, kind, back.wall);
  const probe = ghostPanel(d, back.wall, 'e2', { height: 2000, angle: 90, dir: 'up', kind, offset, seating: seatingOf(kind), span: null });
  const r = probe && reachFor(d, probe, back.wall, 'ghost');
  if (!r) return null;
  const g = growPanel(d, back.wall, 'e2', { height: r.yOut, angle: 90, dir: 'up', kind, pref: kind });
  if (!g) return null;
  solve(d);
  autoConnect(d);
  return g.panelId;
}

/**
 * A board grown across a box's top as *Fixed* (the grow card's ✓): as deep as the front wall's outside face for its
 * own joint, whatever depth the ghost had within the reach (a glue flap's board sits where a fold's would not), then
 * joined to every wall it meets.
 */
function fitFixedTop(d: Design, id: string) {
  const L = d.panels[id];
  const c = parentConnection(d, id);
  if (!L || !c || c.kind === 'fold') return;
  const r = reachFor(d, L, c.a.panelId, c.id);
  // a plain board only: an outline drawn by hand keeps its depth
  const plain = L.sketch.kind === 'wall' && !Object.keys(L.sketch.corners ?? {}).length && !L.sketch.inserts?.length;
  if (r && plain && Math.abs(L.h - r.yOut) > 0.05) L.h = r.yOut;
  solve(d);
  autoConnect(d);
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
  // a hinged lid is a flat board folded off the back wall: over rounded corners it covers only part of the opening
  // (milestone 138, REPORT.md C1; gated until curved walls are structural, QA_FIX_PLAN.md S6)
  const B = d.panels[t.baseId];
  if (choice === 'hinged' && t.base !== 'open' && B?.sketch.kind === 'poly' && B.sketch.pts.some((q) => q.curve)) return 'lid.why.hingeRound';
  // a flat board fixed across the top covers no more of a rounded opening (26 November)
  if (choice === 'fixed' && B?.sketch.kind === 'poly' && (B.sketch.round || B.sketch.pts.some((q) => q.curve))) return 'lid.why.fixedRound';
  if (choice === 'liftoff' || boxLid(d, trayId).kind === choice) return null;
  // what the answer depends on: the box's base, walls, tray settings and material (not shapes, names or other boards)
  const key = boxKey(d, trayId) + '|' + choice;
  if (whyCache.has(key)) return whyCache.get(key)!;
  const why = probeWhy(d, trayId, choice);
  if (whyCache.size > 200) whyCache.delete(whyCache.keys().next().value!);
  whyCache.set(key, why);
  return why;
}

/**
 * The numbers a lid's reason names (milestone 138, REPORT.md I9: "needs a box tall enough" said neither how tall nor
 * that depth was the problem): an arched lid's least inside depth and height in this board, and its bend.
 */
export function lidWhyVars(d: Design, trayId: string, choice: LidChoice): Record<string, number> {
  const t = d.trays?.[trayId];
  if (!t || choice !== 'arched') return {};
  const m = matOf(d, t.baseId);
  const r = Math.ceil(Math.max(m.thickness + 1, bendOf(m).patternR + m.thickness));
  return { r, depth: 2 * r + ARCH_STRIP, height: r + 7 };
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
  const no: MsgKey = choice === 'arched' ? 'lid.why.arch' : choice === 'fixed' ? 'lid.why.cannot' : matOf(d, t.baseId).kind === 'plywood' ? 'lid.why.hingeSmall' : 'lid.why.cannot';
  const probe = structuredClone(d) as Design;
  if (!setBoxLid(probe, trayId, choice).ok) return no;
  const lid = boxLid(probe, trayId);
  // a fixed top is joined on every wall it meets, so it is offered only where that leaves no new problem (26 November)
  if (lid.kind === 'fixed') {
    const sig = (i: { key: string; vars: unknown }) => `${i.key}|${JSON.stringify(i.vars)}`;
    const had = new Set(validate(d).filter((i) => !NOTE_KEYS.has(i.key)).map(sig));
    if (validate(probe).some((i) => !NOTE_KEYS.has(i.key) && !had.has(sig(i)))) return 'lid.why.fixedProblem';
  }
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
export function closeChoices(d: Design, wallId: string, edge: string, ghost: Pick<Panel, 'id' | 'w' | 'h' | 'frame'> | null, picked?: ConnectionKind): { tray: string; options: CloseAs[]; why: Partial<Record<CloseAs, MsgKey>> } | null {
  const tr = ghost ? boxOfWallTop(d, wallId, edge) : null;
  if (!tr || !sealFor(d, ghost!, wallId, 'ghost')) return null;
  const t = d.trays[tr];
  if (t.base === 'open') return { tray: tr, options: ['hinged'], why: {} };
  const kind = matOf(d, t.baseId).kind;
  // a fixed top can be greyed with its reason like any lid (a round box, a problem it would leave)
  const fixedWhy = lidWhy(d, tr, 'fixed');
  const fw: Partial<Record<CloseAs, MsgKey>> = fixedWhy ? { fixed: fixedWhy } : {};
  // on card and corrugated, a joint picked on the grow card that does not fold (glue, tabs) asks for a board joined
  // shut, not a folded lid that opens: *Fixed* comes first (plywood's own joints never fold, so there one that opens
  // stays first, milestone 77)
  const asked = kind !== 'plywood' && !!picked && picked !== 'fold' && !fixedWhy;
  if (kind === 'plywood') {
    const why = lidWhy(d, tr, 'hinged');
    // one that opens comes first
    const opens: CloseAs[] = why ? ['liftoff', 'hinged'] : ['hinged', 'liftoff'];
    return { tray: tr, options: asked ? ['fixed', ...opens] : [...opens, 'fixed'], why: { ...(why ? { hinged: why } : {}), ...fw } };
  }
  // card and corrugated (26 November): the closure styles fold a lid that opens; *Fixed* joins the board shut on every wall
  const styles = closureStyles(kind).map((s) => `style:${s}` as CloseAs);
  return { tray: tr, options: asked ? ['fixed', ...styles, 'liftoff'] : [...styles, 'liftoff', 'fixed'], why: fw };
}

/**
 * Make what a grow that closes a box was chosen to make (one edit): the board made (a lid's top), or null. `grow`
 * grows the ghost with the joint it is given (a fold for a closure style; for *Fixed*, `fixedKind`: never a fold).
 */
export function closeAsRecipe(d: Design, tray: string, choice: CloseAs, grow: (own?: ConnectionKind) => string | null, wallId?: string, picked?: ConnectionKind): string | null {
  if (choice === 'liftoff' || choice === 'hinged') {
    setBoxLid(d, tray, choice);
    const lid = boxLid(d, tray);
    return lid.kind === 'liftoff' ? lid.top : lid.kind === 'hinged' ? lid.lid : null;
  }
  if (choice === 'fixed') {
    const wall = wallId ?? backAndFront(d, d.trays[tray]).back?.wall;
    const id = wall ? grow(fixedKind(d, wall, picked)) : null;
    if (id) fitFixedTop(d, id);
    return id;
  }
  const id = grow('fold');
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
  if (style === 'dropin') {
    // it rests on the dividers, its thickness below the walls' tops
    const divs = boxDividers(d, t);
    const tL = matOf(d, t.baseId).thickness;
    if (!divs.length || Math.max(...divs.map((p) => p.h)) > t.height - tL + 1e-6) return 'lid.why.dropinDividers';
    return null;
  }
  // milestone 173: a plug or a brim under the top, plywood only, inside straight walls (a brim: four of them)
  if ((style === 'plug' || style === 'brim') && matOf(d, t.baseId).kind !== 'plywood') return 'lid.why.layerPly';
  if ((style === 'plug' || style === 'brim') && (B?.sketch.kind !== 'poly' || B.sketch.round || B.sketch.pts.some((q) => q.curve))) return 'lid.why.flatRound';
  if (style === 'brim' && B?.sketch.kind === 'poly' && B.sketch.pts.length !== 4) return 'lid.why.brimRect';
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

/** Why a box's lid cannot take a padlock (milestone 82), or null. Hasps go through a Flat lid, which plywood makes. */
export function locksWhy(d: Design, trayId: string): MsgKey | null {
  const t = d.trays?.[trayId];
  if (!t) return 'lid.why.none';
  if (matOf(d, t.baseId).kind !== 'plywood') return 'lid.why.locksPly';
  const lid = boxLid(d, trayId);
  if (lid.kind !== 'liftoff' || lid.style !== 'flat') return 'lid.why.locksFlat';
  return null;
}
