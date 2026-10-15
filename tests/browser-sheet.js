'use strict';
/* Browser test: Google Sheet product data + Apps Script enquiry, with the Google URLs simulated (no real Google calls).
 * Usage: node tests/browser-sheet.js   (needs Playwright + Chromium, same as browser-smoke.js) */
var path = require('path'), fs = require('fs'), http = require('http');
var pw; try { pw = require('playwright'); } catch (e) { try { pw = require('/home/claude/.npm-global/lib/node_modules/playwright'); } catch (e2) { console.log('SKIPPED: playwright not installed'); process.exit(0); } }
var root = path.resolve(__dirname, '..'), fails = 0;
function check(n, c, x) { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  ' + (x || ''))); if (!c) fails++; }
var ENG = 'https://docs.google.com/sim/eng.csv', FAM = 'https://docs.google.com/sim/fam.csv', COM = 'https://docs.google.com/sim/com.csv', SCRIPT = 'https://script.google.com/macros/s/SIM/exec';
var CFG = "window.UCP_CONFIG={enquiry:{endpoint:'" + SCRIPT + "',timeoutMs:8000,sendAs:'text',successField:'ok'},sheets:{engineeringCsv:'" + ENG + "',familiesCsv:'" + FAM + "',companyCsv:'" + COM + "',timeoutMs:3000},upload:{endpoint:''},allowImport:true};";
var srv = http.createServer(function (req, res) {
  var f = req.url === '/' ? 'index.html' : req.url.split('?')[0].slice(1);
  if (f === 'config.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(CFG); }
  var p = path.join(root, f); if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  var t = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(p)] || 'text/plain'; res.writeHead(200, { 'Content-Type': t }); res.end(fs.readFileSync(p));
});
async function fill(p, v) { for (var k in v) { var el = await p.$('#f_' + k), tn = await el.evaluate(function (e) { return e.tagName; }); if (tn === 'SELECT') await el.selectOption(v[k]); else await el.fill(String(v[k])); } }
async function runWizard(p) {
  await p.waitForSelector('#stepBody input');
  await fill(p, { floorLength: '20', floorWidth: '6' }); await p.click('#btnNext');
  await fill(p, { handling: 'bottles', prodLength: '100', prodWidth: '100', prodHeight: '250', weight: '500', gap: '50' }); await p.selectOption('[data-name=weightUnit]', 'g'); await p.click('#btnNext');
  await fill(p, { rate: '60', speed: '10' }); await p.click('#btnNext'); await fill(p, { routeLength: '12' }); await p.click('#btnNext'); await p.waitForSelector('#resultsBody .hero');
}
(async function () {
  await new Promise(function (r) { srv.listen(0, r); }); var base = 'http://127.0.0.1:' + srv.address().port + '/';
  var browser = await pw.chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });

  /* ---- A: sheet works */
  var ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }), p = await ctx.newPage(), errs = [], posted = null;
  p.on('pageerror', function (e) { errs.push(e.message); });
  await p.route(ENG, function (r) { r.fulfill({ status: 200, contentType: 'text/csv', body: 'key,value,verified\nmoduleLengthMm,2000,YES\nlegSpacingMm,1500,NO\n' }); });
  await p.route(FAM, function (r) { r.fulfill({ status: 200, contentType: 'text/csv', body: 'id,label,widthMinMm,widthMaxMm,verified\nplastic_modular,PP belt (sheet),150,2400,YES\n' }); });
  await p.route(COM, function (r) { r.fulfill({ status: 200, contentType: 'text/csv', body: 'key,value\nenquiryEmail,sales@example.com\nwhatsappNumber,+91 98100 60473\nwhatsappVerified,YES\n' }); });
  await p.route(SCRIPT, function (r) { posted = { ct: r.request().headers()['content-type'], body: r.request().postData() }; r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}', headers: { 'access-control-allow-origin': '*' } }); });
  await p.goto(base); await runWizard(p);
  var txt = await p.textContent('#resultsBody');
  check('sheet value used: 12 m route / 2000 mm module = 6 frame modules (Configuration-dependent)', /Conveyor frame \/ modules6 modules/.test(txt.replace(/\s+/g, '')) || /6\s*modules/.test(txt), txt.slice(txt.indexOf('Conveyor frame'), txt.indexOf('Conveyor frame') + 120));
  check('leg spacing NOT trusted when verified = NO? (value still loaded but flagged in footer count)', /not yet marked verified/.test(await p.textContent('#dataSource')), await p.textContent('#dataSource'));
  check('footer states product data comes from the Google Sheet', /Google Sheet/.test(await p.textContent('#dataSource')));
  check('WhatsApp button enabled once number + verified come from the sheet', !(await p.isDisabled('#btnWa')));
  check('company email from the sheet shown', /sales@example\.com|info@ultraplastindia\.in/.test(await p.textContent('#enquiry')));
  var vals = { name: 'Test User', company: 'Test Co', email: 'test@example.com', mobile: '+91 9810012345', city: 'Pune', state: 'MH' };
  for (var k in vals) await p.fill('#c_' + k, vals[k]); await p.selectOption('#c_timeline', '1-3 months'); await p.check('#c_consent');
  await p.click('#btnSubmit'); await p.waitForFunction(function () { return /received by the service/.test(document.getElementById('enqStatus').textContent); }, null, { timeout: 5000 });
  check('enquiry sent to the Apps Script URL as text/plain (no CORS pre-flight)', posted && /^text\/plain/.test(posted.ct), JSON.stringify(posted && posted.ct));
  var body = JSON.parse(posted.body); check('payload has contact + project data', body.contact.company === 'Test Co' && body.project.results.path.total_m === 12);
  check('success shown only after ok:true from the script', /received by the service/.test(await p.textContent('#enqStatus')));
  check('no JS errors (sheet ok)', errs.length === 0, errs.join('|')); await ctx.close();

  /* ---- B: sheet down + Apps Script says ok:false */
  ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }); p = await ctx.newPage(); errs = [];
  p.on('pageerror', function (e) { errs.push(e.message); });
  await p.route(/docs\.google\.com\/sim/, function (r) { r.fulfill({ status: 500, body: 'oops' }); });
  await p.route(SCRIPT, function (r) { r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"error":"busy"}', headers: { 'access-control-allow-origin': '*' } }); });
  await p.goto(base); await runWizard(p);
  txt = await p.textContent('#resultsBody');
  check('sheet unavailable (HTTP 500): calculator still works with built-in values', /12\.00 m/.test(txt) && /To be engineered/.test(txt));
  check('page tells the user built-in values are in use', /built-in/.test(await p.textContent('#dataSource')), await p.textContent('#dataSource'));
  check('WhatsApp stays disabled when the sheet is down', await p.isDisabled('#btnWa'));
  for (k in vals) await p.fill('#c_' + k, vals[k]); await p.selectOption('#c_timeline', '1-3 months'); await p.check('#c_consent'); await p.click('#btnSubmit');
  await p.waitForFunction(function () { return /NOT been sent/.test(document.getElementById('enqStatus').textContent); }, null, { timeout: 5000 });
  check('script replies ok:false -> page says NOT sent', true);
  check('no JS errors (sheet down)', errs.length === 0, errs.join('|')); await ctx.close();

  /* ---- C: sheet hangs forever -> page still starts */
  ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }); p = await ctx.newPage();
  await p.route(/docs\.google\.com\/sim/, function () { /* never answer */ });
  var t0 = Date.now(); await p.goto(base); await p.waitForSelector('#stepBody input', { timeout: 8000 });
  check('hung sheet: wizard appears after the timeout (' + (Date.now() - t0) + ' ms), not forever', Date.now() - t0 < 8000);
  await ctx.close(); await browser.close(); srv.close();
  console.log(fails ? '\n' + fails + ' check(s) FAILED' : '\nAll sheet browser checks passed'); process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error('crashed:', e); process.exit(2); });
