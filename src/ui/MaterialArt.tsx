// Small isometric drawings of a sheet corner for each material, showing its layers.
import type { MaterialKind } from '../model/types';

export function MaterialArt({ kind, thickness }: { kind: MaterialKind; thickness: number }) {
  const th = kind === 'card' ? 5 : kind === 'plywood' ? 11 : thickness > 3 ? 18 : 9;
  const A = [14, 52], B = [104, 18], C = [190, 50], D = [96, 86];
  const top = kind === 'plywood' ? '#e9d3ab' : kind === 'corrugated' ? '#cfa673' : '#ebe5d9';
  const side = kind === 'plywood' ? '#cfae7c' : kind === 'corrugated' ? '#b98d57' : '#d8cfbe';
  const sideR = kind === 'plywood' ? '#c19f6c' : kind === 'corrugated' ? '#a97f4c' : '#cbc1ae';
  const q = (pts: number[][]) => pts.map((p) => p.join(',')).join(' ');
  const left = [A, D, [D[0], D[1] + th], [A[0], A[1] + th]];
  const right = [D, C, [C[0], C[1] + th], [D[0], D[1] + th]];
  // layer lines along the edges
  const layers: number[] = kind === 'plywood' ? [th / 3, (2 * th) / 3] : kind === 'card' ? [th / 2] : [1.6, th - 1.6];
  const flutes: string[] = [];
  if (kind === 'corrugated') {
    const n = thickness > 3 ? 7 : 11;
    for (const [P0, P1] of [[A, D], [D, C]]) {
      let d = '';
      for (let i = 0; i <= n * 4; i++) {
        const f = i / (n * 4);
        const x = P0[0] + (P1[0] - P0[0]) * f, y = P0[1] + (P1[1] - P0[1]) * f;
        const w = (Math.sin(f * n * Math.PI * 2) * (th - 4)) / 2 + th / 2;
        d += `${i ? 'L' : 'M'}${x.toFixed(1)},${(y + w).toFixed(1)}`;
      }
      flutes.push(d);
    }
  }
  const grain = kind === 'plywood' ? [0.2, 0.35, 0.52, 0.7, 0.84] : [];
  return (
    <svg viewBox="0 0 204 112" aria-hidden>
      <defs>
        <linearGradient id={`g-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={top} stopOpacity="1" />
          <stop offset="1" stopColor={side} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <ellipse cx="104" cy="98" rx="92" ry="9" fill="rgba(60,40,10,0.08)" />
      <polygon points={q(left)} fill={side} />
      <polygon points={q(right)} fill={sideR} />
      {layers.map((o, i) => (
        <g key={i} stroke="rgba(255,255,255,0.45)" strokeWidth="1" fill="none">
          <polyline points={q([[A[0], A[1] + o], [D[0], D[1] + o], [C[0], C[1] + o]])} />
        </g>
      ))}
      {flutes.map((d, i) => (
        <path key={i} d={d} stroke="#8b6638" strokeWidth="1.3" fill="none" opacity="0.8" />
      ))}
      <polygon points={q([A, B, C, D])} fill={`url(#g-${kind})`} />
      {grain.map((f, i) => (
        <path
          key={i}
          d={`M${A[0] + (D[0] - A[0]) * f + (B[0] - A[0]) * 0.08},${A[1] + (D[1] - A[1]) * f + (B[1] - A[1]) * 0.08} q ${30 + i * 4},${-12 - i} ${80 + i * 3},${-24 - i * 2}`}
          stroke="#c9a46f"
          strokeOpacity="0.45"
          strokeWidth="1.1"
          fill="none"
        />
      ))}
      {kind === 'corrugated' && <polygon points={q([A, B, C, D])} fill="none" stroke="#b98d57" strokeOpacity="0.3" />}
      <polyline points={q([A, D, C])} stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
