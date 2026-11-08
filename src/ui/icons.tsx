// Inline SVG icon set: 24px grid, 1.75px round strokes, currentColor.
import type { ReactElement } from 'react';
import type { ConnectionKind } from '../model/types';

const P: Record<string, ReactElement> = {
  select: <path d="M5 3.5 18.5 12l-6 1.6 3.4 6.4-2.6 1.3-3.3-6.4L5 19z" fill="currentColor" stroke="none" />,
  panel: (
    <>
      <path d="M3 15.5 9.5 8h11.5L14.5 15.5z" />
      <path d="M3 15.5v2h11.5l6.5-7.5V8" />
      <path d="M14.5 15.5v2" />
    </>
  ),
  rect: <rect x="4" y="6" width="16" height="12" rx="1" />,
  roundrect: <rect x="4" y="6" width="16" height="12" rx="4" />,
  circle: <circle cx="12" cy="12" r="7.5" />,
  polygon: <path d="M12 3.5 20 9.3 17 19h-10L4 9.3Z" />,
  through: <path d="M4 8h16M4 16h16M9 4l-2 16M17 4l-2 16" />,
  text: <path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />,
  import: <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 14.5V19h15v-4.5" />,
  undo: <path d="M9 7 4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2" />,
  redo: <path d="M15 7l4.5 4.5L15 16M19 11.5h-9a5 5 0 0 0 0 10h2" />,
  chevDown: <path d="m6 9 6 6 6-6" />,
  chevRight: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  flip: (
    <>
      <path d="M7 4v13M3.5 13.5 7 17l3.5-3.5" />
      <path d="M17 20V7M13.5 10.5 17 7l3.5 3.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  fit: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  persp: (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>
  ),
  ortho: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 12h16M12 4v16" />
    </>
  ),
  saved: <path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9a4 4 0 0 1 0 8M9.5 14l2 2 3.5-3.5" />,
  saving: <path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9a4 4 0 0 1 0 8M12 12v5" />,
  alert: <path d="M12 4 21 19.5H3zM12 10v4.5M12 17.2v.3" />,
  repack: (
    <>
      <rect x="3.5" y="4" width="8" height="7" rx="1" />
      <rect x="13" y="4" width="7.5" height="4.5" rx="1" />
      <rect x="3.5" y="13" width="5.5" height="7" rx="1" />
      <rect x="11" y="10.5" width="9.5" height="9.5" rx="1" />
    </>
  ),
  solo: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
      <path d="M9 12h6M12 9v6" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="1.5" />
      <path d="M5 15V6a1 1 0 0 1 1-1h9" />
    </>
  ),
  file: <path d="M6 3.5h8l4 4v13H6zM14 3.5V8h4" />,
  open: <path d="M3.5 7V5h6l2 2h9v12h-17zM3.5 10h17" />,
  save: <path d="M5 4h11.5L19 6.5V20H5zM8 4v5h7V4M8 20v-6h8v6" />,
  teacher: <path d="M3 9 12 5l9 4-9 4zM7 11v5c3 2 7 2 10 0v-5M21 9v5" />,
  grow: <path d="M12 19V7M7 11l5-5 5 5M5 21h14" />,
  play: <path d="M8 5.5v13l10-6.5z" />,
  ruler: <path d="M3.5 15.5 15.5 3.5l5 5-12 12zM7 12l2 2M10 9l2 2M13 6l2 2" />,
  material: (
    <>
      <path d="M3 9.5 12 5l9 4.5-9 4.5z" />
      <path d="M3 13.5 12 18l9-4.5M3 9.5v4M21 9.5v4" />
    </>
  ),
  'align-left': <path d="M4 4v16M8 7h10M8 12h6M8 17h12" />,
  'align-hcenter': <path d="M12 4v16M6 7h12M8 12h8M5 17h14" />,
  'align-right': <path d="M20 4v16M6 7h10M10 12h6M4 17h12" />,
  'align-top': <path d="M4 4h16M7 8v10M12 8v6M17 8v12" />,
  'align-vcenter': <path d="M4 12h16M7 6v12M12 8v8M17 5v14" />,
  'align-bottom': <path d="M4 20h16M7 6v10M12 10v6M17 4v12" />,
  // joint kinds
  finger: <path d="M3 8h4v4h4V8h4v4h4V8h2M3 16h18" />,
  tabslot: <path d="M3 9h5v-3h5v3h8M3 15h5v3h5v-3h8" />,
  fold: <path d="M4 18 12 6l8 12M12 6v0" strokeDasharray="2.2 2.2" />,
  glue: <path d="M4 7h16v4H4zM6 11l2 6h8l2-6" />,
  halflap: <path d="M4 12h6V6h4v6h6M10 18v-4h4v4" />,
  lean: <path d="M4 19h16M6 19 16 6M14.5 19V9" />,
  slide: <path d="M4 16h16M8 16V6M12 10l4 0M14 8l2 2-2 2" />,
  butt: <path d="M4 12h7M13 12h7M12 6v12" />,
};

export function Icon({ name, size }: { name: string; size?: number }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden width={size} height={size} style={size ? { width: size, height: size } : undefined}>
      {P[name] ?? P.select}
    </svg>
  );
}

export const jointIcon = (k: ConnectionKind) => k;

/** CutForge mark: a panel with a finger-jointed edge. */
export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor" />
      <path d="M9 23V9h14v5h-3v4h3v5H9z" fill="none" stroke="white" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M13 13h3" stroke="#7fe0d6" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
