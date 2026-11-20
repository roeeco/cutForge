// The SVG illustration prototype beside today's WebGL thumbnail (development only: `?illustrate`), for four
// presets in each material that makes them.
import { useMemo } from 'react';
import { MATERIALS } from '../model/materials';
import type { Design, MaterialProfile } from '../model/types';
import { defaults, templateById } from '../templates/registry';
import { builtFor } from '../templates/structures/box';
import { chooseStyle, styleById, styleListed } from '../templates/styles';
import { missionById, startMission } from '../easy/missions';
import { renderThumbnail } from '../views/thumbnail';
import { illustrateDesign, type Prop } from '../views/illustrate';

type Row = { name: string; prop?: Prop; make: (m: MaterialProfile) => Design | null };

const BOX = defaults(templateById('box')!);
const style = (id: string) => (m: MaterialProfile) => {
  const s = styleById(id)!;
  if (!styleListed(s, m, BOX, templateById)) return null;
  const r = chooseStyle(s, m, BOX, templateById);
  return r ? builtFor(templateById(r.id)!, m, r.params) : null;
};
const mission = (id: string) => (m: MaterialProfile) => {
  const ms = missionById(id)!;
  return ms.materials.includes(m.kind) ? startMission(ms, m) : null;
};

const ROWS: Row[] = [
  { name: 'Open tray', prop: 'sweets', make: style('openTray') },
  { name: 'Pencil box (mission)', prop: 'pencils', make: mission('pencil-box') },
  { name: 'Reverse tuck end', make: style('rte') },
  { name: 'Dice tray (mission)', prop: 'dice', make: mission('dice-tray') },
  { name: 'Tray + lid', make: style('trayLid') },
  { name: 'Hinged-lid tray', make: style('hingedTray') },
  { name: 'Game organiser (mission)', make: mission('game-organiser') },
  { name: 'Round box (Guided)', make: (m) => builtFor(templateById('box')!, m, { ...BOX, width: 100, depth: 100, shape: 'round' }) },
];
const MATS = ['ply-3', 'card-0.5', 'corr-4'].map((id) => MATERIALS.find((m) => m.id === id)!);

function Cell({ row, m }: { row: Row; m: MaterialProfile }) {
  const pics = useMemo(() => {
    let d: Design | null = null;
    try {
      d = row.make(m);
    } catch {
      d = null;
    }
    if (!d) return null;
    const t0 = performance.now();
    const svg = illustrateDesign(d, 300, 210, { prop: row.prop });
    const ms = performance.now() - t0;
    return { old: renderThumbnail(d, 300, 210), svg, ms };
  }, [row, m]);
  if (!pics) return <td className="none">—</td>;
  return (
    <td>
      <div className="pair">
        <figure>
          {pics.old && <img src={pics.old} alt="" />}
          <figcaption>{'now (WebGL)'}</figcaption>
        </figure>
        <figure>
          {pics.svg && <img src={pics.svg} alt="" data-testid="illus" />}
          <figcaption>SVG · {pics.ms.toFixed(0)} ms</figcaption>
        </figure>
      </div>
    </td>
  );
}

export function IllustrateDev() {
  return (
    <div className="illus-dev">
      <style>{`
        .illus-dev { padding: 20px; font: 14px system-ui; background: #f7f2ea; min-height: 100vh; overflow: auto; }
        .illus-dev table { border-collapse: separate; border-spacing: 10px; }
        .illus-dev th { text-align: start; font-weight: 600; }
        .illus-dev td { background: #fff; border-radius: 12px; padding: 8px; vertical-align: top; }
        .illus-dev .pair { display: flex; gap: 8px; }
        .illus-dev figure { margin: 0; background: #eceef1; border-radius: 8px; }
        .illus-dev img { width: 300px; height: 210px; display: block; }
        .illus-dev figcaption { font-size: 11px; color: #6e655b; padding: 2px 6px 4px; }
        .illus-dev .none { color: #9b9186; text-align: center; }
      `}</style>
      <table>
        <thead>
          <tr>
            <th />
            {MATS.map((m) => (
              <th key={m.id}>{m.id}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.name}>
              <th>{r.name}</th>
              {MATS.map((m) => (
                <Cell key={m.id} row={r} m={m} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
