import { useRef } from 'react';
import { detailSel, useStore, useT, type ShapeFoot, type Tool } from '../store/store';
import type { DetailOp, P2 } from '../model/types';
import { importSvg } from '../io/svgImport';
import { addPathShape, addPolygonPanel, findDetail } from '../model/ops';
import type { MsgKey } from '../i18n';
import { Icon } from './icons';
import { shown, useFeature } from '../easy/features';
import { QuickRail } from '../easy/QuickRail';

/** The Shapes tool's footprints (milestone 75), in the menu's order. */
const FEET: { id: ShapeFoot; key: MsgKey; icon: string; kbd?: string; only3d?: boolean }[] = [
  { id: 'rect', key: 'tool.rect', icon: 'rect', kbd: 'R' },
  { id: 'rounded', key: 'tool.roundrect', icon: 'roundrect', kbd: 'U' },
  { id: 'circle', key: 'tool.circle', icon: 'circle', kbd: 'C' },
  { id: 'polygon', key: 'tool.polygon', icon: 'polygon', kbd: 'G', only3d: true },
  { id: 'regular', key: 'tool.regular', icon: 'ngon', only3d: true },
];
const OP_ICON: Record<DetailOp, string> = { add: 'opAdd', cut: 'opCut', engrave: 'opEngrave', score: 'opScore' };

/** The footprint and operator a drawing tool stands for (null: not a Shapes tool). */
export function shapeOf(tool: Tool, polyMode: 'click' | 'ngon' | 'round' | 'rounded', board: boolean): { foot: ShapeFoot; board: boolean } | null {
  if (tool === 'panel') return { foot: 'rect', board: true };
  if (tool === 'rect') return { foot: 'rect', board: false };
  if (tool === 'roundrect') return { foot: 'rounded', board: false };
  if (tool === 'circle') return { foot: 'circle', board: false };
  if (tool !== 'polygon') return null;
  if (polyMode === 'round') return { foot: 'circle', board: true };
  if (polyMode === 'rounded') return { foot: 'rounded', board: true };
  return { foot: polyMode === 'ngon' ? 'regular' : 'polygon', board };
}

