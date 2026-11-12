// What a sculpture becomes (SKETCH_OVERHAUL.md §9.1): the waffle today, folded
// card later. Each outcome registers its stage-2 pieces of the editor here when
// its code loads, so the shape workbench (src/sculpt) never imports an outcome.
import type { ComponentType } from 'react';
import type { Design } from '../model/types';

export type OutcomeId = 'waffle' | 'fold';
export type OutcomeUi = {
  id: OutcomeId;
  /** The i18n key of its name (the second stage's label when it is the only one). */
  nameKey: string;
  /** Drawn on the 3D stage in stage 2. */
  Layer: ComponentType;
  /** The card in stage 2. */
  Card: ComponentType;
  /** A bar over the stage in stage 2 (the waffle's assembly steps). */
  Bar?: ComponentType;
  /** Load what it needs (its kernel work and pieces). */
  load: () => Promise<unknown>;
  /** Delete pressed in stage 2 with its own selection (a waffle slice). */
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
/** A design's outcome (absent: the waffle). */
export const outcomeOf = (d: Pick<Design, 'outcome'>): OutcomeId => d.outcome ?? 'waffle';
