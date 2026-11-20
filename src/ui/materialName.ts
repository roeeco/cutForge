// A material's display name: a built-in profile's own name, else its kind and thickness.
import { profileById } from '../model/boards';
import type { MaterialProfile } from '../model/types';
import { fmtNum, type MsgKey } from '../i18n';

export function materialName(t: (k: MsgKey, v?: Record<string, string | number>) => string, m: MaterialProfile): string {
  // a built-in or a board grade (milestone 116)
  const builtIn = profileById(m.id);
  if (builtIn) return t(builtIn.nameKey as MsgKey);
  return t(`mat.kindNamed.${m.kind}` as MsgKey, { mm: fmtNum(m.thickness, 2) });
}
