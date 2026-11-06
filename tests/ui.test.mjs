import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Minimal DOM event harness to exercise app.mjs without dependencies or a browser.
test('visible text input converts to UTF-8 bits, explicit generate and stale code protection', async () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['sourceText', 'pattern', 'convertBtn', 'generateBtn', 'generateBtnOutput']) {
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
  for (const [id, value] of Object.entries({pitchX:'3',pitchY:'3',depth:'0.8',feed:'80',retractZ:'2',safeZ:'5',orientation:'horizontal',origin:'bottom-left',order:'serpentine',cycle:'explicit',rpm:'10000',bytesPerRow:'8'})) elements.get(id).value = value;
  globalThis.document = {getElementById(id){assert(elements.has(id),`missing ${id}`);return elements.get(id);}};
  globalThis.window = {devicePixelRatio:1,addEventListener(){}};
  const el = id=>elements.get(id);
  const emit = (id, event='input')=>{assert(events.has(`${id}:${event}`),`${id}:${event} listener missing`);events.get(`${id}:${event}`)();};
  try {
    await import('../src/app.mjs');
    assert.equal(el('gcode').value,'');
    assert(el('downloadBtn').disabled);
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
    el('pattern').value='101';
    emit('pattern');
    assert.equal(el('sourceText').value,'');
    assert(el('downloadBtn').disabled);
    el('sourceText').value='Z';
    emit('convertBtn','click');
    assert.match(el('pattern').value,/^01011010/);
    assert(el('downloadBtn').disabled);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});
