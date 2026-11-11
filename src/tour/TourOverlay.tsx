// The first-use tour on screen (milestone 43): a spotlight on the step's
// anchor (the rest of the window dimmed, but still usable), and the step's
// card beside it. Steps move on by themselves when the student has done the
// thing (`useTourProgress`); Skip applies the step's result with model ops.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, useT, type EditorState, type TourState } from '../store/store';
import { anchorOf, TOUR_STEPS, type Anchor, type TourStep } from './steps';
import { projectWorld } from './stage';

/** How long a finished step stays on screen before the next one, so the student sees what happened. */
const ADVANCE_MS = 600;
/** The steps after the welcome card, numbered 1–12. */
const COUNT = TOUR_STEPS.length - 1;

type Box = { x: number; y: number; w: number; h: number };

/** The anchor's box on screen (stage points: a small square around the projected point), or null when it is not shown. */
function anchorBox(a: Anchor, d: EditorState['design']): Box | null {
  if ('centre' in a) return null;
  if ('dom' in a) {
    const el = document.querySelector(a.dom);
    const r = el?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  }
  const p = a.stage(d);
  const q = p && projectWorld(p);
  if (!q || q.x < 0 || q.y < 0 || q.x > window.innerWidth || q.y > window.innerHeight) return null;
  return { x: q.x - 22, y: q.y - 22, w: 44, h: 44 };
}

const same = (a: Box | null, b: Box | null) => (a && b ? Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5 : a === b);

/**
 * Moves the tour on: on entering a step its `prepare` runs; when its check
 * turns true (it was not already true on entering) the next step follows after
 * a moment. Returns whether the step was already done on entering (the card
 * then offers Next).
 */
