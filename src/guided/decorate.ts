// Decorate (milestone 108, GUIDED_MODE.md §3.4): a name, a sticker and a window, each placed in the middle of
// a side, ready to drag. Pure functions on a design; the store's guard keeps them where the laser can cut.
import type { Design, DetailOp } from '../model/types';
import type { MsgKey } from '../i18n';
import { addText, parentConnection } from '../model/ops';
import { holeRecipe, stickerRecipe } from '../easy/recipes';
import { fitShape, minTextSize } from '../easy/guard';
import { stickerById, stickerSize } from '../easy/stickers';
import { workshopOnly } from '../easy/mode';
import { isDivider } from '../model/dividers';
import { bandOf } from '../model/bands';

/** Why a board cannot be decorated in Guided, or null when it can. */
export function canDecorate(d: Design, panelId: string): MsgKey | null {
  const p = d.panels[panelId];
  if (!p) return 'g.deco.tapSide';
  if (isDivider(p)) return 'g.deco.divider';
  if (parentConnection(d, panelId) && p.sketch.kind !== 'wall') return 'g.deco.curved';
  // a round box's wall: a flat seam piece carrying the bent band
  if (Object.values(d.connections).some((c) => (c.a.panelId === panelId || c.b.panelId === panelId) && (c.wing || bandOf(d, c)))) return 'g.deco.curved';
  if (workshopOnly(d, panelId)) return 'g.deco.workshop';
  if (Math.min(p.w, p.h) < 15) return 'g.deco.tooSmall';
  return null;
}

/** A name's letter height on a side: readable, and at most a third of the side. */
export function nameSize(d: Design, panelId: string): number {
  const p = d.panels[panelId];
  const least = minTextSize(d, panelId, 'engrave');
  return Math.max(least, Math.min(p.h / 3, p.w / 8, 14));
}

export type Made = { id: string } | { why: MsgKey };

/** Engrave a name in the middle of a side (a name is engraved, never cut out). */
export function addName(d: Design, panelId: string, value: string): Made {
  const why = canDecorate(d, panelId);
  if (why) return { why };
  const p = d.panels[panelId];
  const size = nameSize(d, panelId);
  if (size > p.h * 0.8) return { why: 'g.deco.tooSmall' };
  const id = addText(d, panelId, p.w / 2, p.h / 2, value, 'engrave', undefined, size);
  if (!id) return { why: 'g.deco.tooSmall' };
  fitShape(d, id);
  return { id };
}

/** A sticker, a quarter of the side, engraved in the middle. */
export function addSticker(d: Design, panelId: string, stickerId: string): Made {
  const why = canDecorate(d, panelId);
  if (why) return { why };
  const p = d.panels[panelId];
  const id = stickerRecipe(d, panelId, stickerById(stickerId).polys, p.w / 2, p.h / 2, stickerSize(p.w, p.h), 'engrave');
  if (!id) return { why: 'g.deco.tooSmall' };
  if (!fitShape(d, id)) {
    p.details = p.details.filter((x) => x.id !== id);
    return { why: 'g.deco.tooSmall' };
  }
  return { id };
}

export type WindowShape = 'circle' | 'roundrect' | 'rect';

/** A window: about a third of the side, cut out or engraved, in the middle. */
export function addWindow(d: Design, panelId: string, shape: WindowShape, op: Extract<DetailOp, 'cut' | 'engrave'> = 'cut'): Made {
  const why = canDecorate(d, panelId);
  if (why) return { why };
  const p = d.panels[panelId];
  const s = Math.min(p.w, p.h) * 0.35;
  const w = shape === 'circle' ? s : Math.min(p.w * 0.45, s * 1.4);
  const id = holeRecipe(d, panelId, shape, p.w / 2, p.h / 2, w, s, op);
  if (!id) return { why: 'g.deco.tooSmall' };
  if (!fitShape(d, id)) {
    p.details = p.details.filter((x) => x.id !== id);
    return { why: 'g.deco.tooSmall' };
  }
  return { id };
}
