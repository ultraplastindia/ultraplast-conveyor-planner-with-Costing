'use strict';
/* Run: node tests/report.test.js   (covers PDF/JSON generation and the enquiry service) */
var fs = require('fs'), path = require('path');
var C = require('../calculations.js'), P = require('../products.js'), R = require('../report.js'), E = require('../enquiry.js');
var T = require('./helpers.js'), test = T.test, ok = T.ok, eq = T.eq;

function load(f) { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', f), 'utf8')); }
function build(f) { var raw = load(f), inp = C.normalize(raw), res = C.analyse(inp, P); return { raw: raw, inp: inp, res: res }; }
var latin = function (u) { var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return s; };

console.log('9. JSON and PDF report generation');
var examples = fs.readdirSync(path.join(__dirname, '..', 'examples')).filter(function (f) { return /\.json$/.test(f); });
examples.forEach(function (f) {
  test('example "' + f + '": analyse + JSON + PDF without error', function () {
    var b = build(f);
    var json = JSON.stringify(R.buildSummary(b.raw, b.inp, b.res, P));
    var back = JSON.parse(json); eq(back.schema, 'ultraplast-conveyor-planner/project/1'); ok(back.results.equipment.length > 0);
    ok(!/NaN|undefined/.test(json), 'JSON has NaN/undefined');
    var pdf = R.renderPdf(R.buildReportModel(b.raw, b.inp, b.res, P)), s = latin(pdf);
    ok(s.slice(0, 5) === '%PDF-', 'header'); ok(/%%EOF$/.test(s), 'EOF'); ok(pdf.length > 3000, 'size');
  });
});
test('PDF carries the dimension schedule (curve radius, sweep, heights)', function () {
  var b = build('u-shaped-multi-segment.json'), m = R.buildReportModel(b.raw, b.inp, b.res, P), sec = m.sections.filter(function (x) { return /Dimension schedule/.test(x.title); })[0];
  ok(sec && sec.table.rows.length === 5, 'five segments'); ok(/Radius \d+ mm, sweep 90/.test(sec.table.rows[1][3]), sec.table.rows[1][3]);
  var s = latin(R.renderPdf(m)); ok(/Dimension schedule/.test(s));
});
test('PDF xref offsets point at the right objects', function () {
  var b = build('u-shaped-multi-segment.json'), s = latin(R.renderPdf(R.buildReportModel(b.raw, b.inp, b.res, P)));
  var xs = parseInt(/startxref\n(\d+)/.exec(s)[1], 10); eq(s.substr(xs, 4), 'xref');
  var lines = s.slice(xs).split('\n'), n = parseInt(lines[1].split(' ')[1], 10);
  for (var i = 1; i < n; i++) { var off = parseInt(lines[2 + i].slice(0, 10), 10); ok(new RegExp('^' + i + ' 0 obj').test(s.substr(off, 12)), 'object ' + i); }
});
test('PDF carries disclaimer, project name, key numbers and no prices', function () {
  var b = build('u-shaped-multi-segment.json'), s = latin(R.renderPdf(R.buildReportModel(b.raw, b.inp, b.res, P)));
  ok(/NOT AN ENGINEERING DESIGN OR QUOTATION/.test(s)); ok(/U shaped multi segment/.test(s)); ok(/17\.14 m/.test(s), 'total path 17.14 m'); ok(!/INR|Rs\.|\$\d/.test(s));
});
test('PDF paginates long content (more than one page) and page count matches', function () {
  var b = build('u-shaped-multi-segment.json'), s = latin(R.renderPdf(R.buildReportModel(b.raw, b.inp, b.res, P)));
  var pages = (s.match(/\/Type \/Page /g) || []).length; ok(pages >= 2, 'pages ' + pages); ok(new RegExp('/Count ' + pages).test(s));
});
test('PDF survives special characters and very long unbroken text', function () {
  var b = build('simple-straight-bottle-line.json'); b.raw.projectName = 'Test (a) \\ b π ≈ ₹ ' + new Array(200).join('X');
  var s = latin(R.renderPdf(R.buildReportModel(b.raw, b.inp, b.res, P))); ok(/%%EOF$/.test(s));
});
test('JSON summary re-imports: formState re-normalises to identical metric inputs', function () {
  var b = build('l-shaped-curved-line.json'), sum = JSON.parse(JSON.stringify(R.buildSummary(b.raw, b.inp, b.res, P)));
  var again = C.analyse(C.normalize(sum.formState), P); eq(again.path.total, b.res.path.total);
});
test('JSON summary contains no contact details unless added by the enquiry payload', function () {
  var b = build('simple-straight-bottle-line.json'), s = JSON.stringify(R.buildSummary(b.raw, b.inp, b.res, P)); ok(!/"email"|"mobile"/.test(s));
});

console.log('\n10. Enquiry service unavailable / validation');
var good = { name: 'A Kumar', company: 'ACME Ltd', email: 'a@acme.com', mobile: '+91 98100 12345', city: 'Pune', state: 'MH', timeline: '1-3 months', consent: true };
var payload = E.enquiryPayload(good, { x: 1 });
function resp(status, body) { return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body || {}); } }); }
var async = [];
function atest(name, fn) { async.push(fn().then(function () { console.log('  PASS  ' + name); T.__p = (T.__p || 0) + 1; }, function (e) { console.log('  FAIL  ' + name + '\n        ' + e.message); T.__f = (T.__f || 0) + 1; })); }

