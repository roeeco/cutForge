// Switching between Quick build and Workshop (milestone 37): a viewer
// preference only; the design is never changed by a switch.
import type { Design } from '../model/types';
import { useStore } from '../store/store';
import { isConstruction } from '../model/place';
import { throughHits } from '../model/through';
import type { Mode } from './features';

export function setMode(m: Mode) {
  const st = useStore.getState();
  if (st.viewPrefs.modeLocked && st.viewPrefs.mode && st.viewPrefs.mode !== m) return;
  // a tool of the other mode stops (nothing it made is kept unconfirmed)
  st.setTool('select');
  st.setPrefs({ mode: m });
}

/** The class's choice (milestone 37): start in its mode, and keep it when it is locked. */
export function applyClassMode(mode: Mode | null, locked: boolean) {
  const st = useStore.getState();
  if (mode) st.setPrefs({ mode, modeLocked: locked });
  else if (st.viewPrefs.modeLocked) st.setPrefs({ modeLocked: false });
}

export type WorkshopWhy = 'angle' | 'foldover' | 'through' | 'material' | 'construction';

/**
 * Why a panel can only be changed in Workshop (Quick build shows it read-only),
 * or null: an angled hinge, a fold-over, a through-cut on or reaching it,
 * another material, a construction guide.
 */
export function workshopOnly(d: Design, panelId: string): WorkshopWhy | null {
  const p = d.panels[panelId];
  if (!p) return null;
  const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === panelId);
  if (c && Math.abs(c.angle - 90) > 1e-6) return 'angle';
  if (p.foldOvers?.length) return 'foldover';
  if (p.details.some((dt) => dt.through) || throughHits(d).has(panelId)) return 'through';
  if (p.material && p.material !== d.material.id) return 'material';
  if (isConstruction(d, panelId)) return 'construction';
  return null;
}

/**
 * A class link (`?class=CODE`, milestone 37): the code is remembered for
 * submitting, and the student starts in the class's mode.
 */
export async function joinClassFromLink(search = location.search) {
  const code = new URLSearchParams(search).get('class')?.trim().toUpperCase();
  if (!code) return;
  try {
    localStorage.setItem('cutforge.classCode', code);
  } catch {
    /* storage unavailable */
  }
  try {
    const { api } = await import('../net/api');
    const cls = await api.classInfo(code);
    applyClassMode(cls.mode ?? null, !!cls.modeLocked);
    useStore.getState().setPrefs({ missions: cls.missions ?? undefined });
  } catch {
    /* offline or no such class: the editor works the same */
  }
}
