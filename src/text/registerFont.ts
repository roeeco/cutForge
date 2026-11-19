// Register fonts from their files at once (tests and scripts in Node): the app loads the parser with the fonts instead.
import { parse } from 'opentype.js';
import { registerParsed, type FontId } from './fonts';

export function registerFont(id: FontId, hebrew: ArrayBuffer, latin: ArrayBuffer) {
  registerParsed(id, { hebrew: parse(hebrew), latin: parse(latin) });
}