export function useTourProgress(tour: TourState | null): boolean {
  const [doneAtEntry, setDoneAtEntry] = useState(false);
  useEffect(() => {
    if (!tour) return;
    const step = TOUR_STEPS[tour.step];
    if (!step) {
      useStore.getState().endTour();
      return;
    }
    step.prepare?.(useStore.getState());
    // not in the middle of a gesture (a shape being drawn is not made yet)
    const check = (s: EditorState) => !s.txnBase && !!step.done?.(s, tour.entry);
    const already = check(useStore.getState());
    setDoneAtEntry(already);
    if (already || !step.done) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useStore.subscribe((s) => {
      if (timer || s.tour !== tour || !check(s)) return;
      timer = setTimeout(() => {
        timer = null;
        const now = useStore.getState();
        // still done (a shape may have gone on to wait for ✓, or been undone)
        if (now.tour === tour && check(now)) now.tourNext();
      }, ADVANCE_MS);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [tour]);
  return doneAtEntry;
}

/** Skip: the step's result made with model ops (one undo step), then the next step. */
export function skipStep(step: TourStep, tour: TourState) {
  const s = useStore.getState();
  // something still waiting for ✓ or a rising tray goes first
  if (s.pending) s.cancelPending();
  if (s.extrude) s.set({ extrude: null });
  const now = useStore.getState();
  if (!step.done?.(now, tour.entry)) {
    if (step.skip) now.apply((d) => step.skip!(d));
    step.skipUi?.(useStore.getState());
  }
  useStore.getState().tourNext();
}

/**
 * Where the card goes: beside the anchor on the side with room, below an
 * anchor in the top bar; never over the anchor, the top bar or the rail. A
 * part of the interface gets the card at its inline end (toward the stage); a
 * point on the stage gets it well away, toward the rail's side, so the model
 * and the card dock stay free to work on.
 */
function placeCard(a: Box | null, card: { w: number; h: number }, rtl: boolean, stage: boolean): { left: number; top: number } {
  const vw = window.innerWidth, vh = window.innerHeight, m = 8, top0 = 68, rail = 88;
  const gap = stage ? 150 : 16;
  // the rail's side is kept clear for a point on the stage
  const lo = stage && !rtl ? rail : m, hi = stage && rtl ? vw - rail : vw - m;
  const clamp = (v: number, a0: number, a1: number) => Math.max(a0, Math.min(a1, v));
  if (!a) return { left: (vw - card.w) / 2, top: Math.max(top0, (vh - card.h) / 2) };
  const midY = clamp(a.y + a.h / 2 - card.h / 2, top0, vh - card.h - m);
  const midX = clamp(a.x + a.w / 2 - card.w / 2, lo, hi - card.w);
  const sides = {
    right: { left: a.x + a.w + gap, top: midY, ok: a.x + a.w + gap + card.w <= hi },
    left: { left: a.x - gap - card.w, top: midY, ok: a.x - gap - card.w >= lo },
    below: { left: midX, top: Math.max(top0, a.y + a.h + 16), ok: Math.max(top0, a.y + a.h + 16) + card.h <= vh - m },
    above: { left: midX, top: a.y - 16 - card.h, ok: a.y - 16 - card.h >= top0 },
  };
  const end: (keyof typeof sides)[] = rtl ? ['left', 'right'] : ['right', 'left'];
  const order: (keyof typeof sides)[] = a.y + a.h < top0 + 4 ? ['below', ...end] : stage ? [end[1], end[0], 'below', 'above'] : [...end, 'below', 'above'];
  const pick = order.find((k) => sides[k].ok) ?? 'below';
  return { left: sides[pick].left, top: sides[pick].top };
}

export function TourOverlay() {
  const tour = useStore((s) => s.tour);
  const doneAtEntry = useTourProgress(tour);
  if (!tour || !TOUR_STEPS[tour.step]) return null;
  return <TourCard tour={tour} step={TOUR_STEPS[tour.step]} doneAtEntry={doneAtEntry} />;
}

function TourCard({ tour, step, doneAtEntry }: { tour: TourState; step: TourStep; doneAtEntry: boolean }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  // the anchor as a key (a selector, the stage or the centre), so a new anchor object does not re-render
  const anchorKey = useStore((s) => {
    const a = anchorOf(step, s);
    return 'dom' in a ? a.dom : 'stage' in a ? 'stage' : 'centre';
  });
  const notQuite = useStore((s) => step.notQuite?.(s, tour.entry) ?? null);
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState({ w: 340, h: 180 });
  const card = useRef<HTMLDivElement>(null);
  const stage = anchorKey === 'stage';
  // the anchor's box, followed every frame (the camera orbits, cards open and close)
  useEffect(() => {
    let raf = 0, cur: Box | null = null;
    const tick = () => {
      const s = useStore.getState();
      const b = anchorBox(anchorOf(step, s), s.design);
      if (!same(b, cur)) setBox((cur = b));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step, anchorKey]);
  useLayoutEffect(() => {
    const r = card.current?.getBoundingClientRect();
    if (r && (Math.abs(r.width - size.w) > 1 || Math.abs(r.height - size.h) > 1)) setSize({ w: r.width, h: r.height });
  });
  // focus moves to the card on each step, but not away from a field being typed in
  useEffect(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    card.current?.focus({ preventScroll: true });
  }, [tour]);
  const st = useStore.getState;
  const n = tour.step;
  const centre = anchorKey === 'centre';
  const pos = placeCard(centre ? null : box, size, lang === 'he', stage);
  const pad = stage ? 0 : 6;
  const ring = box && !centre ? { left: box.x - pad, top: box.y - pad, width: box.w + 2 * pad, height: box.h + 2 * pad } : null;
  const explain = !!step.next || doneAtEntry;
  const last = n === TOUR_STEPS.length - 1;
  return (
    <>
      {(ring || centre) && <div className={`tour-dim ${centre ? 'full' : ''}`} aria-hidden data-testid="tour-dim" />}
      {ring && <div className={`tour-ring ${stage ? 'stage' : ''}`} style={ring} aria-hidden data-testid="tour-ring" />}
      {step.id === 'base' && box && <DragHint at={box} />}
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        aria-labelledby="tour-title"
        tabIndex={-1}
        dir="auto"
        style={{ left: pos.left, top: pos.top }}
        data-testid="tour-card"
        data-step={step.id}
        data-n={n}
      >
        <div aria-live="polite">
          {n > 0 && <p className="tour-count" data-testid="tour-count">{t('tour.stepOf', { n, total: COUNT })}</p>}
          <h3 id="tour-title">{t(step.title)}</h3>
          <p className="tour-body">{t(step.body)}</p>
          {notQuite && (
            <p className="tour-not-quite" data-testid="tour-not-quite">
              {t(notQuite)}
            </p>
          )}
        </div>
        <div className="tour-actions">
          {n === 0 ? (
            <>
              <button className="link" onClick={() => st().endTour()} data-testid="tour-not-now">
                {t('tour.notNow')}
              </button>
              <span className="spacer" />
              <button className="primary" onClick={() => st().tourNext()} data-testid="tour-go">
                {t('tour.start')}
              </button>
            </>
          ) : (
            <>
              <button className="link" onClick={() => st().endTour()} data-testid="tour-end">
                {t('tour.end')}
              </button>
              <span className="spacer" />
              <button onClick={() => st().tourBack()} data-testid="tour-back">
                {t('tour.back')}
              </button>
              {!last && !step.next && (
                <button onClick={() => skipStep(step, tour)} data-testid="tour-skip">
                  {t('tour.skip')}
                </button>
              )}
              {last ? (
                <button className="primary" onClick={() => st().endTour()} data-testid="tour-done">
                  {t('tour.done')}
                </button>
              ) : (
                explain && (
                  <button className="primary" onClick={() => st().tourNext()} data-testid="tour-next">
                    {t('tour.next')}
                  </button>
                )
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Step 2's animated hint: a hand dragging across the floor near the anchor, until the student starts drawing. */
function DragHint({ at }: { at: Box }) {
  const drawing = useStore((s) => !!s.panelGhost);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (drawing) setStarted(true);
  }, [drawing]);
  if (started || drawing) return null;
  return (
    <div className="tour-hand" style={{ left: at.x + at.w / 2, top: at.y + at.h / 2 }} aria-hidden data-testid="tour-hand">
      <svg viewBox="0 0 24 24" width="28" height="28">
        <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-.5V4.5a1.5 1.5 0 0 1 3 0V10m0-.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-2.3-4a1.5 1.5 0 0 1 2.6-1.5L9 13" fill="white" stroke="#1f2937" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
