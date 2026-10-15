'use strict';
/* Run:  node tests/calculations.test.js     (Node 14+; no dependencies) */
var C = require('../calculations.js');
var P = require('../products.js');
var T = require('./helpers.js');
var test = T.test, approx = T.approx, ok = T.ok, eq = T.eq;

function base(over) {
  var r = {
    unitSystem: 'metric', layout: 'straight', industry: 'beverages',
    floorLength: '20', floorWidth: '6', routeLength: '12',
    handling: 'bottles', prodLength: '100', prodWidth: '100', prodHeight: '250', weight: '0.5', weightUnit: 'kg',
    gap: '50', rate: '60', rateUnit: 'per_min', speed: '10', lanes: '1', hoursPerDay: '16', electrical: '415V 3ph',
    obstacles: [], segments: [], conditions: ['dry']
  };
  for (var k in over) r[k] = over[k];
  return r;
}
function run(over) { return C.analyse(C.normalize(base(over)), P); }
function has(res, level, text) { return res.issues.some(function (i) { return i.level === level && i.msg.indexOf(text) >= 0; }); }

console.log('1. Simple straight conveyor');
test('floor area = L x W (F1) and is not used as conveyor length', function () {
  var r = run({});
  approx(r.floor.area, 120); approx(r.path.total, 12);
});
test('route length is customer-provided path length', function () {
  var r = run({}); eq(r.path.totalStatus, C.STATUS.CUSTOMER); approx(r.path.straight, 12); approx(r.path.curved, 0);
});
test('pitch, required speed, capacity, units on conveyor, live load (F5-F8)', function () {
  var r = run({});
  approx(r.throughput.productPitchMm, 150); approx(r.throughput.requiredSpeed, 9);
  approx(r.throughput.capacityPerMin, 66.667, 0.01); eq(r.throughput.unitsOnConveyor, 80); approx(r.throughput.liveLoadKg, 40);
});
test('two-pulley loop length = 2C + pi*D (F9)', function () {
  var r = run({ pulleyDia: '100' });
  eq(r.loop.status, C.STATUS.CALC); approx(r.loop.loopLengthM, 24 + Math.PI * 0.1, 1e-3);
  approx(r.loop.routeLengthM, 12); ok(r.loop.loopLengthM !== r.loop.routeLengthM, 'loop must differ from route');
});
test('sprocket pitch diameter from pitch + teeth (F10): 38 mm, 8 teeth', function () {
  var r = run({ pitch: '38', sprocketTeeth: '8' });
  approx(r.loop.diameterMm, 38 / Math.sin(Math.PI / 8), 0.01);
  eq(r.loop.pitchRowsMin, Math.ceil((24 + Math.PI * (38 / Math.sin(Math.PI / 8)) / 1000) * 1000 / 38));
});
test('belt quantity NOT estimated without diameter/pitch (engineering review)', function () {
  var r = run({}); eq(r.loop.status, C.STATUS.REVIEW);
  ok(r.equipment.some(function (e) { return /Belt|Chain/.test(e.item) && e.qty === 'To be engineered'; }));
});
test('motor / torque / tension always engineering review', function () {
  var r = run({}); ok(r.engineering.length >= 5); ok(r.engineering.every(function (e) { return e.status === C.STATUS.REVIEW; }));
});
test('fits on floor; too-long route flagged', function () {
  eq(run({}).fit.status, 'fits');
  var r = run({ routeLength: '30' }); eq(r.fit.status, 'does_not_fit'); ok(has(r, 'error', 'does not fit'));
});
test('insufficient speed flagged', function () {
  ok(has(run({ speed: '5' }), 'error', 'below the required'));
});
test('accumulation worst-case load computed', function () {
  var r = run({ accumulation: 'long', maxWeight: '0.6' }); eq(r.throughput.accumulationLoadKg, 120 * 0.6);
});
test('no price / quotation values anywhere in output', function () {
  ok(!/(₹|\$|INR|Rs\.?\s?\d)/.test(JSON.stringify(run({}))));
});

