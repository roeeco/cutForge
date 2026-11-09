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
  return (
    <nav className="rail" aria-label={t('tool.title')}>
      {TOOLS.filter((x) => !(x.only3d && view !== '3d')).map((x) => (
        <button key={x.id} className={tool === x.id ? 'on' : ''} aria-pressed={tool === x.id} aria-label={t(x.key)} onClick={() => setTool(x.id)} data-testid={`tool-${x.id}`}>
          <Icon name={x.icon} />
          <span className="tip" aria-hidden>
            {t(x.key)}
            <kbd>{x.kbd}</kbd>
          </span>
        </button>
      ))}
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
      <div className="rail-sep" />
      <div className="ops" role="radiogroup" aria-label={t('tool.op')}>
        {(['add', 'cut', 'engrave', 'score'] as const).map((o) => (
          <button key={o} className={`op-btn ${op === o ? 'on' : ''}`} role="radio" aria-checked={op === o} aria-label={t(`tool.op.${o}`)} data-op={o} onClick={() => setOp(o as DetailOp)} data-testid={`op-${o}`}>
            <span className="dot" style={o === 'engrave' ? undefined : { background: `var(--op-${o})` }}>{o === 'add' ? '+' : null}</span>
            <span className="tip" aria-hidden>
              {t('tool.op')}: {t(`tool.op.${o}`)}
            </span>
          </button>
        ))}
        {op === 'cut' && (
          <button
            className={`op-btn through ${through ? 'on' : ''}`}
            role="switch"
            aria-checked={through}
            aria-label={t('tool.op.through')}
            onClick={() => useStore.getState().set({ shapeThrough: !through })}
            data-testid="op-through"
          >
            <Icon name="through" size={18} />
            <span className="tip" aria-hidden>
              {t('tool.op.through')}
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
