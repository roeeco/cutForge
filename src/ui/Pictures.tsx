// One question answered with pictures (LIDS_LINES_PROJECTS_PLAN.md §10.1 rule
// 2): a row of at most four choices, each a small line drawing over its name.
// A choice that cannot be made here is greyed but can still be tapped: it then
// says why, and offers the fix when there is one.
import { useState, type CSSProperties, type ReactNode } from 'react';

export type PictureOption<T extends string> = {
  value: T;
  label: string;
  pic: PicName;
  testId?: string;
  /** Why it cannot be made here (greyed); tapping it shows this. */
  why?: string;
  /** A fix for the reason, shown with it. */
  fix?: { label: string; run: () => void };
};

export function PictureChoice<T extends string>(props: { label: string; value: T | null; options: PictureOption<T>[]; onChange: (v: T) => void; testId?: string; children?: ReactNode; /** the section's heading already says it */ hideLabel?: boolean }) {
  const [asked, setAsked] = useState<T | null>(null);
  const why = props.options.find((o) => o.value === asked && o.why);
  return (
    <div className="field pictures-field">
      {!props.hideLabel && <span className="label">{props.label}</span>}
      {/* an explicit column count: auto-fit columns made Chrome size the rows for one column (twice as tall) */}
      <span className={`pictures n${props.options.length}`} style={{ '--n': props.options.length } as CSSProperties} role="radiogroup" aria-label={props.label} data-testid={props.testId}>
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === props.value}
            aria-disabled={!!o.why || undefined}
            className={[o.value === props.value ? 'on' : '', o.why ? 'off' : ''].join(' ').trim()}
            title={o.why ?? o.label}
            onClick={() => {
              if (o.why) return setAsked(asked === o.value ? null : o.value);
              setAsked(null);
              if (o.value !== props.value) props.onChange(o.value);
            }}
            data-testid={o.testId}
          >
            <Pic name={o.pic} />
            <span className="pic-label">{o.label}</span>
          </button>
        ))}
      </span>
      {why && (
        <p className="note warn-text" role="status" data-testid={`${props.testId ?? 'pictures'}-why`}>
          {why.why}
          {why.fix && (
            <>
              {' '}
              <button
                className="link"
                onClick={() => {
                  why.fix!.run();
                  setAsked(null);
                }}
                data-testid={`${props.testId ?? 'pictures'}-fix`}
              >
                {why.fix.label}
              </button>
            </>
          )}
        </p>
      )}
      {props.children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The drawings: a box seen from the front and a little above, in a 40 × 32 box.

const BOX = 'M8 14 L32 14 L32 28 L8 28 Z M32 14 L38 9 L38 23 L32 28 M8 14 L14 9 L38 9';
const PICS = {
  /** An open box: its rim open at the top. */
  open: `${BOX} M11 13 L15 10 L36 10`,
  /** A box with a lid lifted off above it. */
  liftoff: `${BOX} M6 8 L12 3 L40 3 L34 8 Z M6 8 L6 10 L34 10 L34 8 M34 10 L40 5 L40 3 M20 13 L20 11`,
  /** A cap: a shallow tray over the box, its rim down its sides (milestone 79). */
  cap: `${BOX} M6 15 L6 9 L34 9 L34 15 M34 9 L40 4 L40 10 M6 9 L12 4 L40 4`,
  /** A Flat lid: one board on the walls, its tabs showing through (milestone 79). */
  flatLid: `${BOX} M6 12 L32 12 L39 7 L13 7 Z M17 10 L19 10 M27 10 L29 10`,
  /** A Drop-in lid: a board down inside the walls, a finger hole in it (milestone 80). */
  dropinLid: `${BOX} M12 17 L30 17 L35 13 L17 13 Z M23 15 m-1.5 0 a1.5 1 0 1 0 3 0 a1.5 1 0 1 0 -3 0`,
  /** A box with its lid hinged open at the back. */
  hinged: `${BOX} M14 9 L38 9 L35 1 L11 1 Z`,
  /** A box with an arched lid. */
  arched: 'M8 18 L32 18 L32 28 L8 28 Z M32 18 L38 13 L38 23 L32 28 M8 18 Q20 4 32 18 M14 13 Q26 0 38 13',
  /** A box shut with its lid joined on. */
  fixed: `M8 14 L32 14 L32 28 L8 28 Z M32 14 L38 9 L38 23 L32 28 M8 14 L14 9 L38 9 L32 14 M8 14 L8 12 L32 12 L32 14 M32 12 L38 7 L38 9 M8 12 L14 7 L38 7`,
  /** A carton: a tall box, its tuck flap at the top. */
  carton: 'M12 9 L26 9 L26 30 L12 30 Z M26 9 L31 5 L31 26 L26 30 M12 9 L17 5 L31 5 M12 9 L10 3 L24 3 L26 9',
  /** A box with a lid on top (the Box action's *With a lid*). */
  lidded: 'M8 15 L32 15 L32 28 L8 28 Z M32 15 L38 10 L38 23 L32 28 M7 15 L7 11 L33 11 L33 15 Z M33 11 L39 6 L39 10 L33 15 M7 11 L13 6 L39 6',
  /** Footprints, from above. */
  footRect: 'M7 6 L35 6 L35 26 L7 26 Z',
  footRegular: 'M21 3 L33.1 10 L33.1 24 L21 31 L8.9 24 L8.9 10 Z',
  footRounded: 'M13 6 L29 6 Q35 6 35 12 L35 20 Q35 26 29 26 L13 26 Q7 26 7 20 L7 12 Q7 6 13 6 Z',
  footRound: 'M21 4 A12 12 0 1 1 20.99 4 Z',
  /** No lid. */
  none: `${BOX} M11 13 L15 10 L36 10`,
  /** A snap-lock bottom, from below: four flaps that lock in turn. */
  snap: 'M6 4 L34 4 L34 28 L6 28 Z M6 4 L20 16 L34 4 M6 28 L20 16 L34 28 M14 22 L26 22',
  /** A tuck bottom, from below: one flap tucked in under the front. */
  tuck: 'M6 4 L34 4 L34 28 L6 28 Z M6 22 L34 22 M10 22 Q20 30 30 22',
  /** Four flaps glued, from below. */
  flaps: 'M6 4 L34 4 L34 28 L6 28 Z M6 16 L34 16 M20 4 L20 28',
  /** Flap shapes on a board's edge (milestone 112): plain, dust, glue, hang tab. */
  flapPlain: 'M6 18 L36 18 L36 30 L6 30 Z M6 18 L12 8 L30 8 L36 18',
  flapDust: 'M6 18 L36 18 L36 30 L6 30 Z M6 18 L9 5 L33 5 L36 18',
  flapGlue: 'M6 18 L36 18 L36 30 L6 30 Z M6 18 L12 10 L30 10 L36 18 M14 14 L28 14',
  flapHang: 'M6 18 L36 18 L36 30 L6 30 Z M14 18 L14 6 Q14 3 17 3 L25 3 Q28 3 28 6 L28 18 M19 8 A2 2 0 1 0 23 8 A2 2 0 1 0 19 8',
  /** Edge endings (milestone 161): a bare edge; a tuck (square ends, round corners); a fold-over, from the side; a lip where two walls meet. */
  endNone: 'M6 18 L36 18 L36 30 L6 30 Z M6 18 L36 18',
  flapTuck: 'M6 18 L36 18 L36 30 L6 30 Z M8 18 L8 9 Q8 6 11 6 L31 6 Q34 6 34 9 L34 18',
  foldOver: 'M6 30 L36 30 M17 30 L17 9 Q17 4 21 4 Q25 4 25 9 L25 26',
  lip: 'M4 12 L22 12 L22 30 L4 30 Z M22 12 L36 6 L36 24 L22 30 M22 14 L17 15.5 L17 27 L22 28',
} as const;

export type PicName = keyof typeof PICS;

export function Pic({ name, size = 40 }: { name: PicName; size?: number }) {
  return (
    <svg className="pic" viewBox="0 0 42 32" width={size} height={(size * 32) / 42} aria-hidden>
      <path d={PICS[name]} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
