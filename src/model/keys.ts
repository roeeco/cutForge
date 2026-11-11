// Piece and placement keys (BUGFIX_PLAN B5). A piece is keyed by its net's root
// panel id; a fragment a cut splits off is `<key>@n`; a sheet placement is
// `${pieceKey}#${copy}`. Panel ids never contain `@` (wall-set members are
// `<wall>~n`, tray walls on split edges `<tray>/<edge>#n`).

/** The separator of a fragment's number in its piece key (`<key>@n`); no panel id contains it. */
export const FRAG_SEP = '@';
/** The net (and quantity) a piece key belongs to: fragments share their net's. */
export const pieceRoot = (key: string) => {
  const m = /^(.*)@\d+$/.exec(key);
  return m ? m[1] : key;
};
/** The piece key of a placement key (`${pieceKey}#${copy}`); piece keys can contain `#` (tray walls on split edges). */
export const placementPiece = (placementKey: string) => {
  const i = placementKey.lastIndexOf('#');
  return i < 0 ? placementKey : placementKey.slice(0, i);
};

