// Vite's `?url` import of the kernel's WASM file (a hashed asset URL).
declare module 'manifold-3d/manifold.wasm?url' {
  const url: string;
  export default url;
}
