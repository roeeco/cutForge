// Show how it goes together (milestone 40): the nets fold up, then each
// separate piece comes in from above to its place, one at a time; milestone 152:
// then it closes (folded lids and a carton's open top flaps fold shut). View only.
import * as THREE from 'three';
import type { Design } from '../model/types';
import { netGroups } from '../model/pieces';
import { useStore } from '../store/store';

const FOLD = 0.35;
/** Where the closing starts (milestone 152): the last part of the animation. */
const CLOSE = 0.82;

/** How far its lids and top flaps have closed at a point of the animation (0 open as shown, 1 shut). */
export const assembleClose = (a: number) => Math.max(0, Math.min(1, (a - CLOSE) / (1 - CLOSE)));

/** The fold slider's value at a point of the animation. */
export const assembleFold = (a: number) => Math.min(1, a / FOLD);

/** Each panel's lift at a point of the animation: pieces (nets) come in one after another. */
export function assembleLift(d: Design, a: number): Map<string, THREE.Matrix4> {
  const groups = netGroups(d);
  const n = groups.length;
  const out = new Map<string, THREE.Matrix4>();
  const p = Math.max(0, Math.min(1, (a - FOLD) / (CLOSE - FOLD))) * n;
  groups.forEach((g, k) => {
    const local = Math.max(0, Math.min(1, p - k));
    const ease = 1 - (1 - local) ** 3;
    const lift = (1 - ease) * 140;
    for (const np of g) out.set(np.panelId, new THREE.Matrix4().makeTranslation(0, lift, 0));
  });
  return out;
}

let raf = 0;
/** Play the animation (about a second for the folds and half a second a piece). */
export function playAssembly() {
  cancelAnimationFrame(raf);
  const d = useStore.getState().design;
  const total = 1600 + 500 * netGroups(d).length;
  const t0 = performance.now();
  const step = () => {
    const a = Math.min(1, (performance.now() - t0) / total);
    useStore.getState().set({ assemble: a });
    if (a < 1) raf = requestAnimationFrame(step);
    else setTimeout(() => useStore.getState().set({ assemble: null }), 400);
  };
  raf = requestAnimationFrame(step);
}
