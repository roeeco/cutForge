// The Net view (milestone 113, DIELINE_DNA_PLAN.md D1): the cut plan's nets
// one beside another, picked edge by edge, with the folded model beside them.
// The preview orbits and folds and edits nothing; it can be turned off (per
// browser), and under 1200 px wide it is shown in place of the net on request (900 until the exploratory test
// report: the card now floats over the nets beside the preview, and below 1200 it left the nets too little room).
import { useEffect, useState } from 'react';
import { useStore, useT } from '../store/store';
import { Plan2D } from './Plan2D';
import { View3D } from './View3D';

function useWide(px: number): boolean {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(`(min-width: ${px}px)`) : null;
  const [w, setW] = useState(q ? q.matches : true);
  useEffect(() => {
    if (!q) return;
    const f = () => setW(q.matches);
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, [q]);
  return w;
}

export function NetView() {
  const t = useT();
  const want = useStore((s) => s.viewPrefs.netPreview !== false);
  const wide = useWide(1200);
  // narrow: the preview in place of the net, on request
  const [swap, setSwap] = useState(false);
  const toggle = wide ? (
    <button className={want ? 'on' : ''} aria-pressed={want} onClick={() => useStore.getState().setPrefs({ netPreview: want ? false : undefined })} data-testid="net-preview-toggle">
      {t('net.preview')}
    </button>
  ) : (
    <button onClick={() => setSwap((x) => !x)} data-testid="net-preview-toggle">
      {swap ? t('net.showNet') : t('net.showPreview')}
    </button>
  );
  if (!wide && swap)
    return (
      <div className="net-view narrow" data-testid="net-view">
        <div className="net-preview full" data-testid="net-preview">
          <View3D preview />
        </div>
        <div className="net-swap">{toggle}</div>
      </div>
    );
  return (
    <div className="net-view" data-testid="net-view">
      <div className="net-plan">
        <Plan2D mode="net" dockExtra={toggle} />
      </div>
      {wide && want && (
        <div className="net-preview" data-testid="net-preview" aria-label={t('net.preview')}>
          <View3D preview />
        </div>
      )}
    </div>
  );
}
