// The unfolder off the main thread (milestone 119's decision: forms over about 40 faces).
// It takes the face graph and the flap depths by edge (a function cannot cross), and
// sends back the unfolding with its folds as a list.
import { unfold, type UnfoldSpec } from '../model/unfold';
import type { Polyhedron } from '../model/polyhedron';

type In = { P: Polyhedron; spec: Omit<UnfoldSpec, 'flap'>; flaps: Record<string, number> };

self.onmessage = (ev: MessageEvent<In>) => {
  const { P, spec, flaps } = ev.data;
  const u = unfold(P, { ...spec, flap: (e) => flaps[e.key] ?? 0 });
  (self as unknown as Worker).postMessage({ ...u, folds: [...u.folds] });
};
