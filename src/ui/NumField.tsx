// Number controls. All commit once (Enter, blur, end of a scrub or a step) as
// a single undo step; Escape restores. Typed values accept simple arithmetic
// like "40+2".
//  - NumField: sizes and positions. Drag the label sideways to scrub
//    (Shift ×10, Alt ×0.1), or type.
//  - Stepper: counts. − / + buttons, a short slider, or type.
//  - Segmented: a small choice of options.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { fmtNum } from '../i18n';

type NumProps = {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  unit?: string;
  decimals?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  testId?: string;
};

const clamp = (v: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

/** Shared text-input behaviour: local text while editing, commit on Enter/blur. */
function useNumInput(props: NumProps) {
  const { value, decimals = 1 } = props;
  const [text, setText] = useState(fmtNum(value, decimals));
  const [editing, setEditing] = useState(false);
  const committed = useRef<string | null>(null);
  useEffect(() => {
    if (!editing) setText(fmtNum(value, decimals));
  }, [value, decimals, editing]);
  const commit = (raw: string) => {
    setEditing(false);
    const v = evalNumber(raw, value);
    if (v === null) return setText(fmtNum(value, decimals));
    const c = clamp(v, props.min, props.max);
    if (Math.abs(c - value) > 1e-9) props.onCommit(c);
    setText(fmtNum(c, decimals));
  };
  const inputProps = {
    'data-testid': props.testId,
    inputMode: 'decimal' as const,
    value: text,
    disabled: props.disabled,
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      setEditing(true);
      e.target.select();
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value),
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      // Enter already committed this exact text
      if (committed.current !== e.currentTarget.value) commit(e.currentTarget.value);
      committed.current = null;
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const el = e.currentTarget;
        committed.current = el.value;
        commit(el.value);
        el.blur();
      }
      if (e.key === 'Escape') {
        setText(fmtNum(value, decimals));
        setEditing(false);
        const el = e.currentTarget;
        setTimeout(() => el.blur());
      }
      e.stopPropagation();
    },
  };
  return { text, setText, inputProps, commit };
}

export function NumField(props: NumProps) {
  const id = useId();
  const { setText, inputProps } = useNumInput(props);
  const decimals = props.decimals ?? 1;
  const scrub = useRef<{ x: number; v: number; moved: boolean; last: number } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLLabelElement>) => {
    if (props.disabled || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrub.current = { x: e.clientX, v: props.value, moved: false, last: props.value };
  };
  const onMove = (e: React.PointerEvent<HTMLLabelElement>) => {
    const s = scrub.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 2) s.moved = true;
    if (!s.moved) return;
    const per = decimals === 0 ? 1 / 8 : 1 / 4; // value units per pixel
    const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
    const q = decimals === 0 ? 1 : e.altKey ? 0.1 : 0.5;
    const v = clamp(Math.round((s.v + dir * dx * per * k) / q) * q, props.min, props.max);
    s.last = v;
    setText(fmtNum(v, decimals));
  };
  const onUp = (e: React.PointerEvent<HTMLLabelElement>) => {
    const s = scrub.current;
    scrub.current = null;
    if (!s) return;
    if (!s.moved) {
      (document.getElementById(id) as HTMLInputElement | null)?.focus();
      return;
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (Math.abs(s.last - props.value) > 1e-9) props.onCommit(s.last);
  };
  return (
    <div className="field scrub">
      <label htmlFor={id} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (scrub.current = null)}>
        {props.label}
      </label>
      <span className="num-wrap" dir="ltr">
        <input id={id} {...inputProps} />
        {props.unit && <span className="unit">{props.unit}</span>}
      </span>
    </div>
  );
}

export function Stepper(props: NumProps & { step?: number; slider?: boolean }) {
  const id = useId();
  const { inputProps } = useNumInput({ ...props, decimals: 0 });
  const step = props.step ?? 1;
  const set = (v: number) => {
    const c = clamp(v, props.min, props.max);
    if (c !== props.value) props.onCommit(c);
  };
  const showSlider = props.slider !== false && props.min !== undefined && props.max !== undefined && props.max - props.min <= 60;
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <div className="stepper">
        <span className="stepper-row" dir="ltr">
          <button type="button" tabIndex={-1} aria-hidden disabled={props.disabled || props.value - step < (props.min ?? -Infinity)} onClick={() => set(props.value - step)} data-testid={props.testId ? `${props.testId}-dec` : undefined}>
            −
          </button>
          <input id={id} {...inputProps} />
          <button type="button" tabIndex={-1} aria-hidden disabled={props.disabled || props.value + step > (props.max ?? Infinity)} onClick={() => set(props.value + step)} data-testid={props.testId ? `${props.testId}-inc` : undefined}>
            +
          </button>
        </span>
        {showSlider && (
          <input
            type="range"
            tabIndex={-1}
            aria-hidden
            min={props.min}
            max={props.max}
            step={step}
            value={props.value}
            disabled={props.disabled}
            dir="ltr"
            onChange={(e) => set(Number(e.target.value))}
          />
        )}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>(props: {
  label?: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string; testId?: string }[];
  onChange: (v: T) => void;
  testId?: string;
}) {
  const group = (
    <span className="segmented" role="radiogroup" aria-label={props.label} data-testid={props.testId}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          className={o.value === props.value ? 'on' : ''}
          title={o.title}
          onClick={() => props.onChange(o.value)}
          data-testid={o.testId}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
  if (!props.label) return group;
  return (
    <div className="field">
      <span className="label">{props.label}</span>
      {group}
    </div>
  );
}

export function evalNumber(s: string, base?: number): number | null {
  let clean = s.replace(/,/g, '.').replace(/\s/g, '');
  // a percent of the current value: "150%" is 1.5 × base
  if (base !== undefined && Number.isFinite(base)) clean = clean.replace(/(\d+(?:\.\d*)?|\.\d+)%/g, (_m, n) => `(${n}*${base.toFixed(9)}/100)`);
  if (!/^[-+*/().\d]+$/.test(clean)) return null;
  try {
    // Only digits and arithmetic operators reach here.
    const v = Function(`"use strict";return (${clean})`)();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
