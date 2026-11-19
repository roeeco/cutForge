// Pictures of Build's gestures (milestone 107, GUIDED_MODE.md G4): pull an arrow, slide a divider, drag to
// look around. Short loops in SVG and CSS, shown the first time Build opens and again from the add bar's
// **?**; a still picture when the browser asks for less motion.
import { useState } from 'react';
import { useT } from '../store/store';
import { Icon } from '../ui/icons';

const SEEN = 'cutforge.guidedDemo';
export function demoSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === '1';
  } catch {
    return true;
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN, '1');
  } catch {
    /* storage unavailable */
  }
}

const BOX = 'M14 30 L54 30 L54 52 L14 52 Z M14 30 L24 22 L64 22 L54 30 M54 52 L64 44 L64 22';

function Loop({ kind }: { kind: 'pull' | 'slide' | 'look' }) {
  return (
    <svg viewBox="0 0 80 64" className={`g-demo-pic g-demo-${kind}`} aria-hidden>
      <g className="g-demo-move">
        <path d={BOX} fill="#f3e3c7" stroke="#9a7a4f" strokeWidth="1.5" strokeLinejoin="round" />
        {kind === 'slide' && <path className="g-demo-divider" d="M34 30 L44 22 M34 30 L34 52" stroke="#9a7a4f" strokeWidth="2" />}
      </g>
      {kind === 'pull' && <path className="g-demo-arrow" d="M58 38 l8 0 m-3 -3 l3 3 l-3 3" stroke="#1fb8ac" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
      {kind === 'look' && <path className="g-demo-arc" d="M18 58 Q40 64 62 58 m-4 -3 l4 3 l-4 3" stroke="#1fb8ac" strokeWidth="2" fill="none" strokeLinecap="round" />}
      <circle className={`g-demo-finger g-demo-finger-${kind}`} cx={kind === 'pull' ? 60 : kind === 'slide' ? 39 : 30} cy={kind === 'look' ? 58 : kind === 'slide' ? 24 : 38} r="4" fill="#15706b" opacity="0.8" />
    </svg>
  );
}

export function Demo({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div className="g-demo card" role="dialog" aria-label={t('g.demo.title')} data-testid="g-demo">
      <div className="g-demo-row">
        {(['pull', 'slide', 'look'] as const).map((k) => (
          <figure key={k}>
            <Loop kind={k} />
            <figcaption>{t(`g.demo.${k}`)}</figcaption>
          </figure>
        ))}
      </div>
      <button
        className="primary"
        onClick={() => {
          markSeen();
          onClose();
        }}
        data-testid="g-demo-ok"
      >
        {t('g.demo.ok')}
      </button>
    </div>
  );
}

/** The add bar's **?**: show the pictures again. */
export function DemoButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button className="g-help" onClick={onClick} aria-label={t('g.demo.replay')} title={t('g.demo.replay')} data-testid="g-demo-replay">
      <Icon name="play" />
      <span>{t('g.demo.replayShort')}</span>
    </button>
  );
}

export function useDemo(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(() => !demoSeen());
  return [open, setOpen];
}
