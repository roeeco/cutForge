import { useRef } from 'react';
import { detailSel, useStore, useT, type Tool } from '../store/store';
import type { DetailOp } from '../model/types';
import { importSvg } from '../io/svgImport';
import { addPathShape, findDetail } from '../model/ops';
import type { MsgKey } from '../i18n';
import { Icon } from './icons';
import { shown, useFeature } from '../easy/features';
import { QuickRail } from '../easy/QuickRail';

const TOOLS: { id: Tool; key: MsgKey; icon: string; kbd: string; only3d?: boolean }[] = [
  { id: 'select', key: 'tool.select', icon: 'select', kbd: 'V' },
  { id: 'panel', key: 'tool.panel', icon: 'panel', kbd: 'P', only3d: true },
  { id: 'rect', key: 'tool.rect', icon: 'rect', kbd: 'R' },
  { id: 'roundrect', key: 'tool.roundrect', icon: 'roundrect', kbd: 'U' },
  { id: 'circle', key: 'tool.circle', icon: 'circle', kbd: 'C' },
  { id: 'polygon', key: 'tool.polygon', icon: 'polygon', kbd: 'G', only3d: true },
  { id: 'text', key: 'tool.text', icon: 'text', kbd: 'T' },
];

/** The shapes grouped under one rail button (as Quick build's Hole). */
const SHAPES: Tool[] = ['rect', 'roundrect', 'circle'];
/** Tools that make shapes on a panel: the operations card shows while one is in use. */
const SHAPE_TOOLS: Tool[] = [...SHAPES, 'polygon', 'text'];
const OP_ICON: Record<DetailOp, string> = { add: 'opAdd', cut: 'opCut', engrave: 'opEngrave', score: 'opScore' };

/** Single-key tool shortcuts (outside text fields). */
export const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(TOOLS.map((x) => [x.kbd.toLowerCase(), x.id]));

/** The panel an imported shape goes on: the solo panel, the selected panel, or the selected shape's panel. */
function targetPanel(): string | null {
  const s = useStore.getState();
  if (s.view === 'solo' && s.soloPanel) return s.soloPanel;
  const sel = s.selection;
  if (sel?.kind === 'panel') return sel.id;
  if (sel?.kind === 'edge') return sel.panelId;
  if (sel?.kind === 'detail') return findDetail(s.design, sel.id)?.panel.id ?? null;
  return null;
}

/** The tool rail: Workshop's tools, or Quick build's five actions (milestone 37). */
export function Toolbar() {
  return shown(useFeature('rail.tools')) ? <WorkshopRail /> : <QuickRail />;
}

