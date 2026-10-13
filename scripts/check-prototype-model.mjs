import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context = { window: {}, Math, Number, JSON };
vm.createContext(context);
vm.runInContext(readFileSync(new URL('./prototype-model.js', import.meta.url), 'utf8'), context);
const fields = ['distance','bearing','playsLike','rangeLow','rangeHigh','headwind','crosswind','airDensity','flightTime','lateralDrift','lateralLow','lateralHigh','aimOffset','aimBearing','descentAngle','carryMargin','lateralMargin','distanceUncertainty'];
let count = 0;
for (const windFrom of [0, 90, 180, 270]) {
  for (const lie of ['fairway','rough','flyer','sand']) {
    for (const trajectory of ['low','normal','high']) {
      const shot = { ball: null, target: null, distance: 160, bearing: 30, elevationChange: count % 2 ? -8 : 8,
        lie, trajectory, wetBall: count % 2 === 0, flightTime: count % 3 === 0 ? 6.2 : null,
        descentAngle: count % 4 === 0 ? 38 : null, uncertainty: { distance: count % 3, elevation: count % 4, windDirection: count % 5 * 10 },
        weather: { temperature: count % 2 ? 5 : 22, humidity: 75, pressure: 1008, windSpeed: 5, windFrom, gusts: 9 } };
      const response = await fetch('http://127.0.0.1:8080/api/shot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shot) });
      assert.equal(response.status, 200);
      const java = await response.json(), prototype = context.window.GolfPrototype.calculate(shot);
      for (const field of fields) assert.ok(Math.abs(java[field] - prototype[field]) < .0001, `${field}: Java ${java[field]}, prototype ${prototype[field]}`);
      assert.equal(prototype.uncertaintyLimited,java.uncertaintyLimited);
      assert.equal(prototype.flightTimeMeasured,java.flightTimeMeasured);
      assert.deepEqual(Array.from(prototype.adjustments, x => x.meters), java.adjustments.map(x => x.meters));
      count++;
    }
  }
}
console.log(`PASS: ${count} prototype scenarios match the Java API (wind, lie, trajectory, elevation, air and margins).`);
