import { openFromLibrary } from './ui/Library';
import { saveLocal } from './store/persist';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore, useT } from './store/store';
import { useAutosave, useKeyboard } from './store/hooks';
import { TopBar } from './ui/TopBar';
import { Toolbar } from './ui/Toolbar';
import { Inspector } from './ui/Inspector';
import { StartScreen } from './ui/StartScreen';
import { MaterialDrawer } from './ui/MaterialDrawer';
import { TourNudge } from './tour/TourNudge';
import { TourOverlay } from './tour/TourOverlay';
import { Gate } from './easy/Gate';
import { MissionPanel } from './easy/InsideUI';
import { joinClassFromLink } from './easy/mode';
import { shown, useFeature, useMode } from './easy/features';
import { View3D } from './views/View3D';
import { LazySculptView, LazySketchView } from './sculpt/ui/lazy';
import { isSculpture } from './sculpt/ops';
import { loadShapes, registerOutcomeLoader } from './sculpt/load';

// Fold it and Build from boards (milestones 126, 127): their code loads with the shape kernel
registerOutcomeLoader(() => import('./make/register'));

// Loaded when first used (code splitting, 20 November): the cut plan and face-on view with the 2D editing, the
// download dialog with the export and print code, the teacher's view, and the sentence's development page.
const Plan2D = lazy(() => import('./views/Plan2D').then((m) => ({ default: m.Plan2D })));
// milestone 113: the Net view (the cut plan's nets with a folded preview)
const NetView = lazy(() => import('./views/NetView').then((m) => ({ default: m.NetView })));
const ExportDialog = lazy(() => import('./ui/ExportDialog').then((m) => ({ default: m.ExportDialog })));
const TeacherApp = lazy(() => import('./teacher/TeacherApp').then((m) => ({ default: m.TeacherApp })));
// Guided's shell (milestone 105): its own chunk
const GuidedApp = lazy(() => import('./guided/GuidedApp').then((m) => ({ default: m.GuidedApp })));
const SentenceDev = lazy(() => import('./sentence/SentenceDev').then((m) => ({ default: m.SentenceDev })));
/** What shows while a part loads: the same quiet placeholder as the app's own first load. */
const Loading = () => <div className="loading" aria-busy="true" />;
import { EditorBoundary } from './ui/ErrorBoundary';
import { AppDialog } from './ui/AppDialog';

export function App() {
  const t = useT();
  const [loaded, setLoaded] = useState(false);
  const lang = useStore((s) => s.lang);
  const view = useStore((s) => s.view);
  const soloPanel = useStore((s) => s.soloPanel);
  const soloExists = useStore((s) => !!(s.soloPanel && s.design.panels[s.soloPanel]));
  useEffect(() => {
    if (view === 'solo' && !soloExists) useStore.getState().closeSolo();
  }, [view, soloExists]);
  const needsMaterial = useStore((s) => s.needsMaterial);
  const exportOpen = useStore((s) => s.exportOpen);
  const drawerOpen = useStore((s) => s.drawerOpen);
  useEffect(() => void joinClassFromLink(), []);
  const [route, setRoute] = useState(() => location.hash);
  useEffect(() => {
    const h = () => setRoute(location.hash);
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const teacher = route.startsWith('#/teacher');
  const otherTab = useStore((s) => s.otherTab);
  const guided = useMode() === 'guided';
  // milestone 113: the cut plan as nets (never in a level that hides them: a stored choice falls back to the sheets)
  const netsShown = shown(useFeature('plan.nets'));
  const planNets = useStore((s) => s.viewPrefs.planMode === 'nets') && netsShown;
  useAutosave(() => setLoaded(true));
  // a sculpture design loads the shape kernel (milestone 120); box designs never do
  const sculpture = useStore((s) => isSculpture(s.design));
  const sketching = useStore((s) => !!s.sketch);
  // a made sculpture's stage 2 is the Workshop's own 3D view of its boards
  const shapeStage = useStore((s) => s.sculpt.stage === 'shape' || !s.design.outcome);
  useEffect(() => {
    if (!sculpture || useStore.getState().sculpt.ready) return;
    loadShapes().then(
      () => useStore.getState().setSculpt({ ready: true, failed: false }),
      () => useStore.getState().setSculpt({ failed: true }),
    );
  }, [sculpture]);
  useKeyboard();
  // the parts loaded when first used are fetched once the editor is up, so they are there offline too
  useEffect(() => {
    if (!loaded) return;
    const h = setTimeout(() => {
      void import('./views/Plan2D');
      void import('./views/NetView');
      void import('./ui/ExportDialog');
      void import('./guided/GuidedApp');
    }, 0);
    return () => clearTimeout(h);
  }, [loaded]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.title = t('app.name');
  }, [lang]);
  if (teacher)
    return (
      <Suspense fallback={<Loading />}>
        <TeacherApp />
        <AppDialog lang={lang} />
      </Suspense>
    );
  // the sentence on its own, in development (milestone 97)
  if (import.meta.env.DEV && location.search.includes('sentence'))
    return (
      <Suspense fallback={<Loading />}>
        <SentenceDev />
      </Suspense>
    );
  if (!loaded) return <div className="loading" aria-busy="true" />;
  return (
    <div className={guided ? 'app guided' : 'app'}>
      {guided ? (
        <Suspense fallback={<Loading />}>
          <GuidedApp />
        </Suspense>
      ) : (
        <>
      <TopBar />
      <div className="main">
        <EditorBoundary>
          <main className="viewport">
            {view === 'sketch' && sketching ? (
              <LazySketchView />
            ) : view === '3d' && sculpture && shapeStage ? (
              <LazySculptView />
            ) : view === '3d' ? (
              <View3D />
            ) : (
              <Suspense fallback={<Loading />}>{view === 'solo' && soloPanel && soloExists ? <Plan2D key={soloPanel} soloPanel={soloPanel} /> : view === '2d' && planNets ? <NetView /> : <Plan2D />}</Suspense>
            )}
          </main>
          <Toolbar />
          <Inspector />
          {view === '3d' && <MissionPanel />}
        </EditorBoundary>
        {!needsMaterial && (
          // a first-time student who chose Start: one note offering the tour (milestone 43)
          <Gate f="hints">
            <TourNudge />
          </Gate>
        )}
      </div>
        </>
      )}
      {needsMaterial && !guided && <StartScreen />}
      {/* the app's own dialogs (milestone 143) */}
      <AppDialog lang={lang} />
      {otherTab && (
        // milestone 86: two tabs on one design
        <div className="other-tab" role="alert" data-testid="other-tab">
          <span>{t('lib.otherTab')}</span>
          <button
            className="primary"
            onClick={async () => {
              const id = useStore.getState().design.id;
              useStore.setState({ otherTab: false });
              await openFromLibrary(id);
            }}
            data-testid="other-tab-reload"
          >
            {t('lib.reload')}
          </button>
          <button
            onClick={() => {
              useStore.setState({ otherTab: false });
              // save mine now: it becomes the saved version
              useStore.getState().set({ saveState: 'saving' });
              void saveLocal(useStore.getState().design).then(() => useStore.getState().set({ saveState: 'saved' }));
            }}
            data-testid="other-tab-keep"
          >
            {t('lib.keepMine')}
          </button>
        </div>
      )}
      {drawerOpen && <MaterialDrawer />}
      {exportOpen && (
        <Suspense fallback={null}>
          <ExportDialog />
        </Suspense>
      )}
      {/* the first-use tour over everything, while it runs (milestone 43) */}
      <TourOverlay />
    </div>
  );
}
