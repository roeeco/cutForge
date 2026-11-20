// The app's own small dialogs (milestone 143, REPORT.md §8): a question, a message, or a line of text to type,
// instead of the browser's `confirm`, `alert` and `prompt`, which look unlike the app, cannot be translated around
// their buttons, and are silently dismissed by some browsers. One at a time; each call returns a promise.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { translate, type Lang } from '../i18n';

type Ask =
  | { kind: 'confirm'; text: string; ok?: string; done: (v: boolean) => void }
  | { kind: 'alert'; text: string; done: (v: void) => void }
  | { kind: 'prompt'; text: string; value: string; done: (v: string | null) => void };

let current: Ask | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const show = (a: Ask) => {
  current = a;
  emit();
};
const close = () => {
  current = null;
  emit();
};

/** Ask yes or no; resolves true for *OK* (or `ok`'s word). */
export function askConfirm(text: string, ok?: string): Promise<boolean> {
  return new Promise((done) => show({ kind: 'confirm', text, ok, done }));
}

/** Tell the student something; resolves when it is closed. */
export function tellUser(text: string): Promise<void> {
  return new Promise((done) => show({ kind: 'alert', text, done }));
}

/** Ask for a line of text; resolves null when cancelled. */
export function askText(text: string, value = ''): Promise<string | null> {
  return new Promise((done) => show({ kind: 'prompt', text, value, done }));
}

/** The dialog itself: rendered once at the root of each app (editor, Guided, teacher view). */
export function AppDialog({ lang }: { lang: Lang }) {
  const a = useSyncExternalStore(
    (f) => (listeners.add(f), () => void listeners.delete(f)),
    () => current,
  );
  if (!a) return null;
  // a new body for each question: its typed text starts as the question's own (not set after the first paint, which
  // could overwrite what was typed at once)
  return <DialogBody key={keyOf(a)} a={a} lang={lang} />;
}

const seq = new WeakMap<Ask, number>();
let n = 0;
const keyOf = (a: Ask) => (seq.has(a) ? seq.get(a)! : (seq.set(a, ++n), n));

function DialogBody({ a, lang }: { a: Ask; lang: Lang }) {
  const [text, setText] = useState(a.kind === 'prompt' ? a.value : '');
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (a.kind === 'prompt') inputRef.current?.select();
    else okRef.current?.focus();
  }, []);
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const finish = (yes: boolean) => {
    close();
    if (a.kind === 'confirm') a.done(yes);
    else if (a.kind === 'alert') a.done();
    else a.done(yes ? text : null);
  };
  return (
    <div className="modal-back" role="presentation" onKeyDown={(e) => e.key === 'Escape' && finish(false)}>
      <div className="modal app-dialog" role={a.kind === 'alert' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={a.text} data-testid="app-dialog" data-kind={a.kind}>
        <p dir="auto">{a.text}</p>
        {a.kind === 'prompt' && (
          <input ref={inputRef} autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && finish(true)} dir="auto" data-testid="app-dialog-input" />
        )}
        <div className="modal-actions">
          {a.kind !== 'alert' && (
            <button onClick={() => finish(false)} data-testid="app-dialog-cancel">
              {t('dlg.cancel')}
            </button>
          )}
          <button ref={okRef} className="primary" onClick={() => finish(true)} data-testid="app-dialog-ok">
            {a.kind === 'confirm' && a.ok ? a.ok : t('dlg.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}
