// A placed panel's card (milestone 29): what it is on (*On panel 3, inner
// face*), Flat or Standing, Flip side for a standing one (milestone 42), and
// Construction for any panel's net.
import { useStore, useT } from '../store/store';
import { NumField, Segmented } from './NumField';
import { flipPlacedSide, normDeg, rotatePlaced, setConstruction, setDividerOffset, setPlacedPose, solve } from '../model/ops';
import { dividerEnds, dividerRow, rowGaps, stepDividerEnd } from '../model/dividers';
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
      {p.place && !p.divider && (
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

/**
 * A divider's card section (milestone 44): the clear size behind it (typed,
 * it moves the divider along its normal), its angle, and what each end
 * meets, with ‹ › to stop a board sooner or reach one further.
 */
export function DividerSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const p = d.panels[panelId];
  const row = dividerRow(d, panelId);
  const ends = dividerEnds(d, panelId);
  if (!p?.divider || !row) return null;
  const [behind] = rowGaps(row);
  const mm = t('unit.mm');
  // shown 0–180°: a line has no sense
  const shown = Math.round(((((p.divider.rot % 180) + 180) % 180) * 10)) / 10;
  const name = (id: string | null) => (id ? t('div.end.board', { name: panelLabel(d, id, t as never) }) : t('div.end.edge'));
  return (
    <div className="subsection divider" data-testid="divider-section">
      <h4>{t('div.card.title')}</h4>
      <NumField label={t('div.position')} value={behind} unit={mm} min={0.5} onCommit={(v) => apply((x) => setDividerOffset(x, panelId, row.pos - behind + v))} testId="div-behind" />
      <NumField
        label={t('div.angle')}
        value={shown}
        unit={t('unit.deg')}
        min={-360}
        max={360}
        onCommit={(v) => apply((x) => rotatePlaced(x, panelId, normDeg(v - shown)))}
        testId="div-angle"
      />
      {ends && (
        <div className="div-ends" data-testid="div-ends">
          <span className="label">{t('div.ends')}</span>
          {ends.map((e, k) => (
            <div className="div-end" key={k} data-testid={`div-end-${k}`}>
              <button className="ghost icon-btn" disabled={!e.less} onClick={() => apply((x) => (stepDividerEnd(x, panelId, k as 0 | 1, -1), solve(x)))} title={t('div.end.less')} aria-label={t('div.end.less')} data-testid={`div-end-${k}-less`}>
                ‹
              </button>
              <span dir="auto" data-testid={`div-end-${k}-name`}>
                {t('div.end', { n: k + 1 })}: {name(e.board)}
              </span>
              <button className="ghost icon-btn" disabled={!e.more} onClick={() => apply((x) => (stepDividerEnd(x, panelId, k as 0 | 1, 1), solve(x)))} title={t('div.end.more')} aria-label={t('div.end.more')} data-testid={`div-end-${k}-more`}>
                ›
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="note">{t('div.note')}</p>
    </div>
  );
}
