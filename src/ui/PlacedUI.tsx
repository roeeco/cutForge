// A placed panel's card (milestone 29): what it is on (*On panel 3, inner
// face*), Flat or Standing, Flip side for a standing one (milestone 42), and
// Construction for any panel's net.
import { useStore, useT } from '../store/store';
import { Segmented } from './NumField';
import { flipPlacedSide, setConstruction, setPlacedPose } from '../model/ops';
import { Icon } from './icons';
import { faceOut, isConstruction } from '../model/place';
import { panelLabel } from '../model/names';
import type { Design, MsgKeyLike } from './placedTypes';

/** Where a placed panel sits, for its card's kicker; null for other panels. */
export function placedWhere(d: Design, id: string, t: (k: MsgKeyLike, v?: Record<string, string | number>) => string): string | null {
  const pl = d.panels[id]?.place;
  if (!pl) return null;
  if (pl.host === null) return t('place.onFloor');
  const H = d.panels[pl.host];
  if (!H) return null;
  const out = faceOut(H.frame, pl.face);
  const face = Math.abs(out[1]) > 0.9 ? (out[1] > 0 ? 'place.face.top' : 'place.face.under') : pl.face === 1 ? 'place.face.inner' : 'place.face.outer';
  return t('place.on', { panel: panelLabel(d, pl.host, t as never), face: t(face as MsgKeyLike) });
}

export function PlacedSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const p = d.panels[panelId];
  if (!p) return null;
  const guide = isConstruction(d, panelId);
  return (
    <div className="subsection placed" data-testid="placed-section">
      {p.place && (
        <Segmented
          label={t('place.pose')}
          value={p.place.pose}
          options={[
            { value: 'flat', label: t('ghost.flat'), testId: 'place-pose-flat' },
            { value: 'standing', label: t('ghost.standing'), testId: 'place-pose-standing' },
          ]}
          onChange={(v) => apply((x) => setPlacedPose(x, panelId, v as 'flat' | 'standing'))}
        />
      )}
      {p.place?.pose === 'standing' && (
        // which side of its line the material is on
        <button className="btn-flip" onClick={() => apply((x) => flipPlacedSide(x, panelId))} title={t('ghost.flip')} data-testid="placed-flip">
          <Icon name="flip" size={16} /> {t('placed.flip')}
        </button>
      )}
      <label className="check" title={t('insp.constructionNote')}>
        <input type="checkbox" checked={guide} onChange={(e) => apply((x) => setConstruction(x, panelId, e.target.checked))} data-testid="panel-construction" />
        {t('insp.construction')}
      </label>
      {guide && <p className="note" data-testid="construction-note">{t('insp.constructionNote')}</p>}
    </div>
  );
}
