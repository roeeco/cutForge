// The sketch view's rail (SKETCH_OVERHAUL.md §6.4), styled as the stage's rail.
import { useStore, useT, type SkTool } from '../../../store/store';
import type { MsgKey } from '../../../i18n';
import { Icon } from '../../../ui/icons';

const st = () => useStore.getState();

export const SK_TOOLS: { id: SkTool; key: MsgKey; icon: string; kbd: string }[] = [
  { id: 'select', key: 'sketch.tool.select', icon: 'select', kbd: 'V' },
  { id: 'line', key: 'sketch.tool.line', icon: 'polygon', kbd: '1' },
  { id: 'bezier', key: 'sketch.tool.bezier', icon: 'curve', kbd: '2' },
  { id: 'smooth', key: 'sketch.tool.smooth', icon: 'grow', kbd: '3' },
  { id: 'points', key: 'sketch.tool.points', icon: 'plus', kbd: '4' },
  { id: 'arc', key: 'sketch.tool.arc', icon: 'circle', kbd: 'A' },
];

export function SketchRail() {
  const t = useT();
  const tool = useStore((s) => s.sketch?.tool);
  const cons = useStore((s) => !!s.sketch?.cons);
  const dims = useStore((s) => !!s.sketch?.dims);
  const btn = (id: SkTool, key: MsgKey, icon: string, kbd: string) => (
    <button key={id} className={tool === id ? 'on' : ''} aria-pressed={tool === id} aria-label={t(key)} onClick={() => st().setSketch({ tool: id })} data-testid={`sk-tool-${id}`}>
      <Icon name={icon} />
      <span className="tip" aria-hidden>
        {t(key)}
        <kbd>{kbd}</kbd>
      </span>
    </button>
  );
  return (
    <nav className="rail sk-rail" aria-label={t('tool.title')} data-testid="sketch-rail">
      {SK_TOOLS.map((x) => btn(x.id, x.key, x.icon, x.kbd))}
      <ShapeMenuSlot />
      {btn('erase', 'sketch.tool.erase', 'trash', 'E')}
      <div className="rail-sep" />
      <button className={cons ? 'on' : ''} aria-pressed={cons} aria-label={t('sketch.tool.cons')} onClick={() => st().setSketch({ cons: !cons })} data-testid="sk-cons">
        <Icon name="ruler" />
        <span className="tip" aria-hidden>
          {t('sketch.tool.cons')}
        </span>
      </button>
      {btn('tape', 'sketch.tool.tape', 'ruler', 'T')}
      <button className={dims ? 'on' : ''} aria-pressed={dims} aria-label={t('sketch.tool.dims')} onClick={() => st().setSketch({ dims: !dims })} data-testid="sk-dims">
        <Icon name="grid" />
        <span className="tip" aria-hidden>
          {t('sketch.tool.dims')}
        </span>
      </button>
    </nav>
  );
}

/** The Add shape menu (milestone 58). */
export function ShapeMenuSlot() {
  return null;
}
