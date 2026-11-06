import { buildPlan, generateGcode, toggleCell, textToBinary } from './gcode.mjs';

const $ = id => document.getElementById(id);
const ids = ['pattern', 'pitchX', 'pitchY', 'depth', 'feed', 'retractZ', 'safeZ', 'orientation', 'origin', 'order', 'cycle', 'spindle', 'rpm'];
const sample = ['0010100', '0111110', '1111111', '1111111', '0111110', '0011100', '0001000'].join('\n');
$('pattern').value = sample;
$('sourceText').value = '';
let plan = null;
let generated = '';
let geometry = null;

function readSettings() {
  const result = {};
  for (const key of ids.slice(1)) result[key] = key === 'spindle' ? $(key).checked : $(key).value;
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
}
function update() {
  $('rpm').disabled = !$('spindle').checked;
  clearGenerated();
  try {
    plan = buildPlan($('pattern').value, readSettings());
    $('gridStat').textContent = `${plan.cols} × ${plan.rows}`;
    $('holeStat').textContent = String(plan.ones);
    $('widthStat').textContent = `${plan.width.toFixed(2)} mm`;
    $('heightStat').textContent = `${plan.height.toFixed(2)} mm`;
    const message = `${plan.ones} nawiertów, ${plan.cols} × ${plan.rows} pól. Kliknij „Generuj G-code”. ${plan.warnings.join(' ')}`;
    status(message, plan.warnings.length ? 'warn' : '');
  } catch (error) {
    plan = null;
    for (const id of ['gridStat', 'holeStat', 'widthStat', 'heightStat']) $(id).textContent = '-';
    status(error.message, 'error');
  }
  draw();
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
    generated = generateGcode(plan);
    $('gcode').value = generated;
    $('copyBtn').disabled = false;
    $('downloadBtn').disabled = false;
    status(`Wygenerowano G-code: ${plan.ones} nawiertów. Możesz skopiować kod lub pobrać plik .TAP.`);
    $('outputPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    clearGenerated();
    status(error.message, 'error');
  }
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
  $('pattern').value = toggleCell($('pattern').value, $('orientation').value, r, c);
  update();
});

for (const id of ids) {
  $(id).addEventListener(id === 'spindle' || ['orientation','origin','order','cycle'].includes(id) ? 'change' : 'input', () => {
    if (id === 'pattern') $('sourceText').value = '';
    update();
  });
}
$('sourceText').addEventListener('input', () => convertText());
$('bytesPerRow').addEventListener('input', () => { if ($('sourceText').value) convertText(); else update(); });
$('convertBtn').addEventListener('click', () => convertText(true));
$('sampleBtn').addEventListener('click', () => {
  $('sourceText').value = '';
  $('pattern').value = sample;
  update();
});
$('generateBtn').addEventListener('click', generate);
$('generateBtnOutput').addEventListener('click', generate);
$('downloadBtn').addEventListener('click', () => {
  if (!generated || !plan) return;
  const blob = new Blob([generated], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cmc-poem-${plan.cols}x${plan.rows}-${plan.orientation}.tap`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
