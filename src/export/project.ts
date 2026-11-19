// Cut the whole project (milestone 87, LIDS_LINES_PROJECTS_PLAN.md §7.2): the
// designs of one material share sheets, each piece named with its design on
// the GUIDE layer (the teacher's batch does the same for a class); a project
// of several materials gets one batch per material.
import type { Design } from '../model/types';
import { batchExport, sameMaterial, type BatchResult } from './batch';
import type { KerfMode } from './prepare';

export function projectBatches(designs: Design[], kerfMode: KerfMode = 'nominal'): { material: Design['material']; designs: Design[]; result: BatchResult }[] {
  const groups: Design[][] = [];
  for (const d of designs) {
    const g = groups.find((x) => sameMaterial(x[0], d));
    if (g) g.push(d);
    else groups.push([d]);
  }
  return groups.map((g) => ({ material: g[0].material, designs: g, result: batchExport(g.map((d) => ({ design: d, label: d.name || d.id, id: d.id })), kerfMode) }));
}
