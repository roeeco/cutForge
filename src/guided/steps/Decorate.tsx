// Decorate (milestone 108, GUIDED_MODE.md §3.4): tap a side and it opens face-on; *Name*, *Sticker* and
// *Window* each land in the middle, ready to drag. A selected decoration has its words, size and letters
// (a name), its shape and how it is made (a window), *Copy* and *Remove*. Every change is one undo step.
import { useEffect, useState } from 'react';
import { detailSel, selectedDetailIds, useStore, useT } from '../../store/store';
import type { Design, Detail } from '../../model/types';
import { findDetail, setText, updateDetail } from '../../model/ops';
import { deleteDetails, duplicateDetails } from '../../model/edit';
import { panelLabel } from '../../model/names';
import { FONTS } from '../../text/fonts';
import { STICKERS } from '../../easy/stickers';
import { minTextSize } from '../../easy/guard';
import { frontWall } from '../../templates/structures/box';
import { PictureChoice } from '../../ui/Pictures';
import { Icon } from '../../ui/icons';
import { fmtNum, type MsgKey } from '../../i18n';
import { SideSheet } from '../SideSheet';
import { AddBar } from '../AddBar';
import { guidedApply, guidedCommit } from '../apply';
import { addName, addSticker, addWindow, canDecorate, type Made, type WindowShape } from '../decorate';
import { boxTrayOf } from '../box';

const note = (key: MsgKey) => useStore.setState({ guidedNote: { key, at: Date.now() } });

function studentName(): string {
  try {
    return localStorage.getItem('cutforge.studentName')?.trim() ?? '';
  } catch {
    return '';
  }
}

/** The side being decorated: the open one, else the box's front, else the first that can be decorated. */
function sideFor(d: Design, solo: string | null): string | null {
  if (solo) return solo;
  const tray = boxTrayOf(d);
  const front = tray ? frontWall(d, tray) : null;
  if (front && !canDecorate(d, front)) return front;
  return d.order.find((id) => !canDecorate(d, id)) ?? null;
}

/** Make a decoration on the side (opening it face-on first), and select it. */
function make(fn: (d: Design, side: string) => Made) {
  const st = useStore.getState();
  const side = sideFor(st.design, st.view === 'solo' ? st.soloPanel : null);
  if (!side) return note('g.deco.tapSide');
  const box: { made: Made } = { made: { why: 'g.deco.tooSmall' } };
  const ok = guidedApply((x) => void (box.made = fn(x as Design, side)));
  const made = box.made;
  if ('why' in made) return note(made.why);
  if (!ok) return;
  if (st.view !== 'solo') useStore.getState().openSolo(side);
  useStore.getState().select(detailSel([made.id]));
}

