// The derived waffle of the design being edited (for the stage and the card).
import { useStore } from '../../store/store';
import type { Design } from '../../model/types';
import { kernelNow } from '../../sculpt/kernel';
import { deriveWaffle, type WaffleModel } from '../derive';
import { waffleResult } from '../pieces';
import type { CutPart } from '../finish';

export function modelOf(d: Design): WaffleModel | null {
  const k = kernelNow();
  return k && d.kind === 'waffle' ? deriveWaffle(k, d) : null;
}
/** The model of the design a gesture started from (previews are re-applied to it). */
export function baseModel(): WaffleModel | null {
  const s = useStore.getState();
  return modelOf(s.txnBase ?? s.design);
}
export function useWaffle(): { model: WaffleModel | null; parts: CutPart[] } {
  const d = useStore((s) => s.design);
  useStore((s) => s.sculpt.ready);
  const model = modelOf(d);
  return { model, parts: model ? waffleResult(d).parts : [] };
}
