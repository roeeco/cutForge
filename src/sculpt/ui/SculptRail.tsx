// The waffle design's rail (WAFFLE_MODE.md §5.1): Select, Shapes, Sketch,
// Radius, Solid / Hole, and Group / Ungroup when the selection allows.
import { selectedShapeIds, useStore, useT, type Tool } from '../../store/store';
import type { MsgKey } from '../../i18n';
import { Icon } from '../../ui/icons';
import { canGroup, canUngroup, groupSelected, toggleHole, ungroupSelected } from './commands';

export function SculptRail() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const stage = useStore((s) => s.sculpt.stage);
  const sel = useStore((s) => s.selection);
  const d = useStore((s) => s.design);
  const nextHole = useStore((s) => s.sculpt.nextHole);
  const ids = selectedShapeIds(sel);
  const allHoles = ids.length ? ids.every((id) => d.sculpt?.shapes[id]?.hole) : nextHole;
  const btn = (id: Tool, key: MsgKey, icon: string, kbd: string) => (
    <button
      key={id}
      className={tool === id ? 'on' : ''}
      aria-pressed={tool === id}
      aria-label={t(key)}
      onClick={() => {
        const s = useStore.getState();
        if (s.view !== '3d') s.setView('3d');
        s.setTool(tool === id && id !== 'select' ? 'select' : id);
      }}
      data-testid={`sculpt-tool-${id}`}
    >
      <Icon name={icon} />
      <span className="tip" aria-hidden>
        {t(key)}
        <kbd>{kbd}</kbd>
      </span>
    </button>
  );
  return (
    <nav className="rail" aria-label={t('tool.title')} data-testid="sculpt-rail">
      {btn('select', 'tool.select', 'select', 'V')}
      {stage === 'shape' && (
        <>
          {btn('shapes', 'sculpt.tool.shapes', 'shapes', 'S')}
          {btn('sketch', 'sculpt.tool.sketch', 'polygon', 'K')}
          {btn('radius', 'sculpt.tool.radius', 'curve', 'F')}
          <div className="rail-sep" />
          <button className={allHoles ? 'on' : ''} aria-pressed={allHoles} aria-label={t('sculpt.tool.hole')} onClick={toggleHole} data-testid="sculpt-hole">
            <Icon name="hole" />
            <span className="tip" aria-hidden>
              {t('sculpt.tool.hole')}
              <kbd>{'H'}</kbd>
            </span>
          </button>
          {canGroup(d, ids) && (
            <button aria-label={t('sculpt.tool.group')} onClick={groupSelected} data-testid="sculpt-group">
              <Icon name="group" />
              <span className="tip" aria-hidden>
                {t('sculpt.tool.group')}
                <kbd>{'Ctrl+G'}</kbd>
              </span>
            </button>
          )}
          {canUngroup(d, ids) && (
            <button aria-label={t('sculpt.tool.ungroup')} onClick={ungroupSelected} data-testid="sculpt-ungroup">
              <Icon name="ungroup" />
              <span className="tip" aria-hidden>
                {t('sculpt.tool.ungroup')}
                <kbd>{'Ctrl+Shift+G'}</kbd>
              </span>
            </button>
          )}
        </>
      )}
    </nav>
  );
}
