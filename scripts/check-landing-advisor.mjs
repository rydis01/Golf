import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../mobile/www/landing-advisor.js', import.meta.url), 'utf8'), context);
const analyze = context.window.LandingAdvisor.analyze;
// Synthetic geometry in metres near National: a flag beside a bunker and green edge.
const origin = { lat: 55.57, lon: 13.18 };
const point = (x, y) => [origin.lon + x / (111195 * Math.cos(origin.lat * Math.PI / 180)), origin.lat + y / 111195];
const polygon = (tags, vertices) => ({ properties: { tags }, geometry: { type: 'Polygon', coordinates: [vertices.map(([x,y]) => point(x,y))] } });
const green = polygon({ golf: 'green' }, [[-3,-15],[35,-15],[35,15],[-3,15],[-3,-15]]);
const bunker = polygon({ golf: 'bunker' }, [[-10,-10],[-4,-10],[-4,10],[-10,10],[-10,-10]]);
const result = { playsLike:150,rangeLow:144,rangeHigh:156,lateralDrift:2,lateralLow:-4,lateralHigh:8 };
const advice = analyze(origin, [green,bunker], result);
assert.ok(advice.available && advice.candidate);
assert.equal(advice.nearest.kind, 'bunker');
assert.ok(advice.nearest.distance < 5);
assert.ok(advice.candidate.clearance > 6);
assert.ok(advice.candidate.flagOffset > 2);
assert.equal(advice.candidate.fullMargin, true);
assert.equal(analyze(origin, [bunker], result).available, false);
assert.equal(analyze(origin, [green,bunker], result, 80).candidate.fullMargin, false);
const centered = polygon({ golf: 'green' }, [[-30,-30],[30,-30],[30,30],[-30,30],[-30,-30]]);
assert.equal(analyze(origin, [centered], result).candidate, null);
const water = polygon({ natural: 'water' }, [[-10,-10],[-4,-10],[-4,10],[-10,10],[-10,-10]]);
assert.equal(analyze(origin, [green,water], result).nearest.kind, 'vatten');
console.log('PASS: bunker/water proximity, alternative on same green, missing green, GPS margin and ample flag clearance.');
