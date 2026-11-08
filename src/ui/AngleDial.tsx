// Hinge dial: a full circle around the hinge. The grey bar is the parent
// panel, the needle is the new panel; 90° stands it up, 180° is flat, 270°
// hangs down (see src/model/hinge.ts). The ring is coloured by what can be
// built at each angle. Drag the handle (5° steps, Alt for 1°), click a tick,
// use the arrow keys (Shift for 15°), or click the readout to type a value.
import { useRef, useState } from 'react';
import { norm360, snapHinge, type HingeCheck, type HingeZone } from '../model/hinge';
import type { MsgKey } from '../i18n/en';
import { evalNumber } from './NumField';

const C = 55, R = 40;
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);

function pt(a: number, r = R) {
  const rad = (a * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C - r * Math.sin(rad) };
}

function arcPath(a0: number, a1: number, r = R) {
  const p0 = pt(a0, r), p1 = pt(a1, r);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 0 ${p1.x} ${p1.y}`;
}

/** Runs of equal zone around the ring, in 5° steps. */
function zoneRuns(zoneAt: (a: number) => HingeZone) {
  const runs: { a0: number; a1: number; z: HingeZone }[] = [];
  for (let a = 0; a < 360; a += 5) {
    const z = zoneAt(a + 2.5);
    const last = runs[runs.length - 1];
    if (last && last.z === z) last.a1 = a + 5;
    else runs.push({ a0: a, a1: a + 5, z });
  }
  return runs;
}

export function AngleDial(props: {
  value: number;
  /** `final` is false while dragging. */
  onChange: (a: number, final: boolean) => void;
  zoneAt?: (a: number) => HingeZone;
  /** Why the current angle is a problem, shown under the dial. */
  message?: string;
  label: string;
  testIdPrefix: string;
  title?: string;
  disabled?: boolean;
}) {
  const value = norm360(props.value);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const zoneAt = props.zoneAt ?? (() => 'ok' as HingeZone);
  const zone = zoneAt(value);
  const angleAt = (clientX: number, clientY: number, fine: boolean) => {
    const r = svgRef.current!.getBoundingClientRect();
    const s = 110 / r.width;
    const x = (clientX - r.left) * s - C, y = C - (clientY - r.top) * s;
    return snapHinge((Math.atan2(y, x) * 180) / Math.PI, fine);
  };
  const set = (a: number, final: boolean) => {
    if (props.disabled) return;
    const n = norm360(a);
    if (n !== value || final) props.onChange(n, final);
  };
  const commitTyped = (raw: string) => {
    setTyping(null);
    const v = evalNumber(raw);
    if (v !== null) set(v, true);
  };
  const tip = pt(value, R);
  return (
    <div className="dial" dir="ltr" title={props.title}>
      <svg
        ref={svgRef}
        viewBox="0 0 110 110"
        role="group"
        aria-label={props.label}
        onPointerDown={(e) => {
          if (props.disabled) return;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          const a = angleAt(e.clientX, e.clientY, e.altKey);
          drag.current = a;
          set(a, false);
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const a = angleAt(e.clientX, e.clientY, e.altKey);
          drag.current = a;
          set(a, false);
        }}
        onPointerUp={() => {
          if (drag.current !== null) set(drag.current, true);
          drag.current = null;
        }}
        onKeyDown={(e) => {
          const k = e.shiftKey ? 15 : 5;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(value + k, true);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(value - k, true);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {zoneRuns(zoneAt).map((r) => (
          <path key={r.a0} className={`ring zone-${r.z}`} d={arcPath(r.a0, r.a1)} />
        ))}
        {/* the parent panel, lying from the hinge inwards */}
        <line x1={C} y1={C} x2={C + R - 4} y2={C} className="parent" />
        {TICKS.map((a) => {
          const p = pt(a, R);
          const major = a % 90 === 0;
          const lp = pt(a, R + 11);
          return (
            <g key={a}>
              <circle
                className={`tick ${major ? 'major' : ''}`}
                cx={p.x}
                cy={p.y}
                r={major ? 3 : 1.8}
                role="button"
                aria-label={`${a}°`}
                tabIndex={-1}
                data-testid={`${props.testIdPrefix}${a}`}
                onClick={(e) => {
                  e.stopPropagation();
                  set(a, true);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
              {major && (
                <text className="tick-label" x={lp.x} y={lp.y + 3} textAnchor="middle">
                  {a}
                </text>
              )}
            </g>
          );
        })}
        <line className={`needle zone-${zone}`} x1={C} y1={C} x2={tip.x} y2={tip.y} />
        <circle
          className={`handle zone-${zone}`}
          cx={tip.x}
          cy={tip.y}
          r="6"
          role="slider"
          tabIndex={props.disabled ? -1 : 0}
          aria-label={props.label}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={value}
          aria-valuetext={`${value}°`}
          data-testid={`${props.testIdPrefix}handle`}
        />
        <circle cx={C} cy={C} r="3.5" className="hub" />
      </svg>
      <div className="dial-side">
        {typing === null ? (
          <button type="button" className={`readout zone-${zone}`} onClick={() => !props.disabled && setTyping(String(value))} data-testid={`${props.testIdPrefix}value`}>
            {value}°
          </button>
        ) : (
          <input
            className="readout-input"
            autoFocus
            value={typing}
            aria-label={props.label}
            onChange={(e) => setTyping(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => commitTyped(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitTyped(e.currentTarget.value);
              if (e.key === 'Escape') setTyping(null);
            }}
            data-testid={`${props.testIdPrefix}input`}
          />
        )}
        {props.message && (
          <p className={`dial-msg zone-${zone}`} dir="auto" data-testid={`${props.testIdPrefix}msg`}>
            {props.message}
          </p>
        )}
      </div>
    </div>
  );
}

/** The sentence explaining a hinge check, or nothing when the angle is fine. */
export function hingeText(t: (k: MsgKey) => string, c: HingeCheck): string | undefined {
  switch (c.reason) {
    case 'onPanel':
      return t('hinge.onPanel');
    case 'flat':
      return t('hinge.flat');
    case 'floor':
      return t('hinge.floor');
    case 'outward':
      return t('hinge.outward');
    case 'needsWalls':
      return t('edge.leanNeedsWalls');
    default:
      return undefined;
  }
}
