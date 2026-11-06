import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, generateGcode, parsePattern, orientedMatrix, toggleCell, textToBinary } from '../src/gcode.mjs';

const settings = {pitchX: 5, pitchY: 10, depth: 1.2, feed: 75, retractZ: 2, safeZ: 6};
test('parse binary lines and pad short rows with zero', () => {
  const p = parsePattern('1 0 1\n0\n');
  assert.deepEqual(p.matrix, [[1,0,1],[0,0,0]]);
  assert.equal(p.warnings.length, 1);
});
test('rejects invalid characters', () => assert.throws(() => parsePattern('101\n10A'), /Wiersz 2/));
test('horizontal and vertical dimensions and rotation', () => {
  const h = buildPlan('100\n011', settings);
  assert.equal(h.cols, 3);assert.equal(h.rows, 2);
  assert.equal(h.width, 10);assert.equal(h.height, 10);
  const v = buildPlan('100\n011', {...settings, orientation:'vertical'});
  assert.deepEqual(v.matrix, [[0,1],[1,0],[1,0]]);
  assert.equal(v.cols, 2);assert.equal(v.rows, 3);
  assert.equal(v.width, 5);assert.equal(v.height, 20);
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
test('clicking rotated preview maps back to original', () => {
  assert.equal(toggleCell('10\n00', 'vertical', 0, 1), '00\n00');
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