/** Single-key tool shortcuts (outside text fields): the Shapes tool's footprints, Divider and Text (milestone 75). */
export const TOOL_KEYS: Record<string, Tool | ShapeFoot> = { v: 'select', p: 'panel', r: 'rect', u: 'rounded', c: 'circle', g: 'polygon', d: 'divider', t: 'text' };

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
    const r = importSvg(await f.text());
    if ('error' in r) return alert(t('import.failed', { reason: t(`import.${r.error}` as MsgKey) }));
    const s = useStore.getState();
    // the operator *Board* (milestone 75): the largest outline becomes a board on the floor, at its own size;
    // with a board selected and the Shapes tool not on Board, it is a shape on that board, as before
    const onBoard = shapeOf(s.tool, s.polyMode, s.shapeBoard)?.board ?? false;
    if (s.view === '3d' && (onBoard || (s.shapeBoard && !targetPanel()))) {
      const area = (q: P2[]) => Math.abs(q.reduce((a, p, i) => a + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0)) / 2;
      const ring = [...r.polys].sort((a, b) => area(b) - area(a))[0];
      if (!ring) return alert(t('import.failed', { reason: t('import.noClosed') }));
      let id: string | null = null;
      s.cancelPending();
      s.apply((d) => void (id = addPolygonPanel(d, 0, 0, ring.map((q) => ({ x: q.x, y: r.h - q.y })))));
      if (id) {
        s.select({ kind: 'panel', id });
        s.beginPending({ kind: 'panel', ids: [id], panelId: id });
      } else alert(t('import.failed', { reason: t('import.badBoard') }));
      return;
    }
    const panelId = targetPanel();
    if (!panelId) return alert(t('import.needPanel'));
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
  const polyMode = useStore((s) => s.polyMode);
  const shapeBoard = useStore((s) => s.shapeBoard);
  const shapeNote = useStore((s) => s.shapeNote);
  const lastFoot = useStore((s) => s.shapeFoot);
  const railBtn = (id: Tool, key: MsgKey, icon: string, kbd: string) => (
    <button key={id} className={tool === id ? 'on' : ''} aria-pressed={tool === id} aria-label={t(key)} onClick={() => setTool(id)} data-testid={`tool-${id}`}>
      <Icon name={icon} />
      <span className="tip" aria-hidden>
        {t(key)}
        <kbd>{kbd}</kbd>
      </span>
    </button>
  );
  // the Shapes tool (milestone 75): which footprint and operator the drawing tool in use stands for
  const cur = shapeOf(tool, polyMode, shapeBoard);
  const inShapes = !!cur;
  const foot = cur?.foot ?? lastFoot;
  const isBoard = cur ? cur.board : shapeBoard && view === '3d';
  const feet = FEET.filter((f) => view === '3d' || !f.only3d);
  return (
    <>
      <nav className="rail" aria-label={t('tool.title')}>
        {railBtn('select', 'tool.select', 'select', 'V')}
        {/* one Shapes tool: a footprint drawn as a board, or as a shape on one (milestone 75) */}
        <button className={inShapes ? 'on' : ''} aria-pressed={inShapes} aria-expanded={inShapes} aria-label={t('tool.shapes')} onClick={() => (inShapes ? setTool('select') : useStore.getState().chooseShape(view === '3d' ? lastFoot : lastFoot === 'polygon' || lastFoot === 'regular' ? 'rect' : lastFoot))} data-testid="tool-shapes">
          <Icon name={FEET.find((f) => f.id === foot)!.icon} />
          <span className="tip" aria-hidden>
            {t('tool.shapes')}
            <kbd>{'P R U C G'}</kbd>
          </span>
        </button>
        {inShapes && (
          // the footprints as a vertical menu under the button: the rail's other buttons move down
          <div className="rail-menu" role="radiogroup" aria-label={t('tool.shapes')} data-testid="shape-feet">
            {feet.map((f) => (
              <button key={f.id} role="radio" aria-checked={foot === f.id} className={foot === f.id ? 'on' : ''} aria-label={t(f.key)} onClick={() => useStore.getState().chooseShape(f.id)} data-testid={`foot-${f.id}`}>
                <Icon name={f.icon} size={18} />
                <span className="tip" aria-hidden>
                  {t(f.key)}
                  {f.kbd && <kbd>{f.kbd}</kbd>}
                </span>
              </button>
            ))}
          </div>
        )}
        {/* dividers: a line drawn in a box (milestone 44), a gesture of its own */}
        {view === '3d' && railBtn('divider', 'tool.divider', 'divider', 'D')}
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
      {(inShapes || tool === 'text') && (
        // the shape card: what the footprint does (only while the Shapes or Text tool is in use)
        <aside className="quick-card shape-card" aria-label={t('tool.op')} data-testid="shape-card">
          <h4>{t('tool.op')}</h4>
          <div className="op-list" role="radiogroup" aria-label={t('tool.op')}>
            {inShapes && view === '3d' && (
              <button role="radio" aria-checked={isBoard} className={isBoard ? 'on' : ''} data-op="board" onClick={() => useStore.getState().chooseShape(foot, true)} data-testid="op-board">
                <Icon name="panel" size={20} />
                <span className="op-text">
                  <strong>{t('op.name.board')}</strong>
                  <small>{t('op.desc.board')}</small>
                </span>
              </button>
            )}
            {(['cut', 'engrave', 'score', 'add'] as const).map((o) => {
              const on = !isBoard && op === o;
              const pick = () => {
                setOp(o);
                // from Board to an operator: the drawing tool changes; otherwise only the operator (a shape waiting for ✓ keeps it)
                if (inShapes && isBoard) useStore.getState().chooseShape(foot, false);
              };
              return (
                <button key={o} role="radio" aria-checked={on} className={on ? 'on' : ''} data-op={o} onClick={pick} data-testid={`op-${o}`}>
                  <Icon name={OP_ICON[o]} size={20} />
                  <span className="op-text">
                    <strong>{t(`op.name.${o}`)}</strong>
                    <small>{t(`op.desc.${o}`)}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {inShapes && isBoard && (
            // standing is offered for the rectangle only
            <div className="field" data-testid="board-pose">
              <span>{t('tool.pose')}</span>
              <div className="seg" role="radiogroup">
                {(['flat', 'standing'] as const).map((p) => {
                  const ok = p === 'flat' || foot === 'rect';
                  const on = foot === 'rect' ? tool === 'panel' && pose === p : p === 'flat';
                  return (
                    <button key={p} role="radio" aria-checked={on} className={on ? 'on' : ''} aria-disabled={!ok} title={ok ? undefined : t('tool.pose.rectOnly')} onClick={() => ok && (useStore.getState().setBoardPose(p), useStore.getState().chooseShape('rect', true))} data-testid={`pose-${p}`}>
                      {t(p === 'flat' ? 'tool.pose.flat' : 'tool.pose.standing')}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {inShapes && !isBoard && <p className="hint" data-testid="shape-onboard">{t(shapeNote === 'onBoard' ? 'tool.shapeOnBoardNote' : 'tool.shapeOnBoard')}</p>}
          {!isBoard && op === 'cut' && (
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
