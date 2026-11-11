// Quick build's tool rail (milestone 37): Select and five actions. Each action
// makes a ghost that ✓ (or Enter) makes, as one undo step; the rail then goes
// back to Select. One line of guidance replaces the Workshop hints.
import type { ReactNode } from 'react';
import { useStore, useT, type Tool } from '../store/store';
import type { MsgKey } from '../i18n';
import { Icon } from '../ui/icons';
import { Segmented, Stepper } from '../ui/NumField';
import { STICKERS } from './stickers';

export type QuickAction = 'box' | 'wall' | 'divider' | 'standing' | 'hole' | 'text';

/** The actions: the tool each one runs and what it draws with. */
export const QUICK_ACTIONS: { id: QuickAction; key: MsgKey; icon: string; tools: Tool[] }[] = [
  { id: 'box', key: 'quick.box', icon: 'box', tools: ['box'] },
  { id: 'wall', key: 'quick.wall', icon: 'wall', tools: ['wall'] },
  { id: 'divider', key: 'quick.divider', icon: 'divider', tools: ['divider'] },
  // a board standing on any face, as Workshop's Standing board (milestone 44: the Divider makes dividers only)
  { id: 'standing', key: 'tool.panelStanding', icon: 'panelStanding', tools: ['panel'] },
  { id: 'hole', key: 'quick.hole', icon: 'hole', tools: ['circle', 'rect', 'roundrect'] },
  { id: 'text', key: 'quick.textStickers', icon: 'text', tools: ['text', 'sticker'] },
];

/** Single-key shortcuts in Quick build (outside text fields). */
export const QUICK_KEYS: Record<string, QuickAction | 'select'> = { v: 'select', b: 'box', w: 'wall', d: 'divider', h: 'hole', t: 'text' };

/** Start an action: its tool, with what Quick build chooses (holes are cut, text is engraved). */
export function startAction(a: QuickAction) {
  const st = useStore.getState();
  const def = QUICK_ACTIONS.find((x) => x.id === a)!;
  // the last kind of hole (or text or sticker) chosen stays
  const tool = def.tools.includes(st.tool) ? st.tool : def.tools.includes(st.quickLast[a] as Tool) ? (st.quickLast[a] as Tool) : def.tools[0];
  if (a === 'standing') st.setBoardPose('standing');
  st.setTool(tool);
  st.setShapeOp(a === 'hole' ? 'cut' : 'engrave');
}

/** The key shown for an action ('D D': Standing board is Divider's key pressed again). */
const keyOf = (a: QuickAction) => (a === 'standing' ? 'D D' : Object.keys(QUICK_KEYS).find((k) => QUICK_KEYS[k] === a)!.toUpperCase());

export function QuickRail() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const empty = useStore((s) => s.design.order.length === 0);
  return (
    <>
      <nav className="rail quick-rail" aria-label={t('tool.title')} data-testid="quick-rail">
        <button className={tool === 'select' ? 'on' : ''} aria-pressed={tool === 'select'} aria-label={t('tool.select')} onClick={() => useStore.getState().setTool('select')} data-testid="tool-select">
          <Icon name="select" />
          <span className="tip" aria-hidden>
            {t('tool.select')}
            <kbd>{'V'}</kbd>
          </span>
        </button>
        <div className="rail-sep" />
        {QUICK_ACTIONS.map((a) => {
          const on = a.tools.includes(tool);
          return (
            <button key={a.id} className={on ? 'on' : ''} aria-pressed={on} aria-label={t(a.key)} onClick={() => (on ? useStore.getState().setTool('select') : startAction(a.id))} data-testid={`quick-${a.id}`}>
              <Icon name={a.icon} />
              <span className="tip" aria-hidden>
                {t(a.key)}
                <kbd>{keyOf(a.id)}</kbd>
              </span>
            </button>
          );
        })}
      </nav>
      {empty && tool === 'select' && (
        <p className="quick-guide" role="note" data-testid="quick-guide">
          {t('quick.guide')}
        </p>
      )}
      <ActionCard />
    </>
  );
}

