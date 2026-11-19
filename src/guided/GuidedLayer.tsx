// What Guided draws inside the 3D scene (milestone 105): View3D renders it through its `layer` slot,
// so the stage never imports Guided. Build's arrows and grips (milestone 107) go here.
export function GuidedLayer() {
  return <group name="guided-layer" />;
}
