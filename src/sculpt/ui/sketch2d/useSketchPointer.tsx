// The sketch view's pointer (SKETCH_OVERHAUL.md §7): pointer → SVG point →
// sketch coordinates → the tool's reducer (src/sketch/tools.ts). A press that
// moves under 4 px is a click, so a pan never adds a point.
import { useEffect, useMemo, useRef, useState } from 'react';
import { gridSnap, useStore, useT, type SkTool } from '../../../store/store';
import type { MsgKey } from '../../../i18n';
import { fmtNum } from '../../../i18n';
import type { P2, SketchGraph } from '../../../model/types';
import type { useViewBox } from '../../../views/canvas2d';
import { Marquee } from '../../../views/canvas2d';
import { busy, initTool, step, typedTarget, type Env, type ToolEv, type ToolState } from '../../../sketch/tools';
import { arcOf, bulgeThrough, arcPts, bezPts } from '../../../sketch/flatten';
import { selPts } from '../../../sketch/model';
import { setSegKind, setSmooth } from '../../../sketch/ops';
import { hitTest } from '../../../sketch/hit';
import { underlay } from '../../underlay';
import { sketchHandlers } from '../commands';

export type View = ReturnType<typeof useViewBox>;
export type Ptr = {
  onDown: (ev: React.PointerEvent) => void;
  onMove: (ev: React.PointerEvent) => void;
  onDouble: (ev: React.MouseEvent) => void;
  hint: string | null;
  state: ToolState;
  env: () => Env;
};

const st = () => useStore.getState();
const fromSvg = (p: P2): P2 => ({ x: p.x, y: -p.y });
const sv = (p: P2) => ({ x: p.x, y: -p.y });

/** Where the view is, for things outside the canvas (the Add shape menu): its middle and a screen → sketch mapping. */
export const sketchViewInfo: { centre: P2; toSketch: ((x: number, y: number) => P2 | null) | null; canvas: SVGSVGElement | null } = { centre: { x: 0, y: 0 }, toSketch: null, canvas: null };

/** A pick the bar is waiting for: the next click on a straight line goes to it. */
export const sketchPick: { onLine: ((seg: string) => void) | null } = { onLine: null };

const TOOL_KEYS: Record<string, SkTool> = { v: 'select', '1': 'line', '2': 'bezier', '3': 'smooth', '4': 'points', a: 'arc', e: 'erase', t: 'tape' };

