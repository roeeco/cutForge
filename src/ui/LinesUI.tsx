// A board's drawn lines on its card (milestone 84, LIDS_LINES_PROJECTS_PLAN.md §6):
// each line's type, and Delete. In both modes: lines made in Workshop show in
// Quick build and can be deleted there (its rail has no Line tool).
import { useStore, useT } from '../store/store';
import { deleteLine, updateLine } from '../model/ops';
import { LINE_TYPES } from '../model/lines';
import type { LineType } from '../model/types';
import { Icon } from './icons';

export function LinesSection({ panelId }: { panelId: string }) {
  const t = useT();
  const p = useStore((s) => s.design.panels[panelId]);
  const apply = useStore((s) => s.apply);
  if (!p?.lines?.length) return null;
  return (
    <div className="subsection" data-testid="lines-section">
      <h4>
        {t('lines.title')} <span className="count">{p.lines.length}</span>
      </h4>
      {p.lines.map((ln, i) => (
        <div className="field" key={ln.id} data-testid={`line-row-${i}`}>
          <select value={ln.type} onChange={(e) => apply((d) => updateLine(d, ln.id, { type: e.target.value as LineType }))} aria-label={t('line.type')} data-testid={`line-type-${i}`}>
            {LINE_TYPES.map((lt) => (
              <option key={lt} value={lt}>
                {t(`line.name.${lt}`)}
              </option>
            ))}
          </select>
          <button className="ghost icon-btn" onClick={() => apply((d) => deleteLine(d, ln.id))} aria-label={t('lines.delete')} title={t('lines.delete')} data-testid={`line-delete-${i}`}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
