// Guided's plain things (milestone 106): their ids and names, shared by Guided's gallery and the teacher's
// list of things offered. What each starts as is in src/guided/things.ts; which they are is the catalogue's
// (milestone 146, templates/catalogue.ts).
import type { MsgKey } from '../i18n';
import { guidedEntries } from '../templates/catalogue';

export const PLAIN_THINGS: { id: string; title: MsgKey }[] = guidedEntries()
  .filter((x) => !x.v.solid)
  .map((x) => ({ id: x.g.id, title: x.g.title }));
export const PLAIN_IDS = PLAIN_THINGS.map((x) => x.id);

/** Is a thing offered by a class's list? A list naming no plain thing (one made before 106) offers every plain thing. */
export function offered(list: string[] | null | undefined, id: string): boolean {
  if (!list) return true;
  if (PLAIN_IDS.includes(id) && !list.some((x) => PLAIN_IDS.includes(x))) return true;
  return list.includes(id);
}
