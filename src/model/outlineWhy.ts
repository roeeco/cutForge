// Which boards' outlines can be edited (milestone 101, DIELINE_DNA_PLAN.md
// D0): one rule for the card's *Edit outline* button and the stage's outline
// mode. A root board drawn as points, and a grown board's wall outline; not a
// round board (its shape is a circle, an oval or a stadium: its card sets
// it), a divider (its ends are found by the box), a lid the generator made
// (made again when its box changes), or a carton's top (folded from its wall).
import type { Design } from './types';
import type { MsgKey } from '../i18n';
import { parentConnection } from './ops';

export function outlineWhy(d: Design, id: string): MsgKey | null {
  const p = d.panels[id];
  if (!p) return 'outline.why.none';
  if (p.divider) return 'outline.why.divider';
  if (p.lidOf || Object.values(d.trays ?? {}).some((t) => t.lidOf && t.baseId === id)) return 'outline.why.lid';
  const parent = parentConnection(d, id);
  if (!parent) {
    if (p.sketch.kind !== 'poly') return 'outline.why.none';
    if (p.sketch.round) return 'outline.why.round';
    return null;
  }
  if (p.sketch.kind !== 'wall') return 'outline.why.curved';
  return null;
}
