import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, generateGcode, parsePattern, orientedMatrix, toggleCell, textToBinary, buildStages } from '../src/gcode.mjs';

const settings = {pitchX: 5, pitchY: 10, depth: 1.2, feed: 75, retractZ: 2, safeZ: 6};
test('parse binary lines and pad short rows with zero', () => {
  const p = parsePattern('1 0 1\n0\n');
  assert.deepEqual(p.matrix, [[1,0,1],[0,0,0]]);
  assert.equal(p.warnings.length, 1);
});
test('rejects invalid characters', () => assert.throws(() => parsePattern('101\n10A'), /Wiersz 2/));
test('horizontal and vertical bits layouts both advance along Y', () => {
  const h = buildPlan('100\n011', settings);
  assert.equal(h.cols, 3);assert.equal(h.rows, 2);
  assert.equal(h.width, 10);assert.equal(h.height, 10);
  const v = buildPlan('100\n011', {...settings, orientation:'vertical'});
  assert.deepEqual(v.matrix, [[1],[0],[0],[0],[1],[1]]);
  assert.equal(v.cols, 1);assert.equal(v.rows, 6);
  assert.equal(v.width, 0);assert.equal(v.height, 50);
});
test('origin transform across all corners', () => {
  const matrix = '10\n01';
  const expect = {
    'bottom-left': [[0,10],[5,0]],
    'bottom-right': [[-5,10],[0,0]],
    'top-left': [[0,0],[5,-10]],
    'top-right': [[-5,0],[0,-10]],
  };
  for (const origin of Object.keys(expect)) {
    const p = buildPlan(matrix, {...settings, origin, order:'rows'});
    assert.deepEqual(p.holes.map(h => [h.x,h.y]), expect[origin]);
  }
});
test('0 skips drilling, explicit output has safe retract and ends M30', () => {
  const p = buildPlan('101\n000', settings);
  const code = generateGcode(p);
  assert.equal((code.match(/G1 Z-/g) || []).length, 2);
  assert.equal((code.match(/G0 Z6\.000/g) || []).length, 3);
  assert.match(code, /G1 Z-1\.200 F75\.000/);
  assert.match(code, /G21 G17 G90 G94/);
  assert.match(code, /G54/);
  assert.match(code, /M30\n$/);
  assert.doesNotMatch(code, /\bM3\b/);
});
test('G81 emits one cycle, cancels G80 and retracts', () => {
  const p = buildPlan('11\n01', {...settings,cycle:'g81'});
  const code = generateGcode(p);
  assert.equal((code.match(/G98 G81/g) || []).length, 1);
  assert.match(code, /G98 G81 X0\.000 Y10\.000 Z-1\.200 R2\.000 F75\.000/);
  assert.match(code, /\nG80\nG0 Z6\.000\nM30/);
});
test('serpentine visits next row in reversed column order', () => {
  const p = buildPlan('111\n111', {...settings, order:'serpentine'});
  assert.deepEqual(p.holes.map(h => h.col), [0,1,2,2,1,0]);
});
test('explicit spindle start is opt-in', () => {
  const code = generateGcode(buildPlan('1', {...settings, spindle:true,rpm:12000}));
  assert.match(code, /S12000 M3/);
  assert.match(code, /\nM5\nM30/);
});
test('numeric constraints and no holes rejected', () => {
  assert.throws(() => buildPlan('0', settings), /jedynki/);
  assert.throws(() => buildPlan('1', {...settings, safeZ:1}), /Bezpieczne Z/);
  assert.throws(() => buildPlan('1', {...settings, pitchX:-3}), /Odstęp X/);
  assert.throws(() => buildPlan('1', {...settings, feed:'garbage'}), /Posuw/);
});
test('clicking preview maps back to original bit in both orientations', () => {
  assert.equal(toggleCell('10\n00', 'vertical', 0, 0), '00\n00');
  assert.equal(toggleCell('10\n00', 'vertical', 3, 0), '10\n01');
  assert.equal(toggleCell('10\n00', 'horizontal', 1, 1), '10\n01');
});
test('single cell yields zero span, nonzero tool travel', () => {
  const p = buildPlan('1', settings);
  assert.equal(p.width, 0);assert.equal(p.height, 0);
  assert.equal(p.holes.length, 1);
});

test('UTF-8 source converts ASCII into bits with padding', () => {
  assert.equal(textToBinary('A',2), '0100000100000000');
  assert.equal(textToBinary('A\nB',1), '01000001\n01000010');
});
test('UTF-8 source converts Polish Unicode multi-byte characters', () => {
  assert.equal(textToBinary('ł',2), '1100010110000010');
  assert.equal(textToBinary('A\n\nB',1), '01000001\n00000000\n01000010');
});
test('text converter rejects invalid width and blank text', () => {
  assert.throws(() => textToBinary('',8), /Wpisz tekst/);
  assert.throws(() => textToBinary('Hi',0), /Bajtów/);
});


test('vertical UTF-8 stores each 8-bit byte along Y and subsequent bytes below', () => {
  const source = textToBinary('ABCD', 1);
  assert.equal(source, '01000001\n01000010\n01000011\n01000100');
  const vertical = buildPlan(source, {...settings, sourceMode: 'text', orientation: 'vertical', pitchX: 3, pitchY: 5});
  assert.equal(vertical.cols, 1);
  assert.equal(vertical.rows, 32);
  assert.equal(vertical.width, 0);
  assert.equal(vertical.height, 155);
  assert.equal(vertical.matrix.slice(0,8).map(row => row[0]).join(''), '01000001');
  assert.equal(vertical.matrix.slice(24,32).map(row => row[0]).join(''), '01000100');
  const stageData = buildStages(vertical, { enabled: true, maxAreaX: 50, maxAreaY: 40, linesPerStage: 8, drillDiameter: 1 });
  assert.equal(stageData.total, 4);
  assert.deepEqual(stageData.stages.map(s => [s.cols, s.rows]), [[1, 8], [1, 8], [1, 8], [1, 8]]);
  const stitched = new Set(stageData.stages.flatMap(s => s.holes.map(h => `${h.x + s.stage.offsetX},${h.y + s.stage.offsetY}`)));
  assert.deepEqual(stitched, new Set(vertical.holes.map(h => `${h.x},${h.y}`)));
  for (const stage of stageData.stages) assert.match(generateGcode(stage), /\(PATTERN SOURCE UTF8-BYTE-ROWS\)/);
});

test('horizontal UTF-8 keeps bytes in rows while vertical makes a column', () => {
  const source = textToBinary('ABCD',1);
  const h = buildPlan(source, {...settings, sourceMode:'text', orientation:'horizontal'});
  assert.equal(h.cols,8);
  assert.equal(h.rows,4);
  assert.equal(h.matrix[0].join(''), '01000001');
  const vBinary = buildPlan(source, {...settings, sourceMode:'binary', orientation:'vertical'});
  assert.equal(vBinary.cols,1);
  assert.equal(vBinary.rows,32);
  assert.equal(toggleCell(source,'vertical',0,0,'text'), '11000001\n01000010\n01000011\n01000100');
  assert.equal(toggleCell(source,'horizontal',1,0,'text'), '01000001\n11000010\n01000011\n01000100');
  assert.throws(()=>buildPlan('1',{...settings,sourceMode:'strange'}),/Rodzaj wejścia/);
});
