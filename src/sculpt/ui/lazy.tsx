// The waffle editor's components, loaded only when a waffle design opens (milestone 49):
// box designs download neither the kernel nor this code.
import { lazy, Suspense } from 'react';

const View = lazy(() => import('./SculptView3D').then((m) => ({ default: m.SculptView3D })));
const Rail = lazy(() => import('./SculptRail').then((m) => ({ default: m.SculptRail })));
const Card = lazy(() => import('./SculptCard').then((m) => ({ default: m.SculptCard })));

export const LazySculptView = () => (
  <Suspense fallback={null}>
    <View />
  </Suspense>
);
export const LazySculptRail = () => (
  <Suspense fallback={null}>
    <Rail />
  </Suspense>
);
export const LazySculptCard = () => (
  <Suspense fallback={null}>
    <Card />
  </Suspense>
);
