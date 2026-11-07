import { useRef } from 'react';
import { detailSel, useStore, useT, type Tool } from '../store/store';
import type { DetailOp } from '../model/types';
import { importSvg } from '../io/svgImport';
import { addPathShape, findDetail } from '../model/ops';
import type { MsgKey } from '../i18n';

const TOOLS: { id: Tool; key: MsgKey; icon: string; only3d?: boolean }[] = [
  { id: 'select', key: 'tool.select', icon: '↖' },
  { id: 'panel', key: 'tool.panel', icon: '▱', only3d: true },
  { id: 'rect', key: 'tool.rect', icon: '▭' },
  { id: 'roundrect', key: 'tool.roundrect', icon: '▢' },
  { id: 'circle', key: 'tool.circle', icon: '◯' },
  { id: 'text', key: 'tool.text', icon: 'T' },
];

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

export function Toolbar() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const view = useStore((s) => s.view);
  const op = useStore((s) => s.shapeOp);
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
    s.apply((d) => void (id = addPathShape(d, panelId, r.polys, p.w / 2, p.h / 2, r.w * k, r.h * k, s.shapeOp)));
    if (id) s.select(detailSel([id]));
    const notes = r.problems.filter((x) => x === 'openDropped' || x === 'simplified');
    if (notes.length) alert(t('import.notes', { notes: notes.map((n) => t(`import.${n}` as MsgKey)).join('; ') }));
  };
  return (
    <nav className="toolbar" aria-label={t('tool.title')}>
      {TOOLS.filter((x) => !(x.only3d && view !== '3d')).map((x) => (
        <button key={x.id} className={tool === x.id ? 'on' : ''} aria-pressed={tool === x.id} onClick={() => setTool(x.id)} data-testid={`tool-${x.id}`} title={t(x.key)}>
          <span className="icon" aria-hidden>
            {x.icon}
          </span>
          <span className="tl">{t(x.key)}</span>
        </button>
      ))}
      <button onClick={() => fileRef.current?.click()} data-testid="import-svg">
        <span className="icon" aria-hidden>
          ⇪
        </span>
        <span className="tl">{t('tool.import')}</span>
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
