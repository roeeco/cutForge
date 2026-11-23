// A design made from a template (a preset, the welcome sentence's box) keeps its settings as long as it is the
// template's: its sizes, lid, spaces and the rest can be changed in the settings card, and the design is made again
// from them. Changed by hand (a board resized, a wall grown, a shape cut, a joint changed…), it is no longer what the
// template makes, and making it again from the settings broke it (the hand edits fought the new boards). So in
// Workshop, the first hand edit asks: keep it, and the template's settings go (the design is the student's own from
// then on), or take it back.
import type { Connection, Design, Panel } from '../model/types';

/** A board as the template made it: without where it stands (the box moved or turned), its name, or where a divider sits along its row. */
function boardShape(p: Panel): unknown {
  const { frame: _f, name: _n, ...rest } = p;
  if (!p.divider) return rest;
  // a divider moved along its row: the template keeps it there (milestone 92)
  const { at: _at, ...div } = p.divider;
  const place = p.place ? { ...p.place, x: 0, y: 0 } : p.place;
  return { ...rest, divider: div, place };
}

/** A joint without what is worked out from the boards (its holes and tabs, whether it is broken). */
function jointShape(c: Connection): unknown {
  const { geom: _g, broken: _b, ...rest } = c;
  return rest;
}

const same = <T,>(a: Record<string, T>, b: Record<string, T>, shape: (x: T) => unknown): boolean => {
  if (a === b) return true;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!(k in b)) return false;
    if (a[k] === b[k]) continue;
    if (JSON.stringify(shape(a[k])) !== JSON.stringify(shape(b[k]))) return false;
  }
  return true;
};

/** What a design is besides the boards and joints, minus what the settings card, the sheets and its name set. */
const IGNORED = new Set(['id', 'name', 'template', 'material', 'materials', 'joints', 'placements', 'pieces', 'sheetMargin', 'sheetSpacing', 'allowRotate', 'sizes', 'sizeAs', 'mission', 'contents', 'panels', 'connections']);

/**
 * Did this edit change the design by hand? Not when its template's settings made it (the template record changed:
 * a setting, a new material), nor a design-wide setting (the material's fit, the joints for every corner), nor its
 * name, its sheets and copies, moving or turning the box, or moving a divider along its row: the template keeps all
 * of those when it makes the design again. Anything else, yes.
 */
export function handEdited(before: Design, after: Design): boolean {
  if (!before.template || !after.template || before === after) return false;
  // made by its settings, or a design-wide setting
  if (after.template !== before.template || after.material !== before.material || after.materials !== before.materials || after.joints !== before.joints) return false;
  if (!same(before.panels, after.panels, boardShape)) return true;
  if (!same(before.connections, after.connections, jointShape)) return true;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (IGNORED.has(k)) continue;
    const a = (before as Record<string, unknown>)[k], b = (after as Record<string, unknown>)[k];
    if (a !== b && JSON.stringify(a) !== JSON.stringify(b)) return true;
  }
  return false;
}

/** The design as its own, no longer its template's: the settings go; everything made stays as it is. */
export function detachTemplate(d: Design): void {
  delete d.template;
}
