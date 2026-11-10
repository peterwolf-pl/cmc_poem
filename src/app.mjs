import { buildPlan, buildStages, generateGcode, toggleCell, textToBinary } from './gcode.mjs';
import { packZip } from './zip.mjs';

const $ = id => document.getElementById(id);
const ids = ['pattern', 'pitchX', 'pitchY', 'depth', 'feed', 'travelMode', 'travelFeed', 'retractZ', 'safeZ', 'orientation', 'origin', 'order', 'cycle', 'spindle', 'rpm', 'toolDiameter', 'holeDiameter', 'helixStep'];
const sample = ['0010100', '0111110', '1111111', '1111111', '0111110', '0011100', '0001000'].join('\n');
$('pattern').value = sample;
$('sourceText').value = '';
let plan = null;
let generated = '';
let geometry = null;
let stageData = null;
let generatedParts = [];
let currentStage = 0;
// Text-mode bit rows grow downward in the vertical CNC layout. Binary-mode
// preserves the original 90-degree rotation convention for existing projects.
let sourceMode = 'binary';
let orientationExplicit = false;

function readSettings() {
  const result = {};
  for (const key of ids.slice(1)) result[key] = key === 'spindle' ? $(key).checked : $(key).value;
  result.sourceMode = sourceMode;
  return result;
}
function status(message, type = '') {
  $('status').textContent = message;
  $('status').className = `status ${type}`;
}
function clearGenerated() {
  generated = '';
  $('gcode').value = '';
  $('downloadBtn').disabled = true;
  $('copyBtn').disabled = true;
  $('downloadAllBtn').disabled = true;
  generatedParts = [];
}
function stageOptions() {
  return {
    enabled: $('splitEnabled').checked,
    maxAreaX: $('maxAreaX').value,
    maxAreaY: $('maxAreaY').value,
    linesPerStage: $('linesPerStage').value,
    drillDiameter: $('toolDiameter').value,
  };
}
function update() {
  $('rpm').disabled = !$('spindle').checked;
  const isHelix = $('cycle').value === 'helix';
  $('stageOptions').hidden = false;
  $('stageDimensions').hidden = !$('splitEnabled').checked;
  $('travelFeedWrap').hidden = $('travelMode').value !== 'controlled';
  $('helixOptions').hidden = !isHelix;
  clearGenerated();
  try {
    plan = buildPlan($('pattern').value, readSettings());
    stageData = buildStages(plan, stageOptions());
    currentStage = Math.min(currentStage, stageData.stages.length-1);
    populateStages();
    $('gridStat').textContent = `${plan.cols} × ${plan.rows}`;
    $('holeStat').textContent = String(plan.ones);
    $('widthStat').textContent = `${plan.width.toFixed(2)} mm`;
    $('heightStat').textContent = `${plan.height.toFixed(2)} mm`;
    const lineInfo = stageData.lineLimit === null ? 'Podział wzdłuż Y wg obszaru roboczego.' :
      `Podział co ${stageData.lineLimit} wierszy wzdłuż Y (maks. ${stageData.actualLinesPerStage} na etap${stageData.actualLinesPerStage < stageData.lineLimit ? ', ograniczenie obszaru Y' : ''}).`;
    $('stageSummary').textContent = `${stageData.total} etapów (maks. ${stageData.columnsPerStage} kolumn × ${stageData.rowsPerStage} wierszy na etap). ${lineInfo} Siatka: ${plan.width.toFixed(2)} × ${plan.height.toFixed(2)} mm między środkami.`;
    status(`${plan.ones} nawiertów, ${stageData.total} etapów. Kliknij „Generuj G-code”. ${plan.warnings.join(' ')}`, plan.warnings.length ? 'warn' : '');
  } catch (error) {
    plan = null; stageData = null;
    for (const id of ['gridStat', 'holeStat', 'widthStat', 'heightStat']) $(id).textContent = '-';
    $('stageSummary').textContent = 'Błąd parametrów etapów.';
    $('stageDetail').textContent = '';
    $('stageSelect').innerHTML = '';
    status(error.message, 'error');
  }
  draw();
}
function populateStages() {
  // Stage metadata is derived only from validated numeric coordinates.
  $('stageSelect').innerHTML = stageData.stages.map((s,i) =>
    `<option value="${i}">Etap ${s.stage.number}/${s.stage.total} - ${s.ones} nawiertów${s.ones ? '' : ' (pusty)'}</option>`).join('');
  $('stageSelect').value = String(currentStage);
  showStageDetails();
}
function showStageDetails() {
  if (!stageData) return;
  const s = stageData.stages[currentStage];
  const t = s.stage;
  $('stageDetail').textContent = `Etap ${t.number}/${t.total}. Siatka: kolumny ${t.colStart+1}-${t.colEnd}, wiersze ${t.rowStart+1}-${t.rowEnd}. `+
    `Zajęty obszar ${t.footprintX.toFixed(2)} × ${t.footprintY.toFixed(2)} mm (z narzędziem). `+
    `Pozycja jego zera względem zera całego wzoru: X${t.offsetX.toFixed(2)} Y${t.offsetY.toFixed(2)} mm. `+
    `Przed uruchomieniem ustaw ponownie G54 X0/Y0 w narożniku tego etapu.`;
  generated = generatedParts[currentStage] || '';
  $('gcode').value = generated;
  $('copyBtn').disabled = !generated;
  $('downloadBtn').disabled = !generated;
}
function convertText(explicit = false) {
  try {
    const source = $('sourceText').value;
    if (!source) {
      if (explicit) throw new Error('Najpierw wpisz zwykły tekst.');
      $('pattern').value = '';
      update();
      return;
    }
    $('pattern').value = textToBinary(source, $('bytesPerRow').value);
    sourceMode = 'text';
    // Default one-byte ribbons to a vertical material feed, unless the
    // operator explicitly chose a different orientation.
    if (Number($('bytesPerRow').value) === 1 && !orientationExplicit)
      $('orientation').value = 'vertical';
    update();
    if (explicit && plan) status(`Tekst zamieniony na ${plan.cols} × ${plan.rows} bitów. Kliknij „Generuj G-code”.`);
  } catch (error) {
    clearGenerated();
    plan = null;
    draw();
    status(error.message, 'error');
  }
}
function generate() {
  try {
    plan = buildPlan($('pattern').value, readSettings());
    stageData = buildStages(plan, stageOptions());
    generatedParts = stageData.stages.map(s => s.ones ? generateGcode(s) : '');
    if (!generatedParts.some(Boolean)) throw new Error('Brak nawiertów do generowania.');
    if (generatedParts.reduce((total,part) => total+part.length,0) > 25000000)
      throw new Error('Łączny kod przekracza 25 MB. Użyj mniejszej siatki lub większego zejścia spiralnego.');
    currentStage = generatedParts.findIndex(Boolean);
    populateStages();
    $('downloadAllBtn').disabled = false;
    status(`Wygenerowano ${generatedParts.filter(Boolean).length} niezależnych plików .TAP dla ${stageData.total} etapów. Pobierz ZIP lub wybrany etap.`);
    $('outputPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    draw();
  } catch (error) {
    clearGenerated();
    status(error.message, 'error');
  }
}
function stageFilename(stage) {
  return `cmc-poem-etap-${String(stage.stage.number).padStart(3,'0')}-z-${String(stage.stage.total).padStart(3,'0')}.tap`;
}
function downloadContent(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function allInstructions() {
  const notes = [
    'CMC POEM - ETAPY OBRÓBKI MACH3MILL',
    'Każdy plik TAP jest niezależnym programem z G54 i M30.',
    'PRZED KAŻDYM ETAPEM: zamocuj materiał i ustaw X0/Y0 G54 w odpowiednim narożniku LOKALNEJ siatki etapu.',
    'Z0 ustaw na powierzchni materiału. Ruchu materiału i bazowania NIE wykonuje program.',
    'Współrzędne offsetów służą wyłącznie do ustalenia położenia etapu na pełnym wzorze.',
    'Sprawdź kierunki osi, mocowanie, możliwości frezu, zakres maszyny, symulację oraz przejazd próbny.',
    `ORIENTACJA ${plan.orientation}; PUNKT 0,0 ${plan.origin}; RASTER ${plan.cols}x${plan.rows}`,
    `ROZSTAW SRODKOW X${plan.width.toFixed(3)} Y${plan.height.toFixed(3)} mm; ETAPOW ${stageData.total}`,
    `MAX OBSZAR X${stageData.areaX.toFixed(3)} Y${stageData.areaY.toFixed(3)} mm`,
    `PODZIAL CO N LINII SIATKI: ${stageData.lineLimit === null ? 'AUTO (WG OBSZARU)' : stageData.lineLimit}; OS ${stageData.lineAxis}; FAKTYCZNIE MAKS. ${stageData.actualLinesPerStage} POZYCJI NA ETAP`,
    `POSUW ROBOCZY F${plan.feed.toFixed(3)} MM/MIN; POSUW JALOWY ${plan.travelMode === 'controlled' ? `G1 F${plan.travelFeed.toFixed(3)}` : 'G0 (WG MACH3)'}`,
    '',
  ];
  stageData.stages.forEach((s,i)=>{
    const t=s.stage;
    notes.push(`ETAP ${t.number}/${t.total}: ${s.ones} NAWIERTÓW; `+
      `KOLUMNY ${t.colStart+1}-${t.colEnd}; WIERSZE ${t.rowStart+1}-${t.rowEnd}; `+
      `OSRODEK ZERA W PELNYM WZORZE X${t.offsetX.toFixed(3)} Y${t.offsetY.toFixed(3)} MM; `+
      `OBSZAR X${t.footprintX.toFixed(3)} Y${t.footprintY.toFixed(3)} MM; `+
      `${generatedParts[i] ? stageFilename(s) : 'BRAK PLIKU: ETAP BEZ NAWIERTOW'}`);
  });
  return notes.join('\n')+'\n';
}

function draw() {
  const canvas = $('matrixCanvas');
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  geometry = null;
  if (!plan) {
    ctx.fillStyle = '#81908d';
    ctx.font = '13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Uzupełnij poprawny wzór i parametry', w / 2, h / 2);
    return;
  }
  const { rows, cols, matrix } = plan;
  const availableW = Math.max(w - 76, 10), availableH = Math.max(h - 80, 10);
  const step = Math.max(0.001, Math.min(availableW / Math.max(cols - 1, 1), availableH / Math.max(rows - 1, 1), 48));
  const left = (w - (cols - 1) * step) / 2;
  const top = (h - (rows - 1) * step) / 2;
  geometry = { left, top, step, rows, cols, rectW: w, rectH: h };
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#223033';
  for (let r = 0; r < rows; r++) {
    const y = top + r * step;
    ctx.beginPath();ctx.moveTo(left, y);ctx.lineTo(left + (cols - 1) * step, y);ctx.stroke();
  }
  for (let c = 0; c < cols; c++) {
    const x = left + c * step;
    ctx.beginPath();ctx.moveTo(x, top);ctx.lineTo(x, top + (rows - 1) * step);ctx.stroke();
  }
  const radius = Math.min(10, Math.max(1.2, step * .27));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = left + c * step, y = top + r * step;
    ctx.beginPath();ctx.arc(x, y, matrix[r][c] ? radius : Math.max(1, radius * .65), 0, Math.PI * 2);
    ctx.fillStyle = matrix[r][c] ? '#e6f4ef' : '#162023';
    ctx.fill();
    if (!matrix[r][c]) { ctx.lineWidth = 1;ctx.strokeStyle = '#647779';ctx.stroke(); }
  }
  if (stageData && stageData.total > 1) {
    for (const s of stageData.stages) {
      const t = s.stage;
      const x0 = left + (t.colStart - 0.5) * step;
      const y0 = top + (t.rowStart - 0.5) * step;
      const x1 = left + (t.colEnd - 0.5) * step;
      const y1 = top + (t.rowEnd - 0.5) * step;
      const active = t.number === currentStage+1;
      ctx.strokeStyle = active ? '#b6ecdc' : '#62716d';
      ctx.lineWidth = active ? 2.5 : 1;
      ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y0);ctx.lineTo(x1,y1);ctx.lineTo(x0,y1);ctx.lineTo(x0,y0);ctx.stroke();
    }
  }
  const r = plan.origin.startsWith('top') ? 0 : rows - 1;
  const c = plan.origin.endsWith('right') ? cols - 1 : 0;
  const ox = left + c * step, oy = top + r * step;
  ctx.beginPath();ctx.arc(ox, oy, radius + 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#b6ecdc';ctx.lineWidth = 1.5;ctx.stroke();
  ctx.fillStyle = '#b6ecdc';ctx.font = 'bold 11px ui-monospace,monospace';
  ctx.textAlign = c === 0 ? 'left' : 'right';
  ctx.fillText('0,0', ox + (c === 0 ? radius + 12 : -radius - 12), oy + (r === 0 ? 20 : -14));
}