test('validation: missing everything', function () { var e = E.validateContact({}); ['name', 'company', 'email', 'mobile', 'city', 'state', 'timeline', 'consent'].forEach(function (k) { ok(e[k], k); }); });
test('validation: bad email / mobile without country code / no consent', function () {
  var e = E.validateContact({ name: 'A B', company: 'C D', email: 'nope', mobile: '9810012345', city: 'x1', state: 'y1', timeline: 'asap', consent: false });
  ok(e.email && e.mobile && e.consent && !e.name);
});
test('validation: good contact passes', function () { eq(Object.keys(E.validateContact(good)).length, 0); });
test('payload strips spaces from mobile and records consent', function () { eq(payload.contact.mobile, '+919810012345'); eq(payload.contact.consentToContact, true); });
test('WhatsApp URL is null while number is unverified / missing', function () {
  eq(E.whatsappUrl(P.company, 'hi'), null); eq(E.whatsappUrl({ whatsappNumber: '919810060473', whatsappVerified: false }, 'hi'), null);
  ok(/^https:\/\/wa\.me\/919810060473\?text=/.test(E.whatsappUrl({ whatsappNumber: '+91 98100 60473', whatsappVerified: true }, 'hi')));
});
test('products.js ships with NO unverified WhatsApp number', function () { eq(P.company.whatsappNumber, null); eq(P.company.whatsappVerified, false); });
test('mailto link built and length-limited', function () { var u = E.mailtoUrl('info@ultraplastindia.in', 'S', new Array(5000).join('a')); ok(u.indexOf('mailto:info@ultraplastindia.in?subject=') === 0); ok(u.length <= 1900); });

atest('endpoint not configured -> not_configured, never "sent"', function () { return E.submit(payload, { endpoint: '' }, function () { throw new Error('must not be called'); }).then(function (r) { eq(r.status, 'not_configured'); ok(/NOT been sent/.test(r.message)); }); });
atest('network failure -> failed', function () { return E.submit(payload, { endpoint: 'https://x.test' }, function () { return Promise.reject(new TypeError('Failed to fetch')); }).then(function (r) { eq(r.status, 'failed'); ok(/NOT been sent/.test(r.message)); }); });
atest('HTTP 500 -> failed', function () { return E.submit(payload, { endpoint: 'https://x.test' }, function () { return resp(500); }).then(function (r) { eq(r.status, 'failed'); ok(/500/.test(r.message)); }); });
atest('HTTP 404 -> failed', function () { return E.submit(payload, { endpoint: 'https://x.test' }, function () { return resp(404); }).then(function (r) { eq(r.status, 'failed'); }); });
atest('timeout -> failed', function () { return E.submit(payload, { endpoint: 'https://x.test', timeoutMs: 50 }, function () { return new Promise(function () { }); }).then(function (r) { eq(r.status, 'failed'); ok(/in time/.test(r.message)); }); });
atest('HTTP 200 -> sent', function () { return E.submit(payload, { endpoint: 'https://x.test' }, function () { return resp(200); }).then(function (r) { eq(r.status, 'sent'); }); });
atest('successField false -> failed; true -> sent', function () {
  return E.submit(payload, { endpoint: 'https://x.test', successField: 'success' }, function () { return resp(200, { success: false }); }).then(function (r) {
    eq(r.status, 'failed'); return E.submit(payload, { endpoint: 'https://x.test', successField: 'success' }, function () { return resp(200, { success: true }); });
  }).then(function (r) { eq(r.status, 'sent'); });
});
atest('request carries JSON body, omits credentials, no secrets in config.js', function () {
  var seen; return E.submit(payload, { endpoint: 'https://x.test' }, function (u, o) { seen = o; return resp(200); }).then(function () {
    eq(seen.method, 'POST'); eq(seen.credentials, 'omit'); ok(JSON.parse(seen.body).contact.company === 'ACME Ltd');
    var cfg = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8'); ok(!/(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]+/i.test(cfg));
  });
});
test('enquiry.js / app code never touches localStorage with customer data', function () {
  ['enquiry.js', 'report.js', 'calculations.js', 'app.js'].forEach(function (f) { var p = path.join(__dirname, '..', f); if (fs.existsSync(p)) ok(!/localStorage\.setItem\((?!COST_KEY,)/.test(fs.readFileSync(p, 'utf8')), f + ' (only the optional staff rate card, COST_KEY, may be stored)'); });
});

Promise.all(async).then(function () {
  var bad = T.summary() + (T.__f || 0);
  console.log('(plus ' + (T.__p || 0) + ' async checks passed, ' + (T.__f || 0) + ' failed)');
  process.exit(bad ? 1 : 0);
});
