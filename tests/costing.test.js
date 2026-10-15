'use strict';
var H = require('./helpers'), test = H.test, approx = H.approx, ok = H.ok, eq = H.eq, K = require('../costing.js'), C = require('../calculations.js'), P = require('../products.js');
console.log('costing (rate-card engine)');
function qs() { var inp = C.normalize({ floorLength: '20', floorWidth: '6', layout: 'straight', routeLength: '10', unitSystem: 'metric', lanes: '1' }), res = C.analyse(inp, P); return K.quantities(inp, res, { legs: 8, beltWidthM: 0.4 }); }
test('template ships with NO prices at all', function () { var t = K.templateCard(); ok(t.lines.length >= 10); t.lines.forEach(function (l) { eq(l.rate, null); }); Object.keys(t.percents).forEach(function (k) { eq(t.percents[k], 0); }); });
test('quantities come from the calculated route', function () { var q = qs(); approx(q.path_m, 10); approx(q.belt_area_m2, 4); approx(q.frame_m, 20); eq(q.legs, 8); eq(q.end_units, 2); eq(q.drives, 1); eq(q.curves, 0); });
test('no route -> quantities unknown (null), not guessed', function () { var q = K.quantities(C.normalize({}), C.analyse(C.normalize({}), P), {}); eq(q.path_m, null); eq(q.belt_area_m2, null); eq(q.legs, null); });
test('all rates blank -> total INCOMPLETE and every missing rate listed', function () { var c = K.templateCard(), r = K.compute(c, qs()); eq(r.complete, false); eq(r.missing.length, c.lines.length); eq(r.total, 0); });
test('amount = rate x quantity and the build-up order is wastage, overhead, margin, discount, tax', function () {
  var c = K.templateCard(); c.lines.forEach(function (l) { l.enabled = false; }); var belt = c.lines[0]; belt.enabled = true; belt.rate = 1000; // 4 m2
  c.percents = { wastage: 10, overhead: 10, margin: 20, discount: 5, tax: 18 };
  var r = K.compute(c, qs()); approx(r.subtotal, 4000); approx(r.wastage, 400); approx(r.overhead, 440); approx(r.margin, 968); approx(r.priceBeforeDiscount, 5808); approx(r.discount, 290.4); approx(r.taxable, 5517.6); approx(r.tax, 993.168); approx(r.total, 6510.768); eq(r.complete, true);
});
test('manual quantity overrides the calculated one and is marked manual', function () { var c = K.templateCard(); c.lines.forEach(function (l) { l.enabled = false; }); var l = c.lines[3]; l.enabled = true; l.rate = 500; l.qty = 12; var r = K.compute(c, qs()); approx(r.subtotal, 6000); eq(r.lines[3].qtySource, 'manual'); });
test('rate present but quantity unknown -> flagged, not zero-priced silently', function () { var c = K.templateCard(); c.lines.forEach(function (l) { l.enabled = false; }); c.lines[0].enabled = true; c.lines[0].rate = 100; var r = K.compute(c, K.quantities(C.normalize({}), C.analyse(C.normalize({}), P), {})); eq(r.lines[0].status, 'qty-missing'); eq(r.complete, false); });
test('custom manual line works; disabled lines are ignored', function () { var c = K.templateCard(); c.lines = [{ id: 'x', label: 'Special guard', driver: 'manual', unit: 'nos', rate: 250, qty: 3, enabled: true }, { id: 'y', label: 'Off', driver: 'fixed', rate: 99999, qty: null, enabled: false }]; var r = K.compute(c, qs()); approx(r.total, 750); eq(r.complete, true); });
test('import: valid card round-trips; bad numbers are rejected', function () {
  var c = K.templateCard(); c.lines[0].rate = 10; c.percents.tax = 18; var back = K.importCard(JSON.parse(JSON.stringify(c))); eq(back.lines[0].rate, 10); eq(back.percents.tax, 18);
  var bad = JSON.parse(JSON.stringify(c)); bad.lines[1].rate = -5; var threw = false; try { K.importCard(bad); } catch (e) { threw = /rate must be/.test(e.message); } ok(threw);
  threw = false; try { K.importCard({ nope: 1 }); } catch (e) { threw = true; } ok(threw); threw = false; var b2 = JSON.parse(JSON.stringify(c)); b2.percents.margin = 'abc'; try { K.importCard(b2); } catch (e) { threw = /Percentage/.test(e.message); } ok(threw);
});
test('unknown driver in an imported file becomes a manual line (no code injection path)', function () { var r = K.importCard({ lines: [{ label: 'a', driver: 'process.exit()', rate: 1, qty: 2 }] }); eq(r.lines[0].driver, 'manual'); });
test('CSV export: formula-injection guarded, shows INCOMPLETE flag', function () {
  var c = K.templateCard(); c.lines[0].label = '=cmd|calc'; var csv = K.toCsv(c, K.compute(c, qs()), 'P1'); ok(/'=cmd/.test(csv)); ok(/INCOMPLETE/.test(csv)); ok(/not a quotation/.test(csv));
});
test('customer summary / enquiry payload never contain costing', function () { var R = require('../report.js'), raw = { floorLength: '20', floorWidth: '6', layout: 'straight', routeLength: '10' }, inp = C.normalize(raw), res = C.analyse(inp, P); ok(!/cost|rate card|margin/i.test(JSON.stringify(R.buildSummary(raw, inp, res, P)).replace(/Costing|Calculated/g, ''))); });
test('money formatting', function () { eq(K.fmtMoney(1234567.5, 'INR'), 'Rs 12,34,567.50'); eq(K.fmtMoney(null, 'INR'), '-'); });
process.exit(H.summary() ? 1 : 0);