function TextControls({ dt }: { dt: Detail }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const f = findDetail(d, dt.id);
  if (!f || !dt.text) return null;
  const least = Math.ceil(minTextSize(d, f.panel.id, 'engrave') * 10) / 10;
  const most = Math.max(least + 1, Math.floor(Math.min(f.panel.h * 0.8, 40)));
  return (
    <>
      <label className="field g-text">
        <span>{t('g.deco.text')}</span>
        <input
          value={dt.text.value}
          dir="auto"
          onChange={(e) => useStore.getState().preview((x) => setText(x as Design, dt.id, { value: e.target.value }))}
          onBlur={() => guidedCommit()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          data-testid="g-deco-text"
        />
      </label>
      <label className="g-slider">
        <span>{t('g.deco.size')}</span>
        <input
          type="range"
          min={least}
          max={most}
          step={0.5}
          value={dt.text.size}
          onChange={(e) => useStore.getState().preview((x) => setText(x as Design, dt.id, { size: Number(e.target.value) }))}
          onPointerUp={() => guidedCommit()}
          onKeyUp={() => guidedCommit()}
          data-testid="g-deco-size"
        />
        <b dir="ltr">
          {fmtNum(dt.text.size)} {t('unit.mm')}
        </b>
      </label>
      <div className="g-fonts" role="radiogroup" aria-label={t('g.deco.font')}>
        {FONTS.map((fo) => (
          <button key={fo.id} role="radio" aria-checked={dt.text!.font === fo.id} className={dt.text!.font === fo.id ? 'on' : ''} style={{ fontFamily: `"${fo.name}"` }} onClick={() => guidedApply((x) => setText(x as Design, dt.id, { font: fo.id }))} data-testid={`g-font-${fo.id}`}>
            {dt.text!.value.slice(0, 8) || fo.name}
          </button>
        ))}
      </div>
    </>
  );
}

function WindowControls({ dt }: { dt: Detail }) {
  const t = useT();
  return (
    <PictureChoice<'cut' | 'engrave'>
      label={t('g.deco.how')}
      value={dt.op === 'engrave' ? 'engrave' : 'cut'}
      options={[
        { value: 'cut', label: t('g.deco.cut'), pic: 'open', testId: 'g-deco-op-cut' },
        { value: 'engrave', label: t('g.deco.engrave'), pic: 'footRect', testId: 'g-deco-op-engrave' },
      ]}
      onChange={(op) => guidedApply((x) => updateDetail(x as Design, dt.id, { op }))}
      testId="g-deco-op"
    />
  );
}

export function Decorate() {
  const t = useT();
  const d = useStore((s) => s.design);
  const view = useStore((s) => s.view);
  const solo = useStore((s) => s.soloPanel);
  const sel = useStore((s) => s.selection);
  const [panel, setPanel] = useState<'sticker' | 'window' | null>(null);
  // a tap on a side opens it face-on (a single tap: Guided has no double-click)
  useEffect(() => {
    if (view !== '3d' || sel?.kind !== 'panel' || sel.ids?.length) return;
    const why = canDecorate(d, sel.id);
    useStore.getState().select(null);
    if (why) return note(why);
    useStore.getState().openSolo(sel.id);
  }, [sel, view]);
  const ids = selectedDetailIds(sel);
  const dt = ids.length === 1 ? findDetail(d, ids[0])?.detail : undefined;
  const isText = dt?.shape === 'text';
  const isWindow = dt && (dt.shape === 'circle' || dt.shape === 'rect' || dt.shape === 'roundrect');
  return (
    <>
      <SideSheet>
        <div className="subsection" data-testid="g-deco">
          {view === 'solo' && solo && d.panels[solo] ? (
            <h4 data-testid="g-deco-side">{t('g.deco.side', { part: panelLabel(d, solo, t) })}</h4>
          ) : (
            <p className="note">{t('g.deco.tapSide')}</p>
          )}
          {!dt && view === 'solo' && <p className="note">{t('g.deco.pick')}</p>}
          {dt && isText && <TextControls dt={dt} />}
          {dt && isWindow && <WindowControls dt={dt} />}
          {ids.length > 0 && (
            <div className="g-row">
              <button
                onClick={() => {
                  let copies: string[] = [];
                  guidedApply((x) => void (copies = duplicateDetails(x as Design, ids)));
                  if (copies.length) useStore.getState().select(detailSel(copies));
                }}
                data-testid="g-deco-copy"
              >
                <Icon name="copy" /> {t('g.deco.copy')}
              </button>
              <button
                onClick={() => {
                  guidedApply((x) => deleteDetails(x as Design, ids));
                  useStore.getState().select(null);
                }}
                data-testid="g-deco-remove"
              >
                <Icon name="trash" /> {t('g.deco.remove')}
              </button>
            </div>
          )}
        </div>
        {panel === 'sticker' && (
          <div className="subsection" data-testid="g-stickers">
            <div className="g-objects">
              {STICKERS.map((s) => (
                <button key={s.id} onClick={() => make((x, side) => addSticker(x, side, s.id))} data-testid={`g-sticker-${s.id}`}>
                  <svg viewBox="-0.6 -0.6 1.2 1.2" width={36} height={36} aria-hidden>
                    {s.polys.map((p, i) => (
                      <polygon key={i} points={p.map((q) => `${q.x},${-q.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={0.05} strokeLinejoin="round" />
                    ))}
                  </svg>
                  <span>{t(s.key)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {panel === 'window' && (
          <div className="subsection" data-testid="g-windows">
            <PictureChoice<WindowShape>
              label={t('g.deco.shape')}
              value={null}
              options={(['circle', 'roundrect', 'rect'] as const).map((w) => ({ value: w, label: t(`g.deco.${w}`), pic: w === 'circle' ? 'footRound' : w === 'roundrect' ? 'footRounded' : 'footRect', testId: `g-window-${w}` }))}
              onChange={(w) => make((x, side) => addWindow(x, side, w, 'cut'))}
              testId="g-window"
            />
          </div>
        )}
      </SideSheet>
      <AddBar>
        <button onClick={() => (setPanel(null), make((x, side) => addName(x, side, studentName() || t('g.deco.namePlaceholder'))))} data-testid="g-add-name">
          <Icon name="text" />
          <span>{t('g.deco.name')}</span>
        </button>
        <button className={panel === 'sticker' ? 'on' : ''} aria-pressed={panel === 'sticker'} onClick={() => setPanel(panel === 'sticker' ? null : 'sticker')} data-testid="g-add-sticker">
          <Icon name="sticker" />
          <span>{t('g.deco.sticker')}</span>
        </button>
        <button className={panel === 'window' ? 'on' : ''} aria-pressed={panel === 'window'} onClick={() => setPanel(panel === 'window' ? null : 'window')} data-testid="g-add-window">
          <Icon name="hole" />
          <span>{t('g.deco.window')}</span>
        </button>
      </AddBar>
    </>
  );
}
