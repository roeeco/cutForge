import { useEffect } from 'react';
import { useStore } from './store';
import { loadLocal, saveLocal } from './persist';
import { migrateDesign } from '../model/serialize';
import { deleteDetail, deletePanel, findDetail, updateDetail } from '../model/ops';

/** Load the autosaved design once, then save every committed change. */
export function useAutosave(onLoaded: () => void) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsub = () => {};
    (async () => {
      try {
        const raw = await loadLocal();
        if (raw && !cancelled) {
          const d = migrateDesign(raw);
          useStore.getState().replaceDesign(d, false);
        }
      } catch {
        /* no saved design or storage blocked: start fresh */
      }
      if (cancelled) return;
      onLoaded();
      unsub = useStore.subscribe((s, prev) => {
        if (s.design === prev.design || s.txnBase) return;
        if (timer) clearTimeout(timer);
        useStore.getState().set({ saveState: 'saving' });
        timer = setTimeout(async () => {
          try {
            await saveLocal(useStore.getState().design);
            useStore.getState().set({ saveState: 'saved' });
          } catch {
            useStore.getState().set({ saveState: 'failed' });
          }
        }, 400);
      });
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
}

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !isTyping(e) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return e.shiftKey ? s.redo() : s.undo();
      }
      if (mod && !isTyping(e) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        return s.redo();
      }
      if (isTyping(e)) return;
      const sel = s.selection;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel?.kind === 'detail') s.apply((d) => deleteDetail(d, sel.id));
        else if (sel?.kind === 'panel') s.apply((d) => deletePanel(d, sel.id));
        e.preventDefault();
      } else if (e.key === 'Escape') {
        if (s.txnBase) return; // views cancel their own gestures
        if (s.tool !== 'select') s.setTool('select');
        else s.select(null);
      } else if (e.key.startsWith('Arrow') && sel?.kind === 'detail') {
        const f = findDetail(s.design, sel.id);
        if (!f) return;
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
        s.apply((d) => updateDetail(d, sel.id, { cx: f.detail.cx + dx, cy: f.detail.cy + dy }));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
