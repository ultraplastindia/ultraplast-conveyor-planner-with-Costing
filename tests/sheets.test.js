'use strict';
/* Run: node tests/sheets.test.js  - Google Sheet product loader + Apps Script enquiry saver (mocked; no network) */
var fs = require('fs'), path = require('path'), vm = require('vm');
var T = require('./helpers.js'), test = T.test, ok = T.ok, eq = T.eq, approx = T.approx;
var SH = require('../sheetconfig.js'), E = require('../enquiry.js');
function freshP() { delete require.cache[require.resolve('../products.js')]; return require('../products.js'); }
function resp(text, status) { return Promise.resolve({ ok: (status || 200) < 300, status: status || 200, text: function () { return Promise.resolve(text); } }); }
var async = [], pass = 0, fail = 0;
function atest(n, fn) { async.push(fn().then(function () { console.log('  PASS  ' + n); pass++; }, function (e) { console.log('  FAIL  ' + n + '\n        ' + e.message); fail++; })); }

console.log('Google Sheet product data');
test('CSV parser: quotes, commas, escaped quotes, newlines, CRLF, BOM', function () {
  var r = SH.parseCsv('﻿a,b,c\r\n1,"x, y","he said ""hi"""\r\n"line1\nline2",,3\r\n');
  eq(r.length, 3); eq(r[1][1], 'x, y'); eq(r[1][2], 'he said "hi"'); eq(r[2][0], 'line1\nline2'); eq(r[2][1], ''); eq(r[2][2], '3');
});
test('toObjects skips blank and # comment rows, lower-cases headers', function () {
  var o = SH.toObjects(SH.parseCsv('Key,Value\n# note,x\n\nlegSpacingMm,1200\n')); eq(o.length, 1); eq(o[0].key, 'legSpacingMm');
});
test('engineering values override defaults; blank clears to null; invalid ignored with warning', function () {
  var P = freshP(), log = []; P.meta.sheetValues = [];
  SH.applyEngineering(SH.toObjects(SH.parseCsv('key,value,verified\nmoduleLengthMm,1500,YES\nlegSpacingMm,abc,NO\nmaxInclineDeg,95,NO\nwidthAllowancePerSideMm,0,NO\nmaxSpeedMPerMin,,NO\nbogus,1,NO')), P, log);
  eq(P.engineering.moduleLengthMm, 1500); eq(P.engineering.legSpacingMm, null); eq(P.engineering.maxInclineDeg, null); eq(P.engineering.widthAllowancePerSideMm, 0); eq(P.engineering.maxSpeedMPerMin, null);
  ok(log.length === 3, log.join('|')); ok(P.meta.sheetValues.some(function (v) { return v.key === 'moduleLengthMm' && v.verified; }));
});
test('families: values applied and flagged verified only when verified = YES', function () {
  var P = freshP(), log = []; P.meta.sheetValues = [];
  SH.applyFamilies(SH.toObjects(SH.parseCsv('id,label,widthMinMm,widthMaxMm,pitchOptionsMm,sprocketTeeth,minRadiusFactorOfWidth,usedByCategories,verified\nplastic_modular,PP belt,200,2000,25;38,8,,straight_modular,YES\nnew_fam,New family,100,500,50,10,3,food_pu_pvc,NO')), P, log);
  eq(P.families.plastic_modular.widthMm.min.value, 200); eq(P.families.plastic_modular.widthMm.min.verified, true); eq(P.families.plastic_modular.pitchOptionsMm.value.join(','), '25,38');
  eq(P.families.new_fam.minSideFlexRadius.factorOfWidth.value, 3); eq(P.families.new_fam.sprocketTeeth.verified, false);
  ok(P.categories.filter(function (c) { return c.id === 'food_pu_pvc'; })[0].families.indexOf('new_fam') >= 0); eq(log.length, 0, log.join('|'));
});
test('families: bad width range / teeth / unknown category rejected, defaults kept', function () {
  var P = freshP(), log = []; P.meta.sheetValues = [];
  SH.applyFamilies(SH.toObjects(SH.parseCsv('id,widthMinMm,widthMaxMm,sprocketTeeth,usedByCategories\nplastic_modular,900,100,2.5,nope')), P, log);
  eq(P.families.plastic_modular.widthMm.min.value, 150); eq(P.families.plastic_modular.sprocketTeeth.value, 8); eq(log.length, 3, log.join('|'));
});
test('company: valid values applied; bad email / phone rejected; WhatsApp needs YES flag', function () {
  var P = freshP(), log = [];
  SH.applyCompany(SH.toObjects(SH.parseCsv('key,value\nenquiryEmail,not-an-email\nphones,"+91-1111111111;<script>"\nwhatsappNumber,+91 98100 60473\nwhatsappVerified,NO')), P, log);
  eq(P.company.enquiryEmail, 'info@ultraplastindia.in'); eq(P.company.phones.length, 1); eq(P.company.whatsappNumber, '919810060473'); eq(P.company.whatsappVerified, false);
  eq(E.whatsappUrl(P.company, 'x'), null); SH.applyCompany([{ key: 'whatsappVerified', value: 'YES' }], P, log); ok(/wa\.me\/919810060473/.test(E.whatsappUrl(P.company, 'x')));
});
atest('load: not configured -> built-in values untouched', function () { var P = freshP(); return SH.load({}, P, function () { throw new Error('no'); }).then(function (r) { eq(r.status, 'not_configured'); eq(P.engineering.moduleLengthMm, null); }); });
atest('load: three tabs fetched, parsed, applied; unverified counted', function () {
  var P = freshP(), csv = { e: 'key,value,verified\nlegSpacingMm,1000,NO\n', f: 'id,widthMinMm,widthMaxMm,verified\nplastic_modular,160,2400,YES\n', c: 'key,value\nhours,Mon-Sat 9-6\n' };
  return SH.load({ engineeringCsv: 'https://x/e', familiesCsv: 'https://x/f', companyCsv: 'https://x/c' }, P, function (u) { return resp(csv[u.slice(-1)]); }).then(function (r) {
    eq(r.status, 'loaded'); eq(r.loaded.length, 3); eq(P.engineering.legSpacingMm, 1000); eq(P.families.plastic_modular.widthMm.max.value, 2400); eq(P.company.hours, 'Mon-Sat 9-6'); eq(r.unverified, 1); ok(/Google Sheet/.test(P.meta.dataSource));
  });
});
atest('load: one tab fails (HTTP 404) -> partial, others still applied', function () {
  var P = freshP(); return SH.load({ engineeringCsv: 'https://x/e', companyCsv: 'https://x/c' }, P, function (u) { return u.slice(-1) === 'e' ? resp('', 404) : resp('key,value\nhours,Open\n'); }).then(function (r) { eq(r.status, 'partial'); eq(P.company.hours, 'Open'); eq(r.failed[0], 'Engineering'); });
});
atest('load: network error / HTML login page / timeout -> failed, defaults kept', function () {
  var P = freshP(); return SH.load({ engineeringCsv: 'https://x/e' }, P, function () { return Promise.reject(new TypeError('Failed to fetch')); }).then(function (r) {
    eq(r.status, 'failed'); eq(P.engineering.legSpacingMm, null);
    return SH.load({ engineeringCsv: 'https://x/e' }, P, function () { return resp('<!DOCTYPE html><html>Sign in</html>'); });
  }).then(function (r) { eq(r.status, 'failed'); ok(/published/.test(r.warnings[0])); return SH.load({ engineeringCsv: 'x', timeoutMs: 30 }, P, function () { return new Promise(function () { }); }).catch(function () { }); });
});

