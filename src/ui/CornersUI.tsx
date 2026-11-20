// A tray's rounded corners on its card (milestone 64, PACKAGING_PLAN.md §4.4):
// how they join the next wall, all at once, and where a plywood strip that
// runs all round is keyed shut.
import { useStore, useT } from '../store/store';
import { setClosingCorner, setTrayCorners, setTrayCurveKind, setTrayEnds } from '../model/ops';
import { trayRing } from '../model/cartons';
import { closingCorner, curveKindOf, curveKinds, trayCorners, wingId, wingKinds } from '../model/wings';
import { matOf } from '../model/materials';
import { panelLabel } from '../model/names';
import { connKindKey } from './connLabel';
import type { ConnectionKind, Tray, TrayBottom, TrayTop } from '../model/types';
import { shown, useFeature } from '../easy/features';

export function TrayCorners({ tray }: { tray: Tray }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const f = shown(useFeature('tray.corners'));
  const corners = trayCorners(d, tray);
  if (!f || !corners.length) return null;
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

/** A tray as a carton (milestone 68): its base cut or open (a tube), how its top and an open bottom close. */
export function TrayEnds({ tray }: { tray: Tray }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const f = shown(useFeature('tray.ends'));
  const ring = trayRing(d, tray);
  const four = ring.length === 4;
  const card = matOf(d, tray.baseId).kind !== 'plywood';
  if (!f || !card) return null;
  return (
    <div className="subsection" data-testid="tray-ends">
      <div className="field">
        <label htmlFor={`tb-${tray.id}`}>{t('carton.base')}</label>
        <select id={`tb-${tray.id}`} value={tray.base ?? 'cut'} onChange={(e) => apply((x) => setTrayEnds(x, tray.id, { base: e.target.value as 'cut' | 'open' }))} data-testid="tray-base">
          <option value="cut">{t('carton.base.cut')}</option>
          <option value="open">{t('carton.base.open')}</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`tt-${tray.id}`}>{t('carton.top')}</label>
        <select id={`tt-${tray.id}`} value={tray.top ?? 'open'} onChange={(e) => apply((x) => setTrayEnds(x, tray.id, { top: e.target.value as 'open' | TrayTop }))} data-testid="tray-top">
          <option value="open">{t('carton.open')}</option>
          <option value="tuck">{t('carton.tuck')}</option>
          {four && <option value="seal">{t('carton.seal')}</option>}
          {four && <option value="rsc">{t('carton.rsc')}</option>}
        </select>
      </div>
      {tray.base === 'open' && (
        <div className="field">
          <label htmlFor={`tbo-${tray.id}`}>{t('carton.bottom')}</label>
          <select id={`tbo-${tray.id}`} value={tray.bottom ?? 'open'} onChange={(e) => apply((x) => setTrayEnds(x, tray.id, { bottom: e.target.value as 'open' | TrayBottom }))} data-testid="tray-bottom" disabled={!four}>
            <option value="open">{t('carton.open')}</option>
            <option value="snap">{t('carton.snap')}</option>
            <option value="tuck">{t('carton.tuck')}</option>
            <option value="tuckBack">{t('carton.tuckBack')}</option>
            <option value="seal">{t('carton.seal')}</option>
            <option value="rsc">{t('carton.rsc')}</option>
          </select>
        </div>
      )}
      {tray.base === 'open' && <p className="note">{t('carton.openHelp')}</p>}
      {tray.bottom === 'snap' && <p className="note" data-testid="tray-snap-note">{t('carton.snapHelp')}</p>}
    </div>
  );
}
