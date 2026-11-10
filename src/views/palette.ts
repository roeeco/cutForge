// 3D and cut-plan colours for parts. Each material has a face colour and a
// darker cut-edge colour; each part gets a small, deterministic shift in
// lightness and hue (by creation order) so neighbouring parts never merge
// into one shape, and the cut plan uses the same tint for the same part.
import * as THREE from 'three';
import type { Design, MaterialKind, MaterialProfile } from '../model/types';
import { matOf } from '../model/materials';

export const MATERIAL_COLORS: Record<MaterialKind, { face: string; edge: string; sheet: string }> = {
  plywood: { face: '#e2c9a0', edge: '#b98f58', sheet: '#f4e8d3' },
  corrugated: { face: '#cfa875', edge: '#a17646', sheet: '#ecdcc1' },
  card: { face: '#ede6d8', edge: '#c7bca6', sheet: '#f5f1e9' },
};

export const STAGE = { bg: '#eef1f5', gridMinor: '#dfe4eb', gridMajor: '#c9d1dc', outline: '#3a3530', selected: '#1fb8ac', hover: '#5fd3c9', ghost: '#13897f', ghostEdge: '#0b4f4a', ghostOpacity: 0.5, blocked: '#f0a020' };

function jitter(index: number): { dl: number; dh: number } {
  // golden-ratio sequence: consecutive parts land far apart
  const a = (index * 0.6180339887) % 1;
  const b = (index * 0.7548776662 + 0.3) % 1;
  return { dl: (a * 2 - 1) * 0.06, dh: (b * 2 - 1) * 0.011 };
}

function shift(hex: string, index: number, extraL = 0): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const { dl, dh } = jitter(index);
  return new THREE.Color().setHSL((hsl.h + dh + 1) % 1, hsl.s, Math.min(0.97, Math.max(0.05, hsl.l + dl + extraL)));
}

export function partColors(kind: MaterialKind, index: number, lift = 0): { face: THREE.Color; edge: THREE.Color } {
  const m = MATERIAL_COLORS[kind];
  return { face: shift(m.face, index, lift), edge: shift(m.edge, index, lift * 0.6) };
}

/** CSS colour of a part's tint (cut plan). */
export function partTintCss(kind: MaterialKind, index: number): string {
  return '#' + partColors(kind, index).face.getHexString();
}

/**
 * A board's colours in its own material (milestone 36): its material kind's
 * look, a shade darker for each further thickness of that kind in the design,
 * so two plywoods can be told apart.
 */
export function boardColors(d: Design, panelId: string, index: number, lift = 0): { face: THREE.Color; edge: THREE.Color } {
  const m = matOf(d, panelId);
  return partColors(m.kind, index, lift - 0.06 * thicknessRank(d, m));
}

/** CSS tint of a board (cut plan), in its own material. */
export function boardTintCss(d: Design, panelId: string, index: number): string {
  return '#' + boardColors(d, panelId, index).face.getHexString();
}

/** The rank of a material's thickness among the design's materials of its kind (0: the thinnest). */
export function thicknessRank(d: Design, m: MaterialProfile): number {
  if (!d.materials) return 0;
  const ts = [...new Set([d.material, ...Object.values(d.materials)].filter((x) => x.kind === m.kind).map((x) => x.thickness))].sort((a, b) => a - b);
  return Math.max(0, ts.indexOf(m.thickness));
}
