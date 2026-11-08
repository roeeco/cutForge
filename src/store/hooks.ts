import { TOOL_KEYS } from '../ui/Toolbar';
import { useEffect } from 'react';
import { useStore } from './store';
import { loadLocal, saveLocal } from './persist';
import { migrateDesign } from '../model/serialize';
import { deletePanel } from '../model/ops';
import { deleteDetails, duplicateDetails, moveDetailsVisual } from '../model/edit';
import { detailSel, selectedDetailIds } from './store';

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
        // a drag commits by ending its transaction without a new design object: save then too
        const committed = !!prev.txnBase && !s.txnBase && s.design !== prev.txnBase;
        if ((s.design === prev.design && !committed) || s.txnBase) return;
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
      const ids = selectedDetailIds(sel);
      if (mod && e.key.toLowerCase() === 'd' && ids.length) {
        e.preventDefault();
        let copies: string[] = [];
        s.apply((d) => void (copies = duplicateDetails(d, ids)));
        s.select(detailSel(copies));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ids.length) s.apply((d) => deleteDetails(d, ids));
        else if (sel?.kind === 'panel' && !s.editOutline) s.apply((d) => deletePanel(d, sel.id));
        e.preventDefault();
      } else if (e.key === 'Escape') {
        if (s.txnBase) return; // views cancel their own gestures
        if (s.tool !== 'select') s.setTool('select');
        else if (s.selection) s.select(null);
        else if (s.view === 'solo') s.closeSolo();
      } else if (!mod && !e.altKey && e.key.length === 1 && TOOL_KEYS[e.key.toLowerCase()]) {
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if ((tool !== 'panel' && tool !== 'polygon') || s.view === '3d') s.setTool(tool);
      } else if (e.key.startsWith('Arrow') && ids.length) {
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
        s.apply((d) => moveDetailsVisual(d, ids, dx, dy, s.view === 'solo' ? s.soloPanel : null));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
