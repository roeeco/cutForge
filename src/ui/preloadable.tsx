// A part of the app loaded when first used, that can be fetched ahead (exploratory test report, finding 11).
// `React.lazy` suspends on its first render even when its module was fetched long before, so the cut plan, the
// nets and Guided each showed a blank screen once. Fetched ahead with `preload`, the part renders at once.
import { lazy, type ComponentType } from 'react';

/** Fetches the part's code and gives its component. */
interface Loader<P> {
  (): Promise<ComponentType<P>>;
}

export function preloadable<P extends object>(load: Loader<P>) {
  let done: ComponentType<P> | null = null;
  let p: Promise<ComponentType<P>> | null = null;
  const preload = () =>
    (p ??= load().then(
      (c) => (done = c),
      (err) => {
        // a failed fetch (offline) is tried again next time
        p = null;
        throw err;
      },
    ));
  const Lazy = lazy(() => preload().then((c) => ({ default: c }))) as unknown as ComponentType<P>;
  function Part(props: P) {
    const C = done;
    return C ? <C {...props} /> : <Lazy {...props} />;
  }
  return Object.assign(Part, { preload });
}
