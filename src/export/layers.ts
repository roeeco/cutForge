import type { Op } from '../geom/types';

// LightBurn's default layer palette (C00..C29). Each operation uses a
// different palette color so it lands on its own LightBurn layer on import.
//   C00 #000000 black  -> engrave
//   C01 #0000FF blue   -> score
//   C02 #FF0000 red    -> cut
//   C03 #00E000 green  -> guide (labels; set this layer's Output off)
export const LAYERS: Record<Op, { name: string; hex: string; aci: number; lightburn: string }> = {
  cut: { name: 'CUT', hex: '#FF0000', aci: 1, lightburn: 'C02' },
  score: { name: 'SCORE', hex: '#0000FF', aci: 5, lightburn: 'C01' },
  engrave: { name: 'ENGRAVE', hex: '#000000', aci: 7, lightburn: 'C00' },
  guide: { name: 'GUIDE', hex: '#00E000', aci: 3, lightburn: 'C03' },
};
export const OP_ORDER: Op[] = ['engrave', 'score', 'cut', 'guide'];
