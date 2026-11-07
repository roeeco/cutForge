import { useStore, useT, type Tool } from '../store/store';
import type { DetailOp } from '../model/types';

const TOOLS: { id: Tool; key: 'tool.select' | 'tool.panel' | 'tool.rect' | 'tool.roundrect' | 'tool.circle'; icon: string; only3d?: boolean }[] = [
  { id: 'select', key: 'tool.select', icon: '↖' },
  { id: 'panel', key: 'tool.panel', icon: '▱', only3d: true },
  { id: 'rect', key: 'tool.rect', icon: '▭' },
  { id: 'roundrect', key: 'tool.roundrect', icon: '▢' },
  { id: 'circle', key: 'tool.circle', icon: '◯' },
];

export function Toolbar() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const view = useStore((s) => s.view);
  const op = useStore((s) => s.shapeOp);
  const setTool = useStore((s) => s.setTool);
  const setOp = useStore((s) => s.setShapeOp);
  return (
    <nav className="toolbar" aria-label={t('tool.title')}>
      {TOOLS.filter((x) => !(x.only3d && view === '2d')).map((x) => (
        <button key={x.id} className={tool === x.id ? 'on' : ''} aria-pressed={tool === x.id} onClick={() => setTool(x.id)} data-testid={`tool-${x.id}`} title={t(x.key)}>
          <span className="icon" aria-hidden>
            {x.icon}
          </span>
          <span className="tl">{t(x.key)}</span>
        </button>
      ))}
      <div className="field">
        <label htmlFor="shape-op">{t('tool.op')}</label>
        <select id="shape-op" value={op} onChange={(e) => setOp(e.target.value as DetailOp)}>
          {(['cut', 'engrave', 'score'] as const).map((o) => (
            <option key={o} value={o}>
              {t(`tool.op.${o}`)}
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
}