$('matrixCanvas').addEventListener('click', event => {
  if (!plan || !geometry) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  const { left, top, step, rows, cols } = geometry;
  const c = Math.round((x - left) / step), r = Math.round((y - top) / step);
  if (r < 0 || r >= rows || c < 0 || c >= cols) return;
  if (Math.hypot(x - left - c * step, y - top - r * step) > Math.max(12, Math.min(22, step * .5))) return;
  $('sourceText').value = '';
  $('pattern').value = toggleCell($('pattern').value, $('orientation').value, r, c, sourceMode);
  sourceMode = 'binary';
  update();
});

$('stageSelect').addEventListener('change', () => {
  currentStage = Number($('stageSelect').value);
  if (!stageData || !Number.isInteger(currentStage) || currentStage < 0 || currentStage >= stageData.total) return;
  showStageDetails();
  draw();
});
$('splitEnabled').addEventListener('change', update);
for (const id of ['maxAreaX','maxAreaY','linesPerStage']) $(id).addEventListener('input', update);
for (const id of ids) {
  $(id).addEventListener(id === 'spindle' || ['orientation','origin','order','cycle','travelMode'].includes(id) ? 'change' : 'input', () => {
    if (id === 'orientation') orientationExplicit = true;
    if (id === 'pattern') { $('sourceText').value = ''; sourceMode = 'binary'; }
    update();
  });
}
$('sourceText').addEventListener('input', () => convertText());
$('bytesPerRow').addEventListener('input', () => { if ($('sourceText').value) convertText(); else update(); });
$('convertBtn').addEventListener('click', () => convertText(true));
$('sampleBtn').addEventListener('click', () => {
  $('sourceText').value = '';
  sourceMode = 'binary';
  $('pattern').value = sample;
  update();
});
$('generateBtn').addEventListener('click', generate);
$('generateBtnOutput').addEventListener('click', generate);
$('downloadBtn').addEventListener('click', () => {
  if (!generated || !stageData) return;
  downloadContent(stageFilename(stageData.stages[currentStage]), generated);
});
$('downloadAllBtn').addEventListener('click', () => {
  if (!generatedParts.length || !stageData) return;
  const files = stageData.stages.flatMap((s,i)=>generatedParts[i] ?
    [{name:stageFilename(s),content:generatedParts[i]}] : []);
  files.unshift({name:'INSTRUKCJA-ETAPY.txt',content:allInstructions()});
  const zip = packZip(files);
  downloadContent(`cmc-poem-etapy-${stageData.total}.zip`, zip, 'application/zip');
});
$('copyBtn').addEventListener('click', async () => {
  if (!generated) return;
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(generated);
    else { $('gcode').focus(); $('gcode').select(); document.execCommand('copy'); }
    status('G-code skopiowany do schowka.');
  } catch { status('Nie można skopiować. Zaznacz kod i skopiuj ręcznie.', 'warn'); }
});
window.addEventListener('resize', draw);
update();
