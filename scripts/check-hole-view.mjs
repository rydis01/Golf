import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context={window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../mobile/www/hole-view.js',import.meta.url),'utf8'),context);
const select=context.window.HoleView.select;
const data=JSON.parse(fs.readFileSync(new URL('../mobile/www/data/national-geometry.json',import.meta.url))).features;
for(let hole=1;hole<=18;hole++) {
  const view=select(data,'lakes',hole);
  assert.ok(view.line,`Missing Lakes hole ${hole}`);
  assert.equal(view.features.filter(f=>f.properties.tags.golf==='hole').length,1);
  assert.equal(String(view.line.properties.tags.ref),String(hole));
  assert.ok(view.features.every(f=>data.includes(f)), 'Display selection must preserve original GPS geometry');
  assert.ok(!view.features.some(f=>f.properties.tags.leisure==='golf_course'), 'Whole-course boundary must be excluded');
  assert.ok(view.features.some(f=>f.properties.tags.golf==='green'),`Missing green on Lakes ${hole}`);
}
assert.equal(select(data,'links',1).line,null);
assert.equal(select(data,'links',1).features.length,0);
// Parallel holes must not borrow each other's fairways or a course boundary.
const line=(ref,x)=>({properties:{course:'test',tags:{golf:'hole',ref}},geometry:{type:'LineString',coordinates:[[x,55],[x,55.002]]}});
const polygon=(type,x)=>({properties:{course:'unassigned',tags:{golf:type}},geometry:{type:'Polygon',coordinates:[[[x-.0001,55.0005],[x+.0001,55.0005],[x+.0001,55.0015],[x-.0001,55.0015],[x-.0001,55.0005]]]}});
const first=line('1',13),second=line('2',13.001),one=polygon('fairway',13),two=polygon('fairway',13.001);
const view=select([first,second,one,two],'test',1);
assert.ok(view.features.includes(one));assert.ok(!view.features.includes(two));assert.ok(!view.features.includes(second));
console.log('PASS: 18 isolated Lakes selections, unchanged geographic coordinates, explicit unmapped Links fallback and parallel-hole separation.');
