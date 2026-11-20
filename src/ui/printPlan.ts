// *Print a plan* (milestone 90; moved out of the download dialog in milestone 109 so Guided's Send can print
// without loading the dialog): the pieces at a stated scale, on A4 or Letter, in the browser's print window.
import type { Design } from '../model/types';
import { specHtml, specPages, type Paper, type SpecText } from '../export/spec';
import { panelLabel } from '../model/names';
import { assemblySteps } from '../model/assembly';
import { pieceCopies } from '../model/pack';
import { fmtNum, type MsgKey } from '../i18n';
import type { Lang } from '../i18n';

type T = (k: MsgKey, v?: Record<string, string | number>) => string;

/** The words a printed plan uses, in the interface's language. */
export function specText(d: Design, t: T, lang: Lang): SpecText {
  return {
    title: d.name || t('top.untitled'),
    date: new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB'),
    material: t(d.material.nameKey as 'mat.ply3'),
    blank: t('spec.blank'),
    pieces: t('spec.pieces'),
    glue: t('spec.glue'),
    kerf: t('spec.kerf', { k: fmtNum(d.material.kerf, 2) }),
    scale: t('spec.scale'),
    legend: { cut: t('ann.legend.cut'), score: t('ann.legend.score'), engrave: t('ann.legend.engrave'), guide: t('ann.legend.guide') },
    glueWord: t('ann.glue'),
    unit: t('unit.mm'),
    name: (id) => panelLabel(d, id, t),
    // a made model (milestone 131): its seams in order, on each piece's page
    seams: (pieceKey) => {
      const steps = assemblySteps(d);
      if (!steps.length) return null;
      const here = new Set(pieceCopies(d).find((c) => c.pieceKey === pieceKey)?.panels.map((n) => n.panelId) ?? []);
      const mine = steps.filter((s) => here.has(s.a) || here.has(s.b));
      return mine.length ? t('spec.seams', { list: mine.map((s) => `${s.n} ${t(`make.step.${s.kind === 'lock' ? 'lock' : s.kind === 'tabslot' ? 'tabs' : s.kind === 'finger' ? 'fingers' : 'glue'}`)}`).join(' · ') }) : null;
    },
  };
}

/** Open the plan in a print window. */
export function printPlan(d: Design, paper: Paper, t: T, lang: Lang) {
  const pages = specPages(d, paper, specText(d, t, lang));
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(specHtml(pages, paper, d.name || 'CutForge', lang === 'he' ? 'rtl' : 'ltr'));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
