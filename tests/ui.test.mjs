import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Minimal DOM event harness to exercise app.mjs without dependencies or a browser.
test('visible text input converts to UTF-8 bits, explicit generate and stale code protection', async () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['sourceText', 'pattern', 'convertBtn', 'generateBtn', 'generateBtnOutput', 'linesPerStage']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="textSourceWrap"[^>]*hidden/);
  const events = new Map();
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  const elements = new Map(ids.map(id => [id, {
    value: '', checked: false, disabled: false, className: '', textContent: '',
    width: 0, height: 0,
    addEventListener(event, cb) { events.set(`${id}:${event}`, cb); },
    getBoundingClientRect() { return {width: 450, height: 400, left: 0, top:0}; },
    scrollIntoView() {},
  }]));
  const ctx = {
    setTransform(){},clearRect(){},fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},
  };
  elements.get('matrixCanvas').getContext = () => ctx;
  for (const [id, value] of Object.entries({pitchX:'3',pitchY:'3',depth:'0.8',feed:'80',travelMode:'rapid',travelFeed:'600',retractZ:'2',safeZ:'5',orientation:'horizontal',origin:'bottom-left',order:'serpentine',cycle:'explicit',rpm:'10000',bytesPerRow:'8',toolDiameter:'1',holeDiameter:'2',helixStep:'0.25',maxAreaX:'100',maxAreaY:'100',linesPerStage:''})) elements.get(id).value = value;
  globalThis.document = {getElementById(id){assert(elements.has(id),`missing ${id}`);return elements.get(id);}};
  globalThis.window = {devicePixelRatio:1,addEventListener(){}};
  const el = id=>elements.get(id);
  const emit = (id, event='input')=>{assert(events.has(`${id}:${event}`),`${id}:${event} listener missing`);events.get(`${id}:${event}`)();};
  try {
    await import('../src/app.mjs');
    assert.equal(el('gcode').value,'');
    assert(el('downloadBtn').disabled);
    // One-byte UTF-8 must become a vertical eight-column ribbon by default.
    el('bytesPerRow').value = '1';
    emit('bytesPerRow');
    el('sourceText').value = 'ABCD';
    emit('sourceText');
    assert.equal(el('orientation').value, 'vertical');
    assert.equal(el('gridStat').textContent, '1 × 32');
    assert.equal(el('widthStat').textContent, '0.00 mm');
    assert.equal(el('heightStat').textContent, '93.00 mm');
    emit('generateBtn','click');
    assert.match(el('gcode').value, /PATTERN 1 COLUMNS X 32 ROWS/);
    el('orientation').value = 'horizontal';
    emit('orientation', 'change');
    assert.equal(el('gridStat').textContent, '8 × 4');
    assert(el('downloadBtn').disabled);
    el('maxAreaX').value = '1000';
    emit('maxAreaX');
    el('bytesPerRow').value = '8';
    emit('bytesPerRow');
    assert.equal(el('orientation').value, 'horizontal');
    el('splitEnabled').checked=true;
    el('sourceText').value='Ał';
    emit('sourceText');
    assert(el('pattern').value.startsWith('010000011100010110000010'));
    assert.equal(el('gcode').value,'');
    emit('generateBtnOutput','click');
    assert.match(el('gcode').value,/G21 G17 G90 G94/);
    assert.match(el('gcode').value,/G1 Z-0\.800 F80\.000/);
    assert.equal(el('downloadBtn').disabled,false);
    el('pitchX').value='5';
    emit('pitchX');
    assert.equal(el('gcode').value,'');
    assert(el('downloadBtn').disabled);
    emit('generateBtn','click');
    assert.match(el('gcode').value,/M30/);
    assert.equal(el('downloadAllBtn').disabled,false);
    el('pattern').value='101';
    emit('pattern');
    assert.equal(el('sourceText').value,'');
    assert(el('downloadBtn').disabled);
    el('sourceText').value='Z';
    emit('convertBtn','click');
    assert.match(el('pattern').value,/^01011010/);
    assert(el('downloadBtn').disabled);
    el('orientation').value='vertical';
    emit('orientation','change');
    el('maxAreaY').value='7';
    emit('maxAreaY');
    assert.match(el('stageSummary').textContent,/etapów/);
    assert.match(el('stageSelect').innerHTML,/Etap 1/);
    el('linesPerStage').value='2';
    emit('linesPerStage');
    assert.match(el('stageSummary').textContent,/Podział co 2 wierszy wzdłuż Y/);
    assert.equal(el('gcode').value,'');
    emit('generateBtnOutput','click');
    assert.match(el('gcode').value,/\(STAGE \d+\/\d+/);
    assert.equal(el('downloadAllBtn').disabled,false);
    const first=el('gcode').value;
    el('stageSelect').value='1';
    emit('stageSelect','change');
    assert.notEqual(el('stageDetail').textContent,'');
    assert.notEqual(el('gcode').value,first);
    el('cycle').value='helix';
    emit('cycle','change');
    assert(el('downloadAllBtn').disabled);
    emit('generateBtn','click');
    assert.match(el('gcode').value,/G91\.1/);
    assert.match(el('gcode').value,/G3 /);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});
