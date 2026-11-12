// The sketch view's rail (SKETCH_OVERHAUL.md §6.4), styled as the stage's rail.
import { useEffect, useRef, useState } from 'react';
import { gridSnap, useStore, useT, type SkTool } from '../../../store/store';
import type { P2, SketchGraph } from '../../../model/types';
import { emptySketch } from '../../../sketch/model';
import { stamp, STAMPS, type StampKind } from '../../../sketch/ops';
import { sketchPolylines } from '../../../sketch/regions';
import { NumField, Stepper } from '../../../ui/NumField';
import { sketchViewInfo } from './useSketchPointer';
import type { MsgKey } from '../../../i18n';
import { Icon } from '../../../ui/icons';

const st = () => useStore.getState();

export const SK_TOOLS: { id: SkTool; key: MsgKey; icon: string; kbd: string }[] = [
  { id: 'select', key: 'sketch.tool.select', icon: 'select', kbd: 'V' },
  { id: 'line', key: 'sketch.tool.line', icon: 'polygon', kbd: '1' },
  { id: 'bezier', key: 'sketch.tool.bezier', icon: 'curve', kbd: '2' },
  { id: 'smooth', key: 'sketch.tool.smooth', icon: 'grow', kbd: '3' },
  { id: 'points', key: 'sketch.tool.points', icon: 'plus', kbd: '4' },
  { id: 'arc', key: 'sketch.tool.arc', icon: 'circle', kbd: 'A' },
];

export function SketchRail() {
  const t = useT();
  const tool = useStore((s) => s.sketch?.tool);
  const cons = useStore((s) => !!s.sketch?.cons);
  const dims = useStore((s) => !!s.sketch?.dims);
  const btn = (id: SkTool, key: MsgKey, icon: string, kbd: string) => (
    <button key={id} className={tool === id ? 'on' : ''} aria-pressed={tool === id} aria-label={t(key)} onClick={() => st().setSketch({ tool: id })} data-testid={`sk-tool-${id}`}>
      <Icon name={icon} />
      <span className="tip" aria-hidden>
        {t(key)}
        <kbd>{kbd}</kbd>
      </span>
    </button>
  );
  return (
    <nav className="rail sk-rail" aria-label={t('tool.title')} data-testid="sketch-rail">
      {SK_TOOLS.map((x) => btn(x.id, x.key, x.icon, x.kbd))}
      <ShapeMenuSlot />
      {btn('erase', 'sketch.tool.erase', 'trash', 'E')}
      <div className="rail-sep" />
      <button className={cons ? 'on' : ''} aria-pressed={cons} aria-label={t('sketch.tool.cons')} onClick={() => st().setSketch({ cons: !cons })} data-testid="sk-cons">
        <Icon name="ruler" />
        <span className="tip" aria-hidden>
          {t('sketch.tool.cons')}
        </span>
      </button>
      {btn('tape', 'sketch.tool.tape', 'ruler', 'T')}
      <button className={dims ? 'on' : ''} aria-pressed={dims} aria-label={t('sketch.tool.dims')} onClick={() => st().setSketch({ dims: !dims })} data-testid="sk-dims">
        <Icon name="grid" />
        <span className="tip" aria-hidden>
          {t('sketch.tool.dims')}
        </span>
      </button>
    </nav>
  );
}

/** A small picture of a stamp (its own outline, drawn by the real stamp code). */
function StampIcon({ kind, n, inner }: { kind: StampKind; n: number; inner: number }) {
  const sk = emptySketch();
  stamp(sk, kind, { x: 0, y: 0 }, { size: 20, n, inner, ...(kind === 'oval' ? { w: 22, h: 14 } : {}) });
  const d = sketchPolylines(sk)
    .map((l) => `M${l.map((p) => `${p.x} ${-p.y}`).join('L')}`)
    .join('');
  return (
    <svg viewBox="-13 -13 26 26" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Add shape: a menu of ready-made outlines. A click adds one in the middle of the view; a drag drops it where it is let go. */
export function ShapeMenuSlot() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(5);
  const [inner, setInner] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const put = (kind: StampKind, at: P2) => {
    const g = (x: number) => gridSnap(x);
    let made: { pts: string[]; segs: string[] } | null = null;
    st().sketchEdit((sk) => void (made = stamp(sk as SketchGraph, kind, { x: g(at.x), y: g(at.y) }, { n, inner: inner / 100 })));
    if (made) st().setSketch({ tool: 'select', sel: made });
  };
  const down = (kind: StampKind) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => void (moved ||= Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4);
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setOpen(false);
      if (!moved) return put(kind, sketchViewInfo.centre);
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const at = sketchViewInfo.canvas && over && sketchViewInfo.canvas.contains(over) ? sketchViewInfo.toSketch?.(ev.clientX, ev.clientY) : null;
      if (at) put(kind, at);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="sk-shape-wrap" ref={ref}>
      <button className={open ? 'on' : ''} aria-expanded={open} aria-haspopup="menu" aria-label={t('sketch.tool.shape')} onClick={() => setOpen((o) => !o)} data-testid="sk-tool-shape">
        <Icon name="shapes" />
        <span className="tip" aria-hidden>
          {t('sketch.tool.shape')}
        </span>
      </button>
      {open && (
        <div className="sk-menu" role="menu" data-testid="sk-shape-menu">
          <div className="stamps">
            {STAMPS.map((k) => (
              <button key={k} role="menuitem" title={t(`sketch.stamp.${k}` as MsgKey)} onPointerDown={down(k)} data-testid={`sk-stamp-${k}`}>
                <StampIcon kind={k} n={n} inner={inner / 100} />
                <span>{t(`sketch.stamp.${k}` as MsgKey)}</span>
              </button>
            ))}
          </div>
          <Stepper label={t('sketch.stamp.sides')} value={n} min={3} max={24} onCommit={(v) => setN(Math.round(v))} testId="sk-stamp-n" />
          <NumField label={t('sketch.stamp.inner')} value={inner} unit="%" min={10} max={90} decimals={0} onCommit={setInner} testId="sk-stamp-inner" />
          <p className="note">{t('sketch.stamp.hint')}</p>
        </div>
      )}
    </div>
  );
}
