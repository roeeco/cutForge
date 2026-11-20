// What a sculpture becomes (SKETCH_OVERHAUL.md §9.1; SHAPES_TO_DIELINES_PLAN.md
// decision 1): folded card (*Fold it*), boards (*Build from boards*), and later the
// waffle's slices. Each outcome registers its stage-2 pieces of the editor here when
// its code loads, so the shape workbench (src/sculpt) never imports an outcome.
import type { ComponentType } from 'react';
import type { Design, OutcomeKind } from '../model/types';

export type OutcomeId = OutcomeKind;
/** Every outcome a file may name, in the order Make offers them. */
export const OUTCOMES: OutcomeId[] = ['fold', 'boards', 'waffle'];
/** The two Make offers before any outcome has registered its code (milestone 120: shown greyed, *coming next*). */
export const PLANNED_OUTCOMES: OutcomeId[] = ['fold', 'boards'];
export type OutcomeUi = {
  id: OutcomeId;
  /** The i18n key of its name (the second stage's label when it is the only one). */
  nameKey: string;
  /** Drawn on the 3D stage in stage 2. */
  Layer: ComponentType;
  /** The card in stage 2. */
  Card: ComponentType;
  /** A bar over the stage in stage 2 (an outcome's assembly steps). */
  Bar?: ComponentType;
  /** The one click (SHAPES_TO_DIELINES_PLAN.md decision 0): make the shapes into this outcome and show it. */
  make?: () => void;
  /** Load what it needs (its kernel work and pieces). */
  load: () => Promise<unknown>;
  /** Delete pressed in stage 2 with its own selection. */
  onDelete?: () => void;
};

const registry = new Map<string, OutcomeUi>();
const listeners = new Set<() => void>();

export function registerOutcomeUi(o: OutcomeUi) {
  registry.set(o.id, o);
  for (const f of listeners) f();
}
export const outcomeUi = (id: string): OutcomeUi | undefined => registry.get(id);
/** The outcomes registered so far, in registration order. */
export const outcomeIds = (): string[] => [...registry.keys()];
/** Called whenever an outcome registers. */
export function onOutcomes(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
/** A design's outcome, or null when its shapes are not made into anything yet (decision 11). */
export const outcomeOf = (d: Pick<Design, 'outcome'>): OutcomeId | null => d.outcome ?? null;
