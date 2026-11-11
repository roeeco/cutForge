// A bent wall's Bend section (milestone 47, CURVED_WALLS.md §5.2): how it
// bends (Auto, or one of the styles its material offers), its line spacing,
// which face is up when it is cut (kiss scores), and one sentence on its
// tightest bend against what the material reaches.
import { useStore, useT } from '../store/store';
import { NumField, Segmented } from './NumField';
import { setBend } from '../model/ops';
import { matOf, bendOf } from '../model/materials';
import { styleReach, stylesFor } from '../model/bendPattern';
import type { BendStyle } from '../model/types';
import { fmtNum } from '../i18n';
import { panelLabel } from '../model/names';

export function BendSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const p = d.panels[panelId];
  const info = p?.bent?.pattern;
  if (!p?.bent || !info) return null;
  const m = matOf(d, panelId);
  const mm = t('unit.mm');
  const choice = p.bend?.style ?? 'auto';
  const styles: BendStyle[] = ['auto', ...stylesFor(m.kind)];
  const styleName = (s: BendStyle) => t(`bend.style.${s}` as const);
  const r = fmtNum(p.bent.minR, 1);
  const kiss = info.zones.some((z) => z.style === 'kiss') || info.style === 'kiss';
  const lines = info.zones.reduce((s, z) => s + z.lines, 0);
  // its in-line seams (milestone 48): one strip with a neighbour in the net, or its own piece glued in line
  const seams = Object.values(d.connections).filter((c) => !c.grown && c.a.panelId === panelId && /\|[se]$/.test(c.id));
  const ride = seams.find((c) => c.kind === 'inline');
  const strip = seams.length ? { with: ride ? (ride.a.panelId === panelId ? ride.b.panelId : ride.a.panelId) : null } : null;
  return (
    <div className="subsection bend" data-testid="bend-section">
      <h4>{t('bend.title')}</h4>
      <Segmented
        label={t('bend.style')}
        value={choice}
        options={styles.map((s) => ({ value: s, label: styleName(s), title: s === 'auto' ? t('bend.styleHelp') : undefined, testId: `bend-style-${s}` }))}
        onChange={(v) => apply((x) => void setBend(x, panelId, { style: v as BendStyle }))}
      />
      {info.auto && (
        <p className="note" data-testid="bend-auto">
          {t('bend.autoChose', { style: styleName(info.style) })}
        </p>
      )}
      <p className={`note${p.bent.minR < info.reach - 1e-6 ? ' warn' : ''}`} data-testid="bend-reach" dir="auto">
        {info.style === 'smooth'
          ? t('bend.reachSmooth', { r, reach: fmtNum(bendOf(m).smoothR, 1) })
          : t('bend.reach', { r, style: styleName(info.style), reach: fmtNum(styleReach(m, info.style), 1) })}{' '}
        {lines > 0 && t('bend.lines', { n: lines })}
      </p>
      {info.style !== 'smooth' && (
        <>
          <label className="check">
            <input type="checkbox" checked={p.bend?.pitch == null} onChange={(e) => apply((x) => void setBend(x, panelId, { pitch: e.target.checked ? null : Math.round(bendOf(m).pitch * 10) / 10 }))} data-testid="bend-pitch-auto" />
            {t('bend.pitchAuto')}
          </label>
          {p.bend?.pitch != null && (
            <>
              <NumField label={t('bend.pitch')} value={p.bend.pitch} unit={mm} min={0.3} max={100} onCommit={(v) => apply((x) => void setBend(x, panelId, { pitch: v }))} testId="bend-pitch" />
              <p className="note">{t('bend.pitchSet', { p: fmtNum(p.bend.pitch, 1) })}</p>
            </>
          )}
        </>
      )}
      {p.bent.closed && (
        <>
          <NumField label={t('bend.seam')} value={Math.round((p.bend?.seamAt ?? 0) * 360)} unit={t('unit.deg')} decimals={0} min={0} max={359} onCommit={(v) => apply((x) => void setBend(x, panelId, { seamAt: v / 360 }))} testId="bend-seam" />
          <p className="note">{t('bend.seamHelp')}</p>
        </>
      )}
      {strip && (
        <p className="note" data-testid="bend-strip" dir="auto">
          {strip.with ? t('bend.strip', { panel: panelLabel(d, strip.with, t) }) : t('bend.stripOwn')}
        </p>
      )}
      {m.kind === 'corrugated' && kiss && (
        <>
          <Segmented
            label={t('bend.face')}
            value={info.face}
            options={[
              { value: 1, label: t('bend.faceIn'), testId: 'bend-face-in' },
              { value: -1, label: t('bend.faceOut'), testId: 'bend-face-out' },
            ]}
            onChange={(v) => apply((x) => void setBend(x, panelId, { face: v as 1 | -1 }))}
          />
          {info.mirror && <p className="note">{t('bend.mirror')}</p>}
          <p className="note">{t('bend.kissHelp')}</p>
        </>
      )}
    </div>
  );
}
