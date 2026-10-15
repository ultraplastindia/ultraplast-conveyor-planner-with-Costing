'use strict';
var H = require('./helpers'), test = H.test, approx = H.approx, ok = H.ok, eq = H.eq;
var C = require('../calculations.js'), P = require('../products.js'), V = require('../conveyor3d.js'), fs = require('fs'), path = require('path');
console.log('conveyor3d (3-D geometry accuracy)');

function plan(raw, extra) {
  var inp = C.normalize(raw), res = C.analyse(inp, P);
  var sc = { floorL: inp.floorLength, floorW: inp.floorWidth, workingH: inp.workingHeight > 0 ? inp.workingHeight / 1000 : null, obstacles: inp.obstacles, path: res.path, inletMm: inp.inletHeight, dischargeMm: inp.dischargeHeight,
    beltWidthM: 0.4, widthNote: 'entered width', prod: { alongMm: 100, acrossMm: 80, heightMm: 150, pitchMm: 150, lanes: 1 } };
  for (var k in (extra || {})) sc[k] = extra[k];
  return { inp: inp, res: res, scene: sc, built: V.buildScene(sc), desc: V.describe(sc) };
}
var base = { floorLength: '20', floorWidth: '6', workingHeight: '3500', layout: 'straight', routeLength: '10', inletHeight: '900', unitSystem: 'metric' };
function tops(sc) { return sc.polys.filter(function (q) { return q.top; }); }
function dist(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); }

