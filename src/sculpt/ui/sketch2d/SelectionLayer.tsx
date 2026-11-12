// The selection frame and measurements in the sketch view (SKETCH_OVERHAUL.md
// §8.2, §8.4): corner and side handles that scale, knobs beyond the corners that
// turn, width and height pills, and lengths and angles that can be typed.
import { useState } from 'react';
import { gridSnap, useStore, useT } from '../../../store/store';
import { fmtNum } from '../../../i18n';
import type { P2, SketchGraph } from '../../../model/types';
import { Handles } from '../../../views/canvas2d';
import { evalNumber } from '../../../ui/NumField';
import { otherEnd, segsAt, selPts, bounds } from '../../../sketch/model';
import { frameScale, scaleSelection, snapTurn, turnSelection, typedSize } from '../../../sketch/select';
import { segLength, cornerAngle } from '../../../sketch/dims';
import { setAngle, setLength } from '../../../sketch/ops';
import type { View } from './useSketchPointer';

const st = () => useStore.getState();
const sv = (p: P2) => ({ x: p.x, y: -p.y });
const fromSvg = (p: P2): P2 => ({ x: p.x, y: -p.y });

/** A value being typed into a pill. */
type Editing =
  | { kind: 'w' | 'h'; at: P2; text: string }
  | { kind: 'len'; seg: string; at: P2; text: string }
  | { kind: 'ang'; pt: string; turn: string; other: string; at: P2; text: string };

/** A pill on the sheet: a value; click to type. */
function Pill({ at, text, px, onClick, testId, dim }: { at: P2; text: string; px: number; onClick?: () => void; testId?: string; dim?: boolean }) {
  const w = (text.length * 6.6 + 14) * px, h = 18 * px;
  const q = sv(at);
  return (
    // the mouse down's default would move the focus and close the input it opens
    <g onPointerDown={(e) => (e.stopPropagation(), e.preventDefault(), onClick?.())} onMouseDown={(e) => e.preventDefault()} style={{ cursor: onClick ? 'text' : 'default' }} data-testid={testId}>
      <rect x={q.x - w / 2} y={q.y - h / 2} width={w} height={h} rx={h / 2} className="sk-pill" strokeWidth={px} opacity={dim ? 0.75 : 1} />
      <text x={q.x} y={q.y + 4 * px} textAnchor="middle" className="sk-pill-text" fontSize={11 * px}>
        {text}
      </text>
    </g>
  );
}

/** The input for a pill being typed into, drawn in the sheet at screen size. */
function PillInput({ e, px, onDone, onTab }: { e: Editing; px: number; onDone: (v: string | null, alt: boolean) => void; onTab?: () => void }) {
  const q = sv(e.at);
  return (
    <foreignObject x={q.x - 40 * px} y={q.y - 11 * px} width={80 * px} height={22 * px}>
      <input
        autoFocus
        defaultValue={e.text}
        style={{ width: '100%', height: '100%', fontSize: `${12 * px}px`, padding: `0 ${4 * px}px`, border: `${px}px solid #2f6feb`, borderRadius: `${4 * px}px`, boxSizing: 'border-box', minHeight: 0 }}
        onFocus={(ev) => ev.target.select()}
        onKeyDown={(ev) => {
          ev.stopPropagation();
          if (ev.key === 'Enter') onDone(ev.currentTarget.value, ev.altKey);
          if (ev.key === 'Escape') onDone(null, false);
          if (ev.key === 'Tab' && onTab) (ev.preventDefault(), onTab());
        }}
        onBlur={(ev) => onDone(ev.currentTarget.value, false)}
        data-testid={`sk-pill-input-${e.kind}`}
      />
    </foreignObject>
  );
}

/** The two straight lines at a corner, or null. */
function cornerLines(sk: SketchGraph, pt: string): [string, string] | null {
  const gs = segsAt(sk, pt, { cons: false });
  return gs.length === 2 && gs.every((g) => sk.segs[g].k === 'line') ? [gs[0], gs[1]] : null;
}

