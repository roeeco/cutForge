// The sketch view's pointer (SKETCH_OVERHAUL.md §7): one path for every tool.
// Milestone 57: panning (middle or right button) only; the tools come in 58.
import type { useViewBox } from '../../../views/canvas2d';

export type View = ReturnType<typeof useViewBox>;
export type Ptr = {
  onDown: (ev: React.PointerEvent) => void;
  onMove: (ev: React.PointerEvent) => void;
  onDouble: (ev: React.MouseEvent) => void;
  hint: string | null;
};

export function useSketchPointer(view: View): Ptr {
  return {
    onDown: (ev) => {
      if (ev.button === 1 || ev.button === 2) view.panFrom(ev);
    },
    onMove: () => {},
    onDouble: () => {},
    hint: null,
  };
}

export function SketchOverlay(_p: { ptr: Ptr; px: number }) {
  return null;
}
