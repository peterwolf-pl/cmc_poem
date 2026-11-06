/** Pure CNC pattern parser / Mach3Mill postprocessor. Units are millimetres. */
export const DEFAULTS = Object.freeze({
  pitchX: 3,
  pitchY: 3,
  depth: 0.8,
  feed: 80,
  retractZ: 2,
  safeZ: 5,
  orientation: 'horizontal',
  origin: 'bottom-left',
  order: 'serpentine',
  cycle: 'explicit',
  spindle: false,
  rpm: 10000,
});

const ORIGINS = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];
const ORIENTATIONS = ['horizontal', 'vertical'];
const ORDERS = ['rows', 'serpentine'];
const CYCLES = ['explicit', 'g81'];

/** Read a grid of 0 and 1. Spaces and tabs can separate bits. Blank lines are ignored.
 * Short rows are padded with 0 on the right and reported as a warning.
 */
export function parsePattern(source) {
  if (typeof source !== 'string') throw new Error('Wzór musi być tekstem.');
  const lines = source.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const rows = [];
  const sourceLines = [];
  for (let i = 0; i < lines.length; i++) {
    const bits = lines[i].replace(/[ \t\u00a0]/g, '');
    if (!bits) continue;
    if (/[^01]/.test(bits)) throw new Error(`Wiersz ${i + 1}: użyj tylko cyfr 0 i 1 (oraz spacji).`);
    if (bits.length > 250) throw new Error('Maksymalna liczba kolumn to 250.');
    rows.push(bits.split('').map(Number));
    sourceLines.push(i + 1);
    if (rows.length > 250) throw new Error('Maksymalna liczba wierszy to 250.');
  }
  if (!rows.length) throw new Error('Wpisz wzór złożony z 0 i 1.');
  const cols = Math.max(...rows.map(row => row.length));
  if (cols * rows.length > 40000) throw new Error('Siatka może mieć maksymalnie 40 000 pól.');
  const uneven = rows.some(row => row.length !== cols);
  for (const row of rows) while (row.length < cols) row.push(0);
  return {
    matrix: rows,
    rows: rows.length,
    cols,
    sourceLines,
    warnings: uneven ? ['Nierówne wiersze: krótsze uzupełniono zerami z prawej.'] : [],
  };
}

/** Converts each line of ordinary text into rows of UTF-8 bytes (MSB first).
 * Long text lines are wrapped at bytesPerRow; short/empty lines are zero-padded.
 */
export function textToBinary(source, bytesPerRow = 8) {
  if (typeof source !== 'string' || !source.length) throw new Error('Wpisz tekst do zakodowania.');
  if (!Number.isInteger(Number(bytesPerRow)) || Number(bytesPerRow) < 1 || Number(bytesPerRow) > 31)
    throw new Error('Bajtów na wiersz: wybierz liczbę całkowitą od 1 do 31.');
  const width = Number(bytesPerRow);
  const encoder = new TextEncoder();
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  // A terminal newline is a line separator, not necessarily an extra blank row.
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  const output = [];
  let hasContent = false;
  for (const line of lines) {
    const bytes = encoder.encode(line);
    if (bytes.length) hasContent = true;
    if (!bytes.length) { output.push('0'.repeat(width * 8)); continue; }
    for (let i = 0; i < bytes.length; i += width) {
      const slice = bytes.slice(i, i + width);
      const bits = Array.from(slice, byte => byte.toString(2).padStart(8, '0')).join('');
      output.push(bits.padEnd(width * 8, '0'));
    }
  }
  if (!hasContent) throw new Error('Wpisz co najmniej jeden znak tekstu.');
  if (output.length > 250 || output.length * width * 8 > 40000)
    throw new Error('Tekst jest zbyt długi: maksymalnie 250 wierszy i 40 000 bitów.');
  return output.join('\n');
}

export function orientedMatrix(matrix, orientation) {
  if (orientation === 'horizontal') return matrix.map(row => [...row]);
  if (orientation !== 'vertical') throw new Error('Nieznana orientacja siatki.');
  // Rotate input 90 degrees clockwise: top-left of input moves to top-right.
  const rows = matrix.length;
  const cols = matrix[0].length;
  return Array.from({ length: cols }, (_, r) =>
    Array.from({ length: rows }, (_, c) => matrix[rows - 1 - c][r]));
}

function positiveNumber(raw, label, allowZero = false) {
  if (raw === '' || raw === null || raw === undefined) throw new Error(`${label}: wpisz liczbę.`);
  const n = Number(raw);
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0))
    throw new Error(`${label}: wymagana ${allowZero ? 'liczba nieujemna' : 'liczba większa od zera'}.`);
  if (n > 1000000) throw new Error(`${label}: liczba jest zbyt duża.`);
  if (n < 0.001) throw new Error(`${label}: minimalna wartość to 0.001.`);
  return n;
}

