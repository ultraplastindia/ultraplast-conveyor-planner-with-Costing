'use strict';
var Sim = require('../simulation.js'), T = require('./helpers.js'), approx = T.approx, eq = T.eq, ok = T.ok, test = T.test;
console.log('Simulation maths');
var pts = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }];
test('track length and interpolation along a 3+4 m L path', function () {
  var tr = Sim.buildTrack(pts); approx(tr.length, 7); var p = tr.at(5); approx(p.x, 3); approx(p.y, 2); approx(tr.at(1.5).x, 1.5); approx(tr.at(99).y, 4);
});
test('track reports unit tangent (3-4-5 incline -> 0.6 / 0 / 0.8)', function () { var q = Sim.buildTrack([{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }]).at(2.5); approx(q.tx, 0.6); approx(q.ty, 0); approx(q.tz, 0.8); });
test('incline counted in 3-D length (3 run, 4 rise -> 5)', function () { approx(Sim.buildTrack([{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }]).length, 5); });
test('products appear one per pitch and are spaced exactly one pitch apart', function () {
  var v = 0.2, pitch = 0.15, L = 12, pos = Sim.positions(3, v, pitch, L); // 0.6 m travelled -> k=0..4 (0.6,0.45,0.30,0.15,0.0)
  eq(pos.length, 5); for (var i = 1; i < pos.length; i++) approx(pos[i] - pos[i - 1], pitch, 1e-9);
});
test('nothing delivered until the first product reaches the end', function () { eq(Sim.delivered(10, 0.2, 0.15, 12), 0); eq(Sim.delivered(59.9, 0.2, 0.15, 12), 0); eq(Sim.delivered(60.1, 0.2, 0.15, 12), 1); });
test('steady-state output = throughput implied by speed/pitch (66.7/min for 10 m/min, 150 mm)', function () {
  var v = 10 / 60, pitch = 0.15, L = 12, t1 = 600, t2 = 660, d = Sim.delivered(t2, v, pitch, L) - Sim.delivered(t1, v, pitch, L);
  approx(d, 66.67, 1.01);
});
test('steady state: on-conveyor count = floor(L/pitch)+1 at most', function () { var n = Sim.positions(1000, 10 / 60, 0.15, 12).length; ok(n === 80 || n === 81, String(n)); });
process.exit(T.summary() ? 1 : 0);
