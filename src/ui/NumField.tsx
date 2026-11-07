import { useEffect, useId, useRef, useState } from 'react';
import { fmtNum } from '../i18n';

/**
 * Numeric input that commits once (Enter or blur) as a single undo step.
 * Escape restores the current value. Accepts simple arithmetic like "40+2".
 */
export function NumField(props: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  unit?: string;
  decimals?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  testId?: string;
}) {
  const { value, decimals = 1 } = props;
  const [text, setText] = useState(fmtNum(value, decimals));
  const [editing, setEditing] = useState(false);
  const committed = useRef<string | null>(null);
  const id = useId();
  useEffect(() => {
    if (!editing) setText(fmtNum(value, decimals));
  }, [value, decimals, editing]);
  // read the input itself: state can lag the typed value by a render
  const commit = (raw: string) => {
    setEditing(false);
    const v = evalNumber(raw);
    if (v === null) return setText(fmtNum(value, decimals));
    const clamped = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, v));
    if (Math.abs(clamped - value) > 1e-9) props.onCommit(clamped);
    setText(fmtNum(clamped, decimals));
  };
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <span className="num-wrap" dir="ltr">
        <input
          id={id}
          data-testid={props.testId}
          inputMode="decimal"
          value={text}
          disabled={props.disabled}
          onFocus={(e) => {
            setEditing(true);
            e.target.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => {
            // Enter already committed this exact text
            if (committed.current !== e.currentTarget.value) commit(e.currentTarget.value);
            committed.current = null;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const el = e.currentTarget;
              committed.current = el.value;
              commit(el.value);
              el.blur();
            }
            if (e.key === 'Escape') {
              setText(fmtNum(value, decimals));
              setEditing(false);
              setTimeout(() => (e.target as HTMLInputElement).blur());
            }
            e.stopPropagation();
          }}
        />
        {props.unit && <span className="unit">{props.unit}</span>}
      </span>
    </div>
  );
}

export function evalNumber(s: string): number | null {
  const clean = s.replace(/,/g, '.').replace(/\s/g, '');
  if (!/^[-+*/().\d]+$/.test(clean)) return null;
  try {
    // Only digits and arithmetic operators reach here.
    const v = Function(`"use strict";return (${clean})`)();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
