import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, buildStages, generateGcode, textToBinary } from '../src/gcode.mjs';
import { packZip } from '../src/zip.mjs';
const s = {pitchX:5,pitchY:10,depth:1.0,feed:75,retractZ:2,safeZ:6,toolDiameter:1};

test('stage splitting respects maximum work rectangle including tool size',()=>{
  const plan=buildPlan('1111\n1111\n1111\n1111',{...s,orientation:'vertical'});
  const result=buildStages(plan,{enabled:true,maxAreaX:11,maxAreaY:21,drillDiameter:1});
  assert.equal(result.total,6);
  assert.equal(result.countX,1);
  assert.equal(result.countY,6);
  assert.deepEqual(result.stages.map(st=>st.ones),[3,3,3,3,3,1]);
  assert.deepEqual(result.stages.map(st=>[st.stage.offsetX,st.stage.offsetY]),[[0,130],[0,100],[0,70],[0,40],[0,10],[0,0]]);
  for(const st of result.stages){
    assert(st.stage.footprintX<=11+1e-9);
    assert(st.stage.footprintY<=21+1e-9);
    const code=generateGcode(st);
    assert.match(code,/\(STAGE \d\/6/);
    assert.match(code,/G54/);
    assert.match(code,/\nM30\n$/);
    assert.equal((code.match(/G1 Z-/g)||[]).length,st.ones);
  }
  assert.equal(result.stages.reduce((n,st)=>n+st.ones,0),plan.ones);
});

test('selected corner is reset locally; each stage preserves global positions',()=>{
  const pattern='10110\n01010\n10101\n11100';
  for(const origin of ['bottom-left','bottom-right','top-left','top-right']) {
    const plan=buildPlan(pattern,{...s,orientation:'vertical',origin});
    const {stages}=buildStages(plan,{enabled:true,maxAreaX:16,maxAreaY:21,drillDiameter:1});
    assert(stages.length>=2);
    const glob=new Set(plan.holes.map(h=>`${h.x},${h.y}`));
    const regroup=new Set(stages.flatMap(st=>st.holes.map(h=>`${h.x+st.stage.offsetX},${h.y+st.stage.offsetY}`)));
    assert.deepEqual(regroup,glob,`${origin} lost or relocated holes`);
  }
});

test('empty tiles are retained for indexing and excluded from CNC output',()=>{
  const p=buildPlan('1000\n0000\n0000\n0000',{...s,orientation:'vertical'});
  const {stages,total}=buildStages(p,{enabled:true,maxAreaX:1,maxAreaY:1,drillDiameter:1});
  assert.equal(total,16);
  assert.equal(stages.filter(x=>x.ones>0).length,1);
  assert.throws(()=>generateGcode(stages.find(x=>!x.ones)),/Brak nawiertów/);
});

test('stage refuses window smaller than cut diameter, and excess stages',()=>{
  const p=buildPlan('111',{...s,orientation:'vertical',cycle:'helix',toolDiameter:1,holeDiameter:2,helixStep:.25});
  assert.throws(()=>buildStages(p,{enabled:true,maxAreaX:1,maxAreaY:10}),/Średnica/);
  assert.throws(()=>buildStages(p,{enabled:true,maxAreaX:0,maxAreaY:10}),/wymagana/);
});

test('helix has incremental IJ, helical Z and finishing circle at target depth',()=>{
  const p=buildPlan('1',{...s,cycle:'helix',holeDiameter:2,toolDiameter:1,helixStep:.4});
  const code=generateGcode(p);
  assert.match(code,/G91\.1/);
  assert.match(code,/HELIX HOLE D2\.000 TOOL D1\.000 PITCH 0\.400/);
  assert.match(code,/G0 X0\.500 Y0\.000\nG0 Z2\.000\nG1 Z0\.000 F75\.000/);
  assert.match(code,/G3 X-0\.500 Y0\.000 Z-0\.200 I-0\.500 J0\.000 F75\.000/);
  assert.match(code,/G3 X0\.500 Y0\.000 Z-0\.400 I0\.500 J0\.000/);
  assert.match(code,/G3 X0\.500 Y0\.000 Z-1\.000 I0\.500 J0\.000/);
  assert.equal((code.match(/^G3 /gm)||[]).length,8);
  assert.match(code,/G0 Z6\.000\nM30\n$/);
});

test('helix rejects hole diameter without centre clearing, sub-minimal radius',()=>{
  assert.throws(()=>buildPlan('1',{...s,cycle:'helix',holeDiameter:1.02,helixStep:.1}),/0,1 mm/);
  assert.throws(()=>buildPlan('1',{...s,cycle:'helix',holeDiameter:2.1,helixStep:.1}),/2 ×/);
});

test('UTF-8 text can be rotated and divided into multiple Mach3 programs',()=>{
  const src=textToBinary('POEM\nŁódź',2);
  const p=buildPlan(src,{...s,orientation:'vertical'});
  const result=buildStages(p,{enabled:true,maxAreaX:11,maxAreaY:31,drillDiameter:1});
  assert(result.total>1);
  assert.equal(result.stages.reduce((n,q)=>n+q.ones,0),p.ones);
});

test('ZIP packs valid local and central headers and preserves UTF-8 files',()=>{
  const zip=packZip([{name:'ETAP-001.tap',content:'G21\nM30\n'},{name:'INSTRUKCJA.txt',content:'Przesuń materiał'}]);
  const view=new DataView(zip.buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);
  assert.equal(view.getUint32(zip.length-22,true),0x06054b50);
  assert.equal(view.getUint16(zip.length-12,true),2);
  const directorySize = view.getUint32(zip.length-10,true);
  const directoryOffset = view.getUint32(zip.length-6,true);
  assert.equal(directoryOffset + directorySize, zip.length - 22);
  assert.equal(view.getUint32(directoryOffset,true),0x02014b50);
  assert(zip.length>90);
});


test('manual line frequency splits oriented rows exactly as entered',()=>{
  const p=buildPlan(Array(22).fill('11').join('\n'),{...s,orientation:'horizontal',pitchX:5,pitchY:5});
  // 22 visible Y rows, 8+8+6; 2 columns.
  const result=buildStages(p,{enabled:true,maxAreaX:100,maxAreaY:100,linesPerStage:8,drillDiameter:1});
  assert.equal(p.rows,22);
  assert.equal(result.total,3);
  assert.equal(result.countY,3);
  assert.equal(result.countX,1);
  assert.equal(result.lineLimit,8);
  assert.equal(result.rowsPerStage,8);
  assert.deepEqual(result.stages.map(t=>t.rows),[8,8,6]);
  assert.deepEqual(result.stages.map(t=>[t.stage.rowStart,t.stage.rowEnd]),[[0,8],[8,16],[16,22]]);
  assert.equal(result.stages.reduce((n,st)=>n+st.ones,0),p.ones);
});

test('work-area limit wins when N rows would exceed available Y',()=>{
  const p=buildPlan(Array(10).fill('11').join('\n'),{...s,orientation:'horizontal',pitchX:5,pitchY:5});
  const result=buildStages(p,{enabled:true,maxAreaX:100,maxAreaY:11,linesPerStage:8,drillDiameter:1});
  assert.equal(result.lineLimit,8);
  assert.equal(result.areaRowsPerStage,3);
  assert.equal(result.rowsPerStage,3);
  assert.deepEqual(result.stages.map(t=>t.rows),[3,3,3,1]);
  assert(result.stages.every(t=>t.stage.footprintY<=11));
});

test('invalid manual line counts are rejected when splitting is active',()=>{
  const p=buildPlan('101\n111',{...s,orientation:'vertical'});
  for (const bad of ['0','2.5','abc','-3','251','Infinity']) {
    assert.throws(()=>buildStages(p,{enabled:true,maxAreaX:100,maxAreaY:100,linesPerStage:bad,drillDiameter:1}),/Podział co N linii/);
  }
  assert.equal(buildStages(p,{enabled:true,maxAreaX:100,maxAreaY:100,linesPerStage:'',drillDiameter:1}).lineLimit,null);
  assert.equal(buildStages(p,{enabled:false,linesPerStage:'abc'}).total,1);
});

test('manual row division preserves positions for every origin and stage',()=>{
  const matrix='10111101\n11011001\n11101111\n10110111';
  for (const origin of ['bottom-left','bottom-right','top-left','top-right']) {
    const plan=buildPlan(matrix,{...s,orientation:'vertical',origin,pitchX:5,pitchY:5});
    const {stages}=buildStages(plan,{enabled:true,maxAreaX:11,maxAreaY:100,linesPerStage:3,drillDiameter:1});
    const want=new Set(plan.holes.map(h=>`${h.x},${h.y}`));
    const have=new Set(stages.flatMap(st=>st.holes.map(h=>`${h.x+st.stage.offsetX},${h.y+st.stage.offsetY}`)));
    assert.deepEqual(have,want);
    assert(stages.every(st=>st.rows<=3));
    assert(stages.every(st=>st.stage.footprintX<=11));
  }
});
