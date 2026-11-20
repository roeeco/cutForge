// The 2D editor, used for the cut plan (every piece flat on its sheets) and
// for the solo panel view (one panel face-on). Both edit the same panels as
// the 3D workspace, with the same tools, selection and history.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { foldChips, ghostInNet, netEdges, type NetEdge } from './netPick';
import type { Selection as StoreSelection } from '../store/store';
import { Handles, Marquee, RotRing, useViewBox, type Box, type VB } from './canvas2d';
import { frameDrag, fromOwn, typedSize, type FrameBox, type FrameHandle } from './frameScale';
import { evalNumber } from '../ui/NumField';
import { isGuided, keepsCuttable, shown, useFeature, useMode } from '../easy/features';
import { keepOutZones } from '../easy/guard';
import { canEdit, movePoint, targetOf, type Edit2D } from '../sketch/edit2d';
import { pointInPolygon } from '../geom/vec';
import { snapPoint as skSnap, snapTargets as skTargets } from '../sketch/snap';
import { linePolyline } from '../model/lines';
import { Edit2DCard, Edit2DLayer, distToSegment } from './Edit2D';
import { detailSel, gridSnap, noSmartSnap, selectedDetailIds, selectedPanelIds, uiDir, useStore, useT } from '../store/store';
import { YieldBar } from '../ui/SplitUI';
import { pack, pieceCopies, placementXform, quantityOf, sheetGroups, type PieceCopy } from '../model/pack';
import { netOverlaps, panelPiece, pieceRoot } from '../model/pieces';
import { isOutlineShape } from '../model/outline';
import { contourPathD } from '../export/svg';
import { applyX, flattenContour, IDENTITY, invertPoint, xformContour } from '../geom/vec';
import { SNAP_PX, type Vec2, type Xform2 } from '../geom/types';
import { MIN_PANEL, addDetail, findDetail, newId, parentConnection, rotateDetails, setEdgeFlap, setPanelSize, updateDetail } from '../model/ops';
import { findEdge, isRectSketch, segInward } from '../model/edges';
import { edgeHasRoom, heightTargets, snapTo } from '../model/adapt';
import { heightMarks } from '../easy/lid';
import { trayRing } from '../model/cartons';
import { effectiveGrow, growConfirm } from './ghost';
import { closeLabel } from '../ui/EdgeBar';

import { scaleDetails } from '../model/edit';
import { detailBBox, detailContours } from '../model/geometry';
import { snapBox, snapContext, snapPoint, type Guide } from '../model/snap';
import { LAYERS } from '../export/layers';
import { fmtNum, type MsgKey } from '../i18n';
import type { Design, Detail, MaterialProfile, SheetPlacement } from '../model/types';
import { validate } from '../model/validate';
import { placeText } from './View3D';
import { MATERIAL_COLORS, boardTintCss } from './palette';
import { panelLabel } from '../model/names';
import { annotations } from '../export/annotate';
import { materialName } from '../ui/materialName';
import { snapAngle } from './widgets';
import { ConfirmBarHtml, PendingBarHtml } from './panelTool';
import { Icon } from '../ui/icons';

const GAP = 40;
const grid = (x: number, ev?: { altKey: boolean } | null) => gridSnap(x, ev);

type Placed = { copy: PieceCopy; sheet: number; xf: Xform2; ox: number; H: number };
/** One sheet drawn in the cut plan: its material, its number within that material, where it sits and its size. */
type Slot = { mat: string; profile: MaterialProfile; i: number; n: number; ox: number; W: number; H: number };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vb: VB }
  | { kind: 'marquee'; a: Vec2; b: Vec2; additive: boolean; base: string[] }
  | { kind: 'move'; ids: string[]; placed: Placed; panelId: string; start: Vec2; startSvg: Vec2; box: Box }
  | { kind: 'resize'; id: string; placed: Placed; panelId: string; start: FrameBox; handle: FrameHandle; circle: boolean }
  | { kind: 'rotate'; ids: string[]; placed: Placed; panelId: string; pivot: Vec2; a0: number; last: number; deg: number }
  | { kind: 'gresize'; ids: string[]; placed: Placed; panelId: string; fixed: Vec2; corner: Vec2 }
  | { kind: 'draw'; id: string; placed: Placed; panelId: string; start: Vec2 }
  | { kind: 'piece'; key: string; start: SheetPlacement; startSvg: Vec2; moved: boolean }
  | { kind: 'pt2d'; ptId: string; placed: Placed; panelId: string; startSvg: Vec2; moved: boolean }
  // milestone 114 (Nets): the grow ghost's height, a flap's length, a board's size, dragged in the flat
  | { kind: 'growH'; axis: Vec2; startSvg: Vec2; h0: number; marks: { y: number; key: MsgKey; vars?: Record<string, string> }[]; targets: number[] }
  | { kind: 'flapLen'; panelId: string; edge: string; axis: Vec2; startSvg: Vec2; len0: number }
  | { kind: 'boardSize'; panelId: string; dim: 'w' | 'h'; axis: Vec2; startSvg: Vec2; v0: number };


