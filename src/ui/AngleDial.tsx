// Angle dial: the parent panel is the base line, the needle is the new panel.
// Drag anywhere on it (snaps to the allowed angles) or click a detent. It is
// a radiogroup, so arrow keys step between the detents.
import { useRef } from 'react';
import { ANGLES } from '../model/materials';

const PX = 10, PY = 54, R = 44;

function pt(a: number, r = R) {
  const rad = (a * Math.PI) / 180;
  return { x: PX + r * Math.cos(rad), y: PY - r * Math.sin(rad) };
}

export function AngleDial(props: { value: number; onChange: (a: number) => void; label: string; testIdPrefix: string; title?: string; disabled?: boolean }) {
  const { value } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const angles: number[] = [...ANGLES].sort((a, b) => a - b);
  const pick = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const sx = 96 / r.width;
    const x = (clientX - r.left) * sx - PX, y = PY - (clientY - r.top) * sx;
    const a = (Math.atan2(Math.max(0, y), x) * 180) / Math.PI;
    const best = angles.reduce((b, c) => (Math.abs(c - a) < Math.abs(b - a) ? c : b), angles[0]);
    if (best !== value) props.onChange(best);
  };
  const step = (dir: 1 | -1) => {
    const i = angles.indexOf(value);
    const n = angles[Math.max(0, Math.min(angles.length - 1, (i < 0 ? 0 : i) + dir))];
    if (n !== value) props.onChange(n);
  };
  const tip = pt(value, R + 2);
  const arcEnd = pt(90), arcStart = pt(0);
  const valEnd = pt(value);
  return (
    <div className="dial" dir="ltr" title={props.title}>
      <svg
        ref={svgRef}
        viewBox="0 0 96 60"
        role="radiogroup"
        aria-label={props.label}
        onPointerDown={(e) => {
          if (props.disabled) return;
          dragging.current = true;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          pick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && pick(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') step(1);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') step(-1);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <line x1={PX} y1={PY} x2={PX + R + 8} y2={PY} stroke="var(--ink-muted)" strokeWidth="4" strokeLinecap="round" />
        <path className="arc" d={`M ${arcStart.x} ${arcStart.y} A ${R} ${R} 0 0 0 ${arcEnd.x} ${arcEnd.y}`} />
        <path className="arc-on" d={`M ${arcStart.x} ${arcStart.y} A ${R} ${R} 0 0 0 ${valEnd.x} ${valEnd.y}`} />
        <line className="needle" x1={PX} y1={PY} x2={tip.x} y2={tip.y} strokeWidth="4" stroke="var(--accent-bright)" />
        {angles.map((a) => {
          const p = pt(a);
          const lp = pt(a, R + 11);
          return (
            <g key={a}>
              <circle
                className="tick"
                cx={p.x}
                cy={p.y}
                r={a === value ? 5.5 : 4.5}
                role="radio"
                aria-checked={a === value}
                aria-label={`${a}°`}
                tabIndex={a === value ? 0 : -1}
                data-testid={`${props.testIdPrefix}${a}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!props.disabled && a !== value) props.onChange(a);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <text className="tick-label" x={lp.x} y={lp.y + 3} textAnchor="middle">
                {a}
              </text>
            </g>
          );
        })}
        <circle cx={PX} cy={PY} r="3.5" fill="var(--ink)" />
      </svg>
      <span className="readout">{value}°</span>
    </div>
  );
}
