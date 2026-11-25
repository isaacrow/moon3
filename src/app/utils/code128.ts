/**
 * Code 128 (set B) barcodes as SVG, for printed borrower cards (plan step H9): every letter, digit and the
 * punctuation Moon allows in card numbers. Set B covers ASCII 32-127. No library: the standard pattern table, a
 * start code, the data, a check symbol (mod 103) and the stop pattern; a quiet zone of ten modules each side.
 */
/** Bar and space widths (in modules) of the 107 symbols; index = symbol value. 104 is Start B, 106 is Stop. */
export const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

/** The symbol values for a text in set B (start, data, check), or null if a character is outside ASCII 32-127. */
export function code128Values(text: string): number[] | null {
  const data: number[] = [];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 127) return null;
    data.push(c - 32);
  }
  const check = (START_B + data.reduce((sum, v, i) => sum + v * (i + 1), 0)) % 103;
  return [START_B, ...data, check, STOP];
}

/** The barcode as an SVG string (bars in currentColor), `height` px tall, one module `module` px wide. */
export function code128Svg(text: string, height = 48, module = 2): string | null {
  const values = code128Values(text);
  if (!values) return null;
  const widths = values.map((v) => PATTERNS[v]).join('');
  let x = 10 * module;
  const bars: string[] = [];
  [...widths].forEach((w, i) => {
    const width = Number(w) * module;
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}"/>`);
    x += width;
  });
  const total = x + 10 * module;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" width="${total}" height="${height}" fill="currentColor" role="img" aria-label="${text.replace(/[<>&"]/g, '')}">${bars.join('')}</svg>`;
}