/** Builds a complete data model, including the ordered hole trajectory. */
export function buildPlan(source, settings = {}) {
  const o = { ...DEFAULTS, ...settings };
  for (const [label, value, choices] of [
    ['Punkt zerowy', o.origin, ORIGINS],
    ['Orientacja', o.orientation, ORIENTATIONS],
    ['Kolejność', o.order, ORDERS],
    ['Tryb G-code', o.cycle, CYCLES],
  ]) if (!choices.includes(value)) throw new Error(`${label}: nieznana opcja.`);

  const pitchX = positiveNumber(o.pitchX, 'Odstęp X');
  const pitchY = positiveNumber(o.pitchY, 'Odstęp Y');
  const depth = positiveNumber(o.depth, 'Głębokość');
  const feed = positiveNumber(o.feed, 'Posuw');
  const retractZ = positiveNumber(o.retractZ, 'Poziom R');
  const safeZ = positiveNumber(o.safeZ, 'Bezpieczne Z');
  if (safeZ < retractZ) throw new Error('Bezpieczne Z musi być większe lub równe poziomowi R.');
  const rpm = o.spindle ? positiveNumber(o.rpm, 'Obroty wrzeciona') : null;
  if (o.spindle && !Number.isInteger(rpm)) throw new Error('Obroty wrzeciona muszą być liczbą całkowitą.');

  const parsed = parsePattern(source);
  const matrix = orientedMatrix(parsed.matrix, o.orientation);
  const rows = matrix.length;
  const cols = matrix[0].length;
  const width = (cols - 1) * pitchX;
  const height = (rows - 1) * pitchY;
  const holes = [];
  for (let r = 0; r < rows; r++) {
    const indices = Array.from({ length: cols }, (_, c) => c);
    if (o.order === 'serpentine' && r % 2 === 1) indices.reverse();
    for (const c of indices) {
      if (!matrix[r][c]) continue;
      const right = o.origin.endsWith('right');
      const top = o.origin.startsWith('top');
      holes.push({
        row: r, col: c,
        x: (right ? c - (cols - 1) : c) * pitchX,
        y: (top ? (r === 0 ? 0 : -r) : rows - 1 - r) * pitchY,
      });
    }
  }
  if (!holes.length) throw new Error('We wzorze nie ma ani jednej jedynki (nawiertu).');
  return {
    ...o, pitchX, pitchY, depth, feed, retractZ, safeZ, rpm,
    matrix, rows, cols, holes, width, height,
    ones: holes.length, zeros: rows * cols - holes.length,
    warnings: parsed.warnings,
  };
}

const fmt = n => {
  const s = Number(n.toFixed(3)).toFixed(3);
  return s === '-0.000' ? '0.000' : s;
};

/** Output explicit, fully retracted moves or a Mach3 G81 drilling cycle. */
export function generateGcode(plan) {
  if (!plan || !Array.isArray(plan.holes) || !plan.holes.length) throw new Error('Brak nawiertów do eksportu.');
  const p = plan;
  const output = [
    '(CMC POEM - MACH3MILL)',
    `(PATTERN ${p.cols} COLUMNS X ${p.rows} ROWS - ${p.ones} HOLES)`,
    `(SIZE BETWEEN EXTREME CENTERS X${fmt(p.width)} Y${fmt(p.height)} MM)`,
    `(ORIGIN ${p.origin.toUpperCase()} - ORIENTATION ${p.orientation.toUpperCase()})`,
    '(SET G54 X0 Y0 AT SELECTED GRID CORNER; Z0 AT MATERIAL SURFACE)',
    '(VERIFY TOOL, FIXTURE, CLAMPS AND WORK ENVELOPE BEFORE RUN)',
    'G21 G17 G90 G94',
    'G40 G49 G80',
    'G54',
    `G0 Z${fmt(p.safeZ)}`,
  ];
  if (p.spindle) output.push(`S${p.rpm} M3`);
  else output.push('(SPINDLE CONTROL OFF - START SPINDLE MANUALLY IF REQUIRED)');

  if (p.cycle === 'g81') {
    const first = p.holes[0];
    output.push(`G98 G81 X${fmt(first.x)} Y${fmt(first.y)} Z-${fmt(p.depth)} R${fmt(p.retractZ)} F${fmt(p.feed)}`);
    for (const hole of p.holes.slice(1)) output.push(`X${fmt(hole.x)} Y${fmt(hole.y)}`);
    output.push('G80', `G0 Z${fmt(p.safeZ)}`);
  } else {
    for (const hole of p.holes) {
      output.push(
        `G0 X${fmt(hole.x)} Y${fmt(hole.y)}`,
        `G0 Z${fmt(p.retractZ)}`,
        `G1 Z-${fmt(p.depth)} F${fmt(p.feed)}`,
        `G0 Z${fmt(p.safeZ)}`,
      );
    }
  }
  if (p.spindle) output.push('M5');
  output.push('M30', '');
  return output.join('\n');
}

/** Map a clicked preview cell back into the original, unrotated text grid. */
export function toggleCell(source, orientation, displayRow, displayCol) {
  const original = parsePattern(source);
  const r = orientation === 'vertical' ? original.rows - 1 - displayCol : displayRow;
  const c = orientation === 'vertical' ? displayRow : displayCol;
  if (r < 0 || r >= original.rows || c < 0 || c >= original.cols) throw new Error('Pole jest poza siatką.');
  original.matrix[r][c] = original.matrix[r][c] ? 0 : 1;
  return original.matrix.map(row => row.join('')).join('\n');
}
