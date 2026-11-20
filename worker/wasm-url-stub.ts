// The Worker bundles src/model/serialize, which reaches src/sculpt/kernel.ts. Its
// browser-only `manifold-3d/manifold.wasm?url` import (a Vite asset URL) is never run
// in the Worker, but esbuild can't resolve it, so wrangler.toml aliases it here.
export default '';
