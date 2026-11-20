// The files an export writes (milestone 36; moved here in milestone 109 so Guided can download directly).
import type { Design } from '../model/types';
import { prepareExport, type KerfMode, type Prepared } from './prepare';
import { sheetToSvg, sheetsToSvg } from './svg';
import { downloadText, safeName } from '../ui/download';
import { fmtNum } from '../i18n';

/** One file per material, named by the material (and its kerf). */
export function exportFiles(name: string, p: Prepared, mode: KerfMode): { base: string; mat: string; sheets: Prepared['sheets'] }[] {
  return p.materials.map((m) => ({ base: `${safeName(name)}-${m.mat}-${mode}-kerf${fmtNum(m.profile.kerf, 2)}mm`, mat: m.mat, sheets: m.sheets }));
}

/** The SVG files of a design at nominal size (what the download dialog writes by default): name and contents. */
export function nominalSvgs(d: Design, kiss: { kissUp: string; kissUpShort: string }): { name: string; svg: string }[] {
  const p = prepareExport(d, 'nominal', kiss);
  return exportFiles(d.name || 'cutforge', p, 'nominal').map((f) => ({ name: `${f.base}.svg`, svg: f.sheets.length === 1 ? sheetToSvg(f.sheets[0]) : sheetsToSvg(f.sheets) }));
}

/** Download them (Guided's *Download the file*, milestone 109). */
export function downloadNominalSvg(d: Design, kiss: { kissUp: string; kissUpShort: string }) {
  for (const f of nominalSvgs(d, kiss)) downloadText(f.name, f.svg, 'image/svg+xml');
}
