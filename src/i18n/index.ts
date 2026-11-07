import { en, type MsgKey } from './en';
import { he } from './he';

export type Lang = 'en' | 'he';
export type { MsgKey };
export const catalogs: Record<Lang, Record<MsgKey, string>> = { en, he };

export function translate(lang: Lang, key: MsgKey, vars?: Record<string, string | number>): string {
  let s: string = catalogs[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Numbers are always shown with Western digits and a dot, in both languages. */
export function fmtNum(n: number, decimals = 1): string {
  const r = Number(n.toFixed(decimals));
  return String(Object.is(r, -0) ? 0 : r);
}
