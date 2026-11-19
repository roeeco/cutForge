// A word of the sentence that is picked from a list (milestone 97,
// SENTENCE_BUILDER_PLAN.md §4.2–4.3): a button with a dashed underline and
// ▾; its list follows the WAI-ARIA select-only combobox pattern (Enter or
// Space opens it, the arrows and type-ahead move, Enter picks, Esc closes).
// The list is worked out when it is opened: an option can take a build.
import { useEffect, useId, useRef, useState } from 'react';
import type { Value } from './resolve';
import { useT } from '../store/store';

export function Word(props: {
  /** What the word is about (*Lid*), for its accessible name. */
  name: string;
  value: Value;
  text: (v: Value) => string;
  /** The allowed options, worked out when the list opens. */
  options: () => Value[];
  /** A small picture per option (a data URL), or null. */
  picture?: (v: Value) => string | null;
  onPick: (v: Value) => void;
  testId: string;
  onFocus?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Value[] | null>(null);
  const [active, setActive] = useState(0);
  const [pics, setPics] = useState<Record<string, string | null>>({});
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const typed = useRef({ s: '', at: 0 });

  // the options (and their pictures) after the list has painted, so opening is immediate
  useEffect(() => {
    if (!open) return;
    setOpts(null);
    const h = setTimeout(() => {
      const o = props.options();
      setOpts(o);
      setActive(Math.max(0, o.indexOf(props.value)));
      if (props.picture) {
        let k = 0;
        const next = () => {
          if (k >= o.length) return;
          const v = o[k++];
          setPics((p) => ({ ...p, [String(v)]: props.picture!(v) }));
          setTimeout(next, 0);
        };
        setTimeout(next, 0);
      }
    }, 0);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open && opts) list.current?.focus();
  }, [open, opts]);

  const close = (focusBack = true) => {
    setOpen(false);
    if (focusBack) btn.current?.focus();
  };
  const pick = (v: Value) => {
    close();
    if (v !== props.value) props.onPick(v);
  };
  const onListKey = (e: React.KeyboardEvent) => {
    if (!opts) return;
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(opts.length - 1, a + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
    else if (e.key === 'Home') (e.preventDefault(), setActive(0));
    else if (e.key === 'End') (e.preventDefault(), setActive(opts.length - 1));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), pick(opts[active]));
    else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), close());
    else if (e.key === 'Tab') close(false);
    else if (e.key.length === 1) {
      // type-ahead: the next option starting with what was typed
      const now = Date.now();
      typed.current = { s: (now - typed.current.at < 700 ? typed.current.s : '') + e.key.toLowerCase(), at: now };
      const i = opts.findIndex((v) => props.text(v).toLowerCase().replace(/^(a|an|the) /, '').startsWith(typed.current.s));
      if (i >= 0) setActive(i);
    }
  };
  const cur = props.text(props.value);
  return (
    <span className="sen-word-wrap">
      <button
        ref={btn}
        type="button"
        className="sen-word"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={t('sen.change', { name: props.name, value: cur })}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) (e.preventDefault(), setOpen(true));
        }}
        onFocus={props.onFocus}
        data-testid={props.testId}
      >
        {cur}
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="sen-list"
          role="listbox"
          tabIndex={-1}
          aria-label={props.name}
          aria-activedescendant={opts ? `${id}-o${active}` : undefined}
          onKeyDown={onListKey}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node) && e.relatedTarget !== btn.current) setOpen(false);
          }}
          data-testid={`${props.testId}-list`}
        >
          {!opts && <li className="sen-loading">{t('sen.loading')}</li>}
          {opts?.map((v, i) => (
            <li
              key={String(v)}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={v === props.value}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(v)}
              data-testid={`${props.testId}-opt-${v}`}
            >
              {props.picture && <span className="pic">{pics[String(v)] ? <img src={pics[String(v)]!} alt="" /> : null}</span>}
              <span>{props.text(v)}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
