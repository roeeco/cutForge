// What a joint kind is called for one connection: a tray's rounded corner in
// one piece reads "One piece", a plywood fold "Living hinge" (milestones 63,
// 64); every other kind its own name.
import type { Connection, ConnectionKind, Design } from '../model/types';
import { matOf } from '../model/materials';
import type { MsgKey } from '../i18n';

export function connKindKey(d: Design, c: Pick<Connection, 'a' | 'wing'>, kind: ConnectionKind): MsgKey {
  if (kind === 'fold' && c.wing) return 'conn.wingFold';
  if (kind === 'fold' && d.panels[c.a.panelId] && matOf(d, c.a.panelId).kind === 'plywood') return 'bend.hinge';
  return `conn.${kind}` as MsgKey;
}
