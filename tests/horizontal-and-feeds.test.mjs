import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan,buildStages,generateGcode,textToBinary} from '../src/gcode.mjs';
const base = {pitchX:3,pitchY:5,depth:0.7,feed:80,retractZ:2,safeZ:5,toolDiameter:1};

test('horizontal text pattern also splits by N rows along Y, including empty cells', () => {
  const plan=buildPlan(textToBinary('ABCDEFGHIJ',1),{...base,sourceMode:'text',orientation:'horizontal'});
  assert.equal(plan.cols,8);
  assert.equal(plan.rows,10);
  const result=buildStages(plan,{enabled:true,maxAreaX:100,maxAreaY:50,linesPerStage:4,drillDiameter:1});
  assert.equal(result.total,3);
  assert.equal(result.lineAxis,'Y');
  assert.deepEqual(result.stages.map(st=>st.rows),[4,4,2]);
  assert.deepEqual(result.stages.map(st=>[st.stage.rowStart,st.stage.rowEnd]),[[0,4],[4,8],[8,10]]);
  assert(result.stages.every(st => st.stage.colStart === 0 && st.stage.colEnd === 8));
  assert.equal(result.stages.reduce((n,st)=>n+st.ones,0),plan.ones);
});

test('horizontal width must fit X; all stage offsets preserve original Y positions',()=>{
  const plan=buildPlan('111111111111\n111111111111\n111111111111',{...base,orientation:'horizontal'});
  assert.throws(()=>buildStages(plan,{enabled:true,maxAreaX:10,maxAreaY:6,linesPerStage:6,drillDiameter:1}),/za szeroki/);
  for(const origin of ['top-left','top-right','bottom-left','bottom-right']) {
    const actual=buildPlan('111111111111\n111111111111\n111111111111',{...base,orientation:'horizontal',origin});
    const result=buildStages(actual,{enabled:true,maxAreaX:35,maxAreaY:6,linesPerStage:6,drillDiameter:1});
    assert.equal(result.columnsPerStage,12);
    assert.equal(result.rowsPerStage,2);
    assert.equal(result.countX,1);
    const real=new Set(actual.holes.map(h=>`${h.x}:${h.y}`));
    const reconstructed=new Set(result.stages.flatMap(st=>st.holes.map(h=>`${h.x+st.stage.offsetX}:${h.y+st.stage.offsetY}`)));
    assert.deepEqual(reconstructed,real);
    for(const st of result.stages){assert(st.stage.footprintX<=35);assert(st.stage.footprintY<=6);assert.match(generateGcode(st),/G54/);}
  }
});

test('controlled travel adds G1 F to XY while drilling retains separate work F',()=>{
  const plan=buildPlan('11',{...base,travelMode:'controlled',travelFeed:700});
  const code=generateGcode(plan);
  assert.match(code,/\(IDLE XY G1 F700\.000/);
  assert.equal((code.match(/G1 X[\d.-]+ Y[\d.-]+ F700\.000/g)||[]).length,2);
  assert.equal((code.match(/G1 Z-0\.700 F80\.000/g)||[]).length,2);
  assert.match(code,/G0 Z5\.000/);
  assert.doesNotMatch(code,/^G0 X/m);
});

test('rapid remains machine controlled and ignores F on G0',()=>{
  const plan=buildPlan('11',{...base,travelMode:'rapid',travelFeed:'not used'});
  const code=generateGcode(plan);
  assert.match(code,/^G0 X/m);
  assert.doesNotMatch(code,/^G0 X.* F/m);
  assert.doesNotMatch(code,/^G1 X.* F700/m);
});

test('G81 cannot claim controlled idle feed; invalid values rejected',()=>{
  assert.throws(()=>buildPlan('1',{...base,cycle:'g81',travelMode:'controlled',travelFeed:600}),/G81/);
  assert.throws(()=>buildPlan('1',{...base,travelMode:'controlled',travelFeed:-10}),/Posuw jałowy/);
  assert.throws(()=>buildPlan('1',{...base,travelMode:'invalid'}),/Ruch jałowy/);
});

test('helix also uses separately controlled XY feed',()=>{
  const plan=buildPlan('11',{...base,cycle:'helix',travelMode:'controlled',travelFeed:480,holeDiameter:2,toolDiameter:1,helixStep:0.2});
  const code=generateGcode(plan);
  assert.match(code,/G1 X0\.500 Y0\.000 F480\.000/);
  assert.match(code,/G3 /);
  assert.match(code,/G3 .*F80\.000/);
  assert.match(code,/G0 Z5\.000/);
});
