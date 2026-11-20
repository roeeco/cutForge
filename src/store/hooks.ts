import { sculptKey, sketchKey } from '../sculpt/ui/commands';
import { isSculpture } from '../sculpt/ops';
import { TOOL_KEYS } from '../ui/Toolbar';
import { QUICK_KEYS, startAction } from '../easy/QuickRail';
import { useEffect } from 'react';
import { useStore } from './store';
import { libraryChannel, loadLocal, saveLocal, TAB } from './persist';
import { migrateDesign } from '../model/serialize';
import { deletePanel } from '../model/ops';
import { deleteDetails, duplicateDetails, moveDetailsVisual } from '../model/edit';
import { designToSave, detailSel, selectedDetailIds, type Tool } from './store';
import { validate } from '../model/validate';
import { featureState, shown } from '../easy/features';
import { isDivider } from '../model/dividers';
import { isBad, rememberGood } from './goodDesign';

/** A design as saved, as text: two designs with the same text are the same save. */
export const savedText = (d: unknown) => JSON.stringify(d);

/** A short hash of a saved text (FNV-1a), sent with each save so other tabs can tell a save of what they have. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

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
      // what this tab last loaded or saved, as text (milestone 136): a change that leaves it the same is not saved,
      // so opening a design in a second tab does not tell the first that it changed
      let base = savedText(designToSave(useStore.getState()));
      // another tab saved the design open here (milestone 86): say so, never overwrite it silently. A save of the
      // very content this tab has as its base is not a change (milestone 136, REPORT.md A10).
      const ch = libraryChannel();
      if (ch)
        ch.onmessage = (ev: MessageEvent) => {
          const m = ev.data as { saved?: string; by?: string; hash?: number };
          if (!m?.saved || m.by === TAB || m.saved !== useStore.getState().design.id) return;
          if (m.hash !== undefined && m.hash === hashOf(base)) return;
          useStore.setState({ otherTab: true });
          // autosave waits for the student's choice (Reload or Keep mine): the label says so
          if (useStore.getState().saveState === 'saving') useStore.getState().set({ saveState: 'paused' });
        };
      unsub = useStore.subscribe((s, prev) => {
        // a drag commits by ending its transaction without a new design object: save then too
        const committed = !!prev.txnBase && !s.txnBase && s.design !== prev.txnBase;
        // a draft waiting for ✓ is never saved (milestone 92): its base is, and the design once ✓ or ✗ ends it
        const ended = !!prev.pending && !s.pending;
        if ((s.design === prev.design && !committed && !ended) || s.txnBase) return;
        if (timer) clearTimeout(timer);
        useStore.getState().set({ saveState: 'saving' });
        timer = setTimeout(async () => {
          timer = undefined;
          const d = designToSave(useStore.getState());
          // another tab changed this design: nothing is saved until the student chooses (milestone 136: not
          // "Saving…" for ever)
          if (useStore.getState().otherTab) {
            useStore.getState().set({ saveState: 'paused' });
            return;
          }
          const text = savedText(d);
          if (text === base) {
            useStore.getState().set({ saveState: 'saved' });
            return;
          }
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
            await saveLocal(d, undefined, hashOf(text));
            base = text;
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

/** The app's keys (exported for tests, milestone 105). */
export function handleKey(e: KeyboardEvent) {
  {
    {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      // the sketch view has its own history and keys (milestone 120, from claude/guided-mode)
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
      // a sculpture's shape stage has its own keys; once made, stage 2 and the cut plan use the box keys
      if (isSculpture(s.design) && s.view === '3d' && (s.sculpt.stage === 'shape' || !s.design.outcome)) return void sculptKey(e);
      const sel = s.selection;
      const ids = selectedDetailIds(sel);
      // Guided (milestone 105) has no clipboard: a paste would wait for ✓, which Guided never asks for
      const clip = shown(featureState('keys.clipboard'));
      // copy and paste shapes (milestone 33): the paste follows the pointer, a click puts it down, ✓ keeps it
      if (clip && mod && e.key.toLowerCase() === 'c' && ids.length) {
        e.preventDefault();
        s.copyShapes();
        return;
      }
      if (clip && mod && e.key.toLowerCase() === 'v' && s.clipboard?.length) {
        e.preventDefault();
        s.pasteShapes();
        return;
      }
      if (clip && mod && e.key.toLowerCase() === 'd' && ids.length) {
        e.preventDefault();
        let copies: string[] = [];
        s.apply((d) => void (copies = duplicateDetails(d, ids)));
        s.select(detailSel(copies));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ids.length) s.apply((d) => deleteDetails(d, ids));
        // Guided removes only a divider (its sides and bottom are the thing itself)
        else if (sel?.kind === 'panel' && !s.editOutline && (s.viewPrefs.mode !== 'guided' || isDivider(s.design.panels[sel.id]))) s.apply((d) => deletePanel(d, sel.id));
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
        // D again: Divider and Standing board take turns (milestone 44)
        else if (a === 'divider' && s.view === '3d' && s.tool === 'divider') startAction('standing');
        else if (s.view === '3d' || a === 'hole' || a === 'text') startAction(a);
      } else if (shown(featureState('keys.tools')) && !mod && !e.altKey && e.key.length === 1 && TOOL_KEYS[e.key.toLowerCase()]) {
        const k = TOOL_KEYS[e.key.toLowerCase()];
        // the Shapes tool (milestone 75): P is a rectangle that makes a board, P again flat ↔ standing;
        // R, U, C and G choose the footprint and keep the operator
        if (k === 'panel') {
          if (s.view !== '3d') return;
          if (s.tool === 'panel') s.setBoardPose(s.panelPose === 'standing' ? 'flat' : 'standing');
          else {
            s.setBoardPose('flat');
            s.chooseShape('rect', true);
          }
        } else if (k === 'rect' || k === 'rounded' || k === 'circle' || k === 'polygon' || k === 'line') s.chooseShape(k);
        else if (k === 'divider') s.view === '3d' && s.setTool('divider');
        else s.setTool(k as Tool);
      } else if (e.key.startsWith('Arrow') && ids.length) {
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0;
        s.apply((d) => moveDetailsVisual(d, ids, dx, dy, s.view === 'solo' ? s.soloPanel : null));
        e.preventDefault();
      }
    }
  }
}

export function useKeyboard() {
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
}