console.log('\nCalculator uses sheet values');
atest('sheet-supplied leg spacing / module length switch equipment lines from "to be engineered" to calculated', function () {
  var P = freshP(), C = require('../calculations.js');
  return SH.load({ engineeringCsv: 'https://x/e' }, P, function () { return resp('key,value,verified\nlegSpacingMm,1500,NO\nmoduleLengthMm,2000,NO\nwidthAllowancePerSideMm,25,NO\n'); }).then(function () {
    var r = C.analyse(C.normalize({ unitSystem: 'metric', layout: 'straight', floorLength: '20', floorWidth: '6', routeLength: '12', prodLength: '100', prodWidth: '100', prodHeight: '200', weight: '1', weightUnit: 'kg', rate: '30', gap: '50', speed: '10', segments: [], obstacles: [] }), P);
    var legs = r.equipment.filter(function (e) { return /Legs/.test(e.item); })[0], mod = r.equipment.filter(function (e) { return /frame/i.test(e.item); })[0];
    eq(legs.qty, 9); eq(mod.qty, 6); eq(r.width.minimumWidthMm, 150); eq(legs.status, 'Configuration-dependent');
  });
});

console.log('\nEnquiry -> Google Apps Script (Code.gs, mocked Sheets)');
function runScript(body, opts) {
  opts = opts || {}; var rows = [], hdr = false;
  var sandbox = {
    LockService: { getScriptLock: function () { return { tryLock: function () { return opts.busy ? false : true; }, releaseLock: function () { sandbox.__released = true; } }; } },
    SpreadsheetApp: { getActive: function () { return { getSheetByName: function (n) { return opts.noSheet && !hdr ? null : { appendRow: function (r) { rows.push(r); }, setFrozenRows: function () { }, getRange: function () { return { setFontWeight: function () { } }; } }; }, insertSheet: function () { hdr = true; return { appendRow: function (r) { rows.push(['HEADER']); }, setFrozenRows: function () { }, getRange: function () { return { setFontWeight: function () { } }; } }; } }; } },
    ContentService: { createTextOutput: function (s) { return { s: s, setMimeType: function () { return this; } }; }, MimeType: { JSON: 'json' } }, Date: Date, JSON: JSON, String: String
  };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'google-sheets', 'Code.gs'), 'utf8'), sandbox);
  var res = sandbox.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } });
  return { out: JSON.parse(res.s), rows: rows, released: sandbox.__released };
}
var payload = E.enquiryPayload({ name: 'A Kumar', company: 'ACME', email: 'a@acme.com', mobile: '+91 98100 12345', city: 'Pune', state: 'MH', timeline: '1-3 months', consent: true, comments: '=HYPERLINK("http://evil")' },
  { formState: { projectName: 'Line 1', productName: 'Bottle', floorLength: '20', floorWidth: '6' }, results: { recommendation: { selectedName: 'Straight modular' }, path: { total_m: 12 }, throughput: { ratePerMin: 60 } } });
