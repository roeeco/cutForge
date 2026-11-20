// Guided's shell (milestone 105, GUIDED_MODE.md §3.2): its top bar, the one stage, a side sheet, an add
// bar, the mission card and its view buttons. Loaded as its own chunk; Workshop and Quick build never
// import anything from src/guided/.
import { lazy, Suspense, useEffect } from 'react';
import { useStore } from '../store/store';
import { requestCamera } from '../tour/stage';
import { View3D } from '../views/View3D';
import { EditorBoundary } from '../ui/ErrorBoundary';
import { MissionPanel } from '../easy/InsideUI';
import { GuidedTopBar } from './GuidedTopBar';
import { GuidedLayer } from './GuidedLayer';
import { ViewButtons } from './ViewButtons';
import { guidedCamera } from './camera';
import { GuidedStart } from './GuidedStart';
import { Build } from './steps/Build';
import { Decorate } from './steps/Decorate';
import { Send } from './steps/Send';
import { GuidedNote } from './GuidedNote';
import { boxSize } from '../model/boxSize';
import { mainTray } from '../templates/structures/box';

// the same lazy chunk as the rest of the app's cut plan and face-on view
const Plan2D = lazy(() => import('../views/Plan2D').then((m) => ({ default: m.Plan2D })));

/** A key that changes when the thing is replaced or changes size: the opening view frames it again. */
function frameKey(s: ReturnType<typeof useStore.getState>): string {
  const d = s.design;
  const tray = mainTray(d);
  const b = tray ? boxSize(d, tray, 'outside') : null;
  return `${d.id}:${b ? `${Math.round(b.w)}x${Math.round(b.d)}x${Math.round(b.h)}` : d.order.length}`;
}

export function GuidedApp() {
  const view = useStore((s) => s.view);
  const soloPanel = useStore((s) => s.soloPanel);
  const soloExists = useStore((s) => !!(s.soloPanel && s.design.panels[s.soloPanel]));
  const needsMaterial = useStore((s) => s.needsMaterial);
  const step = useStore((s) => s.guidedStep);
  const key = useStore(frameKey);
  // the opening view: seen from above and in front, re-centred when the thing changes size
  // (and when the stage comes back from the sheet or the face-on view)
  useEffect(() => {
    if (needsMaterial || view !== '3d') return;
    requestCamera(...guidedCamera(useStore.getState().design));
  }, [key, needsMaterial, view]);
  return (
    <>
      <GuidedTopBar />
      <div className="main g-main" data-testid="guided">
        <EditorBoundary>
          <main className="viewport">
            {view === 'solo' && soloPanel && soloExists ? (
              <Suspense fallback={<div className="loading" aria-busy="true" />}>
                <Plan2D key={soloPanel} soloPanel={soloPanel} />
              </Suspense>
            ) : view === '2d' ? (
              <Suspense fallback={<div className="loading" aria-busy="true" />}>
                <Plan2D />
              </Suspense>
            ) : (
              <View3D layer={<GuidedLayer />} />
            )}
          </main>
          {step === 'build' ? (
            <Build />
          ) : step === 'decorate' ? (
            <Decorate />
          ) : (
            <Send />
          )}
          {view === '3d' && <ViewButtons />}
          <GuidedNote />
          {view === '3d' && <MissionPanel />}
        </EditorBoundary>
      </div>
      {needsMaterial && <GuidedStart />}
    </>
  );
}