/** The active action's card next to the rail: its few choices and one line of help (milestone 38). */
function ActionCard() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const boxFoot = useStore((s) => s.boxFoot);
  const sides = useStore((s) => s.boxSides);
  const sticker = useStore((s) => s.sticker);
  const set = useStore((s) => s.set);
  const a = QUICK_ACTIONS.find((x) => x.tools.includes(tool));
  if (!a) return null;
  let body: ReactNode = null;
  if (a.id === 'box')
    body = (
      <>
        <Segmented
          label={t('quick.boxFoot')}
          value={boxFoot}
          options={[
            { value: 'rect', label: t('quick.boxRect'), testId: 'box-rect' },
            { value: 'regular', label: t('quick.boxRegular'), testId: 'box-regular' },
          ]}
          onChange={(v) => set({ boxFoot: v })}
        />
        {boxFoot === 'regular' && <Stepper label={t('quick.boxSides')} value={sides} min={3} max={12} slider={false} onCommit={(v) => set({ boxSides: Math.round(v) })} testId="box-sides" />}
        <p className="note">{t('quick.boxHelp')}</p>
      </>
    );
  else if (a.id === 'wall') body = <p className="note">{t('quick.wallHelp')}</p>;
  else if (a.id === 'divider') body = <p className="note">{t('quick.dividerHelp')}</p>;
  else if (a.id === 'standing') body = <p className="note">{t('quick.standingHelp')}</p>;
  else if (a.id === 'hole')
    body = (
      <>
        <Segmented
          label={t('quick.holeShape')}
          value={tool}
          options={(['circle', 'rect', 'roundrect'] as const).map((x) => ({ value: x, label: <Icon name={x} size={18} />, title: t(`tool.${x}`), testId: `hole-${x}` }))}
          onChange={(v) => useStore.getState().setTool(v)}
        />
        <p className="note">{t('quick.holeHelp')}</p>
      </>
    );
  else
    body = (
      <>
        <Segmented
          value={tool}
          options={[
            { value: 'text', label: t('quick.text'), testId: 'quick-text-text' },
            { value: 'sticker', label: t('quick.stickers'), testId: 'quick-text-sticker' },
          ]}
          onChange={(v) => {
            useStore.getState().setTool(v);
            useStore.getState().setShapeOp('engrave');
          }}
        />
        {tool === 'sticker' && (
          <div className="sticker-grid" role="radiogroup" aria-label={t('quick.stickers')}>
            {STICKERS.map((k) => (
              <button key={k.id} role="radio" aria-checked={sticker === k.id} className={sticker === k.id ? 'on' : ''} title={t(k.key)} aria-label={t(k.key)} onClick={() => set({ sticker: k.id })} data-testid={`sticker-${k.id}`}>
                <StickerIcon polys={k.polys} />
              </button>
            ))}
          </div>
        )}
        <p className="note">{t(tool === 'sticker' ? 'quick.stickerHelp' : 'quick.textHelp')}</p>
      </>
    );
  return (
    <aside className="quick-card" aria-label={t(a.key)} data-testid={`quick-card-${a.id}`}>
      <h4>{t(a.key)}</h4>
      {body}
    </aside>
  );
}

/** A sticker's outlines as a small SVG. */
function StickerIcon({ polys }: { polys: { x: number; y: number }[][] }) {
  return (
    <svg viewBox="-0.55 -0.55 1.1 1.1" width={28} height={28} aria-hidden>
      <path d={polys.map((r) => 'M' + r.map((p) => `${p.x.toFixed(3)} ${(-p.y).toFixed(3)}`).join('L') + 'Z').join('')} fill="none" stroke="currentColor" strokeWidth={0.05} strokeLinejoin="round" />
    </svg>
  );
}
