import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlan, buildStages, generateGcode, textToBinary } from '../src/gcode.mjs';

const settings = {pitchX:5,pitchY:10,depth:0.8,feed:80,retractZ:2,safeZ:5,toolDiameter:2};
const work = {enabled:true,maxAreaX:40,maxAreaY:100,marginX:5,marginY:5,drillDiameter:2};

for (const orientation of ['horizontal','vertical']) {
  test(`safe X/Y envelope and Y-only automatic stages for ${orientation}`, () => {
    const input = orientation === 'horizontal' ? Array(20).fill('101').join('\n') : Array(10).fill('11').join('\n');
    const p = buildPlan(input, {...settings,orientation});
    const s = buildStages(p,work);
    assert.equal(s.marginX,5);
    assert.equal(s.marginY,5);
    assert.equal(s.usableX,30);
    assert.equal(s.usableY,90);
    assert.equal(s.lineAxis,'Y');
    assert.equal(s.countX,1);
    assert.equal(s.countY, Math.ceil(p.rows / 9));
    assert.equal(s.rowsPerStage,9);
    assert.equal(s.stages.reduce((n,t)=>n+t.ones,0),p.ones);
    assert(s.stages.every(t=>t.stage.footprintX <= s.usableX + 1e-9));
    assert(s.stages.every(t=>t.stage.footprintY <= s.usableY + 1e-9));
    const all=new Set(s.stages.flatMap(t=>t.holes.map(h=>`${h.x+t.stage.offsetX}:${h.y+t.stage.offsetY}`)));
    const expected=new Set(p.holes.map(h=>`${h.x}:${h.y}`));
    assert.deepEqual(all,expected);
    s.stages.filter(t=>t.ones).forEach(t=>assert.match(generateGcode(t), /G54/));
  });
}

test('split occurs only when the next complete tool footprint exceeds the Y safe margin', () => {
  const p=buildPlan(Array(10).fill('1').join('\n'),settings);
  const base={enabled:true,maxAreaX:30,maxAreaY:100,marginX:0,marginY:5,drillDiameter:2};
  const a=buildStages(p,base);
  assert.deepEqual(a.stages.map(t=>t.rows),[9,1]); // 9 centres span 80mm + Ø2 = 82, 10 centres require 92mm > 90.
  const b=buildStages(p,{...base,maxAreaY:102});
  assert.deepEqual(b.stages.map(t=>t.rows),[10]); // exactly 92mm safe rectangle fits.
  const c=buildStages(p,{...base,linesPerStage:4});
  assert.deepEqual(c.stages.map(t=>t.rows),[4,4,2]); // explicit N can only shrink, never enlarge.
});

test('X overflow cannot create lateral stages, including helix diameter',()=>{
  const p=buildPlan(Array(8).fill('1111').join('\n'),{...settings,orientation:'horizontal'});
  assert.throws(()=>buildStages(p,{enabled:true,maxAreaX:20,maxAreaY:100,marginX:3,marginY:1,drillDiameter:2}), /za szeroki/);
  const helix=buildPlan('111',{...settings,cycle:'helix',toolDiameter:2,holeDiameter:3,helixStep:0.2});
  assert.throws(()=>buildStages(helix,{enabled:true,maxAreaX:18,maxAreaY:100,marginX:3,marginY:0}),/za szeroki/);
});

test('safe X/Y remain enforceable when stage splitting is disabled',()=>{
  const p=buildPlan(Array(10).fill('11').join('\n'),settings);
  assert.throws(()=>buildStages(p,{enabled:false,maxAreaX:100,maxAreaY:50,marginX:0,marginY:0}), /bezpieczną wysokość Y/);
  const s=buildStages(p,{enabled:false,maxAreaX:100,maxAreaY:100,marginX:0,marginY:0});
  assert.equal(s.total,1);
  assert.equal(s.stages[0].holes.length,p.ones);
});

test('invalid margins and too-small usable rectangles are rejected',()=>{
  const p=buildPlan('1',settings);
  assert.throws(()=>buildStages(p,{enabled:true,maxAreaX:20,maxAreaY:20,marginX:-1,marginY:0}),/Margines X/);
  assert.throws(()=>buildStages(p,{enabled:true,maxAreaX:20,maxAreaY:20,marginX:10,marginY:0}),/Marginesy/);
  assert.throws(()=>buildStages(p,{enabled:true,maxAreaX:20,maxAreaY:20,marginX:9.1,marginY:0}),/Średnica/);
  assert.throws(()=>buildStages(p,{enabled:true,maxAreaX:20,maxAreaY:20,marginX:Infinity,marginY:0}),/Margines X/);
  assert.throws(()=>buildStages(p,{enabled:true,maxAreaX:'',maxAreaY:20}),/Szerokość pola X/);
  const zero=buildStages(p,{enabled:true,maxAreaX:20,maxAreaY:20,marginX:'0',marginY:'',drillDiameter:2});
  assert.equal(zero.marginX,0);
  assert.equal(zero.marginY,0);
});

test('horizontal and vertical both have permanent, labeled safe-area controls in HTML',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const id of ['maxAreaX','maxAreaY','marginX','marginY','stageOptions','stageDimensions','splitEnabled','linesPerStage','workAreaSummary']) {
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html, /Bezpieczny obszar pracy/);
  assert.doesNotMatch(html, /id="stageOptions"[^>]*hidden/);
  assert.doesNotMatch(html, /id="stageDimensions"[^>]*hidden/);
  assert.match(html, /POZIOMY I PIONOWY/);
});
