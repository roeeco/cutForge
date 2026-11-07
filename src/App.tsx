import { useEffect, useState } from 'react';
import { useStore, useT } from './store/store';
import { useAutosave, useKeyboard } from './store/hooks';
import { TopBar } from './ui/TopBar';
import { Toolbar } from './ui/Toolbar';
import { Inspector } from './ui/Inspector';
import { StartScreen } from './ui/StartScreen';
import { MaterialDrawer } from './ui/MaterialDrawer';
import { ExportDialog } from './ui/ExportDialog';
import { Hints } from './ui/Hints';
import { View3D } from './views/View3D';
import { Plan2D } from './views/Plan2D';
import { TeacherApp } from './teacher/TeacherApp';

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
  const [route, setRoute] = useState(() => location.hash);
  useEffect(() => {
    const h = () => setRoute(location.hash);
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const teacher = route.startsWith('#/teacher');
  useAutosave(() => setLoaded(true));
  useKeyboard();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.title = t('app.name');
  }, [lang]);
  if (teacher) return <TeacherApp />;
  if (!loaded) return <div className="loading" aria-busy="true" />;
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <main className="viewport">{view === '3d' ? <View3D /> : view === 'solo' && soloPanel && soloExists ? <Plan2D key={soloPanel} soloPanel={soloPanel} /> : <Plan2D />}</main>
        <Toolbar />
        <Inspector />
        {!needsMaterial && <Hints />}
      </div>
      {needsMaterial && <StartScreen />}
      {drawerOpen && <MaterialDrawer />}
      {exportOpen && <ExportDialog />}
    </div>
  );
}
