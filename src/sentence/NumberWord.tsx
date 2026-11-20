// A number in the sentence (milestone 97, SENTENCE_BUILDER_PLAN.md §4.2):
// a field four or five characters wide. Focusing it opens a slider with − and
// +, its range and why it ends there (the static range first, the engine's
// when it is worked out). Enter or leaving commits; Esc puts the old value
// back; a number the engine refuses shows its range and stays as it was.
// The slider (fixed 20 November): it was a controlled input that only ever showed the committed value, so a drag
// snapped back on every move and its release read the old value back and committed nothing. Now the thumb follows a
// value of its own while it moves, and the release commits that. The range is worked out once per opening (it
// depends on the other words, not this one), so it no longer jumps after each change. Focusing selects the number,
// so typing replaces it.
import { useEffect, useRef, useState } from 'react';
import { evalNumber } from '../ui/NumField';
import { fmtNum } from '../i18n';
import { useT } from '../store/store';
import type { MsgKey } from '../i18n';

export type NumRange = { min: number; max: number; why?: MsgKey };

export function NumberWord(props: {
  name: string;
  value: number;
  int?: boolean;
  /** The range shown at once (the word's own bounds). */
  quick: NumRange;
  /** The range the engine works out, when the field is opened. */
  full: () => NumRange;
  /** Commit: null when taken, else the range and reason it was refused with. */
  onCommit: (v: number) => NumRange | null;
  testId: string;
  onFocus?: () => void;
}) {
  const t = useT();
  const [text, setText] = useState(fmtNum(props.value, props.int ? 0 : 1));
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<NumRange>(props.quick);
  const [refused, setRefused] = useState<NumRange | null>(null);
  // the slider's value while it is being dragged (null: it shows the committed value)
  const [live, setLive] = useState<number | null>(null);
  // the number as committed, not yet edited: a click selects all of it, so typing replaces it
  const fresh = useRef(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setText(fmtNum(props.value, props.int ? 0 : 1)), [props.value, props.int]);
  useEffect(() => {
    if (!open) return;
    setRange(props.quick);
    // the engine's range after the slider has painted (it can take builds)
    const h = setTimeout(() => setRange(props.full()), 30);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = (raw: string) => {
    const v = evalNumber(raw, props.value);
    if (v === null) {
      setText(fmtNum(props.value, props.int ? 0 : 1));
      return;
    }
    const n = props.int ? Math.round(v) : Math.round(v * 10) / 10;
    if (n === props.value) {
      setText(fmtNum(n, props.int ? 0 : 1));
      return;
    }
    const r = props.onCommit(n);
    if (r) {
      setRefused(r);
      setText(fmtNum(props.value, props.int ? 0 : 1));
    } else setRefused(null);
    // still in the field (Enter): the number selected again, so the next one typed replaces it
    fresh.current = true;
    const el = input.current;
    if (el && document.activeElement === el) el.select();
  };
  const step = 1;
  const fmt = (n: number) => fmtNum(n, props.int ? 0 : 1);
  // the slider let go: what it was moved to
  const release = () => {
    if (live === null) return;
    setLive(null);
    commit(String(live));
  };
  const why = refused ?? (open && range.why ? range : null);
  return (
    <span
      ref={wrap}
      className={`sen-num-wrap${open ? ' open' : ''}`}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
          // one commit: the slider's value if it was let go outside the field, else what was typed
          if (live !== null) release();
          else commit(text);
        }
      }}
    >
      <bdi dir="ltr">
        <input
          ref={input}
          className="sen-num"
          type="text"
          inputMode="decimal"
          size={5}
          value={text}
          aria-label={t('sen.numName', { name: props.name })}
          aria-describedby={why ? `${props.testId}-why` : undefined}
          onChange={(e) => {
            fresh.current = false;
            setText(e.target.value);
          }}
          onMouseUp={(e) => {
            // a click on a number not yet edited keeps it all selected (the click would put a caret in it)
            if (fresh.current) {
              e.preventDefault();
              e.currentTarget.select();
            }
          }}
          onFocus={(e) => {
            fresh.current = true;
            e.currentTarget.select();
            setOpen(true);
            setRefused(null);
            props.onFocus?.();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit(text);
            else if (e.key === 'Escape') {
              setText(fmtNum(props.value, props.int ? 0 : 1));
              setRefused(null);
              input.current?.blur();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              commit(String(props.value + (e.key === 'ArrowUp' ? step : -step)));
            }
          }}
          data-testid={props.testId}
        />
      </bdi>
      {open && (
        <span className="sen-slider" data-testid={`${props.testId}-slider`}>
          <button type="button" aria-label={t('sen.dec')} onMouseDown={(e) => e.preventDefault()} onClick={() => commit(String(props.value - step))} data-testid={`${props.testId}-dec`}>
            −
          </button>
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={1}
            value={live ?? Math.min(Math.max(props.value, range.min), range.max)}
            aria-label={props.name}
            onChange={(e) => {
              const n = Number(e.target.value);
              setLive(n);
              setText(fmt(n));
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onKeyUp={release}
          />
          <button type="button" aria-label={t('sen.inc')} onMouseDown={(e) => e.preventDefault()} onClick={() => commit(String(props.value + step))} data-testid={`${props.testId}-inc`}>
            +
          </button>
          <bdi dir="ltr" className="range">
            {fmtNum(range.min, 1)}–{fmtNum(range.max, 1)}
          </bdi>
        </span>
      )}
      {why && (
        <span className="sen-why" id={`${props.testId}-why`} role="note" data-testid={`${props.testId}-why`}>
          {/* counts have no unit; a range with no reason has no colon */}
          {refused
            ? refused.why
              ? t(props.int ? 'sen.refusedCount' : 'sen.refused', { min: fmtNum(refused.min, 1), max: fmtNum(refused.max, 1), why: t(refused.why) })
              : t(props.int ? 'sen.refusedCountBare' : 'sen.refusedBare', { min: fmtNum(refused.min, 1), max: fmtNum(refused.max, 1) })
            : t(props.int ? 'sen.limitCount' : 'sen.limit', { max: fmtNum(range.max, 1), why: range.why ? t(range.why) : '' })}
        </span>
      )}
    </span>
  );
}
