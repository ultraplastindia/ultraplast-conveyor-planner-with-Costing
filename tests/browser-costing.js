'use strict';
var path = require('path'), fs = require('fs'), pw; try { pw = require('playwright'); } catch (e) { try { pw = require('/home/claude/.npm-global/lib/node_modules/playwright'); } catch (e2) { console.log('SKIPPED: playwright not installed'); process.exit(0); } }
var base = 'file://' + path.resolve(__dirname, '..', 'index.html'), ex = path.resolve(__dirname, '..', 'examples', 'simple-straight-bottle-line.json'), fails = 0;
function check(n, c, x) { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  ' + (x || ''))); if (!c) fails++; }
(async function () {
  var b = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  async function toResults(q) {
    var pg = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage(), errs = []; pg.on('pageerror', function (e) { errs.push(e.message); });
    await pg.goto(base + q); await pg.waitForSelector('#stepBody input'); await pg.setInputFiles('#importFile', ex); await pg.waitForTimeout(400);
    for (var i = 0; i < 6; i++) { if (await pg.$('#resultsBody .hero')) break; await pg.click('#btnNext'); await pg.waitForTimeout(250); }
    await pg.waitForSelector('#resultsBody .hero'); pg.errs = errs; return pg;
  }
  var p = await toResults(''); check('costing hidden for customers by default', !(await p.$('#costCard')) && !/Cost estimate/.test(await p.textContent('#resultsBody')));
  p = await toResults('?costing=1'); check('costing card appears with ?costing=1', !!(await p.$('#costCard')));
  check('no prices pre-filled: all rates empty, total flagged incomplete', (await p.$$eval('[data-cost=rate]', function (e) { return e.filter(function (x) { return x.value !== ''; }).length; })) === 0 && /INCOMPLETE/.test(await p.textContent('#costTotals')));
  var n = await p.$$eval('[data-cost=enabled]', function (e) { return e.length; });
  for (var i = 0; i < n; i++) if (i !== 0) await p.uncheck('[data-cost=enabled][data-i="' + i + '"]');
  await p.fill('[data-cost=rate][data-i="0"]', '1000'); await p.waitForTimeout(100);
  var qtxt = await p.textContent('[data-qs="0"]'), amt = await p.textContent('[data-amt="0"]'), m = /= ([\d.]+) m2/.exec(qtxt);
  check('belt amount = rate x calculated area (' + qtxt.trim() + ' -> ' + amt + ')', !!m && amt.replace(/[^\d.]/g, '') === (Math.round(1000 * parseFloat(m[1]) * 100) / 100).toFixed(2).replace(/[^\d.]/g, ''), amt);
  check('total complete once the only enabled line is priced', !/INCOMPLETE/.test(await p.textContent('#costTotals')));
  await p.fill('#cp_margin', '10'); await p.fill('#cp_tax', '18'); await p.waitForTimeout(100);
  var tot = await p.textContent('#costTotals'), base1 = parseFloat(amt.replace(/[^\d.]/g, '')), expect = base1 * 1.1 * 1.18;
  check('margin and tax applied (expect ~' + expect.toFixed(2) + ')', tot.replace(/,/g, '').indexOf(expect.toFixed(2)) >= 0, tot);
  await p.fill('[data-cost=rate][data-i="0"]', '-5'); check('negative rate rejected', /number, zero or more/.test(await p.textContent('#costMsg')));
  await p.click('#costAdd'); check('custom line can be added', (await p.$$('[data-cost=label]')).length === n + 1);
  var ls = await p.evaluate(function () { return Object.keys(localStorage).filter(function (k) { return /rate|cost/i.test(k); }).length; }); check('rate card NOT stored unless "remember" is ticked', ls === 0);
  var dl = p.waitForEvent('download'); await p.click('#costCsv'); var f = await dl; check('CSV downloads', /\.csv$/.test(f.suggestedFilename()));
  check('PDF / JSON summaries stay price-free (costing not in payload)', !/costCard|rateCard/.test(await p.evaluate(function () { return JSON.stringify(window.UCPReport.buildSummary({ floorLength: '1' }, window.UCPCalc.normalize({ floorLength: '1' }), window.UCPCalc.analyse(window.UCPCalc.normalize({ floorLength: '1' }), window.UCPProducts), window.UCPProducts)); })));
  check('no JS errors', p.errs.length === 0, p.errs.join('|'));
  await b.close(); console.log(fails ? '\n' + fails + ' FAILED' : '\nAll costing browser checks passed'); process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('crashed: ' + e.message); process.exit(1); });
