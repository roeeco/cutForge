// A board's own material (milestone 36): the card's material list. Choosing a
// material sets the board's colour, thickness and joints; the note says which
// joints changed kind because of it.
import { useState } from 'react';
import { useStore, useT } from '../store/store';
import { MATERIALS, matIdOf, matOf, materialsInUse } from '../model/materials';
import { parentConnection, setPanelMaterial } from '../model/ops';
import type { ConnectionKind, MaterialKind, MaterialProfile } from '../model/types';
import { NumField, Segmented } from './NumField';
import { materialName } from './materialName';
import { panelLabel } from '../model/names';
import { fmtNum } from '../i18n';

const SAME = '__same__', CUSTOM = '__custom__';

export function BoardMaterial({ ids }: { ids: string[] }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const [result, setResult] = useState<{ ids: string; list: { a: string; b: string; from: ConnectionKind; to: ConnectionKind }[] } | null>(null);
  const [custom, setCustom] = useState<{ kind: MaterialKind; thickness: number } | null>(null);
  const live = ids.filter((id) => d.panels[id]);
  if (!live.length) return null;
  const mats = new Set(live.map((id) => matIdOf(d, id)));
  const own = live.every((id) => d.panels[id].material && d.panels[id].material !== d.material.id);
  const value = mats.size > 1 ? '' : own ? [...mats][0] : SAME;
  const inUse = materialsInUse(d).filter((m) => !m.working);
  const builtIns = MATERIALS.filter((m) => m.id !== d.material.id && !inUse.some((u) => u.id === m.id));
  const m = matOf(d, live[0]);
  const choose = (prof: MaterialProfile | null) => {
    let list: { id: string; from: ConnectionKind; to: ConnectionKind }[] = [];
    apply((x) => void (list = setPanelMaterial(x, live, prof)));
    const after = useStore.getState().design;
    setResult({
      ids: live.join(),
      list: list.map((c) => {
        const cc = after.connections[c.id];
        return { a: cc ? panelLabel(after, cc.a.panelId, t) : '?', b: cc ? panelLabel(after, cc.b.panelId, t) : '?', from: c.from, to: c.to };
      }),
    });
  };
  const onChange = (v: string) => {
    if (v === CUSTOM) return setCustom({ kind: m.kind, thickness: m.thickness });
    setCustom(null);
    if (v === SAME) return choose(null);
    const prof = inUse.find((u) => u.id === v)?.profile ?? MATERIALS.find((x) => x.id === v);
    if (prof) choose(prof);
  };
  const makeCustom = () => {
    if (!custom) return;
    const base = MATERIALS.find((x) => x.kind === custom.kind) ?? m;
    const id = `${custom.kind}-${fmtNum(custom.thickness, 2).replace(/[^0-9]/g, '_')}mm`;
    choose({ ...(d.materials?.[id] ?? { ...base, id, nameKey: id }), thickness: custom.thickness });
    setCustom(null);
  };
  // a board cut from its fold net because its material differs
  const pc = live.length === 1 ? parentConnection(d, live[0]) : undefined;
  const ownPiece = !!pc && pc.pref === 'fold' && pc.kind !== 'fold';
  const shown = result && result.ids === live.join() ? result : null;
  return (
    <div className="subsection board-material" data-testid="board-material-section">
      <div className="field">
        <label htmlFor="board-mat">{t('board.material')}</label>
        <select id="board-mat" value={custom ? CUSTOM : value} onChange={(e) => onChange(e.target.value)} data-testid="board-material">
          {value === '' && <option value="" disabled />}
          <option value={SAME}>{t('board.sameAsWorking', { name: materialName(t, d.material) })}</option>
          {inUse.length > 0 && (
            <optgroup label={t('board.inDesign')}>
              {inUse.map((u) => (
                <option key={u.id} value={u.id}>
                  {materialName(t, u.profile)}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={t('board.builtIn')}>
            {builtIns.map((x) => (
              <option key={x.id} value={x.id}>
                {materialName(t, x)}
              </option>
            ))}
          </optgroup>
          <option value={CUSTOM}>{t('board.custom')}</option>
        </select>
      </div>
      {custom && (
        <div className="custom-mat" data-testid="board-custom">
          <Segmented
            label={t('board.customKind')}
            value={custom.kind}
            options={(['plywood', 'card', 'corrugated'] as const).map((k) => ({ value: k, label: t(`settings.matIn.${k}`), testId: `board-custom-${k}` }))}
            onChange={(k) => setCustom({ ...custom, kind: k as MaterialKind })}
          />
          <NumField label={t('board.customThickness')} value={custom.thickness} decimals={2} unit={t('unit.mm')} min={0.2} max={20} onCommit={(v) => setCustom({ ...custom, thickness: v })} testId="board-custom-thickness" />
          <button className="primary" onClick={makeCustom} data-testid="board-custom-make">
            {t('board.customMake')}
          </button>
        </div>
      )}
      <p className="note">{t('insp.thickness', { t: fmtNum(m.thickness, 2) })}</p>
      {ownPiece && <p className="note" data-testid="board-own-piece">{t('board.matOwnPiece')}</p>}
      {shown && (
        <p className="note" data-testid="board-mat-result">
          {shown.list.length
            ? t('board.matChanged', { list: shown.list.map((c) => t('board.matChange', { a: c.a, b: c.b, from: t(`conn.${c.from}`), to: t(`conn.${c.to}`) })).join(', ') })
            : t('board.matChangedNone')}
        </p>
      )}
    </div>
  );
}
