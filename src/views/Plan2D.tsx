// The 2D editor, used for the cut plan (every piece flat on its sheets) and
// for the solo panel view (one panel face-on). Both edit the same panels as
// the 3D workspace, with the same tools, selection and history.
import { useEffect, useMemo, useRef, useState } from 'react';
import { detailSel, gridSnap, noSmartSnap, selectedDetailIds, selectedPanelIds, useStore, useT } from '../store/store';
import { pack, pieceCopies, placementXform, sheetGroups, type PieceCopy } from '../model/pack';
import { netOverlaps, panelPiece, pieceRoot } from '../model/pieces';
import { isOutlineShape } from '../model/outline';
import { contourPathD } from '../export/svg';
import { applyX, flattenContour, IDENTITY, invertPoint, xformContour } from '../geom/vec';
import { SNAP_PX, type Vec2, type Xform2 } from '../geom/types';
import { addDetail, findDetail, newId, rotateDetails, updateDetail } from '../model/ops';
import { scaleDetails } from '../model/edit';
import { detailBBox, detailContours } from '../model/geometry';
import { snapBox, snapContext, snapPoint, type Guide } from '../model/snap';
import { LAYERS } from '../export/layers';
import { fmtNum } from '../i18n';
import type { Design, Detail, MaterialProfile, SheetPlacement } from '../model/types';
import { validate } from '../model/validate';
import { placeText } from './View3D';
import { MATERIAL_COLORS, boardTintCss } from './palette';
import { panelLabel } from '../model/names';
import { materialName } from '../ui/materialName';
import { snapAngle } from './widgets';
import { PendingBarHtml } from './panelTool';
import { Icon } from '../ui/icons';

const GAP = 40;
const grid = (x: number, ev?: { altKey: boolean } | null) => gridSnap(x, ev);

type Placed = { copy: PieceCopy; sheet: number; xf: Xform2; ox: number; H: number };
/** One sheet drawn in the cut plan: its material, its number within that material, where it sits and its size. */
type Slot = { mat: string; profile: MaterialProfile; i: number; n: number; ox: number; W: number; H: number };
type VB = { x: number; y: number; w: number; h: number };
type Box = { minX: number; maxX: number; minY: number; maxY: number };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vb: VB }
  | { kind: 'marquee'; a: Vec2; b: Vec2; additive: boolean; base: string[] }
  | { kind: 'move'; ids: string[]; placed: Placed; panelId: string; start: Vec2; startSvg: Vec2; box: Box }
  | { kind: 'resize'; id: string; placed: Placed; panelId: string; fixed: Vec2; circle: boolean; rot?: number }
  | { kind: 'rotate'; ids: string[]; placed: Placed; panelId: string; pivot: Vec2; a0: number; last: number; deg: number }
  | { kind: 'gresize'; ids: string[]; placed: Placed; panelId: string; fixed: Vec2; corner: Vec2 }
  | { kind: 'draw'; id: string; placed: Placed; panelId: string; start: Vec2 }
  | { kind: 'piece'; key: string; start: SheetPlacement; startSvg: Vec2; moved: boolean };

// view boxes survive switching views (solo → back restores the framing)
const savedVB = new Map<string, VB>();