console.log('2. Incline');
test('incline length from run + rise: sqrt(4^2 + 1^2) (F4)', function () {
  var r = run({ layout: 'inclined', segments: [{ type: 'straight', length: '3' }, { type: 'incline', horizontal: '4', rise: '1000' }] });
  approx(r.path.inclined, Math.sqrt(17), 1e-3); approx(r.path.total, 3 + Math.sqrt(17), 1e-3); approx(r.path.netRise, 1.0);
  approx(r.path.details[1].angle, Math.atan(0.25) * 180 / Math.PI, 0.01);
});
test('incline length from run + angle: 4 / cos(15deg)', function () {
  var r = run({ layout: 'inclined', segments: [{ type: 'incline', horizontal: '4', inclineAngle: '15' }] });
  approx(r.path.inclined, 4 / Math.cos(15 * Math.PI / 180), 1e-3);
});
test('decline (negative rise) handled; length still positive', function () {
  var r = run({ layout: 'inclined', segments: [{ type: 'incline', horizontal: '4', rise: '-500' }] });
  approx(r.path.netRise, -0.5); approx(r.path.inclined, Math.sqrt(16.25), 1e-3);
});
test('incline recommended; no max angle claimed (config null -> review note)', function () {
  var r = run({ layout: 'inclined', segments: [{ type: 'incline', horizontal: '4', rise: '1000' }] });
  eq(r.recommendation.primaryId, 'inclined');
});
test('height difference without incline segment is flagged', function () {
  var r = run({ inletHeight: '800', dischargeHeight: '1500' });
  ok(has(r, 'warning', 'no incline segment'));
});
test('inconsistent rise vs angle flagged', function () {
  var r = run({ layout: 'inclined', segments: [{ type: 'incline', horizontal: '4', rise: '1000', inclineAngle: '30' }] });
  ok(has(r, 'warning', 'disagree'));
});

console.log('3. Curved conveyor');
test('90 degree curve arc length = R x theta (F3)', function () {
  var r = run({ layout: 'curved', segments: [{ type: 'straight', length: '2' }, { type: 'curve', angle: '90', radius: '800', direction: 'left' }, { type: 'straight', length: '2' }] });
  approx(r.path.curved, 0.8 * Math.PI / 2, 1e-3); approx(r.path.total, 4 + 0.8 * Math.PI / 2, 1e-3);
});
test('curve end point geometry with entered start (0.5,0.5), heading east', function () {
  var r = run({ layout: 'curved', startX: '0.5', startY: '0.5', startHeading: '0', segments: [{ type: 'straight', length: '2' }, { type: 'curve', angle: '90', radius: '800', direction: 'left' }, { type: 'straight', length: '2' }] });
  approx(r.path.end.x, 3.3, 1e-6); approx(r.path.end.y, 3.3, 1e-6); approx(r.path.end.heading, 90, 1e-6);
});
test('right turn mirrors left turn', function () {
  var r = run({ layout: 'curved', startX: '1', startY: '3', segments: [{ type: 'curve', angle: '90', radius: '1000', direction: 'right' }] });
  approx(r.path.end.x, 2, 1e-6); approx(r.path.end.y, 2, 1e-6); approx(r.path.end.heading, 270, 1e-6);
});
test('curved layout recommends a curve-capable type', function () {
  var r = run({ layout: 'curved', segments: [{ type: 'curve', angle: '90', radius: '800' }] });
  ok(['side_flex', 'powered_curved_roller', 'curved'].indexOf(r.recommendation.primaryId) >= 0);
});
test('radius below published side-flex limit (PP: 2.6 x width) is an error', function () {
  var r = run({ layout: 'curved', categoryPref: 'side_flex', beltWidth: '300', segments: [{ type: 'curve', angle: '90', radius: '500' }] });
  ok(has(r, 'error', 'below the published minimum')); eq(r.radiusChecks[0].ok, false); approx(r.radiusChecks[0].limitMm, 780, 1e-6);
});
test('radius above limit passes; SS tab-flex uses fixed 500 mm', function () {
  var r = run({ layout: 'curved', categoryPref: 'side_flex', beltWidth: '300', segments: [{ type: 'curve', angle: '90', radius: '900' }] });
  eq(r.radiusChecks[0].ok, true);
  var r2 = run({ layout: 'curved', categoryPref: 'side_flex', material: 'ss304', segments: [{ type: 'curve', angle: '90', radius: '450' }] });
  eq(r2.radiusChecks[0].ok, false); approx(r2.radiusChecks[0].limitMm, 500);
});