export function Plan2D({ soloPanel, mode: planMode = 'sheets', dockExtra }: { soloPanel?: string; mode?: 'sheets' | 'net'; dockExtra?: ReactNode }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const sel = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const hoverPart = useStore((s) => s.hoverPart);
  const textDir = useStore((s) => (s.lang === 'he' ? 'rtl' : 'ltr'));
  const svgRef = useRef<SVGSVGElement>(null);
  const solo = soloPanel ? d.panels[soloPanel] : undefined;
  const dims = useStore((s) => !!s.viewPrefs.planDims);
  const dashedUsed = useMemo(() => d.order.some((id) => d.panels[id]?.lines?.some((l) => l.type === 'perf' || l.type === 'cutcrease')) || Object.values(d.connections).some((c) => c.crease && c.crease !== 'score') || Object.values(d.trays ?? {}).some((x) => x.lidOf), [d]);
  // milestone 113: the nets one beside another, picked edge by edge (no sheets)
  const net = !solo && planMode === 'net';
  const netsOk = shown(useFeature('plan.nets'));
  const modeKey = solo ? `solo:${solo.id}` : net ? 'nets' : 'sheets';

  const layout = useMemo(() => {
    if (solo) {
      const piece = panelPiece(d, solo.id);
      const copy: PieceCopy = { key: `${solo.id}#solo`, pieceKey: solo.id, copy: 0, contours: piece.contours, w: solo.w, h: solo.h, origin: { x: 0, y: 0 }, panels: piece.panels, mat: d.material.id };
      return { placed: [{ copy, sheet: 0, xf: IDENTITY, ox: 0, H: solo.h }] as Placed[], slots: [] as Slot[], placements: {} as Record<string, SheetPlacement>, mixed: false };
    }
    if (net) {
      // each net once, in a row, top-aligned; nothing to drag
      let x = 0;
      const placed: Placed[] = pieceCopies(d)
        .filter((c) => c.copy === 0)
        .map((c) => {
          const pl = { copy: c, sheet: 0, xf: IDENTITY, ox: x, H: c.h };
          x += c.w + GAP;
          return pl;
        });
      return { placed, slots: [] as Slot[], placements: {} as Record<string, SheetPlacement>, mixed: false };
    }
    const copies = pieceCopies(d);
    const placements = pack(d, copies);
    // each material's sheets in a row, one material after another (milestone 36)
    const groups = sheetGroups(d, placements);
    const slots: Slot[] = [];
    let x = 0;
    for (const g of groups)
      for (let i = 0; i < g.sheets; i++) {
        slots.push({ mat: g.mat, profile: g.profile, i, n: g.sheets, ox: x, W: g.profile.sheetW, H: g.profile.sheetH });
        x += g.profile.sheetW + GAP;
      }
    const slotOf = (pl: SheetPlacement) => slots.find((k) => k.mat === (pl.mat ?? d.material.id) && k.i === pl.sheet) ?? slots[0];
    const placed: Placed[] = copies
      .filter((c) => placements[c.key])
      .map((c) => {
        const pl = placements[c.key];
        const k = slotOf(pl);
        return { copy: c, sheet: pl.sheet, xf: placementXform(pl, c.h, c.w), ox: k.ox, H: k.H };
      });
    return { placed, slots, placements, mixed: groups.length > 1 };
  }, [d, solo, net]);
  // nets that would not lie flat (milestone 35): the overlap regions, in red on the piece
  const netBad = useMemo(() => (solo ? [] : netOverlaps(d)), [d, solo]);
  // pieces flagged by validation (overlapping or off the sheet) are drawn in red
  const badPieces = useMemo(() => {
    if (solo || net) return new Set<string>();
    return new Set(validate(d).filter((i) => i.key === 'val.piecesOverlap' || i.key === 'val.offSheet').map((i) => i.target.id));
  }, [d, solo, net]);

  const fitVB = (): VB => {
    if (solo) {
      const m = Math.max(solo.w, solo.h) * 0.12 + 10;
      return { x: -m, y: -m, w: solo.w + 2 * m, h: solo.h + 2 * m };
    }
    const last = layout.slots[layout.slots.length - 1];
    const lastNet = layout.placed[layout.placed.length - 1];
    const totalW = net ? (lastNet ? lastNet.ox + lastNet.copy.w : 100) : last ? last.ox + last.W : d.material.sheetW;
    const H = net ? Math.max(1, ...layout.placed.map((k) => k.H)) : Math.max(1, ...layout.slots.map((k) => k.H));
    // frame the sheets in the area the floating rail and card leave free
    // (rail at the inline start, card at the inline end)
    const el = svgRef.current;
    const cw = el?.clientWidth || 1200, ch = el?.clientHeight || 760;
    const rtl = document.documentElement.dir === 'rtl';
    // below the plan dock, which can wrap to two rows (milestone 113's switch made it wider)
    const dockH = (el?.parentElement?.querySelector('.plan-dock') as HTMLElement | null)?.offsetHeight ?? 34;
    const railPx = 96, cardPx = 340, topPx = Math.max(84, 16 + dockH + 40), bottomPx = 64;
    const left = rtl ? cardPx : railPx, right = rtl ? railPx : cardPx;
    const availW = Math.max(200, cw - left - right), availH = Math.max(160, ch - topPx - bottomPx);
    const k = Math.min(availW / totalW, availH / H); // px per mm
    const x0 = left + (availW - totalW * k) / 2, y0 = topPx + (availH - H * k) / 2;
    return { x: -x0 / k, y: -y0 / k, w: cw / k, h: ch / k };
  };
  // the view box, its zoom and pan, kept per mode across remounts (src/views/canvas2d.tsx, milestone 102)
  const { vb, setVB, svgPoint, mmPerPx, onWheel, zoom } = useViewBox(svgRef, modeKey, fitVB);
  const [label, setLabel] = useState<{ text: string; x: number; y: number } | null>(null);
  const [guides, setGuides] = useState<{ guides: Guide[]; targets: Vec2[]; placed: Placed; panelId: string } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const drag = useRef<Drag | null>(null);

  const toPiece = (pl: Placed, p: Vec2): Vec2 => {
    const q = invertPoint(pl.xf, { x: p.x - pl.ox, y: pl.H - p.y });
    return { x: q.x + pl.copy.origin.x, y: q.y + pl.copy.origin.y };
  };
  const netXf = (pl: Placed, panelId: string) => pl.copy.panels.find((n) => n.panelId === panelId)?.xf ?? IDENTITY;
  const toLocal = (pl: Placed, panelId: string, p: Vec2): Vec2 => invertPoint(netXf(pl, panelId), toPiece(pl, p));
  const toSvg = (pl: Placed, panelId: string, p: Vec2): Vec2 => {
    const n = applyX(netXf(pl, panelId), p);
    const q = applyX(pl.xf, { x: n.x - pl.copy.origin.x, y: n.y - pl.copy.origin.y });
    return { x: q.x + pl.ox, y: pl.H - q.y };
  };
  const panelAt = (pl: Placed, p: Vec2): string => {
    const q = toPiece(pl, p);
    for (const n of pl.copy.panels) {
      const l = invertPoint(n.xf, q);
      const pp = d.panels[n.panelId];
      if (pp && l.x >= -0.5 && l.y >= -0.5 && l.x <= pp.w + 0.5 && l.y <= pp.h + 0.5) return n.panelId;
    }
    return pl.copy.pieceKey;
  };
  /** First placed copy showing a panel (where its shapes are edited). */
  const placedOf = (panelId: string) => layout.placed.find((p) => p.copy.copy === 0 && p.copy.panels.some((n) => n.panelId === panelId));
  // milestone 114: building in the flat (the grow ghost, its ✓, the flap and board handles)
  const buildOk = shown(useFeature('net.build'));
  const growAdvanced = shown(useFeature('grow.advanced'));
  const grow = useStore((s) => s.grow);
  const edgeSel = net && buildOk && sel?.kind === 'edge' ? sel : null;
  const ghostPl = edgeSel ? placedOf(edgeSel.panelId) : undefined;
  const netGhost = useMemo(() => (edgeSel && ghostPl ? ghostInNet(d, ghostPl.copy, edgeSel.panelId, edgeSel.edge, grow) : null), [d, edgeSel?.panelId, edgeSel?.edge, ghostPl?.copy.key, grow]);
  const growC = useMemo(() => (edgeSel ? growConfirm(d, edgeSel.panelId, edgeSel.edge, grow, growAdvanced) : null), [d, edgeSel?.panelId, edgeSel?.edge, grow, growAdvanced]);
  const toNetSvg = (pl: Placed, q: Vec2) => ({ x: q.x + pl.ox, y: pl.H - q.y });
  const ghostHandle = useMemo(() => {
    if (!edgeSel || !ghostPl || !netGhost) return null;
    const eg = effectiveGrow(d, edgeSel.panelId, edgeSel.edge, grow);
    const gp = eg.ghost;
    if (!gp) return null;
    const o = ghostPl.copy.origin;
    const net = (x: number, y: number) => {
      const q = applyX(netGhost.xf, { x, y });
      return toNetSvg(ghostPl, { x: q.x - o.x, y: q.y - o.y });
    };
    const a = net(gp.w / 2, gp.h), b = net(gp.w / 2, gp.h + 1);
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const marks = eg.plain ? heightMarks(d, edgeSel.panelId, eg.plain) : [];
    const targets = eg.plain ? heightTargets(d, eg.plain, new Set([edgeSel.panelId])) : [];
    return { at: a, axis: { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, marks, targets };
  }, [d, edgeSel?.panelId, edgeSel?.edge, grow, netGhost, ghostPl?.copy.key]);
  // the ✓ bar in screen space, just past the ghost's far edge
  const ghostBarAt = (() => {
    const svg = svgRef.current;
    if (!ghostHandle || !svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const box = svg.getBoundingClientRect();
    const pt = svg.createSVGPoint();
    // in the middle of the ghost (its far edge can run under the plan dock, a lid grown towards the top)
    const gp = netGhost && ghostPl ? netGhost.pts.map((q) => ({ x: q.x + ghostPl.ox, y: ghostPl.H - q.y })) : [ghostHandle.at];
    pt.x = gp.reduce((a, q) => a + q.x, 0) / gp.length;
    pt.y = gp.reduce((a, q) => a + q.y, 0) / gp.length;
    const r = pt.matrixTransform(ctm);
    // kept clear of the plan dock above and the hint below
    const dockH = (svg.parentElement?.querySelector('.plan-dock') as HTMLElement | null)?.offsetHeight ?? 34;
    return { x: Math.max(110, Math.min(box.width - 380, r.x - box.left - 30)), y: Math.max(16 + dockH + 12, Math.min(box.height - 110, r.y - box.top - 16)) };
  })();
  // a handle at the middle of each flap's far edge
  const flapHandles = useMemo(() => {
    if (!net || !buildOk) return [];
    const out: { key: string; panelId: string; edge: string; at: Vec2; axis: Vec2; len: number }[] = [];
    for (const pl of layout.placed) {
      for (const n of pl.copy.panels) {
        const p = d.panels[n.panelId];
        for (const f of p?.edgeFlaps ?? []) {
          const e = findEdge(p, f.edge);
          if (!e) continue;
          const L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) || 1;
          const inw = segInward(e);
          const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
          const far = { x: mid.x - inw.x * f.len, y: mid.y - inw.y * f.len };
          const a = toSvg(pl, p.id, far), b = toSvg(pl, p.id, { x: far.x - inw.x, y: far.y - inw.y });
          const k = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          void L;
          out.push({ key: `${p.id}:${f.id}`, panelId: p.id, edge: f.edge, at: a, axis: { x: (b.x - a.x) / k, y: (b.y - a.y) / k }, len: f.len });
        }
      }
    }
    return out;
  }, [d, net, buildOk, layout]);
  // a selected rectangular board's size handles, on the edges that grow away from its anchor (a root board's right and far edges, a grown board's far edge), when free
  const boardHandles = useMemo(() => {
    const id = net && buildOk && sel?.kind === 'panel' && !sel.ids?.length ? sel.id : null;
    const p = id ? d.panels[id] : null;
    const pl = id ? placedOf(id) : undefined;
    if (!p || !pl || !isRectSketch(p) || p.divider) return [];
    const grown = !!parentConnection(d, p.id);
    const isTray = Object.values(d.trays ?? {}).some((t) => t.baseId === p.id || trayRing(d, t).some((r) => r.wall === p.id));
    if (isTray) return [];
    const out: { key: string; panelId: string; dim: 'w' | 'h'; at: Vec2; axis: Vec2; v0: number }[] = [];
    for (const [edge, dim] of (grown ? [['e2', 'h']] : [['e1', 'w'], ['e2', 'h']]) as ['e1' | 'e2', 'w' | 'h'][]) {
      const e = findEdge(p, edge);
      if (!e || !edgeHasRoom(d, p.id, e.key)) continue;
      const inw = segInward(e);
      const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
      const a = toSvg(pl, p.id, mid), b = toSvg(pl, p.id, { x: mid.x - inw.x, y: mid.y - inw.y });
      const k = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      out.push({ key: `${p.id}:${edge}`, panelId: p.id, dim, at: a, axis: { x: (b.x - a.x) / k, y: (b.y - a.y) / k }, v0: dim === 'w' ? p.w : p.h });
    }
    return out;
  }, [d, net, buildOk, sel, layout]);
  /** A fold picked in Nets (milestone 113): the board folded by it, its joint open on the card. */
  const pickFold = (foldId: string) => (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const c = useStore.getState().design.connections[foldId];
    if (!c) return;
    useStore.getState().select({ kind: 'panel', id: c.b.panelId });
    useStore.getState().set({ openJoint: foldId });
  };

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      const st = useStore.getState();
      const noSnap = noSmartSnap(ev);
      const tol = SNAP_PX * mmPerPx();
      if (g.kind === 'pan') {
        const svg = svgRef.current!;
        const k = mmPerPx();
        void svg;
        setVB({ ...g.vb, x: g.vb.x - (ev.clientX - g.sx) * k, y: g.vb.y - (ev.clientY - g.sy) * k });
        return;
      }
      if (g.kind === 'growH' || g.kind === 'flapLen' || g.kind === 'boardSize') {
        // milestone 114: along the handle's axis, in millimetres (the net is drawn 1:1)
        const cur = svgPoint(ev);
        const delta = (cur.x - g.startSvg.x) * g.axis.x + (cur.y - g.startSvg.y) * g.axis.y;
        if (g.kind === 'growH') {
          const raw = Math.max(MIN_PANEL, g.h0 + delta);
          const sn = noSnap ? null : snapTo(raw, [...g.targets, ...g.marks.map((k) => k.y)], tol);
          const h = sn ?? Math.max(MIN_PANEL, grid(raw, ev));
          st.setGrow({ height: h });
          const mk = sn !== null ? g.marks.find((k) => Math.abs(k.y - sn) < 0.05) : undefined;
          setLabel({ text: mk ? `${fmtNum(h)} · ${t(mk.key, mk.vars?.panel ? { name: panelLabel(st.design, mk.vars.panel, t) } : {})}` : fmtNum(h), ...cur });
        } else if (g.kind === 'flapLen') {
          const len = Math.max(2, grid(g.len0 + delta, ev));
          st.preview((x) => setEdgeFlap(x, g.panelId, g.edge, len));
          setLabel({ text: fmtNum(len), ...cur });
        } else {
          const v = Math.max(MIN_PANEL, grid(g.v0 + delta, ev));
          st.preview((x) => setPanelSize(x, g.panelId, g.dim === 'w' ? v : undefined, g.dim === 'h' ? v : undefined));
          setLabel({ text: fmtNum(v), ...cur });
        }
        return;
      }
      if (g.kind === 'pt2d') {
        // a point of the outline being edited (milestone 104): snapped by the sketch's own rules, then the grid
        const cur = svgPoint(ev);
        if (!g.moved && Math.hypot(cur.x - g.startSvg.x, cur.y - g.startSvg.y) < 3 * mmPerPx()) return;
        g.moved = true;
        const t2 = st.edit2d;
        if (!t2) return;
        const base = st.txnBase ?? st.design;
        const tg = targetOf(base, t2);
        if (!tg) return;
        const raw = tg.fromBoard(toLocal(g.placed, g.panelId, cur));
        const sn = skSnap(raw, { mmPerPx: mmPerPx(), targets: skTargets(tg.g, { exclude: [g.ptId] }), grid: (v) => (tg.wall || t2.kind !== 'shape' ? grid(v, ev) : v), noSmart: noSnap, free: ev.altKey });
        st.preview((x) => void movePoint(x, t2, g.ptId, tg.toBoard(sn.p)));
        setLabel({ text: `${fmtNum(sn.p.x)}, ${fmtNum(sn.p.y)}`, ...cur });
        return;
      }
      if (g.kind === 'piece') {
        const cur = svgPoint(ev);
        const dxs = cur.x - g.startSvg.x, dys = cur.y - g.startSvg.y;
        if (!g.moved && Math.hypot(dxs, dys) < 3 * mmPerPx()) return;
        g.moved = true;
        // a piece stays on its own material's sheets (or one more of them)
        const mine = layout.slots.filter((k) => k.mat === (g.start.mat ?? st.design.material.id));
        const first = mine[0] ?? layout.slots[0];
        const step = first.W + GAP;
        const sheet = Math.max(0, Math.min(mine.length, Math.floor((cur.x - first.ox + GAP / 2) / step)));
        const x = Math.round((g.start.x + dxs - (sheet - g.start.sheet) * step) * 2) / 2;
        const y = Math.round((g.start.y - dys) * 2) / 2;
        st.preview((dd) => void (dd.placements[g.key] = { sheet, x, y, rot: g.start.rot, manual: true, ...(g.start.mat ? { mat: g.start.mat } : {}) }));
        return;
      }
      if (g.kind === 'rotate') {
        const l = toLocal(g.placed, g.panelId, svgPoint(ev));
        let a = (Math.atan2(l.y - g.pivot.y, l.x - g.pivot.x) * 180) / Math.PI;
        while (a - g.last > 180) a -= 360;
        while (a - g.last < -180) a += 360;
        g.last = a;
        const deg = snapAngle(a - g.a0, ev);
        if (deg !== g.deg) {
          g.deg = deg;
          st.preview((x) => rotateDetails(x, g.ids, deg, g.pivot));
        }
        setLabel({ text: `${fmtNum(deg)}°`, ...svgPoint(ev) });
        return;
      }
      if (g.kind === 'marquee') {
        g.b = svgPoint(ev);
        setMarquee({ a: g.a, b: g.b });
        return;
      }
      const l = toLocal(g.placed, g.panelId, svgPoint(ev));
      if (g.kind === 'move') {
        let dx = l.x - g.start.x, dy = l.y - g.start.y;
        const moved = { minX: g.box.minX + dx, maxX: g.box.maxX + dx, minY: g.box.minY + dy, maxY: g.box.maxY + dy };
        const ctx = snapContext(st.txnBase ?? st.design, g.panelId, new Set(g.ids));
        const sn = ctx && !noSnap ? snapBox(ctx, moved, tol) : null;
        if (sn && (sn.dx || sn.dy)) {
          dx += sn.dx;
          dy += sn.dy;
        }
        if (!sn?.dx) dx = grid(dx, ev);
        if (!sn?.dy) dy = grid(dy, ev);
        setGuides(sn && sn.guides.length ? { guides: sn.guides, targets: sn.targets, placed: g.placed, panelId: g.panelId } : null);
        // the primary panel's delta, as a pointer movement on screen, applied to every shape on its own panel
        const endSvg = toSvg(g.placed, g.panelId, { x: g.start.x + dx, y: g.start.y + dy });
        const base = st.txnBase ?? st.design;
        st.preview((x) => {
          for (const id of g.ids) {
            const f = findDetail(base, id);
            if (!f) continue;
            let lx = dx, ly = dy;
            if (f.panel.id !== g.panelId) {
              const pl = placedOf(f.panel.id);
              if (!pl) continue;
              const a = toLocal(pl, f.panel.id, g.startSvg), b = toLocal(pl, f.panel.id, endSvg);
              lx = b.x - a.x;
              ly = b.y - a.y;
            }
            updateDetail(x, id, { cx: f.detail.cx + lx, cy: f.detail.cy + ly });
          }
        });
        setLabel(null);
      } else if (g.kind === 'resize' || g.kind === 'gresize' || g.kind === 'draw') {
        let px = l.x, py = l.y;
        const exclude = new Set(g.kind === 'gresize' ? g.ids : [g.id]);
        const ctx = snapContext(st.txnBase ?? st.design, g.panelId, exclude);
        const sn = ctx && !noSnap ? snapPoint(ctx, { x: px, y: py }, tol) : null;
        px = sn?.dx ? px + sn.dx : grid(px, ev);
        py = sn?.dy ? py + sn.dy : grid(py, ev);
        setGuides(sn && sn.guides.length ? { guides: sn.guides, targets: sn.targets, placed: g.placed, panelId: g.panelId } : null);
        if (g.kind === 'gresize') {
          const sx = Math.abs(g.corner.x - g.fixed.x) < 1e-9 ? 1 : (px - g.fixed.x) / (g.corner.x - g.fixed.x);
          const sy = Math.abs(g.corner.y - g.fixed.y) < 1e-9 ? 1 : (py - g.fixed.y) / (g.corner.y - g.fixed.y);
          if (sx <= 0.02 || sy <= 0.02) return;
          // with Shift or Keep proportions, both by the direction moved furthest (milestone 103)
          const keep = !!st.viewPrefs.keepRatio || ev.shiftKey;
          const k = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
          st.preview((x) => scaleDetails(x, g.ids, g.fixed, keep ? k : sx, keep ? k : sy));
          setLabel({ text: `${fmtNum(Math.abs(px - g.fixed.x))} × ${fmtNum(Math.abs(py - g.fixed.y))}`, ...svgPoint(ev) });
          return;
        }
        if (g.kind === 'resize') {
          // the transform frame (milestone 103): corners both ways, sides one, Shift or Keep proportions alike, Alt about the middle;
          // a turned shape in its own axes; always from the box at the drag's start
          const r = frameDrag(g.start, g.handle, { x: px, y: py }, { keep: !!st.viewPrefs.keepRatio || ev.shiftKey, alt: ev.altKey, circle: g.circle });
          st.preview((x) => updateDetail(x, g.id, { cx: r.cx, cy: r.cy, w: r.w, h: r.h }));
          setLabel({ text: g.circle ? `Ø ${fmtNum(r.w)}` : `${fmtNum(r.w)} × ${fmtNum(r.h)}`, ...svgPoint(ev) });
          return;
        }
        const circle = st.tool === 'circle';
        const fixed = g.start;
        let w = Math.abs(px - fixed.x), h = Math.abs(py - fixed.y);
        if (circle) w = h = Math.max(w, h);
        if (w < 0.5 && h < 0.5) return;
        const cx = fixed.x + ((Math.sign(px - fixed.x) || 1) * w) / 2;
        const cy = fixed.y + ((Math.sign(py - fixed.y) || 1) * h) / 2;
        {
          const shape = st.tool === 'circle' || st.tool === 'roundrect' ? st.tool : 'rect';
          st.preview((x) => void addDetail(x, g.panelId, shape, st.shapeOp, cx, cy, w, h, g.id, st.shapeThrough));
        }
        setLabel({ text: circle ? `Ø ${fmtNum(w)}` : `${fmtNum(w)} × ${fmtNum(h)}`, ...svgPoint(ev) });
      }
    };
    const up = () => {
      const g = drag.current;
      if (!g) return;
      drag.current = null;
      setLabel(null);
      setGuides(null);
      const st = useStore.getState();
      if (g.kind === 'marquee') {
        setMarquee(null);
        const r = { minX: Math.min(g.a.x, g.b.x), maxX: Math.max(g.a.x, g.b.x), minY: Math.min(g.a.y, g.b.y), maxY: Math.max(g.a.y, g.b.y) };
        if (r.maxX - r.minX < 1e-6 && r.maxY - r.minY < 1e-6) return;
        const inside = detailsInRect(st.design, r);
        st.select(detailSel(g.additive ? [...new Set([...g.base, ...inside])] : inside));
      } else if (g.kind === 'draw') {
        const made = !!st.txnBase;
        st.commit();
        if (made) {
          // a ghost until ✓ (milestone 30)
          st.select(detailSel([g.id]));
          st.beginPending({ kind: 'shape', ids: [g.id], panelId: g.panelId });
        }
      } else if (g.kind === 'pt2d') {
        // a press without a move selects the point
        if (g.moved) st.commit();
        else {
          st.cancel();
          st.set({ sel2d: g.ptId });
        }
      } else if (g.kind === 'growH') {
        // the ghost's height is the grow card's, not the design's: nothing to commit
      } else if (g.kind !== 'pan') st.commit();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && drag.current) {
        if (drag.current.kind === 'growH') useStore.getState().setGrow({ height: drag.current.h0 });
        drag.current = null;
        setLabel(null);
        setGuides(null);
        setMarquee(null);
        useStore.getState().cancel();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  });

  /** Shapes whose whole box (array included) lies inside an SVG-space rectangle. */
  const detailsInRect = (dd: Design, r: Box): string[] => {
    const out: string[] = [];
    for (const pl of layout.placed) {
      if (pl.copy.copy !== 0) continue;
      for (const n of pl.copy.panels) {
        const p = dd.panels[n.panelId];
        if (!p) continue;
        for (const dt of p.details) {
          const bb = detailBBox(dt);
          const pts = [
            [bb.minX, bb.minY],
            [bb.maxX, bb.minY],
            [bb.maxX, bb.maxY],
            [bb.minX, bb.maxY],
          ].map(([x, y]) => toSvg(pl, p.id, { x, y }));
          if (pts.every((q) => q.x >= r.minX && q.x <= r.maxX && q.y >= r.minY && q.y <= r.maxY)) out.push(dt.id);
        }
      }
    }
    return out;
  };


  const shapeTool = tool === 'rect' || tool === 'circle' || tool === 'roundrect';
  const ids = selectedDetailIds(sel);
  const additiveKey = (ev: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => ev.shiftKey || ev.ctrlKey || ev.metaKey;

  const startDraw = (pl: Placed, panelId: string, ev: React.PointerEvent) => {
    const st = useStore.getState();
    // another drawing drops a shape still waiting for ✓
    st.cancelPending();
    let l = toLocal(pl, panelId, svgPoint(ev));
    const ctx = snapContext(st.design, panelId, new Set());
    const sn = ctx && !noSmartSnap(ev) ? snapPoint(ctx, l, SNAP_PX * mmPerPx()) : null;
    l = { x: sn?.dx ? l.x + sn.dx : grid(l.x, ev), y: sn?.dy ? l.y + sn.dy : grid(l.y, ev) };
    drag.current = { kind: 'draw', id: newId('x'), placed: pl, panelId, start: l };
  };
  const onPieceDown = (pl: Placed) => (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    if (useStore.getState().pasting) return useStore.getState().set({ pasting: false });
    const panelId = panelAt(pl, svgPoint(ev));
    if (tool === 'text') {
      const l = toLocal(pl, panelId, svgPoint(ev));
      return placeText(panelId, l.x, l.y);
    }
    if (shapeTool) return startDraw(pl, panelId, ev);
    // shift-click on a piece keeps a shape selection; with panels selected it adds or removes this one (milestone 31)
    if (additiveKey(ev)) {
      const st = useStore.getState();
      if (st.selection?.kind !== 'detail') st.clickPanel(panelId, true);
      return;
    }
    if (solo) {
      // in solo view the panel fills the view: dragging on it draws a selection box
      drag.current = { kind: 'marquee', a: svgPoint(ev), b: svgPoint(ev), additive: false, base: [] };
      useStore.getState().select({ kind: 'panel', id: panelId });
      return;
    }
    useStore.getState().select({ kind: 'panel', id: panelId });
    if (net) return;
    useStore.getState().set({ sheetCopy: pl.copy.key });
    const start = layout.placements[pl.copy.key];
    if (start && planEdit) drag.current = { kind: 'piece', key: pl.copy.key, start, startSvg: svgPoint(ev), moved: false };
  };
  const onDetailDown = (pl: Placed, dt: Detail, panelId: string) => (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    if (shapeTool || tool === 'text' || useStore.getState().pasting || (!solo && !planEdit)) return onPieceDown(pl)(ev);
    ev.stopPropagation();
    const st = useStore.getState();
    const cur = selectedDetailIds(st.selection);
    if (additiveKey(ev)) return st.clickDetail(dt.id, true);
    // pressing on a shape that is already part of the selection drags the whole group
    const group = cur.includes(dt.id) ? cur : [dt.id];
    if (!cur.includes(dt.id)) st.select(detailSel([dt.id]));
    const boxes = group.map((id) => findDetail(st.design, id)).filter((f) => f && f.panel.id === panelId).map((f) => detailBBox(f!.detail));
    const box = { minX: Math.min(...boxes.map((b) => b.minX)), maxX: Math.max(...boxes.map((b) => b.maxX)), minY: Math.min(...boxes.map((b) => b.minY)), maxY: Math.max(...boxes.map((b) => b.maxY)) };
    drag.current = { kind: 'move', ids: group, placed: pl, panelId, start: toLocal(pl, panelId, svgPoint(ev)), startSvg: svgPoint(ev), box };
  };
  const onBackDown = (ev: React.PointerEvent) => {
    if (ev.button === 1 || ev.button === 2 || (ev.button === 0 && tool !== 'select')) {
      drag.current = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vb };
      return;
    }
    if (ev.button !== 0) return;
    const st = useStore.getState();
    const additive = additiveKey(ev);
    if (!additive) st.select(null);
    drag.current = { kind: 'marquee', a: svgPoint(ev), b: svgPoint(ev), additive, base: selectedDetailIds(st.selection) };
  };
  const onDouble = (pl: Placed) => (ev: React.MouseEvent) => {
    ev.stopPropagation();
    const st = useStore.getState();
    const at = svgPoint(ev);
    const panelId = panelAt(pl, at);
    // milestone 104: double-clicked into a shape, a line or (in the face-on view) the board, its outline is edited here
    const target = edit2dOk ? edit2dAt(pl, panelId, at, ev.target as Element) : null;
    if (target) {
      // in Nets (milestone 113) outlines are edited where they are
      if (!solo && !net) st.openSolo(target.panelId);
      st.set({ edit2d: target, sel2d: null });
      if (target.kind === 'shape') st.select(detailSel([target.id]));
      return;
    }
    if (!solo && !net) st.openSolo(panelId);
  };
  /** What a double-click at a point would edit: the shape under it, a line near it, or (face-on) the board itself. */
  const edit2dAt = (pl: Placed, panelId: string, at: Vec2, el: Element | null): Edit2D | null => {
    const p = d.panels[panelId];
    const l = toLocal(pl, panelId, at);
    const tol = 6 * mmPerPx();
    // the shape under the point (inside its outline, or within a few pixels of it); the smallest wins
    let hit = el?.closest('[data-testid^="detail-"]')?.getAttribute('data-testid')?.slice(7) ?? null;
    if (!hit && p) {
      let best = Infinity;
      for (const dt of p.details) {
        for (const c of detailContours(dt)) {
          const poly = flattenContour(c, 0.2);
          let near = pointInPolygon(l, poly);
          for (let i = 0; !near && i < poly.length; i++) near = distToSegment(l, poly[i], poly[(i + 1) % poly.length]) <= tol;
          if (near && dt.w * dt.h < best) (best = dt.w * dt.h), (hit = dt.id);
        }
      }
    }
    if (hit) {
      const f = findDetail(d, hit);
      const t2: Edit2D | null = f ? { kind: 'shape', id: hit, panelId: f.panel.id } : null;
      if (t2 && canEdit(d, t2)) return t2;
    }
    for (const ln of p?.lines ?? []) {
      const pts = linePolyline(ln);
      for (let i = 0; i + 1 < pts.length; i++) if (distToSegment(l, pts[i], pts[i + 1]) <= tol) return { kind: 'line', id: ln.id, panelId };
    }
    if (solo || net) {
      const t2: Edit2D = { kind: 'board', id: panelId, panelId };
      if (canEdit(d, t2)) return t2;
    }
    return null;
  };

  // a shape waiting for ✓ (milestone 30): its bar above it, in screen space over the drawing
  const pending = useStore((s) => s.pending);
  const pendingAt = (() => {
    if (!pending || pending.kind !== 'shape') return null;
    const f = findDetail(d, pending.ids[0]);
    const pl = f && placedOf(f.panel.id);
    const svg = svgRef.current;
    if (!f || !pl || !svg) return null;
    const bb = detailBBox(f.detail);
    const q = toSvg(pl, f.panel.id, { x: (bb.minX + bb.maxX) / 2, y: bb.maxY });
    const ctm = svg.getScreenCTM();
    const box = svg.getBoundingClientRect();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = q.x;
    pt.y = q.y;
    const r = pt.matrixTransform(ctm);
    return { x: r.x - box.left, y: r.y - box.top - 8 };
  })();
  const primary = sel?.kind === 'detail' ? findDetail(d, sel.id) : null;
  const selPanelId = sel?.kind === 'panel' ? sel.id : sel?.kind === 'edge' ? sel.panelId : primary?.panel.id;
  const px = mmPerPx();
  const edit2d = useStore((s) => s.edit2d);
  const edit2dOk = shown(useFeature('edit2d'));
  // side handles and the size pills (milestone 103; Guided keeps corners and the turn knob)
  const sides = shown(useFeature('transform.sides'));
  // dragging pieces and Repack (milestone 105): Guided's sheet is a picture only
  const planEdit = shown(useFeature('plan.edit'));
  // milestone 108: the guard's keep-out and its tip face-on too, where the guard runs (Guided, Quick build)
  const mode = useMode();
  const guardOn = keepsCuttable(mode) && shown(useFeature('solo.guard'));
  const guardNote = useStore((s) => s.guardNote);
  const fLegend = shown(useFeature('plan.legend')), fHint = shown(useFeature('stage.hint'));
  const idSet = new Set(ids);
  // group handles: several shapes on one panel
  const groupInfo = useMemo(() => {
    if (ids.length < 2) return null;
    const fs = ids.map((id) => findDetail(d, id));
    if (fs.some((f) => !f) || new Set(fs.map((f) => f!.panel.id)).size !== 1) return null;
    const bbs = fs.map((f) => detailBBox(f!.detail));
    return { panelId: fs[0]!.panel.id, box: { minX: Math.min(...bbs.map((b) => b.minX)), maxX: Math.max(...bbs.map((b) => b.maxX)), minY: Math.min(...bbs.map((b) => b.minY)), maxY: Math.max(...bbs.map((b) => b.maxY)) } };
  }, [d, sel]);

  // the rotation ring: the selected shapes, all on one panel, turn about their centre
  const ringInfo = useMemo(() => {
    if (!ids.length) return null;
    const fs = ids.map((id) => findDetail(d, id));
    if (fs.some((f) => !f) || new Set(fs.map((f) => f!.panel.id)).size !== 1) return null;
    if (fs.length === 1 && fs[0]!.detail.shape === 'circle' && !fs[0]!.detail.array) return null;
    const bbs = fs.map((f) => detailBBox(f!.detail));
    const box = { minX: Math.min(...bbs.map((b) => b.minX)), maxX: Math.max(...bbs.map((b) => b.maxX)), minY: Math.min(...bbs.map((b) => b.minY)), maxY: Math.max(...bbs.map((b) => b.maxY)) };
    const pivot = fs.length === 1 ? { x: fs[0]!.detail.cx, y: fs[0]!.detail.cy } : { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    const r = Math.max(...[[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]].map(([x, y]) => Math.hypot(x - pivot.x, y - pivot.y)));
    return { panelId: fs[0]!.panel.id, pivot, r };
  }, [d, sel]);

  return (
    <div className={solo ? 'cutplan solo' : 'cutplan'} dir="ltr" data-testid={solo ? 'solo' : 'cutplan'}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={onBackDown}
        onContextMenu={(e) => e.preventDefault()}
        className={shapeTool ? 'drawing' : ''}
      >
        <defs>
          <pattern id="flutes" width="4" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="4" stroke="#7a5a30" strokeOpacity="0.07" strokeWidth="0.6" />
          </pattern>
          <pattern id="flutes-x" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="#7a5a30" strokeOpacity="0.07" strokeWidth="0.6" />
          </pattern>
        </defs>
        {!solo &&
          layout.slots.map((k) => {
            const fs = Math.max(8, px * 12);
            const { W, H, profile: pm } = k;
            const name = materialName(t, pm);
            const chip = `${t('view.sheet', { n: k.i + 1 })} · ${name} · ${W} × ${H} ${t('unit.mm')}`;
            // with more than one material, a heading over each material's sheets
            const heading = layout.mixed && k.i === 0 ? (k.n > 1 ? t('plan.matHeadingN', { name, a: 1, b: k.n }) : t('plan.matHeading', { name, a: 1 })) : null;
            return (
              <g key={`${k.mat}#${k.i}`} data-sheet={`${k.mat}#${k.i}`}>
                <rect x={k.ox} y={0} width={W} height={H} rx={2} className="sheet" fill={MATERIAL_COLORS[pm.kind].sheet} />
                {pm.kind === 'corrugated' && <rect x={k.ox} y={0} width={W} height={H} fill={pm.grain === 'x' ? 'url(#flutes-x)' : 'url(#flutes)'} pointerEvents="none" />}
                <rect x={k.ox + d.sheetMargin} y={d.sheetMargin} width={W - 2 * d.sheetMargin} height={H - 2 * d.sheetMargin} className="sheet-margin" strokeWidth={px} />
                <g className="sheet-chip" transform={`translate(${k.ox}, ${-fs * 2.1})`}>
                  <rect x={0} y={0} width={chip.length * fs * 0.52 + fs * 1.6} height={fs * 1.7} rx={fs * 0.85} strokeWidth={px} />
                  <circle cx={fs * 0.85} cy={fs * 0.85} r={fs * 0.35} fill={MATERIAL_COLORS[pm.kind].face} />
                  <text x={fs * 1.5} y={fs * 1.18} fontSize={fs} direction={textDir} textAnchor={textDir === 'rtl' ? 'end' : 'start'} dx={textDir === 'rtl' ? chip.length * fs * 0.52 : 0}>
                    {chip}
                  </text>
                </g>
                {heading && (
                  <text className="mat-heading" x={k.ox} y={-fs * 3.2} fontSize={fs * 1.3} fontWeight={600} direction={textDir} data-testid={`mat-heading-${k.mat}`}>
                    {heading}
                  </text>
                )}
              </g>
            );
          })}
        {layout.placed.map((pl) => {
          const also = selectedPanelIds(sel);
          const isSel = !!selPanelId && pl.copy.panels.some((n) => n.panelId === selPanelId || also.includes(n.panelId));
          const isHov = !!hoverPart && pl.copy.panels.some((n) => n.panelId === hoverPart);
          const tint = boardTintCss(d, pieceRoot(pl.copy.pieceKey), Math.max(0, d.order.indexOf(pl.copy.pieceKey)));
          return (
            <g
              key={pl.copy.key}
              data-piece={pl.copy.pieceKey}
              onDoubleClick={onDouble(pl)}
              onPointerEnter={() => useStore.getState().set({ hoverPart: pl.copy.pieceKey })}
              onPointerMove={(ev) => {
                // where a paste lands, and a paste being placed follows the pointer (milestone 33)
                const st = useStore.getState();
                const panelId = panelAt(pl, svgPoint(ev));
                const l = toLocal(pl, panelId, svgPoint(ev));
                st.pointerHit = { panelId, x: l.x, y: l.y, tol: SNAP_PX * mmPerPx() };
                if (st.pasting) st.movePaste(panelId, grid(l.x), grid(l.y), SNAP_PX * mmPerPx());
              }}
              onPointerLeave={() => useStore.getState().hoverPart === pl.copy.pieceKey && useStore.getState().set({ hoverPart: null })}
            >
              {pl.copy.contours.map((c, i) => {
                const dpath = contourPathD(xformContour(pl.xf, c.contour), pl.H, pl.ox, 0);
                if (c.role === 'outer')
                  return (
                    <path
                      key={i}
                      d={dpath}
                      className={`piece ${isSel && !solo ? 'sel' : ''} ${isHov && !isSel && !solo ? 'hov' : ''} ${badPieces.has(pl.copy.pieceKey) ? 'bad' : ''}`}
                      fillRule="evenodd"
                      fill={badPieces.has(pl.copy.pieceKey) ? 'rgba(220, 38, 38, 0.25)' : tint}
                      fillOpacity={solo ? 0.55 : 0.75}
                      onPointerDown={onPieceDown(pl)}
                      stroke={LAYERS.cut.hex}
                      strokeWidth={px * (isSel ? 1.6 : 1)}
                      data-copy={pl.copy.key}
                    />
                  );
                const owner = c.ref?.panelId ? d.panels[c.ref.panelId] : undefined;
                const dt = owner?.details.find((x) => x.id === c.ref?.detailId);
                const dsel = !!dt && idSet.has(dt.id);
                const fold = !!c.ref?.foldId;
                return (
                  <path
                    key={i}
                    d={dpath}
                    className={`detail ${dsel ? 'sel' : ''} op-${c.op} ${fold ? 'fold-line' : ''}`}
                    stroke={dsel ? '#1fb8ac' : LAYERS[c.op].hex}
                    strokeWidth={px * (dsel ? 2.5 : 1)}
                    onPointerDown={dt && owner ? onDetailDown(pl, dt, owner.id) : net && fold && pl.copy.copy === 0 ? pickFold(c.ref!.foldId!) : undefined}
                    pointerEvents={dt || (net && fold) ? undefined : 'none'}
                    data-testid={dt && pl.copy.copy === 0 ? `detail-${dt.id}` : undefined}
                  />
                );
              })}
              {pl.copy.copy === 0 &&
                (pl.copy.frag?.i ?? 1) === 1 &&
                pl.copy.panels.flatMap((n) => {
                  // Add shapes and cuts across the edge are part of the outline: a dashed handle selects them
                  const panel = d.panels[n.panelId];
                  if (!panel) return [];
                  return panel.details
                    .filter((dt) => (dt.op === 'add' || dt.op === 'cut') && isOutlineShape(panel, dt.id))
                    .map((dt) => {
                      const dsel = idSet.has(dt.id);
                      const path = detailContours(dt)
                        .map((c) => {
                          const pts = flattenContour(c, 0.1).map((q) => toSvg(pl, n.panelId, q));
                          return pts.length ? `M${pts.map((q) => `${q.x} ${q.y}`).join(' L')} Z` : '';
                        })
                        .join(' ');
                      return (
                        <path
                          key={`o-${dt.id}`}
                          d={path}
                          className={`detail outline-shape op-${dt.op} ${dsel ? 'sel' : ''}`}
                          fill="none"
                          stroke={dsel ? '#1fb8ac' : dt.op === 'add' ? 'var(--op-add)' : LAYERS.cut.hex}
                          strokeDasharray={`${px * 4} ${px * 3}`}
                          strokeWidth={px * (dsel ? 2.5 : 1)}
                          pointerEvents="stroke"
                          onPointerDown={onDetailDown(pl, dt, panel.id)}
                          data-testid={`detail-${dt.id}`}
                        />
                      );
                    });
                })}
              {pl.copy.copy === 0 &&
                pl.copy.panels.map((n) => {
                  const panel = d.panels[n.panelId];
                  if (!panel || solo) return null;
                  const c = toSvg(pl, n.panelId, { x: panel.w / 2, y: panel.h / 2 });
                  const q = quantityOf(d, pieceRoot(pl.copy.pieceKey));
                  return (
                    <text key={n.panelId} x={c.x} y={c.y} className="piece-label" fontSize={Math.max(6, px * 12)} textAnchor="middle" direction={textDir} pointerEvents="none">
                      {panelLabel(d, n.panelId, t)}
                      {pl.copy.frag ? ` (${pl.copy.frag.i}/${pl.copy.frag.n})` : ''}
                      {q > 1 && n.panelId === pl.copy.pieceKey ? ` ${t('view.copies', { n: q })}` : ''}
                    </text>
                  );
                })}
              {/* milestone 89: its blank size and where the glue goes (the names are shown above already) */}
              {dims &&
                annotations(d, pl.copy, (id) => panelLabel(d, id, t), t('unit.mm'))
                  .filter((a) => a.kind !== 'name')
                  .map((a, k) => {
                    const r = applyX(pl.xf, a.at);
                    return (
                      <text key={`ann${k}`} x={r.x + pl.ox} y={pl.H - r.y} className={`plan-ann ann-${a.kind}`} fontSize={Math.max(a.size, px * 10)} textAnchor={a.kind === 'size' ? 'start' : 'middle'} pointerEvents="none" data-testid={pl.copy.copy === 0 ? `ann-${a.kind}` : undefined} direction="ltr">
                        {a.kind === 'glue' ? t('ann.glue') : a.text}
                      </text>
                    );
                  })}
            </g>
          );
        })}
        {net && layout.placed.map((pl) => <NetPicks key={`pick-${pl.copy.key}`} d={d} pl={pl} px={px} sel={sel} onFold={pickFold} />)}
        {/* milestone 114: building in the flat — the grow ghost with its height handle, flap and board handles */}
        {net && buildOk && netGhost && ghostPl && (() => {
          const at = (q: Vec2) => ({ x: q.x + ghostPl.ox, y: ghostPl.H - q.y });
          const pts = netGhost.pts.map(at);
          const warn = !!growC && (growC.blocked || growC.over.length > 0);
          const hEnd = ghostHandle!;
          return (
            <g className={`net-ghost${netGhost.own ? ' own' : ''}${warn ? ' warn' : ''}`} data-testid="net-ghost" data-own={netGhost.own || undefined}>
              <polygon points={pts.map((q) => `${q.x},${q.y}`).join(' ')} strokeWidth={px * 1.5} strokeDasharray={`${px * 6} ${px * 4}`} pointerEvents="none" />
              {netGhost.own && (
                <text x={pts.reduce((a, q) => a + q.x, 0) / pts.length} y={pts.reduce((a, q) => a + q.y, 0) / pts.length} textAnchor="middle" fontSize={px * 11} pointerEvents="none" data-testid="net-own-piece">
                  {t('net.ownPiece')}
                </text>
              )}
              <circle
                cx={hEnd.at.x}
                cy={hEnd.at.y}
                r={px * 9}
                className="net-handle grow-h"
                onPointerDown={(ev) => {
                  if (ev.button !== 0) return;
                  ev.stopPropagation();
                  // the release comes back here even over the folded preview (it handles pointers itself)
              (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
              drag.current = { kind: 'growH', axis: hEnd.axis, startSvg: svgPoint(ev), h0: grow.height, marks: hEnd.marks, targets: hEnd.targets };
                }}
                data-testid="net-grow-height"
              >
                <title>{t('net.dragHeight')}</title>
              </circle>
            </g>
          );
        })()}
        {net && buildOk && !netGhost && boardHandles.map((h) => (
          <rect
            key={`bh-${h.key}`}
            x={h.at.x - px * 6}
            y={h.at.y - px * 6}
            width={px * 12}
            height={px * 12}
            rx={px * 2}
            className="net-handle board-size"
            onPointerDown={(ev) => {
              if (ev.button !== 0) return;
              ev.stopPropagation();
              useStore.getState().select({ kind: 'panel', id: h.panelId });
              // the release comes back here even over the folded preview (it handles pointers itself)
              (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
              drag.current = { kind: 'boardSize', panelId: h.panelId, dim: h.dim, axis: h.axis, startSvg: svgPoint(ev), v0: h.v0 };
            }}
            data-testid={`net-size-${h.panelId}-${h.dim}`}
          >
            <title>{t('net.dragSize')}</title>
          </rect>
        ))}
        {net && buildOk && flapHandles.map((h) => (
          <circle
            key={`fh-${h.key}`}
            cx={h.at.x}
            cy={h.at.y}
            r={px * 7}
            className="net-handle flap-len"
            onPointerDown={(ev) => {
              if (ev.button !== 0) return;
              ev.stopPropagation();
              // the release comes back here even over the folded preview (it handles pointers itself)
              (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
              drag.current = { kind: 'flapLen', panelId: h.panelId, edge: h.edge, axis: h.axis, startSvg: svgPoint(ev), len0: h.len };
            }}
            data-testid={`net-flap-${h.panelId}-${h.edge}`}
          >
            <title>{t('net.dragFlap')}</title>
          </circle>
        ))}
        {netBad.map((o, k) => {
          const pl = layout.placed.find((x) => x.copy.copy === 0 && x.copy.pieceKey === o.net);
          if (!pl) return null;
          const at = (q: Vec2) => {
            const r = applyX(pl.xf, { x: q.x - pl.copy.origin.x, y: q.y - pl.copy.origin.y });
            return `${r.x + pl.ox},${pl.H - r.y}`;
          };
          return o.region.map((r, j) => <polygon key={`${k}.${j}`} points={r.map(at).join(' ')} className="net-overlap" fill="rgba(220, 38, 38, 0.55)" stroke="#b91c1c" strokeWidth={px} pointerEvents="none" data-testid="net-overlap" />);
        })}
        {tool === 'select' && !edit2d && ids.length === 1 && primary && primary.detail.shape !== 'text' && placedOf(primary.panel.id) && (() => {
          const dt = primary.detail;
          const circle = dt.shape === 'circle';
          const box: FrameBox = { cx: dt.cx, cy: dt.cy, w: dt.w, h: dt.h, rot: circle ? 0 : (dt.rot ?? 0) };
          // too small on screen for handles: the pills and moving it only (one kind of handle at a time, milestone 103)
          const small = dt.w / px < 24 && dt.h / px < 24;
          return (
            <>
              {!small && (
                <Handles
                  box={{ minX: dt.cx - dt.w / 2, maxX: dt.cx + dt.w / 2, minY: dt.cy - dt.h / 2, maxY: dt.cy + dt.h / 2 }}
                  rot={box.rot}
                  side={sides}
                  toSvg={(p) => toSvg(placedOf(primary.panel.id)!, primary.panel.id, p)}
                  size={px * 9}
                  onDown={(_fixed, corner, kind) => (ev) => {
                    ev.stopPropagation();
                    drag.current = { kind: 'resize', id: dt.id, placed: placedOf(primary.panel.id)!, panelId: primary.panel.id, start: box, handle: { kind: kind ?? 'corner', at: { x: corner.x - dt.cx, y: corner.y - dt.cy } }, circle };
                  }}
                />
              )}
              {sides && <FramePills box={box} circle={circle} id={dt.id} toSvg={(p) => toSvg(placedOf(primary.panel.id)!, primary.panel.id, p)} px={px} />}
            </>
          );
        })()}
        {tool === 'select' && !edit2d && ringInfo && placedOf(ringInfo.panelId) && (
          <RotRing
            centre={toSvg(placedOf(ringInfo.panelId)!, ringInfo.panelId, ringInfo.pivot)}
            r={ringInfo.r + px * 14}
            px={px}
            onDown={(ev) => {
              ev.stopPropagation();
              const placed = placedOf(ringInfo.panelId)!;
              const l = toLocal(placed, ringInfo.panelId, svgPoint(ev));
              const a0 = (Math.atan2(l.y - ringInfo.pivot.y, l.x - ringInfo.pivot.x) * 180) / Math.PI;
              drag.current = { kind: 'rotate', ids, placed, panelId: ringInfo.panelId, pivot: ringInfo.pivot, a0, last: a0, deg: 0 };
            }}
          />
        )}
        {tool === 'select' && !edit2d && groupInfo && placedOf(groupInfo.panelId) && (
          <Handles
            box={groupInfo.box}
            group
            toSvg={(p) => toSvg(placedOf(groupInfo.panelId)!, groupInfo.panelId, p)}
            size={px * 9}
            onDown={(fixed, corner) => (ev) => {
              ev.stopPropagation();
              drag.current = { kind: 'gresize', ids, placed: placedOf(groupInfo.panelId)!, panelId: groupInfo.panelId, fixed, corner };
            }}
          />
        )}
        {edit2d && placedOf(edit2d.panelId) && <Edit2DLayer t={edit2d} placed={placedOf(edit2d.panelId)!} toSvg={toSvg} px={px} onPoint={(ptId, ev) => {
          ev.stopPropagation();
          drag.current = { kind: 'pt2d', ptId, placed: placedOf(edit2d.panelId)!, panelId: edit2d.panelId, startSvg: svgPoint(ev), moved: false };
        }} />}
        {guides && (
          <g className="guides" pointerEvents="none">
            {guides.guides.map((g, i) => {
              const a = toSvg(guides.placed, guides.panelId, g.a), b = toSvg(guides.placed, guides.panelId, g.b);
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`guide ${g.kind}`} strokeWidth={px * 1.2} />;
            })}
            {guides.targets.map((p0, i) => {
              const p = toSvg(guides.placed, guides.panelId, p0);
              return <circle key={i} cx={p.x} cy={p.y} r={px * 3.5} className="snap-target" strokeWidth={px * 1.2} />;
            })}
          </g>
        )}
        {marquee && <Marquee a={marquee.a} b={marquee.b} px={px} />}
        {guardOn && solo && placedOf(solo.id) && (() => {
          const pl = placedOf(solo.id)!;
          const busy = ids.some((id) => solo.details.some((x) => x.id === id));
          const z = busy ? keepOutZones(d, solo.id) : null;
          const ring = (pts: Vec2[]) => pts.map((q) => toSvg(pl, solo.id, q)).map((q) => `${q.x},${q.y}`).join(' ');
          const recent = guardNote && Date.now() - guardNote.at < 2500 ? solo.details.find((x) => x.id === guardNote.detailId) : null;
          const tip = recent && toSvg(pl, solo.id, { x: recent.cx, y: recent.cy + recent.h / 2 + 4 });
          return (
            <g className="guard-2d" pointerEvents="none" data-testid="guard-2d">
              {z && [z.inset, ...z.holes].filter((r) => r.length > 2).map((r, i) => <polygon key={i} points={ring(r)} fill="none" stroke="#d08a1a" strokeOpacity={0.75} strokeDasharray={`${px * 6} ${px * 4}`} strokeWidth={px * 1.2} />)}
              {tip && guardNote && (
                <text x={tip.x} y={tip.y} textAnchor="middle" className="guard-tip-2d" fontSize={px * 13} data-testid="guard-tip" data-why={guardNote.why}>
                  {t(`${isGuided(mode) ? 'g.guard' : 'guard'}.${guardNote.why}`, { mm: fmtNum(guardNote.mm, 1) })}
                </text>
              )}
            </g>
          );
        })()}
        {label && (
          <text x={label.x + px * 12} y={label.y - px * 12} className="dim-text" fontSize={px * 13}>
            {label.text} {t('unit.mm')}
          </text>
        )}
      </svg>
      {edit2d && <Edit2DCard t={edit2d} />}
      {pendingAt && <PendingBarHtml x={pendingAt.x} y={pendingAt.y} />}
      {net && buildOk && netGhost && growC && ghostBarAt && (
        <ConfirmBarHtml
          x={ghostBarAt.x}
          y={ghostBarAt.y}
          onOk={() => growC.ok()}
          onCancel={() => sel?.kind === 'edge' && useStore.getState().select({ kind: 'panel', id: sel.panelId })}
          okDisabled={growC.disabled}
          testId="grow-ghost-bar"
          okTestId="grow-go"
        >
          {growC.closesW && growC.closeAs && (
            <span data-testid="grow-closes-bar" data-lid={growC.closeAs}>
              {t('grow.makes', { what: t(closeLabel(growC.closeAs)) })}
            </span>
          )}
          {growC.over.length > 0 && !growC.closes && (
            <>
              <span className="warn" data-testid="grow-overlap">{t('grow.overlap', { panels: growC.over.map((x) => panelLabel(d, x, t)).join(', ') })}</span>
              <button onClick={() => growC.own()} data-testid="grow-own">
                {t('grow.own')}
              </button>
            </>
          )}
        </ConfirmBarHtml>
      )}
      <div className="plan-dock" dir={uiDir()}>
        {solo && (
          <button className="primary" onClick={() => useStore.getState().closeSolo()} data-testid="solo-back">
            {isGuided(mode) ? t('g.deco.back') : t('solo.back', { view: t(useStore.getState().prevView === '3d' ? 'top.view3d' : 'top.view2d') })}
          </button>
        )}
        <div className="cluster">
          <button onClick={() => zoom(0.8)} aria-label={t('view.zoomIn')} title={t('view.zoomIn')}>
            <Icon name="plus" />
          </button>
          <button onClick={() => zoom(1.25)} aria-label={t('view.zoomOut')} title={t('view.zoomOut')}>
            <Icon name="minus" />
          </button>
          <button onClick={() => setVB(fitVB())} aria-label={t('view.fit')} title={t('view.fit')} data-testid="fit-view">
            <Icon name="fit" />
          </button>
          {!solo && !net && planEdit && (
            <button
              onClick={() => {
                const st = useStore.getState();
                if (Object.values(st.design.placements).some((p) => p.manual && !p.nested) && !confirm(t('pack.confirm'))) return;
                st.apply((dd) => void (dd.placements = {}));
              }}
              data-testid="repack"
            >
              <Icon name="repack" /> {t('pack.repack')}
            </button>
          )}
        </div>
        {solo && <span className="solo-title">{t('solo.title', { panel: panelLabel(d, solo.id, t) })}</span>}
        {!solo && (
          // milestone 89: blank sizes and glue areas on the pieces
          <button className={dims ? 'on' : ''} aria-pressed={dims} onClick={() => useStore.getState().setPrefs({ planDims: !dims })} data-testid="plan-dims">
            {t('ann.dims')}
          </button>
        )}
        {/* milestone 113: the sheets, or the nets one by one */}
        {!solo && netsOk && (
          <span className="seg plan-mode" role="group" aria-label={t('plan.mode')}>
            {(['sheets', 'nets'] as const).map((v) => (
              <button key={v} type="button" className={(net ? 'nets' : 'sheets') === v ? 'on' : ''} aria-pressed={(net ? 'nets' : 'sheets') === v} onClick={() => useStore.getState().setPrefs({ planMode: v === 'sheets' ? undefined : v })} data-testid={`plan-mode-${v}`}>
                {t(`plan.${v}`)}
              </button>
            ))}
          </span>
        )}
        {dockExtra}
        {!solo && !net && <YieldBar />}
      </div>
      {/* milestone 89: what each colour and dash means, always (Guided names no layers, milestone 108) */}
      {fLegend && <div className="plan-legend" dir={uiDir()} data-testid="plan-legend">
        {(['cut', 'score', 'engrave', 'guide'] as const).map((op) => (
          <span key={op}>
            <i style={{ background: LAYERS[op].hex }} /> {t(`ann.legend.${op}`)}
          </span>
        ))}
        {dashedUsed && (
          <span>
            <i className="dashed" style={{ borderColor: LAYERS.cut.hex }} /> {t('ann.legend.dashed')}
          </span>
        )}
      </div>}
      {fHint && <div className="view-hint" dir={uiDir()}>
        {d.order.length === 0 ? t('view.empty2d') : tool === 'text' ? t('tool.hint.text') : shapeTool ? t('tool.hint.shape2d') : solo ? t('tool.hint.select2d') : net ? t(netGhost ? 'net.buildHint' : 'net.hint') : t('pack.hint')}
      </div>}
    </div>
  );
}


/**
 * The W and H pills of a selected shape's frame (milestone 103): click one to
 * type a size, a sum or a percent (`150%`); with *Keep proportions* the other
 * follows. Drawn at screen size beside the frame's bottom and right sides.
 */
function FramePills({ box, circle, id, toSvg, px }: { box: FrameBox; circle: boolean; id: string; toSvg: (p: Vec2) => Vec2; px: number }) {
  const t = useT();
  const [edit, setEdit] = useState<'w' | 'h' | null>(null);
  const [text, setText] = useState('');
  const keep = useStore((s) => !!s.viewPrefs.keepRatio);
  const pill = (dir: 'w' | 'h') => {
    const at = toSvg(fromOwn(box, dir === 'w' ? { x: 0, y: -box.h / 2 } : { x: box.w / 2, y: 0 }));
    const v = dir === 'w' ? box.w : box.h;
    const w = px * 64, h = px * 22;
    const x = at.x + (dir === 'w' ? -w / 2 : px * 10), y = at.y + (dir === 'w' ? px * 12 : -h / 2);
    const commit = () => {
      const n = evalNumber(text, v);
      setEdit(null);
      if (n === null || n <= 0 || Math.abs(n - v) < 1e-9) return;
      const r = typedSize(box, dir, n, keep || circle);
      useStore.getState().apply((d) => void updateDetail(d, id, { w: r.w, h: r.h }));
    };
    return (
      <foreignObject key={dir} x={x} y={y} width={w} height={h} className="frame-pill-fo">
        {edit === dir ? (
          <input
            className="frame-pill"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') setEdit(null);
            }}
            aria-label={t(dir === 'w' ? 'insp.width' : 'insp.height')}
            data-testid={`frame-pill-${dir}-input`}
          />
        ) : (
          <button
            type="button"
            className="frame-pill"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setText(fmtNum(v));
              setEdit(dir);
            }}
            title={t('frame.pillHelp')}
            data-testid={`frame-pill-${dir}`}
          >
            {dir === 'w' ? 'W' : 'H'} {fmtNum(v)}
          </button>
        )}
      </foreignObject>
    );
  };
  return <g className="frame-pills">{circle ? pill('w') : [pill('w'), pill('h')]}</g>;
}