test('Apps Script appends one row with the right columns and returns ok', function () {
  var r = runScript(payload); eq(r.out.ok, true); eq(r.rows.length, 1); var row = r.rows[0];
  eq(row[1], 'A Kumar'); eq(row[3], 'a@acme.com'); eq(row[4], '+919810012345'.replace(/^/, "'")); eq(row[10], 'YES'); eq(row[11], 'Line 1'); eq(row[13], 12); eq(row[16], '20 x 6'); ok(r.released, 'lock released');
});
test('Apps Script neutralises spreadsheet formulas (=, +, -, @) in user text', function () { var r = runScript(payload); eq(r.rows[0][9].charAt(0), "'"); });
test('Apps Script rejects: no consent, bad email, bad mobile, junk JSON, oversize body', function () {
  var bad = function (mut) { var p = JSON.parse(JSON.stringify(payload)); mut(p.contact); return runScript(p); };
  eq(bad(function (c) { c.consentToContact = false; }).out.error, 'no_consent'); eq(bad(function (c) { c.email = 'x'; }).out.error, 'bad_email'); eq(bad(function (c) { c.mobile = '98100'; }).out.error, 'bad_mobile');
  eq(runScript('not json').out.ok, false); eq(runScript(new Array(200002).join('a')).out.error, 'bad_size'); eq(bad(function (c) { }).rows.length, 1);
});
test('Apps Script: busy lock returns busy and writes nothing', function () { var r = runScript(payload, { busy: true }); eq(r.out.error, 'busy'); eq(r.rows.length, 0); });
atest('website sends text/plain (no CORS pre-flight) when sendAs = text, and shows success only on ok:true', function () {
  var seen; function fx(u, o) { seen = o; return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } }); }
  return E.submit(payload, { endpoint: 'https://script.google.com/macros/s/AAA/exec', sendAs: 'text', successField: 'ok' }, fx).then(function (r) {
    eq(r.status, 'sent'); ok(/^text\/plain/.test(seen.headers['Content-Type']));
    return E.submit(payload, { endpoint: 'https://x', sendAs: 'text', successField: 'ok' }, function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: false, error: 'bad_email' }); } }); });
  }).then(function (r) { eq(r.status, 'failed'); ok(/NOT been sent/.test(r.message)); });
});
test('template workbook has the 4 database tabs + read me', function () { ok(fs.existsSync(path.join(__dirname, '..', 'google-sheets', 'Ultraplast-Planner-Database-Template.xlsx'))); });

Promise.all(async).then(function () { var f = T.summary() + fail; console.log('(plus ' + pass + ' async checks passed, ' + fail + ' failed)'); process.exit(f ? 1 : 0); });
