// Guided's plain things (milestone 106): their ids and names, shared by Guided's gallery and the teacher's
// list of things offered. What each starts as is in src/guided/things.ts.
import type { MsgKey } from '../i18n';

export const PLAIN_THINGS: { id: string; title: MsgKey }[] = [
  { id: 'box', title: 'g.thing.box' },
  { id: 'box-lid', title: 'g.thing.boxLid' },
  { id: 'round-box', title: 'g.thing.round' },
  { id: 'carton', title: 'g.thing.carton' },
];
export const PLAIN_IDS = PLAIN_THINGS.map((x) => x.id);

/** Is a thing offered by a class's list? A list naming no plain thing (one made before 106) offers every plain thing. */
export function offered(list: string[] | null | undefined, id: string): boolean {
  if (!list) return true;
  if (PLAIN_IDS.includes(id) && !list.some((x) => PLAIN_IDS.includes(x))) return true;
  return list.includes(id);
}