function WorkshopRail() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const view = useStore((s) => s.view);
  const op = useStore((s) => s.shapeOp);
  const through = useStore((s) => s.shapeThrough);
  const pose = useStore((s) => s.panelPose);
  const setTool = useStore((s) => s.setTool);
  const setOp = useStore((s) => s.setShapeOp);
  const fileRef = useRef<HTMLInputElement>(null);
  const onFile = async (f: File) => {
    const panelId = targetPanel();
    if (!panelId) return alert(t('import.needPanel'));
    const r = importSvg(await f.text());
    if ('error' in r) return alert(t('import.failed', { reason: t(`import.${r.error}` as MsgKey) }));
    const s = useStore.getState();
    const p = s.design.panels[panelId];
    // fit into 40% of the panel, keeping proportions
    const k = (Math.min(p.w, p.h) * 0.4) / Math.max(r.w, r.h);
    let id: string | null = null;
    s.cancelPending();
    s.apply((d) => void (id = addPathShape(d, panelId, r.polys, p.w / 2, p.h / 2, r.w * k, r.h * k, s.shapeOp)));
    if (id) {
      // a ghost until ✓ (milestone 30)
      s.select(detailSel([id]));
      s.beginPending({ kind: 'shape', ids: [id], panelId });
    }
    const notes = r.problems.filter((x) => x === 'openDropped' || x === 'simplified');
    if (notes.length) alert(t('import.notes', { notes: notes.map((n) => t(`import.${n}` as MsgKey)).join('; ') }));
  };
  const lastShape = useStore((s) => (SHAPES.includes(s.quickLast.hole as Tool) ? (s.quickLast.hole as Tool) : 'rect'));
  const inShapes = SHAPES.includes(tool);
  const shapeIcon = inShapes ? tool : lastShape;
  const railBtn = (id: Tool, key: MsgKey, icon: string, kbd: string) => (
    <button key={id} className={tool === id ? 'on' : ''} aria-pressed={tool === id} aria-label={t(key)} onClick={() => setTool(id)} data-testid={`tool-${id}`}>
      <Icon name={icon} />
      <span className="tip" aria-hidden>
        {t(key)}
        <kbd>{kbd}</kbd>
      </span>
    </button>
  );
  const byId = (id: Tool) => TOOLS.find((x) => x.id === id)!;
  return (
    <>
      <nav className="rail" aria-label={t('tool.title')}>
        {railBtn('select', 'tool.select', 'select', 'V')}
        {view === '3d' && (
          // the Board tool, and its perpendicular button sliding out beside it while the tool is active (milestone 42)
          <div className={`rail-tool ${tool === 'panel' ? 'out' : ''}`}>
            <button className={`rail-main ${tool === 'panel' ? 'on' : ''}`} aria-pressed={tool === 'panel'} aria-label={t('tool.panel')} onClick={() => setTool('panel')} data-testid="tool-panel" data-pose={pose}>
              <Icon name={pose === 'standing' ? 'panelStanding' : 'panel'} />
              <span className="tip" aria-hidden>
                {t('tool.panel')}
                <kbd>{'P'}</kbd>
              </span>
            </button>
            <button
              className={`rail-flyout ${pose === 'standing' ? 'on' : ''}`}
              aria-pressed={pose === 'standing'}
              aria-label={t('tool.panelStanding')}
              inert={tool !== 'panel'}
              onClick={() => useStore.getState().setBoardPose(pose === 'standing' ? 'flat' : 'standing')}
              data-testid="tool-panel-standing"
            >
              <Icon name="panelStanding" />
              <span className="tip" aria-hidden>
                {t('tool.panelStanding')}
                <kbd>{'P'}</kbd>
              </span>
            </button>
          </div>
        )}
        {/* rectangle, rounded rectangle and circle: one button, the card chooses */}
        <button className={inShapes ? 'on' : ''} aria-pressed={inShapes} aria-label={t('tool.shapes')} onClick={() => setTool(inShapes ? 'select' : shapeIcon)} data-testid="tool-shapes">
          <Icon name={shapeIcon === 'rect' ? 'shapes' : shapeIcon} />
          <span className="tip" aria-hidden>
            {t('tool.shapes')}
            <kbd>{'R U C'}</kbd>
          </span>
        </button>
        {view === '3d' && railBtn('polygon', 'tool.polygon', 'polygon', 'G')}
        {railBtn('text', 'tool.text', 'text', 'T')}
        <div className="rail-sep" />
        <button onClick={() => fileRef.current?.click()} aria-label={t('tool.import')} data-testid="import-svg">
          <Icon name="import" />
          <span className="tip" aria-hidden>
            {t('tool.import')}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,image/svg+xml"
          hidden
          data-testid="import-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
      </nav>
      {SHAPE_TOOLS.includes(tool) && (
        // the shape tool's card: which shape, and what it does to the board (only while a shape tool is in use)
        <aside className="quick-card shape-card" aria-label={t('tool.op')} data-testid="shape-card">
          {inShapes && (
            <div className="shape-pick" role="radiogroup" aria-label={t('tool.shapes')}>
              {SHAPES.map((id) => (
                <button key={id} role="radio" aria-checked={tool === id} className={tool === id ? 'on' : ''} title={`${t(byId(id).key)} (${byId(id).kbd})`} aria-label={t(byId(id).key)} onClick={() => setTool(id)} data-testid={`tool-${id}`}>
                  <Icon name={id} size={18} />
                  <span>{t(byId(id).key)}</span>
                </button>
              ))}
            </div>
          )}
          <h4>{t('tool.op')}</h4>
          <div className="op-list" role="radiogroup" aria-label={t('tool.op')}>
            {(['cut', 'engrave', 'score', 'add'] as const).map((o) => (
              <button key={o} role="radio" aria-checked={op === o} className={op === o ? 'on' : ''} data-op={o} onClick={() => setOp(o)} data-testid={`op-${o}`}>
                <Icon name={OP_ICON[o]} size={20} />
                <span className="op-text">
                  <strong>{t(`op.name.${o}`)}</strong>
                  <small>{t(`op.desc.${o}`)}</small>
                </span>
              </button>
            ))}
          </div>
          {op === 'cut' && (
            <label className="check through-check">
              <input type="checkbox" checked={through} onChange={() => useStore.getState().set({ shapeThrough: !through })} data-testid="op-through" />
              <Icon name="through" size={16} /> {t('tool.op.through')}
            </label>
          )}
        </aside>
      )}
    </>
  );
}
