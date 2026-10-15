'use strict';
/* Browser smoke test with Playwright + the pre-installed Chromium.
 * Usage: node tests/browser-smoke.js   (needs `playwright` resolvable; see README "Testing")
 * Writes screenshots to ./tests/screenshots (git-ignored). */
var path = require('path'), fs = require('fs');
var pw; try { pw = require('playwright'); } catch (e) { try { pw = require('/home/claude/.npm-global/lib/node_modules/playwright'); } catch (e2) { console.log('SKIPPED: playwright not installed'); process.exit(0); } }
var url = 'file://' + path.resolve(__dirname, '..', 'index.html'), out = path.join(__dirname, 'screenshots'); fs.mkdirSync(out, { recursive: true });
var fails = 0; function check(n, c, extra) { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  ' + (extra || ''))); if (!c) fails++; }

(async function () {
  var browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  async function session(w, h, tag) {
    var ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', function (e) { errors.push(e.message); }); page.on('console', function (m) { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.goto(url); await page.waitForSelector('#stepBody input'); return { ctx: ctx, page: page, errors: errors, tag: tag };
  }
  async function fill(page, vals) { for (var k in vals) { var el = await page.$('#f_' + k); if (!el) throw new Error('no field ' + k); var tn = await el.evaluate(function (e) { return e.tagName; }); if (tn === 'SELECT') await el.selectOption(vals[k]); else await el.fill(String(vals[k])); } }
  async function sig(page, sel) { return page.evaluate(function (s) { var c = document.querySelector(s); var x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data, h = 0, n = 0; for (var i = 0; i < d.length; i += 4 * 7) { h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0; if (d[i] !== d[0] || d[i + 1] !== d[1]) n++; } return { hash: h, nonBlank: n }; }, sel); }

  /* ---- desktop: validation gate, full wizard, results, downloads, enquiry */
  var d = await session(1280, 900, 'desktop'), p = d.page;
  await p.click('#btnNext');
  check('step 1 blocked when required fields are empty', (await p.textContent('#stepTitle')) === 'Factory space' && (await p.isVisible('#errSummary')));
  await fill(p, { projectName: 'Smoke test', floorLength: '-5', floorWidth: 'abc' }); await p.click('#btnNext');
  check('negative / text input rejected with message', /greater than zero|must be a number/.test(await p.textContent('#errSummary')));
  await fill(p, { floorLength: '20', floorWidth: '6', industry: 'beverages' });
  await p.waitForTimeout(300); check('live 3D preview draws the floor (canvas has content)', (await p.$$('#liveSchem canvas')).length === 1 && (await sig(p, '#liveSchem canvas')).nonBlank > 200);
  await p.click('#btnNext');
  await fill(p, { handling: 'bottles', prodLength: '100', prodWidth: '100', prodHeight: '250', weight: '500', gap: '50' }); await p.selectOption('[data-name=weightUnit]', 'g'); await p.click('#btnNext');
  await fill(p, { rate: '60', speed: '10', hoursPerDay: '16' }); await p.click('#btnNext');
  await fill(p, { routeLength: '12' }); await p.waitForTimeout(500);
  check('step 4 live preview already shows the conveyor in 3D', (await p.$$('#liveSchem canvas')).length === 1 && (await sig(p, '#liveSchem canvas')).nonBlank > 2000);
  check('build checklist shows 5 of 5 complete', (await p.$$('#liveSchem .build li.on')).length === 5);
  await p.screenshot({ path: path.join(out, 'desktop-step4.png') });
  await p.click('#btnNext'); await p.waitForSelector('#resultsBody .hero');
  var txt = await p.textContent('#resultsBody');
  check('results show recommended type', /Recommended conveyor type/.test(txt));
  check('results show 12.00 m path as customer-provided', /12\.00 m/.test(txt) && /Customer-provided/.test(txt));
  check('motor / tension flagged for engineering review', /Motor power and drive selection/.test(txt) && /Engineering review required/.test(txt));
  check('no price values shown', !/₹|\$\s?\d|INR\s?\d/.test(txt));
  check('WhatsApp button disabled (number unverified)', await p.isDisabled('#btnWa'));
  check('3D card present with a canvas drawn', (await p.$$('#v3dHost canvas')).length === 1 && (await sig(p, '#v3dHost canvas')).nonBlank > 2000);
  var t0 = await p.textContent('#v3dHost [data-o=time]'); await p.waitForTimeout(1200); var t1 = await p.textContent('#v3dHost [data-o=time]');
  check('3D simulation is running (time advances: ' + t0 + ' -> ' + t1 + ')', t0 !== t1);
  check('3D view shows entered belt speed 10.00 m/min', /10\.00 m\/min/.test(await p.textContent('#v3dHost')));
  check('3D dimensions list belt, floor and rows are present in the schedule', /Dimension schedule/.test(await p.textContent('#resultsBody')) && /S1/.test(await p.textContent('#schedCard')));
  await p.click('#v3dHost [data-a=play]'); var pa1 = await p.textContent('#v3dHost [data-o=time]'); await p.waitForTimeout(500); check('Pause stops the 3D simulation', pa1 === await p.textContent('#v3dHost [data-o=time]'));
  var s0 = await sig(p, '#v3dHost canvas'); var box = await (await p.$('#v3dHost canvas')).boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 - 60, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(150);
  var s1 = await sig(p, '#v3dHost canvas'); check('dragging rotates the 3D model (picture changes)', s0.hash !== s1.hash);
  await p.click('#v3dHost [data-v=top]'); await p.waitForTimeout(150); var s2 = await sig(p, '#v3dHost canvas'); check('Top view button changes the view', s2.hash !== s1.hash);
  await p.click('#v3dHost [data-v=front]'); await p.waitForTimeout(150); var s3 = await sig(p, '#v3dHost canvas'); check('Front view differs from Top view', s3.hash !== s2.hash);
  await p.click('#v3dHost [data-t=dims]'); await p.waitForTimeout(150); var s4 = await sig(p, '#v3dHost canvas'); check('Dimensions toggle redraws the picture', s4.hash !== s3.hash); await p.click('#v3dHost [data-t=dims]');
  box = await (await p.$('#v3dHost canvas')).boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.wheel(0, -400); await p.waitForTimeout(150); var s5 = await sig(p, '#v3dHost canvas'); check('mouse wheel zooms', s5.hash !== s3.hash);
  await p.click('#v3dHost [data-a=play]');
  await p.click('[data-tab="plan"]'); await p.waitForTimeout(500);
  check('2D plan tab shows the plan with products', (await p.$$('#simHost .sim-prod')).length > 0 && (await p.$$('#simHost .cv-belt')).length === 1 && (await p.$$('#simHost .cv-roller')).length === 2 && await p.isVisible('#simHost'));
  var off0 = await p.evaluate(function () { return document.querySelector('#simHost .cv-lines').style.strokeDashoffset; }); await p.waitForTimeout(400);
  var off1 = await p.evaluate(function () { return document.querySelector('#simHost .cv-lines').style.strokeDashoffset; });
  check('plan-view belt slats move (' + off0 + ' -> ' + off1 + ')', off0 !== off1);
  await p.click('[data-tab="3d"]'); await p.waitForTimeout(200); check('switching back shows the 3D view', await p.isVisible('#v3dHost canvas') && !(await p.isVisible('#simHost')));
  await p.screenshot({ path: path.join(out, 'desktop-results.png'), fullPage: true });
  var dl = await Promise.all([p.waitForEvent('download'), p.click('#btnPdf')]); var pp = await dl[0].path(); var head = fs.readFileSync(pp).slice(0, 5).toString('latin1');
  check('PDF downloaded in browser and is a PDF', head === '%PDF-' && /\.pdf$/.test(dl[0].suggestedFilename()), head);
  dl = await Promise.all([p.waitForEvent('download'), p.click('#btnJson')]); var js = JSON.parse(fs.readFileSync(await dl[0].path(), 'utf8'));
  check('JSON downloaded and parses', js.schema === 'ultraplast-conveyor-planner/project/1' && js.results.path.total_m === 12);
  await p.click('#btnSubmit');
  check('empty enquiry form is rejected with field errors', (await p.textContent('#ce_email')).length > 0 && /complete the highlighted/.test(await p.textContent('#enqStatus')));
  await fill2(p, { name: 'Test User', company: 'Test Co', email: 'test@example.com', mobile: '+91 9810012345', city: 'Pune', state: 'MH' }); await p.selectOption('#c_timeline', '1-3 months'); await p.check('#c_consent');
  await p.click('#btnSubmit'); await p.waitForTimeout(300);
  var st = await p.textContent('#enqStatus');
  check('submit with NO service configured says NOT sent (never "sent successfully")', /not connected|NOT been sent/.test(st) && !/sent successfully/i.test(st), st);
  var ls = await p.evaluate(function () { try { return localStorage.length; } catch (e) { return 0; } });
  check('nothing stored in localStorage', ls === 0);
  check('no uncaught JS errors (desktop)', d.errors.length === 0, d.errors.join(' | '));
  async function fill2(page, v) { for (var k in v) await page.fill('#c_' + k, v[k]); }

  /* ---- failing enquiry service (simulated by routing the endpoint) */
  await p.evaluate(function () { window.UCP_CONFIG.enquiry.endpoint = 'https://enquiry.invalid/submit'; });
  await p.route('https://enquiry.invalid/**', function (r) { r.abort('connectionrefused'); });
  await p.click('#btnSubmit'); await p.waitForFunction(function () { return /NOT been sent/.test(document.getElementById('enqStatus').textContent); }, null, { timeout: 5000 });
  check('unreachable enquiry service -> clear failure message', true);
  await p.unroute('https://enquiry.invalid/**'); await p.route('https://enquiry.invalid/**', function (r) { r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await p.click('#btnSubmit'); await p.waitForFunction(function () { return /received by the service/.test(document.getElementById('enqStatus').textContent); }, null, { timeout: 5000 });
  check('only a real 2xx reply shows success', true);
  await d.ctx.close();

  /* ---- imperial + curve layout + unsupported selection */
  var u = await session(1280, 900, 'imperial'), q = u.page;
  await q.check('input[name=units][value=imperial]'); await fill(q, { floorLength: '65.6', floorWidth: '20' });
  await q.check('input[name=layout][value=L]'); await q.click('#btnNext');
  await fill(q, { prodLength: '4', prodWidth: '4', prodHeight: '8', weight: '1' }); await q.selectOption('[data-name=weightUnit]', 'lb'); await q.click('#btnNext'); await fill(q, { rate: '30' }); await q.click('#btnNext');
  await q.selectOption('#f_categoryPref', 'straight_modular');
  var segs = await q.$$('#segBox .seg'); check('L layout pre-fills 3 segments', segs.length === 3);
  await q.fill('#segBox .seg:nth-child(1) [data-seg=length]', '13'); await q.fill('#segBox .seg:nth-child(2) [data-seg=radius]', '35'); await q.fill('#segBox .seg:nth-child(3) [data-seg=length]', '10');
  await q.click('#btnNext'); await q.waitForSelector('#resultsBody .hero'); var t2 = await q.textContent('#resultsBody');
  check('imperial inputs shown with ft', /ft/.test(t2));
  check('unsupported configuration (straight belt on a curve) flagged as a problem', /Unsupported configuration/.test(t2));
  await q.screenshot({ path: path.join(out, 'imperial-curve-results.png'), fullPage: true });
  check('no uncaught JS errors (imperial)', u.errors.length === 0, u.errors.join(' | ')); await u.ctx.close();

  /* ---- mobile */
  var m = await session(375, 700, 'mobile'), mp = m.page;
  var sw = await mp.evaluate(function () { return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
  check('mobile: no horizontal scroll on step 1 (' + sw.sw + ' vs ' + sw.cw + ')', sw.sw <= sw.cw + 1);
  await mp.screenshot({ path: path.join(out, 'mobile-step1.png'), fullPage: true });
  var small = await mp.evaluate(function () { return Array.prototype.filter.call(document.querySelectorAll('#stepBody input[type=text], #stepBody select'), function (e) { return e.offsetHeight < 44; }).length; });
  check('mobile: form fields are touch-sized (>=44px)', small === 0, small + ' small');
  await fill(mp, { floorLength: '12', floorWidth: '5' }); await mp.check('input[name=layout][value=U]'); await mp.click('#btnNext');
  await fill(mp, { prodLength: '300', prodWidth: '200', prodHeight: '150', weight: '2' }); await mp.click('#btnNext'); await fill(mp, { rate: '20' }); await mp.click('#btnNext');
  await mp.screenshot({ path: path.join(out, 'mobile-step4.png'), fullPage: true });
  await mp.click('#btnNext'); await mp.waitForSelector('#resultsBody .hero');
  var sw2 = await mp.evaluate(function () { return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
  check('mobile: no horizontal scroll on results (' + sw2.sw + ' vs ' + sw2.cw + ')', sw2.sw <= sw2.cw + 1);
  await mp.screenshot({ path: path.join(out, 'mobile-results.png'), fullPage: true });
  check('no uncaught JS errors (mobile)', m.errors.length === 0, m.errors.join(' | '));
  await m.ctx.close();

  await browser.close(); console.log(fails ? '\n' + fails + ' browser check(s) FAILED' : '\nAll browser checks passed'); process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error('Smoke test crashed:', e); process.exit(2); });
