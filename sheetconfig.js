/*
 * sheetconfig.js — LOAD PRODUCT DATA FROM A GOOGLE SHEET (read-only, optional)
 * ---------------------------------------------------------------------------
 * The sheet is "Published to the web" as CSV (one URL per tab). No login, no API key.
 * Anything in the sheet overrides the built-in defaults in products.js; blank cells keep the default.
 * Rules: numbers must be valid and positive, otherwise the cell is IGNORED and a warning is recorded.
 * Values are only treated as engineering-verified when the "verified" column says YES.
 * If the sheet cannot be loaded, the app silently falls back to products.js and tells the user.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UCPSheets = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** RFC-4180 CSV parser (quotes, escaped quotes, commas and newlines inside quotes). */
  function parseCsv(text) {
    var rows = [], row = [], cell = '', i = 0, q = false, c;
    text = String(text || '').replace(/^﻿/, '');
    while (i < text.length) {
      c = text.charAt(i);
      if (q) {
        if (c === '"') { if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text.charAt(i + 1) === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
      i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function toObjects(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); }), out = [];
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r], first = String(row[0] === undefined ? '' : row[0]).trim();
      if (!row.some(function (c) { return String(c).trim() !== ''; }) || first.charAt(0) === '#') continue;
      var o = {}; head.forEach(function (h, k) { o[h] = row[k] === undefined ? '' : String(row[k]).trim(); }); out.push(o);
    }
    return out;
  }
  var isYes = function (v) { return /^(yes|y|true|1)$/i.test(String(v || '').trim()); };
  function num(v, allowZero) { var s = String(v === undefined ? '' : v).trim(); if (s === '') return undefined; var n = Number(s); return isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : NaN; }
  function numList(v) { var parts = String(v || '').split(/[;|]/).map(function (x) { return x.trim(); }).filter(Boolean); var out = parts.map(Number); return out.length && out.every(function (n) { return isFinite(n) && n > 0; }) ? out : (parts.length ? NaN : undefined); }
  function spec(value, unit, source, verified, note) { return { value: value, unit: unit || null, source: source || 'Google Sheet', verified: !!verified, note: note || null }; }

  var ENG_KEYS = { moduleLengthMm: false, legSpacingMm: false, widthAllowancePerSideMm: true, maxInclineDeg: false, maxSpeedMPerMin: false };

  function applyEngineering(objs, P, log) {
    objs.forEach(function (o) {
      var k = o.key; if (!(k in ENG_KEYS)) { if (k) log.push('Engineering: unknown key "' + k + '" ignored.'); return; }
      var n = num(o.value, ENG_KEYS[k]);
      if (n === undefined) { P.engineering[k] = null; return; }
      if (isNaN(n)) { log.push('Engineering: "' + k + '" = "' + o.value + '" is not a valid number; default kept.'); return; }
      if (k === 'maxInclineDeg' && n >= 90) { log.push('Engineering: maxInclineDeg must be below 90; ignored.'); return; }
      P.engineering[k] = n; P.meta.sheetValues.push({ key: k, verified: isYes(o.verified) });
    });
  }
  function applyFamilies(objs, P, log) {
    objs.forEach(function (o) {
      var id = (o.id || '').replace(/[^a-z0-9_]/gi, ''); if (!id) return;
      var v = isYes(o.verified), src = o.source || 'Google Sheet', fam = P.families[id];
      if (!fam) fam = P.families[id] = { label: o.label || id, widthMm: null, pitchOptionsMm: null, sprocketTeeth: null, pinDiameterMm: null, minSideFlexRadius: null, moduleLengthMm: null };
      if (o.label) fam.label = o.label;
      var wmin = num(o.widthminmm), wmax = num(o.widthmaxmm);
      if (wmin !== undefined || wmax !== undefined) {
        if (isNaN(wmin) || isNaN(wmax) || wmin === undefined || wmax === undefined || wmin > wmax) log.push('Families: "' + id + '" width range invalid; default kept.');
        else fam.widthMm = { min: spec(wmin, 'mm', src, v), max: spec(wmax, 'mm', src, v) };
      }
      var pl = numList(o.pitchoptionsmm); if (pl !== undefined) { if (!Array.isArray(pl)) log.push('Families: "' + id + '" pitch list invalid; default kept.'); else fam.pitchOptionsMm = spec(pl, 'mm', src, v); }
      var t = num(o.sprocketteeth); if (t !== undefined) { if (isNaN(t) || Math.floor(t) !== t || t < 3) log.push('Families: "' + id + '" sprocket teeth invalid; default kept.'); else fam.sprocketTeeth = spec(t, null, src, v); }
      var pin = num(o.pindiametermm); if (pin !== undefined) { if (isNaN(pin)) log.push('Families: "' + id + '" pin diameter invalid; default kept.'); else fam.pinDiameterMm = spec(pin, 'mm', src, v); }
      var rf = num(o.minradiusfixedmm), rx = num(o.minradiusfactorofwidth);
      if (rf !== undefined || rx !== undefined) {
        if ((rf !== undefined && isNaN(rf)) || (rx !== undefined && isNaN(rx))) log.push('Families: "' + id + '" minimum radius invalid; default kept.');
        else fam.minSideFlexRadius = { fixedMm: rf !== undefined ? spec(rf, 'mm', src, v) : null, factorOfWidth: rx !== undefined ? spec(rx, 'x width', src, v) : null };
      }
      var ml = num(o.modulelengthmm); if (ml !== undefined && !isNaN(ml)) fam.moduleLengthMm = spec(ml, 'mm', src, v);
      String(o.usedbycategories || '').split(/[;|]/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (cid) {
        var cat = P.categories.filter(function (c) { return c.id === cid; })[0];
        if (!cat) log.push('Families: category "' + cid + '" does not exist.'); else if (cat.families.indexOf(id) < 0) cat.families.push(id);
      });
      P.meta.sheetValues.push({ key: 'family:' + id, verified: v });
    });
  }
  function applyCompany(objs, P, log) {
    objs.forEach(function (o) {
      var k = o.key, v = o.value; if (!k || v === '') return;
      if (k === 'enquiryEmail') { if (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(v)) P.company.enquiryEmail = v; else log.push('Company: enquiryEmail invalid; default kept.'); }
      else if (k === 'phones') { var ph = v.split(/[;|]/).map(function (x) { return x.trim(); }).filter(function (x) { return /^\+?[\d\s\-()]{6,20}$/.test(x); }); if (ph.length) P.company.phones = ph; else log.push('Company: phones invalid; default kept.'); }
      else if (k === 'address') P.company.address = v.slice(0, 300);
      else if (k === 'hours') P.company.hours = v.slice(0, 100);
      else if (k === 'whatsappNumber') { var d = v.replace(/\D/g, ''); if (d.length >= 8 && d.length <= 15) P.company.whatsappNumber = d; else log.push('Company: whatsappNumber invalid; ignored.'); }
      else if (k === 'whatsappVerified') P.company.whatsappVerified = isYes(v);
    });
  }

  var TABS = [['engineeringCsv', 'Engineering', applyEngineering], ['familiesCsv', 'Families', applyFamilies], ['companyCsv', 'Company', applyCompany]];

  /** @returns Promise<{status:'not_configured'|'loaded'|'partial'|'failed', loaded:[], failed:[], warnings:[], unverified:number}> */
  function load(cfg, P, fetchImpl) {
    cfg = cfg || {}; P.meta.sheetValues = [];
    var f = fetchImpl || (typeof fetch === 'function' ? fetch : null), jobs = [], log = [], loaded = [], failed = [];
    TABS.forEach(function (t) { if (cfg[t[0]]) jobs.push(t); });
    if (!jobs.length) return Promise.resolve({ status: 'not_configured', loaded: [], failed: [], warnings: [], unverified: 0 });
    if (!f) return Promise.resolve({ status: 'failed', loaded: [], failed: jobs.map(function (j) { return j[1]; }), warnings: ['This browser cannot fetch the sheet.'], unverified: 0 });
    return Promise.all(jobs.map(function (t) {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer;
      // Hard timeout: even if fetch ignores the abort signal, the page must never wait forever.
      var hardStop = new Promise(function (_, reject) { timer = setTimeout(function () { if (ctl) ctl.abort(); reject(new Error('timed out')); }, cfg.timeoutMs || 6000); });
      return Promise.race([Promise.resolve().then(function () { return f(cfg[t[0]], { credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined }); }), hardStop])
        .then(function (r) { if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status)); return Promise.race([r.text(), hardStop]); })
        .then(function (text) {
          if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('not CSV (is the tab published to the web?)');
          var objs = toObjects(parseCsv(text)); t[2](objs, P, log); loaded.push(t[1]);
        })
        .catch(function (e) { failed.push(t[1]); log.push(t[1] + ' tab could not be loaded (' + (e && e.message ? e.message : 'error') + '); built-in values kept.'); })
        .then(function () { clearTimeout(timer); });
    })).then(function () {
      var unv = P.meta.sheetValues.filter(function (x) { return !x.verified; }).length;
      if (loaded.length) P.meta.dataSource = 'Google Sheet (' + loaded.join(', ') + ')';
      return { status: failed.length ? (loaded.length ? 'partial' : 'failed') : 'loaded', loaded: loaded, failed: failed, warnings: log, unverified: unv };
    });
  }
  return { parseCsv: parseCsv, toObjects: toObjects, load: load, applyEngineering: applyEngineering, applyFamilies: applyFamilies, applyCompany: applyCompany };
});
