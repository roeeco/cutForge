import { TOOL_KEYS } from '../ui/Toolbar';
import { QUICK_KEYS, startAction } from '../easy/QuickRail';
import { useEffect } from 'react';
import { useStore } from './store';
import { loadLocal, saveLocal } from './persist';
import { migrateDesign } from '../model/serialize';
import { deletePanel } from '../model/ops';
import { deleteDetails, duplicateDetails, moveDetailsVisual } from '../model/edit';
import { detailSel, selectedDetailIds } from './store';
import { validate } from '../model/validate';
import { isBad, rememberGood } from './goodDesign';
import { sculptKey, sketchKey } from '../sculpt/ui/commands';
import { isSculpture } from '../sculpt/ops';

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
          rememberGood(d);
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
          timer = undefined;
          const d = useStore.getState().design;
          // only a design that validates and that the editor could draw is saved (BUGFIX_PLAN B4)
          try {
            if (isBad(d)) throw new Error('not drawable');
            validate(d);
          } catch {
            useStore.getState().set({ saveState: 'failed' });
            return;
          }
          rememberGood(d);
          try {
            await saveLocal(d);
            useStore.getState().set({ saveState: 'saved' });
          } catch {
            useStore.getState().set({ saveState: 'failed' });
          }
        }, 400);
      });
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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
      // the sketch view has its own history and keys (milestone 57)
      const sketching = s.view === 'sketch' && !!s.sketch;
      if (mod && !isTyping(e) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (sketching) return e.shiftKey ? s.sketchRedo() : s.sketchUndo();
        return e.shiftKey ? s.redo() : s.undo();
      }
      if (mod && !isTyping(e) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        return sketching ? s.sketchRedo() : s.redo();
      }
      if (isTyping(e)) return;
      if (sketching) return void sketchKey(e);
      // waffle designs have their own keys (milestone 49)
      if (isSculpture(s.design)) return void sculptKey(e);
      const sel = s.selection;
      const ids = selectedDetailIds(sel);
      // copy and paste shapes (milestone 33): the paste follows the pointer, a click puts it down, ✓ keeps it
      if (mod && e.key.toLowerCase() === 'c' && ids.length) {
        e.preventDefault();
        s.copyShapes();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v' && s.clipboard?.length) {
        e.preventDefault();
        s.pasteShapes();
        return;
      }
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
        // a board being drawn: the stage drops it (the tool stays)
        if (s.panelGhost?.drawing) return;
        if (s.tool !== 'select') s.setTool('select');
        else if (s.selection) s.select(null);
        else if (s.view === 'solo') s.closeSolo();
      } else if (s.viewPrefs.mode === 'quick' && !mod && !e.altKey && e.key.length === 1 && QUICK_KEYS[e.key.toLowerCase()]) {
        // Quick build's actions (milestone 37)
        const a = QUICK_KEYS[e.key.toLowerCase()];
        if (a === 'select') s.setTool('select');
        else if (s.view === '3d' || a === 'hole' || a === 'text') startAction(a);
      } else if (s.viewPrefs.mode !== 'quick' && !mod && !e.altKey && e.key.length === 1 && TOOL_KEYS[e.key.toLowerCase()]) {
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        // P chooses Board; P again switches between Board and Standing board
        if (tool === 'panel' && s.tool === 'panel') s.setBoardPose(s.panelPose === 'standing' ? 'flat' : 'standing');
        else if ((tool !== 'panel' && tool !== 'polygon') || s.view === '3d') {
          if (tool === 'panel') s.setBoardPose('flat');
          s.setTool(tool);
        }
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