console.log('4. Multi-segment layout (U shape)');
var U = [{ type: 'straight', length: '6' }, { type: 'curve', angle: '90', radius: '1000', direction: 'left' }, { type: 'straight', length: '2' }, { type: 'curve', angle: '90', radius: '1000', direction: 'left' }, { type: 'straight', length: '6' }];
test('U route total = 14 + pi; straight 14; curved pi', function () {
  var r = run({ layout: 'U', floorLength: '10', floorWidth: '6', segments: U });
  approx(r.path.total, 14 + Math.PI, 1e-3); approx(r.path.straight, 14); approx(r.path.curved, Math.PI, 1e-3);
});
test('U route with right turns, start (8,1) heading west, ends at (8,5) heading east', function () {
  var segs = U.map(function (s) { var c = JSON.parse(JSON.stringify(s)); if (c.direction) c.direction = 'right'; return c; });
  var r = run({ layout: 'U', startX: '8', startY: '1', startHeading: '180', floorLength: '10', floorWidth: '12', segments: segs });
  approx(r.path.end.x, 8, 1e-6); approx(r.path.end.y, 5, 1e-6); approx(r.path.end.heading, 0, 1e-6);
});
test('U route footprint 7 x 4 m; auto-placed and fits a 10 x 6 floor', function () {
  var r = run({ layout: 'U', floorLength: '10', floorWidth: '6', segments: U });
  approx(r.fit.footprint.w + r.fit.footprint.h, 11, 1e-2); eq(r.fit.status, 'fits'); eq(r.path.placement, 'auto');
});
test('auto-placement rotates route to fit a narrow floor', function () {
  var r = run({ layout: 'U', floorLength: '5', floorWidth: '8', segments: U });
  eq(r.fit.status, 'fits'); ok(r.path.startHeading === 90 || r.path.startHeading === 270);
});
test('obstacle on the route is detected', function () {
  var r = run({ layout: 'straight', startX: '0', startY: '1', routeLength: '10', obstacles: [{ name: 'Pillar', x: '5', y: '0.5', w: '1', d: '1' }] });
  ok(r.collisions.indexOf('Pillar') >= 0); ok(has(r, 'error', 'Pillar'));
});
test('entered end point mismatch flagged', function () {
  var r = run({ layout: 'U', startX: '0', startY: '0', endX: '0', endY: '9', floorLength: '10', floorWidth: '12', segments: U });
  ok(has(r, 'warning', 'ends'));
});
test('multi layout is marked for engineering review', function () {
  var r = run({ layout: 'multi', segments: [{ type: 'straight', length: '5' }] });
  eq(r.recommendation.primaryId, 'custom'); ok(has(r, 'info', 'Multi-conveyor'));
});
test('belt loop NOT calculated for multi-segment route', function () {
  var r = run({ layout: 'U', floorLength: '10', floorWidth: '6', pulleyDia: '100', segments: U });
  eq(r.loop.status, C.STATUS.REVIEW);
});

console.log('5. Missing dimensions');
test('no floor size: no area, listed as missing, no crash', function () {
  var r = run({ floorLength: '', floorWidth: '' });
  eq(r.floor.area, null); ok(r.missing.some(function (m) { return /floor length/i.test(m); }));
});
test('no route length: no path, listed as missing', function () {
  var r = run({ routeLength: '' }); eq(r.path, null); ok(r.missing.some(function (m) { return /route length/i.test(m); }));
});
test('incomplete curve (no radius): totals partial, status review, flagged', function () {
  var r = run({ layout: 'L', segments: [{ type: 'straight', length: '3' }, { type: 'curve', angle: '90' }, { type: 'straight', length: '3' }] });
  eq(r.path.complete, false); eq(r.path.totalStatus, C.STATUS.REVIEW); approx(r.path.total, 3);
});
test('no throughput data: required speed absent, listed as missing', function () {
  var r = run({ rate: '', speed: '' }); eq(r.throughput.requiredSpeed, undefined);
  ok(r.missing.some(function (m) { return /throughput or conveying speed/i.test(m); }));
});
test('required-field gate for each wizard step', function () {
  var n = C.normalize({ unitSystem: 'metric', obstacles: [], segments: [] });
  eq(C.requiredForStep(1, n).length, 3); eq(C.requiredForStep(2, n).length, 4); eq(C.requiredForStep(3, n).length, 1);
});
test('belt width envelope reported but width itself not invented', function () {
  var r = run({ beltWidth: '' }); approx(r.width.productEnvelopeMm, 100); eq(r.width.status, C.STATUS.REVIEW); eq(r.width.minimumWidthMm, undefined);
});

