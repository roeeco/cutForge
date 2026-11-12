// The assembly steps (WAFFLE_MODE.md §6.7): the plate, the A slices one at a
// time standing in place, then the B slices one at a time dropped from above.
import type { WaffleModel } from './derive';
import type { Finished } from './finish';

export type Step = { kind: 'plate' } | { kind: 'a'; sliceId: string; label: string } | { kind: 'b'; sliceId: string; label: string; over: string };

/** "A1–A4" for consecutive labels, else "A1, A3". */
export function labelRange(labels: string[]): string {
  if (!labels.length) return '';
  const nums = labels.map((l) => Number(l.slice(1))).sort((a, b) => a - b);
  const p = labels[0][0];
  const run = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  return run && nums.length > 1 ? `${p}${nums[0]}–${p}${nums[nums.length - 1]}` : nums.map((n) => `${p}${n}`).join(', ');
}

export function assemblySteps(m: WaffleModel, f: Finished): Step[] {
  const out: Step[] = [];
  if (f.plate) out.push({ kind: 'plate' });
  const has = (fam: 'a' | 'b', id: string) => f.parts.some((p) => p.fam === fam && p.sliceId === id);
  for (const s of m.slices) if (s.fam === 'a' && has('a', s.id)) out.push({ kind: 'a', sliceId: s.id, label: s.label });
  for (const s of m.slices) {
    if (s.fam !== 'b' || !has('b', s.id)) continue;
    const over = [...new Set(f.crossings.filter((c) => c.b === s.id && c.aParts.length).map((c) => m.slices.find((x) => x.fam === 'a' && x.id === c.a)?.label ?? ''))].filter(Boolean);
    out.push({ kind: 'b', sliceId: s.id, label: s.label, over: labelRange(over) });
  }
  return out;
}