export function Plan2D({ soloPanel }: { soloPanel?: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const sel = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const hoverPart = useStore((s) => s.hoverPart);
  const textDir = useStore((s) => (s.lang === 'he' ? 'rtl' : 'ltr'));
  const svgRef = useRef<SVGSVGElement>(null);
  const solo = soloPanel ? d.panels[soloPanel] : undefined;
  const modeKey = solo ? `solo:${solo.id}` : 'sheets';

  const layout = useMemo(() => {
    if (solo) {
      const piece = panelPiece(d, solo.id);
      const copy: PieceCopy = { key: `${solo.id}#solo`, pieceKey: solo.id, copy: 0, contours: piece.contours, w: solo.w, h: solo.h, origin: { x: 0, y: 0 }, panels: piece.panels, mat: d.material.id };
      return { placed: [{ copy, sheet: 0, xf: IDENTITY, ox: 0, H: solo.h }] as Placed[], slots: [] as Slot[], placements: {} as Record<string, SheetPlacement>, mixed: false };
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
        return { copy: c, sheet: pl.sheet, xf: placementXform(pl, c.h), ox: k.ox, H: k.H };
      });
    return { placed, slots, placements, mixed: groups.length > 1 };
  }, [d, solo]);
  // nets that would not lie flat (milestone 35): the overlap regions, in red on the piece
  const netBad = useMemo(() => (solo ? [] : netOverlaps(d)), [d, solo]);
  // pieces flagged by validation (overlapping or off the sheet) are drawn in red
  const badPieces = useMemo(() => {
    if (solo) return new Set<string>();
    return new Set(validate(d).filter((i) => i.key === 'val.piecesOverlap' || i.key === 'val.offSheet').map((i) => i.target.id));
  }, [d, solo]);

  const fitVB = (): VB => {
    if (solo) {
      const m = Math.max(solo.w, solo.h) * 0.12 + 10;
      return { x: -m, y: -m, w: solo.w + 2 * m, h: solo.h + 2 * m };
    }
    const last = layout.slots[layout.slots.length - 1];
    const totalW = last ? last.ox + last.W : d.material.sheetW;
    const H = Math.max(1, ...layout.slots.map((k) => k.H));
    // frame the sheets in the area the floating rail and card leave free
    // (rail at the inline start, card at the inline end)
    const el = svgRef.current;
    const cw = el?.clientWidth || 1200, ch = el?.clientHeight || 760;
    const rtl = document.documentElement.dir === 'rtl';
    const railPx = 96, cardPx = 340, topPx = 84, bottomPx = 64;
    const left = rtl ? cardPx : railPx, right = rtl ? railPx : cardPx;
    const availW = Math.max(200, cw - left - right), availH = Math.max(160, ch - topPx - bottomPx);
    const k = Math.min(availW / totalW, availH / H); // px per mm
    const x0 = left + (availW - totalW * k) / 2, y0 = topPx + (availH - H * k) / 2;
    return { x: -x0 / k, y: -y0 / k, w: cw / k, h: ch / k };
  };
  const [vb, setVBState] = useState<VB>(() => savedVB.get(modeKey) ?? fitVB());
  const setVB = (v: VB | ((o: VB) => VB)) =>
    setVBState((o) => {
      const n = typeof v === 'function' ? v(o) : v;
      savedVB.set(modeKey, n);
      return n;
    });
  useEffect(() => setVBState(savedVB.get(modeKey) ?? fitVB()), [modeKey]);
  // the first fit ran before the drawing had a size: fit again once it has one
  useEffect(() => {
    if (!savedVB.has(modeKey)) setVBState(fitVB());
  }, []);
  const [label, setLabel] = useState<{ text: string; x: number; y: number } | null>(null);
  const [guides, setGuides] = useState<{ guides: Guide[]; targets: Vec2[]; placed: Placed; panelId: string } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const drag = useRef<Drag | null>(null);

  const svgPoint = (ev: { clientX: number; clientY: number }): Vec2 => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  };
  /** mm per screen pixel (fixed-pixel snap threshold at every zoom). */
  const mmPerPx = () => {
    const svg = svgRef.current;
    if (!svg || !svg.clientWidth) return vb.w / 900;
    return Math.max(vb.w / svg.clientWidth, vb.h / svg.clientHeight);
  };
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
          st.preview((x) => scaleDetails(x, g.ids, g.fixed, sx, sy));
          setLabel({ text: `${fmtNum(Math.abs(px - g.fixed.x))} × ${fmtNum(Math.abs(py - g.fixed.y))}`, ...svgPoint(ev) });
          return;
        }
        if (g.kind === 'resize' && g.rot) {
          // a turned shape: measure the pointer in the shape's own axes from the fixed corner
          const a = (g.rot * Math.PI) / 180, c = Math.cos(a), s2 = Math.sin(a);
          const rx = px - g.fixed.x, ry = py - g.fixed.y;
          const lx = rx * c + ry * s2, ly = -rx * s2 + ry * c;
          const w = Math.max(0.5, Math.abs(lx)), h = Math.max(0.5, Math.abs(ly));
          const hx = ((Math.sign(lx) || 1) * w) / 2, hy = ((Math.sign(ly) || 1) * h) / 2;
          const cx = g.fixed.x + hx * c - hy * s2, cy = g.fixed.y + hx * s2 + hy * c;
          st.preview((x) => updateDetail(x, g.id, { cx, cy, w, h }));
          setLabel({ text: `${fmtNum(w)} × ${fmtNum(h)}`, ...svgPoint(ev) });
          return;
        }
        const circle = g.kind === 'resize' ? g.circle : st.tool === 'circle';
        const fixed = g.kind === 'resize' ? g.fixed : g.start;
        let w = Math.abs(px - fixed.x), h = Math.abs(py - fixed.y);
        if (circle) w = h = Math.max(w, h);
        if (w < 0.5 && h < 0.5) return;
        const cx = fixed.x + ((Math.sign(px - fixed.x) || 1) * w) / 2;
        const cy = fixed.y + ((Math.sign(py - fixed.y) || 1) * h) / 2;
        if (g.kind === 'resize') st.preview((x) => updateDetail(x, g.id, { cx, cy, w: Math.max(0.5, w), h: Math.max(0.5, h) }));
        else {
          const shape = st.tool === 'select' || st.tool === 'panel' ? 'rect' : st.tool;
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
      } else if (g.kind !== 'pan') st.commit();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && drag.current) {
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

  const onWheel = (ev: React.WheelEvent) => {
    const p = svgPoint(ev);
    const k = Math.exp(ev.deltaY * 0.0015);
    setVB((v) => {
      const w = Math.min(20000, Math.max(5, v.w * k));
      const s = w / v.w;
      return { x: p.x - (p.x - v.x) * s, y: p.y - (p.y - v.y) * s, w, h: v.h * s };
    });
  };
  const zoom = (k: number) => setVB((v) => ({ x: v.x + (v.w * (1 - k)) / 2, y: v.y + (v.h * (1 - k)) / 2, w: v.w * k, h: v.h * k }));

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
    useStore.getState().set({ sheetCopy: pl.copy.key });
    const start = layout.placements[pl.copy.key];
    if (start) drag.current = { kind: 'piece', key: pl.copy.key, start, startSvg: svgPoint(ev), moved: false };
  };
  const onDetailDown = (pl: Placed, dt: Detail, panelId: string) => (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    if (shapeTool || tool === 'text' || useStore.getState().pasting) return onPieceDown(pl)(ev);
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
    if (solo) return;
    ev.stopPropagation();
    useStore.getState().openSolo(panelAt(pl, svgPoint(ev)));
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
                    onPointerDown={dt && owner ? onDetailDown(pl, dt, owner.id) : undefined}
                    pointerEvents={dt ? undefined : 'none'}
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
                  const q = d.pieces[pieceRoot(pl.copy.pieceKey)]?.quantity ?? 1;
                  return (
                    <text key={n.panelId} x={c.x} y={c.y} className="piece-label" fontSize={Math.max(6, px * 12)} textAnchor="middle" direction={textDir} pointerEvents="none">
                      {panelLabel(d, n.panelId, t)}
                      {pl.copy.frag ? ` (${pl.copy.frag.i}/${pl.copy.frag.n})` : ''}
                      {q > 1 && n.panelId === pl.copy.pieceKey ? ` ${t('view.copies', { n: q })}` : ''}
                    </text>
                  );
                })}
            </g>
          );
        })}
        {netBad.map((o, k) => {
          const pl = layout.placed.find((x) => x.copy.copy === 0 && x.copy.pieceKey === o.net);
          if (!pl) return null;
          const at = (q: Vec2) => {
            const r = applyX(pl.xf, { x: q.x - pl.copy.origin.x, y: q.y - pl.copy.origin.y });
            return `${r.x + pl.ox},${pl.H - r.y}`;
          };
          return o.region.map((r, j) => <polygon key={`${k}.${j}`} points={r.map(at).join(' ')} className="net-overlap" fill="rgba(220, 38, 38, 0.55)" stroke="#b91c1c" strokeWidth={px} pointerEvents="none" data-testid="net-overlap" />);
        })}
        {tool === 'select' && ids.length === 1 && primary && primary.detail.shape !== 'text' && placedOf(primary.panel.id) && (
          <Handles
            box={{ minX: primary.detail.cx - primary.detail.w / 2, maxX: primary.detail.cx + primary.detail.w / 2, minY: primary.detail.cy - primary.detail.h / 2, maxY: primary.detail.cy + primary.detail.h / 2 }}
            rot={primary.detail.shape === 'circle' ? 0 : (primary.detail.rot ?? 0)}
            toSvg={(p) => toSvg(placedOf(primary.panel.id)!, primary.panel.id, p)}
            size={px * 9}
            onDown={(fixed) => (ev) => {
              ev.stopPropagation();
              drag.current = { kind: 'resize', id: primary.detail.id, placed: placedOf(primary.panel.id)!, panelId: primary.panel.id, fixed, circle: primary.detail.shape === 'circle', rot: primary.detail.shape === 'circle' ? 0 : primary.detail.rot };
            }}
          />
        )}
        {tool === 'select' && ringInfo && placedOf(ringInfo.panelId) && (
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
        {tool === 'select' && groupInfo && placedOf(groupInfo.panelId) && (
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
        {marquee && (
          <rect
            x={Math.min(marquee.a.x, marquee.b.x)}
            y={Math.min(marquee.a.y, marquee.b.y)}
            width={Math.abs(marquee.b.x - marquee.a.x)}
            height={Math.abs(marquee.b.y - marquee.a.y)}
            className="marquee"
            strokeWidth={px}
            data-testid="marquee"
          />
        )}
        {label && (
          <text x={label.x + px * 12} y={label.y - px * 12} className="dim-text" fontSize={px * 13}>
            {label.text} {t('unit.mm')}
          </text>
        )}
      </svg>
      {pendingAt && <PendingBarHtml x={pendingAt.x} y={pendingAt.y} />}
      <div className="plan-dock" dir="auto">
        {solo && (
          <button className="primary" onClick={() => useStore.getState().closeSolo()} data-testid="solo-back">
            {t('solo.back', { view: t(useStore.getState().prevView === '3d' ? 'top.view3d' : 'top.view2d') })}
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
          {!solo && (
            <button
              onClick={() => {
                const st = useStore.getState();
                if (Object.values(st.design.placements).some((p) => p.manual) && !confirm(t('pack.confirm'))) return;
                st.apply((dd) => void (dd.placements = {}));
              }}
              data-testid="repack"
            >
              <Icon name="repack" /> {t('pack.repack')}
            </button>
          )}
        </div>
        {solo && <span className="solo-title">{t('solo.title', { panel: panelLabel(d, solo.id, t) })}</span>}
      </div>
      <div className="view-hint" dir="auto">
        {d.order.length === 0 ? t('view.empty2d') : tool === 'text' ? t('tool.hint.text') : shapeTool ? t('tool.hint.shape2d') : solo ? t('tool.hint.select2d') : t('pack.hint')}
      </div>
    </div>
  );
}

function Handles(props: { box: Box; rot?: number; toSvg: (p: Vec2) => Vec2; size: number; group?: boolean; onDown: (fixed: Vec2, corner: Vec2) => (ev: React.PointerEvent) => void }) {
  const { minX: x0, maxX: x1, minY: y0, maxY: y1 } = props.box;
  // a turned shape: its corners turn about its centre
  const a = ((props.rot ?? 0) * Math.PI) / 180, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const T = (p: Vec2): Vec2 => (a ? { x: cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a), y: cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a) } : p);
  const corners: [Vec2, Vec2][] = (
    [
      [{ x: x0, y: y0 }, { x: x1, y: y1 }],
      [{ x: x1, y: y0 }, { x: x0, y: y1 }],
      [{ x: x1, y: y1 }, { x: x0, y: y0 }],
      [{ x: x0, y: y1 }, { x: x1, y: y0 }],
    ] as [Vec2, Vec2][]
  ).map(([p, q]) => [T(p), T(q)]);
  const pts = corners.map(([p]) => props.toSvg(p));
  return (
    <g className="handles">
      {props.group && <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="group-box" strokeWidth={props.size / 9} />}
      {corners.map(([p, fixed], i) => {
        const s = pts[i];
        return (
          <rect
            key={i}
            x={s.x - props.size / 2}
            y={s.y - props.size / 2}
            width={props.size}
            height={props.size}
            className="handle"
            onPointerDown={props.onDown(fixed, p)}
            data-testid={`${props.group ? 'ghandle' : 'handle'}-${i}`}
          />
        );
      })}
    </g>
  );
}

/** Rotation ring around the selected shapes (cut plan and face-on view): drag it to turn them (15° steps, Shift 1°, Alt free). */
function RotRing(props: { centre: Vec2; r: number; px: number; onDown: (ev: React.PointerEvent) => void }) {
  const { centre: c, r, px } = props;
  return (
    <g className="rot-ring-g">
      <circle cx={c.x} cy={c.y} r={r} className="rot-ring" strokeWidth={px * 2} />
      <circle cx={c.x} cy={c.y} r={r} className="rot-ring-hit" strokeWidth={px * 14} onPointerDown={props.onDown} data-testid="rot-ring" />
      <circle cx={c.x} cy={c.y - r} r={px * 6} className="rot-knob" onPointerDown={props.onDown} data-testid="rot-knob" />
    </g>
  );
}