test('floor-only scene: floor slab has exactly the entered length and width', function () {
  var s = V.buildScene({ floorL: 20, floorW: 6 }), xs = [], ys = [];
  s.polys.forEach(function (q) { q.p.forEach(function (v) { xs.push(v[0]); ys.push(v[1]); }); });
  approx(Math.max.apply(null, xs) - Math.min.apply(null, xs), 20); approx(Math.max.apply(null, ys) - Math.min.apply(null, ys), 6); ok(s.empty);
});
test('empty input does not throw and still gives a grid', function () { var s = V.buildScene({}); ok(s.empty && s.grid && s.all); });
test('floor dimension labels carry the entered numbers', function () {
  var s = plan(base).built, t = s.dims.map(function (d) { return d.text; }).join('|'); ok(/Floor length 20\.00 m/.test(t) && /Floor width 6\.00 m/.test(t) && /Working height 3500 mm/.test(t), t);
});
test('straight 10 m belt: top strips add up to 10.000 m and are 0.400 m wide', function () {
  var b = plan(base).built, ts = tops(b), sum = 0;
  ts.forEach(function (q) { sum += q.top.s1 - q.top.s0; approx(dist(q.top.aL, q.top.aR), 0.4, 1e-6, 'belt width'); approx(dist(q.top.bL, q.top.bR), 0.4, 1e-6, 'belt width end'); });
  approx(sum, 10, 1e-6, 'belt length');
  var f = b.stations[0], l = b.stations[b.stations.length - 1]; approx(dist(f.p, l.p), 10, 1e-6, 'start-to-end');
});
test('belt surface sits at the entered inlet height (900 mm) and stays flat', function () {
  var b = plan(base).built; b.stations.forEach(function (s) { approx(s.p[2], 0.9, 1e-9); });
  tops(b).forEach(function (q) { [q.top.aL, q.top.aR, q.top.bL, q.top.bR].forEach(function (v) { approx(v[2], 0.9, 1e-9); }); });
});
test('top faces point up (normal +Z) on a flat run', function () { tops(plan(base).built).forEach(function (q) { approx(q.n[2], 1, 1e-9); }); });
test('incline: run 4 m, rise 1 m -> belt rises exactly 1000 mm and length is sqrt(17)', function () {
  var raw = { floorLength: '20', floorWidth: '6', layout: 'multi', unitSystem: 'metric', inletHeight: '600', segments: [{ type: 'straight', length: '3' }, { type: 'incline', horizontal: '4', rise: '1000' }, { type: 'straight', length: '2' }] };
  var p = plan(raw), st = p.built.stations; approx(st[0].p[2], 0.6, 1e-9); approx(st[st.length - 1].p[2], 1.6, 1e-9);
  var seg = p.desc.segments[1]; eq(seg.type, 'incline'); approx(seg.lengthM, Math.sqrt(17), 1e-3); approx(seg.riseM, 1, 1e-6); approx(seg.startZ, 0.6, 1e-9); approx(seg.endZ, 1.6, 1e-9);
  approx(p.desc.elevations.maxM, 1.6, 1e-9); approx(p.desc.elevations.minM, 0.6, 1e-9);
  var slope = tops(p.built).filter(function (q) { return q.top.aL[2] > 0.61 && q.top.bL[2] < 1.59 && Math.abs(q.top.bL[2] - q.top.aL[2]) > 1e-6; });
  ok(slope.length > 3); slope.forEach(function (q) { ok(q.n[2] > 0 && q.n[2] < 1, 'tilted normal'); approx(Math.atan2(q.n[0], q.n[2]) * 180 / Math.PI, -Math.atan(0.25) * 180 / Math.PI, 0.6, 'normal tilt'); });
  ok(p.built.dims.some(function (d) { return /Rise 1000 mm/.test(d.text); }) && p.built.dims.some(function (d) { return /Run 4\.00 m/.test(d.text); }));
});
test('90 degree curve R = 1.0 m: centre-line keeps radius 1.0 m, edges are R -/+ W/2', function () {
  var raw = { floorLength: '20', floorWidth: '6', layout: 'multi', unitSystem: 'metric', inletHeight: '900', segments: [{ type: 'straight', length: '2' }, { type: 'curve', angle: '90', radius: '1000', direction: 'left' }, { type: 'straight', length: '2' }] };
  var p = plan(raw), d = p.res.path.details[1], pts = p.res.path.points, a = pts[d.p0], c = [a.x, a.y + 1.0];
  for (var i = d.p0; i <= d.p1; i++) approx(Math.sqrt(Math.pow(pts[i].x - c[0], 2) + Math.pow(pts[i].y - c[1], 2)), 1.0, 1e-6, 'centre-line radius');
  var ts = tops(p.built).filter(function (q) { return q.top.s0 > 2.0 + 1e-6 && q.top.s1 < 2 + Math.PI / 2 - 1e-6; }); ok(ts.length >= 5);
  ts.forEach(function (q) { var rl = Math.sqrt(Math.pow(q.top.aL[0] - c[0], 2) + Math.pow(q.top.aL[1] - c[1], 2)), rr = Math.sqrt(Math.pow(q.top.aR[0] - c[0], 2) + Math.pow(q.top.aR[1] - c[1], 2)); approx(rl, 0.8, 2e-3, 'inner edge (left turn)'); approx(rr, 1.2, 2e-3, 'outer edge'); });
  approx(p.desc.segments[1].lengthM, Math.PI / 2, 1e-3); approx(p.desc.segments[1].radiusM, 1.0, 1e-9); approx(p.desc.segments[1].angleDeg, 90, 1e-9);
  ok(p.built.dims.some(function (d) { return /^R 1000 mm$/.test(d.text); }), 'radius dimension'); ok(p.built.tags.some(function (t) { return /Curve left R 1000 mm × 90°/.test(t.text); }));
});
test('U layout from the shipped example: segment table matches the calculated path', function () {
  var raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'u-shaped-multi-segment.json'), 'utf8')), p = plan(raw);
  eq(p.desc.segments.length, 5); var tot = 0; p.desc.segments.forEach(function (s) { tot += s.lengthM; }); approx(tot, p.res.path.total, 2e-3); approx(p.desc.overall.pathM, p.res.path.total, 1e-9);
  approx(p.built.track.length, p.res.path.total, 3e-3, '3-D track length equals calculated route');
});
test('end of the belt in 3-D equals the calculated end point', function () {
  var raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'l-shaped-curved-line.json'), 'utf8')), p = plan(raw), l = p.built.stations[p.built.stations.length - 1];
  approx(l.p[0], p.res.path.end.x, 1e-6); approx(l.p[1], p.res.path.end.y, 1e-6);
});
test('support legs: reach the floor, stop at the frame, and are all drawn', function () {
  var b = plan(base).built, legs = b.polys.filter(function (q) { return q.tag === 'support'; }); ok(legs.length > 0 && b.legCount >= 3);
  var zs = []; legs.forEach(function (q) { q.p.forEach(function (v) { zs.push(v[2]); }); }); approx(Math.min.apply(null, zs), 0, 1e-9); ok(Math.max.apply(null, zs) < 0.9);
});
test('conveyor at floor level (inlet 0) draws no legs and does not throw', function () { var p = plan({ floorLength: '10', floorWidth: '4', layout: 'straight', routeLength: '3', inletHeight: '0', unitSystem: 'metric' }); eq(p.built.legCount, 0); });
test('leg spacing follows the engineering value when configured', function () {
  var a = plan(base).built.legCount, b = plan(base, { legSpacingMm: 5000 }).built.legCount; ok(b < a, a + ' vs ' + b);
});
test('product box has exactly the entered size and sits on the belt surface', function () {
  var q = V.obox([0, 0, 0.9], [1, 0, 0], [0, 1, 0], [0, 0, 1], [-0.05, 0.05], [-0.04, 0.04], [0, 0.15], [1, 0, 0], { skipBottom: true }), xs = [], ys = [], zs = [];
  q.forEach(function (f) { f.p.forEach(function (v) { xs.push(v[0]); ys.push(v[1]); zs.push(v[2]); }); });
  approx(Math.max.apply(null, xs) - Math.min.apply(null, xs), 0.1); approx(Math.max.apply(null, ys) - Math.min.apply(null, ys), 0.08); approx(Math.max.apply(null, zs) - Math.min.apply(null, zs), 0.15); approx(Math.min.apply(null, zs), 0.9);
  eq(q.length, 5); q.forEach(function (f) { approx(Math.sqrt(f.n[0] * f.n[0] + f.n[1] * f.n[1] + f.n[2] * f.n[2]), 1, 1e-9); });
});
test('box faces point outwards (normal away from the box centre)', function () {
  V.obox([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 1], [-1, 1], [-1, 1], [1, 1, 1], {}).forEach(function (f) { ok(f.n[0] * f.cen[0] + f.n[1] * f.cen[1] + f.n[2] * f.cen[2] > 0, 'outward'); });
});
test('every belt-slab face points away from the slab centre on a 180-degree right-hand curve', function () {
  var raw = { floorLength: '20', floorWidth: '6', layout: 'multi', unitSystem: 'metric', inletHeight: '900', segments: [{ type: 'curve', angle: '180', radius: '1500', direction: 'right' }] };
  var b = plan(raw).built, n = 0;
  b.polys.filter(function (q) { return q.tag === 'belt'; }).forEach(function (q) {
    var best = null, bd = 1e9; b.stations.forEach(function (st) { var d = dist(st.p, q.cen); if (d < bd) { bd = d; best = st; } });
    var c = [best.p[0], best.p[1], best.p[2] - 0.006], v = [q.cen[0] - c[0], q.cen[1] - c[1], q.cen[2] - c[2]];
    ok(q.n[0] * v[0] + q.n[1] * v[1] + q.n[2] * v[2] > -1e-9, 'face points inwards'); n++;
  });
  ok(n > 100, 'checked ' + n + ' faces');
});
test('right-hand curve: LEFT edge is the outer edge (R + W/2), RIGHT edge the inner (R - W/2)', function () {
  var raw = { floorLength: '20', floorWidth: '6', layout: 'multi', unitSystem: 'metric', inletHeight: '900', segments: [{ type: 'straight', length: '1' }, { type: 'curve', angle: '90', radius: '1000', direction: 'right' }] };
  var p = plan(raw), d = p.res.path.details[1], a = p.res.path.points[d.p0], c = [a.x, a.y - 1.0];
  var ts = tops(p.built).filter(function (q) { return q.top.s0 > 1 + 1e-6 && q.top.s1 < 1 + Math.PI / 2 - 1e-6; }); ok(ts.length >= 5);
  ts.forEach(function (q) { approx(Math.sqrt(Math.pow(q.top.aL[0] - c[0], 2) + Math.pow(q.top.aL[1] - c[1], 2)), 1.2, 2e-3); approx(Math.sqrt(Math.pow(q.top.aR[0] - c[0], 2) + Math.pow(q.top.aR[1] - c[1], 2)), 0.8, 2e-3); });
});
test('no inlet height entered -> drawn at an illustrative 900 mm and said so', function () {
  var raw = JSON.parse(JSON.stringify(base)); delete raw.inletHeight; var p = plan(raw); approx(p.built.stations[0].p[2], V.IND.defaultElevation); ok(p.built.notes.some(function (n) { return /Inlet height was not entered/.test(n); })); eq(p.desc.elevations.basis, 'illustrative');
});
test('only a discharge height entered -> inlet derived from it and the rise', function () {
  var raw = { floorLength: '20', floorWidth: '6', layout: 'multi', unitSystem: 'metric', dischargeHeight: '1600', segments: [{ type: 'straight', length: '3' }, { type: 'incline', horizontal: '4', rise: '1000' }] };
  var p = plan(raw); approx(p.built.stations[0].p[2], 0.6, 1e-9); eq(p.desc.elevations.basis, 'from discharge height');
});
test('belt width not entered -> flagged, never presented as entered', function () {
  var p = plan(base, { beltWidthM: 0.3, widthNote: 'illustrative width' }); ok(p.built.notes.some(function (n) { return /Belt width was not entered/.test(n); })); var d = p.built.dims.filter(function (x) { return /Belt width/.test(x.text); })[0]; ok(/not entered/.test(d.text) && d.kind === 'ind');
});
test('entered belt width labelled as entered (black dimension)', function () {
  var d = plan(base).built.dims.filter(function (x) { return /Belt width/.test(x.text); })[0]; eq(d.text, 'Belt width 400 mm'); eq(d.kind, 'entered');
});
test('route below floor level is reported', function () {
  var raw = { floorLength: '20', floorWidth: '6', layout: 'multi', unitSystem: 'metric', inletHeight: '200', segments: [{ type: 'incline', horizontal: '3', rise: '-800' }] };
  ok(plan(raw).desc.notes.some(function (n) { return /below floor level/.test(n); }));
});
test('product above working height is reported', function () {
  var raw = JSON.parse(JSON.stringify(base)); raw.workingHeight = '1000'; ok(plan(raw).desc.notes.some(function (n) { return /exceeds the working height/.test(n); }));
});
test('incomplete route draws only the completed segments and says so', function () {
  var raw = { floorLength: '20', floorWidth: '6', layout: 'multi', unitSystem: 'metric', inletHeight: '900', segments: [{ type: 'straight', length: '5' }, { type: 'curve', angle: '90', radius: '', direction: 'left' }] };
  var p = plan(raw); approx(p.built.track.length, 5, 1e-6); ok(p.built.notes.some(function (n) { return /incomplete/.test(n); }));
});
test('obstacle footprint is drawn at the entered position and size', function () {
  var s = V.buildScene({ floorL: 20, floorW: 6, obstacles: [{ name: 'Column', x: 4, y: 1, w: 0.5, d: 0.6 }] }), q = s.polys.filter(function (p) { return p.tag === 'obst'; }), xs = [], ys = [];
  q.forEach(function (f) { f.p.forEach(function (v) { xs.push(v[0]); ys.push(v[1]); }); });
  approx(Math.min.apply(null, xs), 4); approx(Math.max.apply(null, xs), 4.5); approx(Math.min.apply(null, ys), 1); approx(Math.max.apply(null, ys), 1.6); ok(s.notes.some(function (n) { return /Obstacle height was not entered/.test(n); }));
});
test('main axis snaps to the travel direction (views are relative to the conveyor)', function () {
  eq(plan(base).built.axisTheta % 360, 0);
  var raw = JSON.parse(JSON.stringify(base)); raw.startX = '2'; raw.startY = '2'; raw.startHeading = '90'; eq(((plan(raw).built.axisTheta % 360) + 360) % 360, 90);
});
test('many segments: tags shorten to numbers only (no clutter)', function () {
  var segs = []; for (var i = 0; i < 12; i++) segs.push({ type: 'straight', length: '1' });
  var p = plan({ floorLength: '20', floorWidth: '6', layout: 'multi', unitSystem: 'metric', inletHeight: '900', segments: segs }); ok(p.built.tags.filter(function (t) { return t.kind === 'seg'; }).every(function (t) { return /^S\d+$/.test(t.text); }));
});
test('long routes are decimated but segment ends are kept', function () {
  var p = plan({ floorLength: '300', floorWidth: '10', layout: 'straight', routeLength: '200', unitSystem: 'metric', inletHeight: '900' }); ok(p.built.stations.length <= 320, 'stations ' + p.built.stations.length); approx(p.built.stations[p.built.stations.length - 1].s, 200, 1e-6);
});
test('flow arrows are placed along the route, inside it', function () { var b = plan(base).built; ok(b.arrows.length >= 2); b.arrows.forEach(function (a) { ok(a.s > 0 && a.s < 10); }); });
test('units follow the formatter handed in (imperial display)', function () {
  var b = plan(base, { fmt: function (m) { return (m / 0.3048).toFixed(1) + ' ft'; } }).built; ok(b.dims.some(function (d) { return /Floor length 65\.6 ft/.test(d.text); }));
});
process.exit(H.summary() ? 1 : 0);