/**
 * The Net view's picking layer (milestone 113): a wide transparent line on
 * every edge of a net's boards. A free edge selects the edge (its grow card,
 * and a flap); a fold opens its joint; another joint selects its board with
 * that joint open. A fold's angle sits on it as a chip, with a valley or
 * mountain mark.
 */
function NetPicks({ d, pl, px, sel, onFold }: { d: Design; pl: Placed; px: number; sel: StoreSelection | null; onFold: (id: string) => (ev: React.PointerEvent) => void }) {
  const t = useT();
  const [hover, setHover] = useState<string | null>(null);
  const edges = useMemo(() => netEdges(d, pl.copy), [d, pl.copy]);
  const chips = useMemo(() => foldChips(d, pl.copy), [d, pl.copy]);
  const at = (q: Vec2) => ({ x: q.x + pl.ox, y: pl.H - q.y });
  const pick = (e: NetEdge) => (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const st = useStore.getState();
    if (e.foldId) return onFold(e.foldId)(ev);
    if (e.jointId) {
      st.select({ kind: 'panel', id: e.panelId });
      st.set({ openJoint: e.jointId });
      return;
    }
    st.select({ kind: 'edge', panelId: e.panelId, edge: e.key });
  };
  return (
    <g className="net-picks" data-testid={`net-picks-${pl.copy.pieceKey}`}>
      {edges.map((e) => {
        const a = at(e.a), b = at(e.b);
        const id = `${e.panelId}-${e.key}`;
        const on = sel?.kind === 'edge' && sel.panelId === e.panelId && sel.edge === e.key;
        return (
          <g key={id}>
            {on && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1fb8ac" strokeWidth={px * 4} strokeLinecap="round" pointerEvents="none" data-testid="net-edge-selected" />}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={`edge-hit${e.free ? ' free' : ''}`}
              stroke="transparent"
              strokeWidth={SNAP_PX * px}
              onPointerDown={pick(e)}
              onPointerEnter={() => setHover(id)}
              onPointerLeave={() => setHover((h) => (h === id ? null : h))}
              data-testid={`net-edge-${e.panelId}-${e.key}`}
              data-free={e.free || undefined}
              data-fold={e.foldId}
            />
            {hover === id && e.free && !on && (
              <g pointerEvents="none" transform={`translate(${(a.x + b.x) / 2}, ${(a.y + b.y) / 2})`}>
                <circle r={px * 9} fill="#1fb8ac" />
                <text textAnchor="middle" dy={px * 4} fontSize={px * 13} fill="#fff">+</text>
                <title>{t('net.addHere')}</title>
              </g>
            )}
          </g>
        );
      })}
      {chips.map((c) => {
        const p = at(c.at);
        return (
          <g key={c.foldId} className="fold-chip" pointerEvents="none" transform={`translate(${p.x}, ${p.y})`} data-testid={`fold-chip-${c.foldId}`}>
            <rect x={-px * 20} y={-px * 8} width={px * 40} height={px * 16} rx={px * 8} />
            <text textAnchor="middle" dy={px * 4} fontSize={px * 10} direction="ltr">
              {`${Math.round(c.angle)}° ${c.valley ? 'V' : 'M'}`}
            </text>
            <title>{t(c.valley ? 'conn.valley' : 'conn.mountain')}</title>
          </g>
        );
      })}
    </g>
  );
}
