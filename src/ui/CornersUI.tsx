// A tray's rounded corners on its card (milestone 64, PACKAGING_PLAN.md §4.4):
// how they join the next wall, all at once, and where a plywood strip that
// runs all round is keyed shut.
import { useStore, useT } from '../store/store';
import { setClosingCorner, setTrayCorners, setTrayCurveKind } from '../model/ops';
import { closingCorner, curveKindOf, curveKinds, trayCorners, wingId, wingKinds } from '../model/wings';
import { matOf } from '../model/materials';
import { panelLabel } from '../model/names';
import { connKindKey } from './connLabel';
import type { ConnectionKind, Tray } from '../model/types';

export function TrayCorners({ tray }: { tray: Tray }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const corners = trayCorners(d, tray);
  if (!corners.length) return null;
  const wings = corners.map((k) => d.connections[wingId(k.a, k.b)]).filter(Boolean);
  const kinds = wingKinds(matOf(d, tray.baseId));
  const prefs = new Set(wings.map((c) => c.pref ?? c.kind));
  const value = prefs.size === 1 ? [...prefs][0] : '';
  const keyed = wings.filter((c) => c.kind === 'key').length;
  const close = matOf(d, tray.baseId).kind === 'plywood' && wings.every((c) => (c.pref ?? c.kind) === 'fold') ? closingCorner(d, tray, corners) : undefined;
  return (
    <div className="subsection" data-testid="tray-corners">
      <div className="field">
        <label htmlFor={`tc-${tray.id}`}>{t('corners.join', { n: corners.length })}</label>
        <select id={`tc-${tray.id}`} value={value} onChange={(e) => apply((x) => setTrayCorners(x, tray.id, e.target.value as ConnectionKind))} data-testid="tray-corners-kind">
          {!value && <option value="">{t('corners.mixed')}</option>}
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(connKindKey(d, { a: { panelId: tray.baseId, edge: '' }, wing: true }, k))}
            </option>
          ))}
        </select>
      </div>
      {curveKinds(matOf(d, tray.baseId)).length > 1 && (
        <div className="field">
          <label htmlFor={`tch-${tray.id}`}>{t('corners.holds')}</label>
          <select id={`tch-${tray.id}`} value={curveKindOf(d, tray)} onChange={(e) => apply((x) => setTrayCurveKind(x, tray.id, e.target.value as 'teeth' | 'tabslot' | 'none'))} data-testid="tray-corners-holds">
            {curveKinds(matOf(d, tray.baseId)).map((k) => (
              <option key={k} value={k}>
                {t(`corners.holds.${k}`)}
              </option>
            ))}
          </select>
        </div>
      )}
      {close && (
        <div className="field">
          <label htmlFor={`tcl-${tray.id}`}>{t('corners.closeAt')}</label>
          <select id={`tcl-${tray.id}`} value={close.a} onChange={(e) => apply((x) => setClosingCorner(x, tray.id, e.target.value))} data-testid="tray-close-at">
            {corners.map((k) => (
              <option key={k.a} value={k.a}>
                {t('corners.between', { a: panelLabel(d, k.a, t), b: panelLabel(d, k.b, t) })}
              </option>
            ))}
          </select>
        </div>
      )}
      {keyed > (close ? 1 : 0) && <p className="note" data-testid="tray-strip-keys">{t('corners.sheetKeys', { n: keyed - (close ? 1 : 0) })}</p>}
    </div>
  );
}