console.log('6. Invalid units / negative / non-numeric inputs');
test('negative floor width rejected', function () { var r = run({ floorWidth: '-5' }); ok(r.validation.errors.some(function (e) { return e.field === 'floorWidth'; })); });
test('zero and negative weight rejected', function () { ok(run({ weight: '0' }).validation.errors.length > 0); ok(run({ weight: '-1' }).validation.errors.length > 0); });
test('text in numeric field rejected ("12 m", "abc", "1,5")', function () {
  ['12 m', 'abc', '1,5', '1e', '--3'].forEach(function (t) { ok(run({ routeLength: t }).validation.errors.some(function (e) { return e.field === 'routeLength'; }), t); });
});
test('unknown weight unit rejected', function () { ok(run({ weightUnit: 'stone' }).validation.errors.some(function (e) { return /Unknown weight unit/.test(e.msg); })); });
test('unknown unit system rejected', function () { ok(run({ unitSystem: 'cubits' }).validation.errors.some(function (e) { return e.field === 'unitSystem'; })); });
test('bad throughput unit rejected', function () { ok(run({ rateUnit: 'per_year' }).validation.errors.length > 0); });
test('lanes must be a whole number >= 1', function () { ['0', '1.5', '-1'].forEach(function (v) { ok(run({ lanes: v }).validation.errors.some(function (e) { return e.field === 'lanes'; }), v); }); });
test('hours per day limited to 24', function () { ok(run({ hoursPerDay: '30' }).validation.errors.length > 0); });
test('max weight below typical weight rejected', function () { ok(run({ weight: '2', maxWeight: '1' }).validation.errors.some(function (e) { return e.field === 'maxWeight'; })); });
test('negative curve radius / zero straight length rejected', function () {
  ok(run({ layout: 'L', segments: [{ type: 'curve', angle: '90', radius: '-100' }] }).validation.errors.length > 0);
  ok(run({ layout: 'L', segments: [{ type: 'straight', length: '0' }] }).validation.errors.length > 0);
});
test('curve angle > 360 rejected; incline angle >= 90 rejected', function () {
  ok(run({ layout: 'L', segments: [{ type: 'curve', angle: '400', radius: '800' }] }).validation.errors.length > 0);
  ok(run({ layout: 'L', segments: [{ type: 'incline', horizontal: '3', inclineAngle: '90' }] }).validation.errors.length > 0);
});
test('imperial conversion: 65.6168 ft = 20 m, 212 F = 100 C, 10 in = 254 mm, 2.2046 lb ~ 1 kg', function () {
  var n = C.normalize({ unitSystem: 'imperial', floorLength: '65.6168', temperature: '212', prodLength: '10', weight: '2.2046', weightUnit: 'lb', speed: '100' });
  approx(n.floorLength, 20, 1e-3); approx(n.temperature, 100, 1e-9); approx(n.prodLength, 254, 1e-9); approx(n.weight, 1, 1e-3); approx(n.speed, 30.48, 1e-6);
});
test('weight units g / kg / oz', function () {
  approx(C.normalize({ weight: '500', weightUnit: 'g' }).weight, 0.5); approx(C.normalize({ weight: '16', weightUnit: 'oz' }).weight, 0.45359, 1e-4);
});
test('per-hour throughput converts to per-minute', function () { approx(run({ rate: '3600', rateUnit: 'per_hour' }).throughput.ratePerMin, 60); });
test('blank optional fields never produce NaN output', function () {
  var s = JSON.stringify(run({ gap: '', speed: '', hoursPerDay: '', lanes: '' }));
  ok(!/NaN/.test(s));
});

console.log('7. Unsupported engineering configuration');
test('straight modular belt chosen for an L-shaped (curved) route -> error', function () {
  var r = run({ layout: 'L', categoryPref: 'straight_modular', segments: [{ type: 'straight', length: '3' }, { type: 'curve', angle: '90', radius: '900' }, { type: 'straight', length: '3' }] });
  ok(has(r, 'error', 'Unsupported configuration'));
});
test('gravity roller on a curve -> error', function () {
  var r = run({ layout: 'L', categoryPref: 'gravity_roller', segments: [{ type: 'curve', angle: '90', radius: '900' }] }); ok(has(r, 'error', 'Unsupported configuration'));
});
test('curves + incline -> custom / engineering review', function () {
  var r = run({ layout: 'custom', segments: [{ type: 'curve', angle: '90', radius: '900' }, { type: 'incline', horizontal: '3', rise: '600' }] });
  eq(r.recommendation.primaryId, 'custom');
});
test('roller conveyor with food contact -> hygiene warning', function () {
  var r = run({ categoryPref: 'powered_roller', foodContact: 'direct', handling: 'cartons' }); ok(has(r, 'warning', 'hygiene'));
});
test('incline on a category with unknown incline support -> confirm warning', function () {
  var r = run({ layout: 'inclined', categoryPref: 'straight_modular', segments: [{ type: 'incline', horizontal: '3', rise: '600' }] }); ok(has(r, 'warning', 'not configured'));
});
test('high temperature -> material suitability warning (no temperature data invented)', function () {
  ok(has(run({ temperature: '90' }), 'warning', 'temperature ratings are not configured'));
});
test('no electrical supply -> gravity roller suggested', function () { eq(run({ electrical: 'none', handling: 'cartons' }).recommendation.primaryId, 'gravity_roller'); });
test('food, soft packs -> food-grade belt', function () { eq(run({ handling: 'bags', foodContact: 'direct', industry: 'food' }).recommendation.primaryId, 'food_pu_pvc'); });
test('conveyor narrower than product flagged', function () { ok(has(run({ beltWidth: '80' }), 'error', 'narrower')); });

process.exit(T.summary() ? 1 : 0);