export function SelectionLayer({ view, px }: { view: View; px: number }) {
  const t = useT();
  const k = useStore((s) => s.sketch);
  const keep = useStore((s) => !!s.viewPrefs.keepRatio);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [turn, setTurn] = useState<{ deg: number; at: P2; ring: number; c: P2 } | null>(null);
  if (!k || k.tool !== 'select') return null;
  const sk = k.draft;
  const ids = selPts(sk, k.sel);
  const out: React.ReactNode[] = [];
  const mm = t('unit.mm');

  // ---- the frame: two points or more
  const b = ids.length >= 2 ? bounds(sk, ids) : null;
  if (b && (b.max.x - b.min.x > 1e-6 || b.max.y - b.min.y > 1e-6)) {
    const box = { minX: b.min.x, maxX: b.max.x, minY: -b.max.y, maxY: -b.min.y };
    const mid = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
    const sel = k.sel;
    const startScale = (corner: P2) => (ev: React.PointerEvent) => {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      const c = fromSvg(corner);
      const dir = { x: (Math.abs(c.x - mid.x) < 1e-9 ? 0 : c.x > mid.x ? 1 : -1) as -1 | 0 | 1, y: (Math.abs(c.y - mid.y) < 1e-9 ? 0 : c.y > mid.y ? 1 : -1) as -1 | 0 | 1 };
      const b0 = { min: { ...b.min }, max: { ...b.max } };
      const move = (e: PointerEvent) => {
        const p = fromSvg(view.svgPoint(e));
        const f = frameScale(b0, dir, p, { ratio: e.shiftKey || st().viewPrefs.keepRatio === true, centre: e.altKey, snap: (x) => gridSnap(x, e) });
        st().sketchEdit((x) => void scaleSelection(x as SketchGraph, sel, f), { preview: true });
      };
      const finish = (cancel: boolean) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('keydown', key, true);
        if (cancel) st().sketchCancelGesture();
        else st().sketchCommit();
      };
      const up = () => finish(false);
      const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), finish(true));
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('keydown', key, true);
    };
    out.push(<rect key="frame" x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} className="sk-frame" strokeWidth={px} pointerEvents="none" />);
    // a selection with no width or no height (one straight line along an axis) gets no side handles
    const flat = b.max.x - b.min.x < 1e-6 || b.max.y - b.min.y < 1e-6;
    out.push(<Handles key="handles" box={box} toSvg={(p) => p} size={px * 9} side={!flat} testPrefix="sk-frame" onDown={(_fixed, corner) => startScale(corner)} />);
    // turn knobs beyond the corners
    const R = Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y) / 2;
    const ring = R + 18 * px;
    const knobs = [
      [b.min.x, b.min.y, -1, -1],
      [b.max.x, b.min.y, 1, -1],
      [b.max.x, b.max.y, 1, 1],
      [b.min.x, b.max.y, -1, 1],
    ];
    const startTurn = (ev: React.PointerEvent) => {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      const p0 = fromSvg(view.svgPoint(ev));
      const a0 = Math.atan2(p0.y - mid.y, p0.x - mid.x);
      const move = (e: PointerEvent) => {
        const p = fromSvg(view.svgPoint(e));
        let d = ((Math.atan2(p.y - mid.y, p.x - mid.x) - a0) * 180) / Math.PI;
        d = ((d + 540) % 360) - 180;
        const deg = snapTurn(d, { insideRing: Math.hypot(p.x - mid.x, p.y - mid.y) <= ring, shift: e.shiftKey });
        st().sketchEdit((x) => void turnSelection(x as SketchGraph, sel, mid, deg), { preview: true });
        setTurn({ deg, at: p, ring, c: mid });
      };
      const finish = (cancel: boolean) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('keydown', key, true);
        setTurn(null);
        if (cancel) st().sketchCancelGesture();
        else st().sketchCommit();
      };
      const up = () => finish(false);
      const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), finish(true));
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('keydown', key, true);
    };
    knobs.forEach(([x, y, dx, dy], i) => {
      const q = sv({ x: x + dx * 14 * px, y: y + dy * 14 * px });
      out.push(
        <g key={`turn${i}`} onPointerDown={startTurn} style={{ cursor: 'grab' }} data-testid={`sk-turn-${i}`}>
          <circle cx={q.x} cy={q.y} r={px * 9} fill="transparent" />
          <path d={`M${q.x - 5 * px} ${q.y + 2 * px}A${5 * px} ${5 * px} 0 1 1 ${q.x + 2 * px} ${q.y + 5 * px}`} className="sk-handle-line" strokeWidth={px * 1.8} fill="none" />
        </g>,
      );
    });
    // width and height pills
    const W = b.max.x - b.min.x, H = b.max.y - b.min.y;
    const wAt = { x: mid.x, y: b.min.y - 16 * px }, hAt = { x: b.max.x + 30 * px, y: mid.y };
    if (W > 1e-6) out.push(<Pill key="w" at={wAt} px={px} text={`W ${fmtNum(W)}`} onClick={() => setEditing({ kind: 'w', at: wAt, text: fmtNum(W) })} testId="sk-pill-w" />);
    if (H > 1e-6) out.push(<Pill key="h" at={hAt} px={px} text={`H ${fmtNum(H)}`} onClick={() => setEditing({ kind: 'h', at: hAt, text: fmtNum(H) })} testId="sk-pill-h" />);
    if (turn) {
      out.push(<circle key="ring" cx={turn.c.x} cy={-turn.c.y} r={turn.ring} className="sk-frame" strokeWidth={px} pointerEvents="none" />);
      out.push(
        <text key="turnl" x={turn.at.x + 12 * px} y={-turn.at.y - 12 * px} className="sk-dim-text" fontSize={12 * px} pointerEvents="none">
          {`${fmtNum(turn.deg)}°`}
        </text>,
      );
    }
  }

  // ---- measurements
  if (k.dims) {
    const lines = new Set<string>(k.sel.segs.filter((g) => sk.segs[g]?.k === 'line'));
    const onePt = k.sel.pts.length === 1 && !k.sel.segs.length ? k.sel.pts[0] : null;
    if (onePt) for (const g of segsAt(sk, onePt)) lines.add(g);
    for (const g of k.sel.segs) {
      const s = sk.segs[g];
      if (!s || s.k === 'line') continue;
      // a curve's length is shown, not typed
      const a = sk.pts[s.a], c = sk.pts[s.b];
      out.push(<Pill key={`cl${g}`} at={{ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }} px={px} text={`${fmtNum(segLength(sk, g))} ${mm}`} dim testId={`sk-len-${g}`} />);
    }
    for (const g of lines) {
      const s = sk.segs[g];
      if (!s) continue;
      const a = sk.pts[s.a], c = sk.pts[s.b];
      const L = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      const at = { x: (a.x + c.x) / 2 - ((c.y - a.y) / L) * 14 * px, y: (a.y + c.y) / 2 + ((c.x - a.x) / L) * 14 * px };
      out.push(<Pill key={`l${g}`} at={at} px={px} text={`${fmtNum(segLength(sk, g))} ${mm}`} onClick={s.k === 'line' ? () => setEditing({ kind: 'len', seg: g, at, text: fmtNum(segLength(sk, g)) }) : undefined} testId={`sk-len-${g}`} />);
    }
    if (onePt) {
      const two = cornerLines(sk, onePt);
      const ang = cornerAngle(sk, onePt);
      if (two && ang !== null) {
        const p = sk.pts[onePt];
        const at = { x: p.x + 20 * px, y: p.y + 20 * px };
        out.push(<Pill key="ang" at={at} px={px} text={`${fmtNum(ang)}°`} onClick={() => setEditing({ kind: 'ang', pt: onePt, turn: two[1], other: two[0], at, text: fmtNum(ang) })} testId="sk-angle" />);
        // the angles at the two neighbouring corners
        two.forEach((g, i) => {
          const q = otherEnd(sk, g, onePt);
          const a2 = cornerAngle(sk, q);
          if (a2 !== null) out.push(<Pill key={`na${i}`} at={{ x: sk.pts[q].x + 16 * px, y: sk.pts[q].y + 16 * px }} px={px} text={`${fmtNum(a2)}°`} dim testId={`sk-angle-n${i}`} />);
        });
        if (editing?.kind === 'ang') {
          // the line that will turn is dashed
          const s = sk.segs[editing.turn];
          out.push(<path key="turning" d={`M${sk.pts[s.a].x} ${-sk.pts[s.a].y}L${sk.pts[s.b].x} ${-sk.pts[s.b].y}`} className="sk-rubber" strokeWidth={px * 3} strokeDasharray={`${px * 6} ${px * 4}`} pointerEvents="none" />);
        }
      }
    }
  }

  if (editing) {
    const done = (raw: string | null, alt: boolean) => {
      const e = editing;
      setEditing(null);
      if (raw === null) return;
      const s = st().sketch;
      if (!s) return;
      if (e.kind === 'w' || e.kind === 'h') {
        const bb = bounds(s.draft, selPts(s.draft, s.sel));
        if (!bb) return;
        const cur = e.kind === 'w' ? bb.max.x - bb.min.x : bb.max.y - bb.min.y;
        const v = evalNumber(raw, cur);
        if (v === null || !(v > 0)) return;
        const f = typedSize(bb, e.kind, v, keep);
        const sel = s.sel;
        st().sketchEdit((x) => void scaleSelection(x as SketchGraph, sel, f));
      } else if (e.kind === 'len') {
        const v = evalNumber(raw, segLength(s.draft, e.seg));
        if (v === null || !(v > 0)) return;
        const seg = s.draft.segs[e.seg];
        // the start stays; when one end is selected, that end moves
        const moving = s.sel.pts.find((p) => p === seg.a || p === seg.b);
        const fixed = moving ? (moving === seg.a ? seg.b : seg.a) : seg.a;
        st().sketchEdit((x) => setLength(x as SketchGraph, e.seg, v, { fixed, both: alt }));
      } else {
        const a = e as Extract<Editing, { kind: 'ang' }>;
        const v = evalNumber(raw, cornerAngle(s.draft, a.pt) ?? 0);
        if (v === null || v <= 0 || v >= 360) return;
        st().sketchEdit((x) => setAngle(x as SketchGraph, a.pt, v, a.turn));
      }
    };
    out.push(<PillInput key="input" e={editing} px={px} onDone={done} onTab={editing.kind === 'ang' ? () => setEditing({ ...editing, turn: editing.other, other: editing.turn }) : undefined} />);
  }
  return <g className="sk-selection">{out}</g>;
}
