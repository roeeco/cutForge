// Pictures of the things that go inside a box (milestone 107): small line drawings, one per object.
const OBJ: Record<string, string> = {
  pencil: 'M4 24 L32 10 L36 12 L8 26 Z M32 10 L38 8 L36 12 M4 24 L3 28 L8 26',
  marker: 'M4 22 L28 10 L34 14 L10 26 Z M28 10 L31 7 L37 11 L34 14 M4 22 L2 27 L10 26',
  dice: 'M8 12 L20 6 L32 12 L32 26 L20 32 L8 26 Z M8 12 L20 18 L32 12 M20 18 L20 32 M14 12 h0.1 M26 12 h0.1 M14 23 h0.1 M26 22 h0.1 M26 28 h0.1',
  deck: 'M8 8 L28 8 L28 32 L8 32 Z M11 5 L31 5 L31 29 M14 14 L22 14 M14 26 L22 26',
  phone: 'M12 3 L28 3 Q31 3 31 6 L31 34 Q31 37 28 37 L12 37 Q9 37 9 34 L9 6 Q9 3 12 3 Z M17 33 L23 33',
  coin: 'M20 8 A12 12 0 1 1 19.99 8 Z M20 12 A8 8 0 1 1 19.99 12 Z',
  custom: 'M6 14 L20 8 L34 14 L34 28 L20 34 L6 28 Z M6 14 L20 20 L34 14 M20 20 L20 34',
};

export function ObjectPic({ id, size = 40 }: { id: string; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className="pic">
      <path d={OBJ[id] ?? OBJ.custom} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