export function useSketchPointer(view: View): Ptr {
  const t = useT();
  const tool = useStore((s) => s.sketch?.tool ?? 'select');
  const [state, setState] = useState<ToolState>(() => initTool(tool));
  const ref = useRef(state);
  ref.current = state;
  useEffect(() => setState(initTool(tool)), [tool]);
  const sc = useStore((s) => s.design.sculpt);
  const rigid = useStore((s) => !!s.sketch?.rigid);
  const shapeId = useStore((s) => s.sketch?.shapeId ?? null);
  const M = useStore((s) => s.sketch?.M);
  const ready = useStore((s) => s.sculpt.ready);
  const under = useMemo(() => (rigid && M && ready ? underlay(sc, shapeId, M).flatMap((u) => u.rings) : []), [sc, shapeId, M, rigid, ready]);

  const env = (): Env => ({
    sk: () => st().sketch!.draft as SketchGraph,
    edit: <T,>(fn: (sk: SketchGraph) => T): T => {
      let r: T = undefined as T;
      st().sketchEdit((x) => void (r = fn(x as SketchGraph)));
      return r;
    },
    preview: (fn) => void st().sketchEdit((x) => void fn(x as SketchGraph), { preview: true }),
    commit: () => st().sketchCommit(),
    cancel: () => st().sketchCancelGesture(),
    undo: () => st().sketchUndo(),
    mmPerPx: view.mmPerPx(),
    grid: (x, alt) => gridSnap(x, { altKey: alt }),
    smart: st().viewPrefs.snap,
    cons: !!st().sketch?.cons,
    underlay: under,
    sel: () => st().sketch!.sel,
    setSel: (x) => st().setSketch({ sel: x }),
  });
  const run = (ev: ToolEv) => {
    const k = st().sketch;
    if (!k) return;
    // the tool changed since the last render: start it fresh before this event
    if (ref.current.tool !== k.tool) ref.current = initTool(k.tool);
    const next = step(ref.current, ev, env());
    ref.current = next;
    if (next.done) {
      st().setSketch({ tool: 'select' });
      setState(initTool('select'));
      return;
    }
    setState(next);
  };
  const at = (ev: { clientX: number; clientY: number }) => fromSvg(view.svgPoint(ev));
  const mods = (ev: { shiftKey: boolean; altKey: boolean }) => ({ shift: ev.shiftKey, alt: ev.altKey });

  sketchViewInfo.toSketch = (x, y) => (sketchViewInfo.canvas ? at({ clientX: x, clientY: y }) : null);
  sketchViewInfo.centre = { x: view.vb.x + view.vb.w / 2, y: -(view.vb.y + view.vb.h / 2) };

  // keys: the tool's (Enter, Esc, Backspace, typed numbers), then the tool keys
  useEffect(() => {
    sketchHandlers.key = (e) => {
      const s = ref.current;
      const k = st().sketch;
      if (!k || e.ctrlKey || e.metaKey) return false;
      const routed = ['Enter', 'Escape', 'Backspace', 'Tab', '<'];
      const typing = s.typed && /^[0-9.+\-*/()]$/.test(e.key);
      const startTyping = s.chain && /^[0-9.]$/.test(e.key);
      if ((routed.includes(e.key) && (busy(s) || (e.key === 'Escape' && s.tool !== 'select'))) || typing || startTyping) {
        e.preventDefault();
        run({ t: 'key', key: e.key });
        return true;
      }
      if (busy(s) || e.altKey) return false;
      const key = e.key.toLowerCase();
      // with Select and something selected, 1 / 2 / 3 change it
      if (s.tool === 'select' && (k.sel.pts.length || k.sel.segs.length) && (key === '1' || key === '2' || key === '3')) {
        e.preventDefault();
        const pts = selPts(k.draft, k.sel);
        const segs = k.sel.segs.length ? k.sel.segs : k.draft.order.filter((g) => pts.includes(k.draft.segs[g].a) && pts.includes(k.draft.segs[g].b));
        st().sketchEdit((x) => {
          if (key === '1') (setSegKind(x, segs, 'line'), setSmooth(x, pts, false));
          if (key === '2') setSegKind(x, segs, 'bez');
          if (key === '3') setSmooth(x, pts, true);
        });
        return true;
      }
      if (TOOL_KEYS[key]) {
        e.preventDefault();
        st().setSketch({ tool: TOOL_KEYS[key] });
        return true;
      }
      return false;
    };
    return () => void (sketchHandlers.key = undefined);
  });

  const onDown = (ev: React.PointerEvent) => {
    if (ev.button === 1 || ev.button === 2) {
      const x0 = ev.clientX, y0 = ev.clientY, right = ev.button === 2;
      view.panFrom(ev);
      const up = (e: PointerEvent) => {
        window.removeEventListener('pointerup', up);
        // a right-click without moving ends a chain
        if (right && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) run({ t: 'right' });
      };
      window.addEventListener('pointerup', up);
      return;
    }
    if (ev.button !== 0) return;
    if (sketchPick.onLine) {
      // the bar asked for a line (Mirror across a line)
      const k = st().sketch!;
      const h = hitTest(k.draft, at(ev), 10 * view.mmPerPx());
      if (h?.kind === 'seg' && k.draft.segs[h.id].k === 'line') {
        const f = sketchPick.onLine;
        sketchPick.onLine = null;
        f(h.id);
      }
      return;
    }
    const x0 = ev.clientX, y0 = ev.clientY;
    let moved = false;
    run({ t: 'down', p: at(ev), mods: mods(ev) });
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) <= 4) return;
      moved = true;
      run({ t: 'drag', p: at(e), mods: mods(e) });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      run({ t: moved ? 'up' : 'click', p: at(e), mods: mods(e) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onMove = (ev: React.PointerEvent) => {
    if (ev.buttons) return;
    run({ t: 'move', p: at(ev), mods: mods(ev) });
  };
  const onDouble = (ev: React.MouseEvent) => run({ t: 'double', p: at(ev) });
  const hintKey = `sketch.hint.${tool === 'select' ? 'select' : tool}` as MsgKey;
  return { onDown, onMove, onDouble, hint: t(hintKey), state, env };
}

const SNAP_LABEL: Record<string, MsgKey | undefined> = { end: 'sketch.snap.end', mid: 'sketch.snap.mid', centre: 'sketch.snap.centre', cross: 'sketch.snap.cross', body: 'sketch.snap.body', close: 'sketch.snap.close' };
const pathOf = (pts: P2[]) => (pts.length ? `M${pts.map((p) => `${p.x} ${-p.y}`).join('L')}` : '');

/** The tool's overlay: the rubber band, the snap marker, lengths and angles, typed numbers, an arc's preview, the tape and the erase box. */
export function SketchOverlay({ ptr, px }: { ptr: Ptr; px: number }) {
  const t = useT();
  const draft = useStore((s) => s.sketch?.draft);
  const s = ptr.state;
  if (!draft) return null;
  const pos = (id: string | null | undefined, fb: P2): P2 => (id && draft.pts[id] ? draft.pts[id] : fb);
  const out: React.ReactNode[] = [];
  const label = (p: P2, text: string, key: string) =>
    out.push(
      <text key={key} x={p.x + px * 10} y={-p.y - px * 10} className="sk-dim-text" fontSize={px * 12} pointerEvents="none">
        {text}
      </text>,
    );
  const target = s.typed ? typedTarget(s, ptr.env()) : s.snap?.p ?? s.cur;
  const c = s.chain;
  if (c) {
    const from = c.last ? pos(c.last, c.start.p) : pos(c.start.id, c.start.p);
    // the first point, larger once the chain can close on it
    if (c.first && c.n >= 2) {
      const f = sv(pos(c.first, c.start.p));
      const near = s.snap?.kind === 'close';
      out.push(<circle key="first" cx={f.x} cy={f.y} r={px * (near ? 9 : 6)} className={`sk-first ${near ? 'close' : ''}`} strokeWidth={px * 2} pointerEvents="none" data-testid="sk-first" />);
      if (near) {
        // the region the closed outline will fill
        const pts = c.pts.map((id) => pos(id, c.start.p));
        out.push(<path key="closefill" d={`${pathOf(pts)}Z`} className="sk-region" pointerEvents="none" />);
      }
    }
    if (target) {
      if (s.tool === 'bezier' && s.bez.down) {
        const h = s.bez.h ?? { x: 0, y: 0 };
        const P: [P2, P2, P2, P2] = [from, { x: from.x + (c.out?.x ?? 0), y: from.y + (c.out?.y ?? 0) }, { x: s.bez.down.p.x - h.x, y: s.bez.down.p.y - h.y }, s.bez.down.p];
        out.push(<path key="rb" d={pathOf(bezPts(P, 0.05).pts)} className="sk-rubber" strokeWidth={px * 1.5} pointerEvents="none" />);
        if (s.bez.h) out.push(<path key="hl" d={pathOf([{ x: s.bez.down.p.x - h.x, y: s.bez.down.p.y - h.y }, { x: s.bez.down.p.x + h.x, y: s.bez.down.p.y + h.y }])} className="sk-handle-line" strokeWidth={px} pointerEvents="none" />);
      } else out.push(<path key="rb" d={pathOf([from, target])} className="sk-rubber" strokeWidth={px * 1.5} strokeDasharray={`${px * 5} ${px * 3}`} pointerEvents="none" data-testid="sk-rubber" />);
      const L = Math.hypot(target.x - from.x, target.y - from.y);
      const A = (Math.atan2(target.y - from.y, target.x - from.x) * 180) / Math.PI;
      if (!s.typed) label(target, `${fmtNum(L)} ${t('unit.mm')} · ${fmtNum(A)}°`, 'len');
    }
  }
  if (s.typed && s.cur) {
    const p = sv(s.cur);
    const f = (k: 'len' | 'ang') => `${s.typed![k]}${s.typed!.focus === k ? '▍' : ''}`;
    out.push(
      <g key="typed" pointerEvents="none" data-testid="sk-typed">
        <rect x={p.x + px * 12} y={p.y + px * 8} width={px * 190} height={px * 22} rx={px * 4} className="sk-pill" strokeWidth={px} />
        <text x={p.x + px * 18} y={p.y + px * 23} className="sk-pill-text" fontSize={px * 12}>
          {`${t('sketch.typed.len')} ${f('len')}  <  ${t('sketch.typed.ang')} ${f('ang')}`}
        </text>
      </g>,
    );
  }
  if (s.tool === 'arc' && s.arc.a && s.cur) {
    const tp = s.snap?.p ?? s.cur;
    if (!s.arc.b) out.push(<path key="arc1" d={pathOf([s.arc.a.p, tp])} className="sk-rubber" strokeWidth={px * 1.5} strokeDasharray={`${px * 5} ${px * 3}`} pointerEvents="none" />);
    else {
      const bulge = bulgeThrough(s.arc.a.p, s.arc.b.p, tp);
      const pts = Math.abs(bulge) > 1e-9 ? arcPts(s.arc.a.p, s.arc.b.p, bulge, 0.05) : [s.arc.a.p, s.arc.b.p];
      out.push(<path key="arc2" d={pathOf(pts)} className="sk-rubber" strokeWidth={px * 1.5} pointerEvents="none" data-testid="sk-arc-preview" />);
      if (Math.abs(bulge) > 1e-9) label(tp, t('sketch.radius', { r: fmtNum(arcOf(s.arc.a.p, s.arc.b.p, bulge).r) }), 'r');
    }
  }
  if (s.tool === 'tape' && s.tape.a) {
    const b = s.tape.b ?? s.snap?.p ?? s.cur;
    if (b) {
      out.push(<path key="tape" d={pathOf([s.tape.a, b])} className="sk-rubber" strokeWidth={px * 1.5} pointerEvents="none" data-testid="sk-tape" />);
      label({ x: (s.tape.a.x + b.x) / 2, y: (s.tape.a.y + b.y) / 2 }, `${fmtNum(Math.hypot(b.x - s.tape.a.x, b.y - s.tape.a.y))} ${t('unit.mm')}`, 'tapel');
    }
  }
  if (s.box) out.push(<Marquee key="box" a={sv(s.box.a)} b={sv(s.box.b)} px={px} />);
  // the snap marker
  const sn = s.snap;
  if (sn && sn.kind !== 'grid' && sn.kind !== 'free' && sn.kind !== 'angle') {
    const q = sv(sn.p);
    const join = !!s.drag && !!sn.ptId;
    out.push(<circle key="snap" cx={q.x} cy={q.y} r={px * 7} className="sk-snap" strokeWidth={px * 2} pointerEvents="none" data-testid="sk-snap" />);
    const key = join ? 'sketch.snap.join' : SNAP_LABEL[sn.kind];
    if (key)
      out.push(
        <text key="snapl" x={q.x + px * 10} y={q.y + px * 18} className="sk-snap-label" fontSize={px * 11} pointerEvents="none" data-testid="sk-snap-label">
          {t(key)}
        </text>,
      );
  }
  return <g className="sk-overlay">{out}</g>;
}

