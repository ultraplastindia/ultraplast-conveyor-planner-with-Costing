/*
 * report.js — REPORT GENERATION (JSON summary + dependency-free PDF writer)
 * ---------------------------------------------------------------------------
 * No external library is needed, so reports still work offline and when a CDN
 * is blocked. The PDF is plain A4 text + vector drawing using the built-in
 * Helvetica fonts. Works in the browser (global UCPReport) and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UCPReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var APP_VERSION = '1.0.0';
  var DISCLAIMER = 'PRELIMINARY ESTIMATE - NOT AN ENGINEERING DESIGN OR QUOTATION. Results are calculated only from the information entered and cannot replace detailed design by Ultraplast engineers. No prices are included. Published specifications used as reference are unverified.';

  /* ------------------------------------------------------------ helpers */
  function n(v, dp) { if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return '-'; var f = Math.pow(10, dp === undefined ? 2 : dp); return String(Math.round(v * f) / f); }
  function val(v, unit, dp) { var s = n(v, dp); return s === '-' ? '-' : s + (unit ? ' ' + unit : ''); }

  /* ---------------------------------------------------- JSON summary */
  function buildSummary(raw, inp, res, P, now) {
    var cat = res.recommendation;
    return {
      schema: 'ultraplast-conveyor-planner/project/1',
      appVersion: APP_VERSION,
      generatedAt: (now || new Date()).toISOString(),
      notice: DISCLAIMER,
      units: 'Calculated values are metric. formState holds the values exactly as entered (see formState.unitSystem).',
      formState: raw,
      inputsMetric: stripPrivate(inp),
      results: {
        floor: res.floor,
        recommendation: { recommendedId: cat.primaryId, selectedId: cat.selectedId, selectedName: cat.selected.name, alternatives: cat.alternatives, reasons: cat.reasons },
        path: res.path ? {
          placement: res.path.placement, complete: res.path.complete, straight_m: res.path.straight, curved_m: res.path.curved, inclined_m: res.path.inclined,
          total_m: res.path.total, horizontal_m: res.path.horizontal, netRise_m: res.path.netRise, status: res.path.totalStatus,
          segments: res.path.details.map(function (d) { return { index: d.index + 1, type: d.type, length_m: n(d.length, 4) * 1, horizontal_m: n(d.horizontal, 4) * 1 }; })
        } : null,
        fit: res.fit, collisions: res.collisions, throughput: res.throughput, width: res.width, radiusChecks: res.radiusChecks, beltChainLoop: res.loop,
        engineeringReviewRequired: res.engineering, equipment: res.equipment
      },
      issues: res.issues, missingInputs: res.missing, assumptions: res.assumptions, exclusions: res.exclusions, nextSteps: res.nextSteps,
      pricing: 'Not included. Request a detailed quotation from Ultraplast.'
    };
  }
  function stripPrivate(inp) {
    var c = JSON.parse(JSON.stringify(inp, function (k, v) { return (typeof v === 'number' && isNaN(v)) ? 'INVALID' : v; }));
    delete c._sys; return c;
  }

  /* ------------------------------------------------ human report model */
  function buildReportModel(raw, inp, res, P, now) {
    var S = res.statusLabels, rec = res.recommendation, sections = [];
    var d = (now || new Date());
    var meta = { title: 'Preliminary Conveyor Project Report', project: raw.projectName || 'Untitled project', generated: d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC', company: P.company.name, website: P.company.website, disclaimer: DISCLAIMER };

    sections.push({ title: 'Recommendation', rows: [
      ['Selected conveyor type', rec.selected.name, rec.selectedId === rec.primaryId ? 'Config-dependent' : 'Customer-selected'],
      ['Automatic suggestion', (P.categories.filter(function (c) { return c.id === rec.primaryId; })[0] || {}).name, 'Config-dependent'],
      ['Alternatives', rec.alternatives.map(function (a) { return (P.categories.filter(function (c) { return c.id === a; })[0] || {}).name; }).join('; ') || '-', 'Config-dependent']
    ], bullets: rec.reasons });

    sections.push({ title: 'Available space and route', rows: [
      ['Floor length x width', val(res.floor.length, 'm') + ' x ' + val(res.floor.width, 'm'), S.CUSTOMER],
      ['Floor area', val(res.floor.area, 'm2'), res.floor.area === null ? '-' : S.CALC],
      ['Layout', String(raw.layout || '-').toUpperCase(), S.CUSTOMER],
      ['Total conveyor path length', res.path ? val(res.path.total, 'm') + (res.path.complete ? '' : ' (partial)') : '-', res.path ? res.path.totalStatus : S.REVIEW],
      ['Straight segments', res.path ? val(res.path.straight, 'm') : '-', res.path ? res.path.status : '-'],
      ['Curved segments', res.path ? val(res.path.curved, 'm') : '-', res.path ? S.CALC : '-'],
      ['Inclined segments', res.path ? val(res.path.inclined, 'm') : '-', res.path ? S.CALC : '-'],
      ['Route footprint check', res.fit.detail ? (res.fit.status === 'fits' ? 'Fits: ' : 'DOES NOT FIT: ') + res.fit.detail : '-', res.fit.detail ? S.CALC : '-']
    ] });

    if (res.path && res.path.details && res.path.details.length) {
      var inl = typeof inp.inletHeight === 'number' && isFinite(inp.inletHeight) ? inp.inletHeight : null, pts = res.path.points;
      var hz = function (i) { return inl === null ? '-' : Math.round(inl + (pts[i].z || 0) * 1000) + ' mm'; };
      sections.push({ title: 'Dimension schedule (as drawn in the 3D view)', table: { head: ['No.', 'Type', 'Length', 'Details', 'Height start / end'], widths: [0.07, 0.17, 0.14, 0.4, 0.22], rows: res.path.details.map(function (d, i) {
        var kind = d.type === 'straight' ? 'Straight' : d.type === 'curve' ? 'Curve ' + (d.direction === 'right' ? 'right' : 'left') : (d.rise < 0 ? 'Decline' : 'Incline');
        var det = d.type === 'curve' ? 'Radius ' + Math.round(d.radius * 1000) + ' mm, sweep ' + (Math.round(d.angle * 10) / 10) + ' deg' : d.type === 'incline' ? 'Run ' + n(d.horizontal, 3) + ' m, rise ' + Math.round(d.rise * 1000) + ' mm, slope ' + (Math.round(Math.abs(d.angle) * 10) / 10) + ' deg' : 'Run ' + n(d.horizontal, 3) + ' m';
        return ['S' + (i + 1), kind, n(d.length, 3) + ' m', det, hz(d.p0) + ' / ' + hz(d.p1)];
      }) } });
    }

    var t = res.throughput;
    sections.push({ title: 'Product and throughput', rows: [
      ['Product', (raw.productName || '-') + ' (' + val(inp.prodLength, 'mm', 0) + ' x ' + val(inp.prodWidth, 'mm', 0) + ' x ' + val(inp.prodHeight, 'mm', 0) + ', ' + val(inp.weight, 'kg', 3) + ')', S.CUSTOMER],
      ['Required throughput', t.ratePerMin === null || t.ratePerMin === undefined ? '-' : val(t.ratePerMin, 'products/min') + ' (' + val(t.ratePerHour, '/h', 0) + ')', S.CUSTOMER],
      ['Product pitch along travel', val(t.productPitchMm, 'mm', 1), t.productPitchMm ? S.CALC : '-'],
      ['Minimum speed for throughput', val(t.requiredSpeed, 'm/min'), t.requiredSpeed ? S.CALC : '-'],
      ['Entered speed / capacity', inp.speed ? val(inp.speed, 'm/min') + ' / ' + val(t.capacityPerMin, 'per min', 1) : '-', inp.speed ? S.CALC : '-'],
      ['Products on conveyor (running spacing)', t.unitsOnConveyor === undefined ? '-' : String(t.unitsOnConveyor), t.unitsOnConveyor === undefined ? '-' : S.CALC],
      ['Indicative product live load', val(t.liveLoadKg, 'kg', 1), t.liveLoadKg === undefined ? '-' : S.CALC],
      ['Worst-case accumulation load', val(t.accumulationLoadKg, 'kg', 0), t.accumulationLoadKg === undefined ? '-' : S.CALC]
    ] });

    var L = res.loop, W = res.width;
    sections.push({ title: 'Belt / chain and width', rows: [
      ['Product envelope across belt', val(W.productEnvelopeMm, 'mm', 0), W.productEnvelopeMm ? S.CALC : '-'],
      ['Recommended conveyor width', W.entered ? val(W.entered, 'mm', 0) + ' (entered)' : 'Engineering review required', W.entered ? S.CUSTOMER : S.REVIEW],
      ['Belt/chain loop length', L.status === S.CALC ? val(L.loopLengthM, 'm') : 'Not estimated: ' + (L.note || (L.needs || []).join('; ')), L.status || '-'],
      ['Minimum pitch rows', L.pitchRowsMin ? String(L.pitchRowsMin) : '-', L.pitchRowsMin ? S.CALC : '-']
    ], bullets: L.status === S.CALC ? [L.formula + '.', 'Loop length (' + val(L.loopLengthM, 'm') + ') is not the same as route length (' + val(L.routeLengthM, 'm') + ').'] : [] });

    sections.push({ title: 'Items requiring engineering review', table: { head: ['Item', 'Needs'], widths: [0.35, 0.65], rows: res.engineering.map(function (e) { return [e.item, e.requires.join(', ')]; }) } });
    sections.push({ title: 'Preliminary equipment checklist (not a bill of materials)', table: { head: ['Item', 'Qty', 'Basis', 'Status'], widths: [0.24, 0.16, 0.42, 0.18], rows: res.equipment.map(function (e) { return [e.item, e.qty + (e.unit ? ' ' + e.unit : ''), e.basis, e.status]; }) },
      bullets: ['The final bill of materials depends on detailed engineering. Items shown are only those suggested by your answers.'] });
    sections.push({ title: 'Issues and checks', bullets: res.issues.length ? res.issues.map(function (i) { return '[' + i.level.toUpperCase() + '] ' + i.msg; }) : ['No issues raised.'] });
    sections.push({ title: 'Missing engineering inputs', bullets: res.missing.length ? res.missing : ['None identified by the calculator.'] });
    sections.push({ title: 'Assumptions', bullets: res.assumptions });
    sections.push({ title: 'Exclusions', bullets: res.exclusions });
    sections.push({ title: 'Next steps', bullets: res.nextSteps.concat(['Request a detailed quotation from Ultraplast: ' + P.company.enquiryEmail + ' | ' + P.company.phones.join(', ')]) });

    var schem = null;
    if (res.floor.area !== null) schem = { floor: { l: res.floor.length, w: res.floor.width }, path: res.path ? res.path.points : [], placement: res.path ? res.path.placement : null, obstacles: (inp.obstacles || []).filter(function (o) { return o.x !== null && o.y !== null && o.w > 0 && o.d > 0; }) };
    return { meta: meta, sections: sections, schematic: schem };
  }

  /* ------------------------------------------------------ PDF writer */
  var HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  function sanitize(s) {
    s = String(s === null || s === undefined ? '' : s);
    var map = { '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '•': '\u0095', '≤': '<=', '≥': '>=', '≈': '~', 'π': 'pi', '²': '2', '³': '3', '→': '->', '…': '...', '₹': 'INR ' };
    var o = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), code = s.charCodeAt(i);
      if (map[c] !== undefined) o += map[c];
      else if (code === 9) o += ' ';
      else if (code === 10) o += '\n';
      else if (code >= 32 && code <= 126) o += c;
      else if (code === 149 || (code >= 160 && code <= 255)) o += c;
      else o += '?';
    }
    return o;
  }
  function textWidth(s, size, bold) {
    var w = 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); w += (c >= 32 && c <= 126) ? HW[c - 32] : 556; }
    return w / 1000 * size * (bold ? 1.07 : 1);
  }
  function wrap(s, maxW, size, bold) {
    var out = [];
    sanitize(s).split('\n').forEach(function (para) {
      var words = para.split(' '), line = '';
      words.forEach(function (w) {
        while (textWidth(w, size, bold) > maxW && w.length > 1) {          // hard-break very long tokens
          var k = w.length; while (k > 1 && textWidth(w.slice(0, k), size, bold) > maxW) k--;
          if (line) { out.push(line); line = ''; }
          out.push(w.slice(0, k)); w = w.slice(k);
        }
        var test = line ? line + ' ' + w : w;
        if (textWidth(test, size, bold) <= maxW) line = test; else { if (line) out.push(line); line = w; }
      });
      out.push(line);
    });
    return out;
  }
  function esc(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), code = s.charCodeAt(i);
      if (c === '\\' || c === '(' || c === ')') o += '\\' + c;
      else if (code > 126) o += '\\' + ('00' + code.toString(8)).slice(-3);
      else o += c;
    }
    return o;
  }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }

  function Pdf() {
    this.pages = []; this.cur = null; this.W = 595.28; this.H = 841.89; this.M = 42; this.newPage();
  }
  Pdf.prototype.newPage = function () { this.cur = []; this.pages.push(this.cur); this.y = this.M + 30; return this; };
  Pdf.prototype.op = function (s) { this.cur.push(s); };
  Pdf.prototype.color = function (c, stroke) { this.op(c.map(f2).join(' ') + (stroke ? ' RG' : ' rg')); };
  Pdf.prototype.text = function (x, topY, s, size, bold, col) {
    this.color(col || [0.1, 0.1, 0.1]);
    this.op('BT /F' + (bold ? 2 : 1) + ' ' + size + ' Tf ' + f2(x) + ' ' + f2(this.H - topY) + ' Td (' + esc(sanitize(s)) + ') Tj ET');
  };
  Pdf.prototype.rect = function (x, topY, w, h, fill, stroke) {
    if (fill) { this.color(fill); this.op(f2(x) + ' ' + f2(this.H - topY - h) + ' ' + f2(w) + ' ' + f2(h) + ' re f'); }
    if (stroke) { this.color(stroke, true); this.op('0.6 w ' + f2(x) + ' ' + f2(this.H - topY - h) + ' ' + f2(w) + ' ' + f2(h) + ' re S'); }
  };
  Pdf.prototype.line = function (x1, y1, x2, y2, col, w, dash) {
    this.color(col, true); this.op((w || 0.6) + ' w ' + (dash ? '[' + dash + '] 0 d ' : '[] 0 d ') + f2(x1) + ' ' + f2(this.H - y1) + ' m ' + f2(x2) + ' ' + f2(this.H - y2) + ' l S');
  };
  Pdf.prototype.poly = function (pts, col, w, dash) {
    if (pts.length < 2) return; var self = this;
    var s = (w || 1) + ' w ' + (dash ? '[' + dash + '] 0 d ' : '[] 0 d ') + f2(pts[0][0]) + ' ' + f2(self.H - pts[0][1]) + ' m ';
    for (var i = 1; i < pts.length; i++) s += f2(pts[i][0]) + ' ' + f2(self.H - pts[i][1]) + ' l ';
    this.color(col, true); this.op(s + 'S');
  };
  Pdf.prototype.ensure = function (h) { if (this.y + h > this.H - this.M - 18) this.newPage(); };
  Pdf.prototype.para = function (s, size, opts) {
    opts = opts || {}; var x = this.M + (opts.indent || 0), maxW = this.W - 2 * this.M - (opts.indent || 0), lh = size * 1.3;
    var lines = wrap(s, maxW, size, opts.bold);
    for (var i = 0; i < lines.length; i++) { this.ensure(lh); this.text(x, this.y + size, lines[i], size, opts.bold, opts.color); this.y += lh; }
  };
  Pdf.prototype.bytes = function (footerText) {
    var objs = [], self = this, total = this.pages.length;
    function add(s) { objs.push(s); return objs.length; }
    add('<< /Type /Catalog /Pages 2 0 R >>');                 // 1
    add('PAGES');                                              // 2 placeholder
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');       // 3
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');  // 4
    var kids = [];
    this.pages.forEach(function (ops, idx) {
      var head = [];
      head.push('0.78 0.06 0.18 rg 0 ' + f2(self.H - 22) + ' ' + f2(self.W) + ' 22 re f');
      head.push('1 1 1 rg BT /F2 10 Tf ' + f2(self.M) + ' ' + f2(self.H - 15) + ' Td (' + esc(sanitize(footerText.head)) + ') Tj ET');
      head.push('0.45 0.45 0.45 rg BT /F1 7 Tf ' + f2(self.M) + ' 24 Td (' + esc(sanitize(footerText.foot)) + ') Tj ET');
      head.push('0.45 0.45 0.45 rg BT /F1 7 Tf ' + f2(self.W - self.M - 40) + ' 24 Td (Page ' + (idx + 1) + ' of ' + total + ') Tj ET');
      var stream = head.concat(ops).join('\n');
      var cid = add('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
      var pid = add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f2(self.W) + ' ' + f2(self.H) + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cid + ' 0 R >>');
      kids.push(pid + ' 0 R');
    });
    objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
    var infoId = add('<< /Title (' + esc(sanitize(footerText.head)) + ') /Producer (Ultraplast Conveyor Planner) >>');
    var out = '%PDF-1.4\n%âãÏÓ\n', offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    var u = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
    return u;
  };

  var RED = [0.78, 0.06, 0.18], GREY = [0.45, 0.45, 0.45], LIGHT = [0.95, 0.95, 0.95], BLACK = [0.1, 0.1, 0.1];

  function drawSchematic(pdf, sc) {
    var boxW = pdf.W - 2 * pdf.M, boxH = 190;
    pdf.ensure(boxH + 40);
    pdf.para('Schematic (plan view, to scale)', 11, { bold: true }); pdf.y += 2;
    var top = pdf.y, pad = 22, aw = boxW - 2 * pad, ah = boxH - 2 * pad;
    var s = Math.min(aw / sc.floor.l, ah / sc.floor.w);
    var fx = pdf.M + pad, fy = top + pad, fw = sc.floor.l * s, fh = sc.floor.w * s;
    var X = function (x) { return fx + x * s; }, Y = function (y) { return fy + fh - y * s; };
    pdf.rect(fx, fy, fw, fh, [1, 1, 1], BLACK);
    sc.obstacles.forEach(function (o) { pdf.rect(X(o.x), Y(o.y + o.d), o.w * s, o.d * s, [0.8, 0.8, 0.8], GREY); });
    if (sc.path.length) pdf.poly(sc.path.map(function (p) { return [X(p.x), Y(p.y)]; }), RED, 2.2, sc.placement === 'auto' ? '5 3' : null);
    pdf.text(fx, top + 12, 'Floor length ' + n(sc.floor.l, 2) + ' m (entered)', 8, false, BLACK);
    pdf.text(fx + fw + 4 > pdf.W - pdf.M - 60 ? fx + fw - 90 : fx + fw + 4, fy + fh / 2, n(sc.floor.w, 2) + ' m', 8, false, BLACK);
    pdf.y = top + boxH + 4;
    pdf.para('Black outline = entered floor. Red line = proposed conveyor centre-line' + (sc.placement === 'auto' ? ' (dashed: position auto-placed, not confirmed)' : '') + '. Grey blocks = entered obstacles.', 8, { color: GREY });
    pdf.y += 4;
  }

  function renderPdf(model) {
    var pdf = new Pdf(), m = model.meta, W = pdf.W - 2 * pdf.M;
    pdf.para(m.title, 20, { bold: true, color: RED });
    pdf.para(m.project, 13, { bold: true });
    pdf.para('Generated ' + m.generated + '  |  ' + m.company + '  |  ' + m.website, 8, { color: GREY });
    pdf.y += 6;
    var dl = wrap(m.disclaimer, W - 16, 8.5, true), bh = dl.length * 11 + 12;
    pdf.rect(pdf.M, pdf.y, W, bh, [1, 0.94, 0.94], RED);
    dl.forEach(function (l, i) { pdf.text(pdf.M + 8, pdf.y + 14 + i * 11, l, 8.5, true, [0.55, 0.05, 0.12]); });
    pdf.y += bh + 10;
    var drewSchem = false;
    model.sections.forEach(function (sec, idx) {
      if (!drewSchem && model.schematic && idx === 1) { pdf.ensure(40); pdf.para(sec.title, 12, { bold: true, color: RED }); pdf.y += 2; drawRows(pdf, sec, W); drawSchematic(pdf, model.schematic); drewSchem = true; return; }
      pdf.ensure(46); pdf.y += 4; pdf.para(sec.title, 12, { bold: true, color: RED }); pdf.y += 2;
      drawRows(pdf, sec, W);
    });
    return pdf.bytes({ head: m.title + ' - ' + m.project, foot: 'Preliminary estimate only - not a quotation. ' + m.website });
  }

  function drawRows(pdf, sec, W) {
    if (sec.rows) {
      var cw = [W * 0.30, W * 0.50, W * 0.20];
      sec.rows.forEach(function (r, i) {
        var l0 = wrap(r[0], cw[0] - 8, 8.5, true), l1 = wrap(r[1], cw[1] - 8, 8.5), l2 = wrap(r[2], cw[2] - 6, 7), nl = Math.max(l0.length, l1.length, l2.length), h = nl * 11 + 6;
        pdf.ensure(h);
        if (i % 2 === 0) pdf.rect(pdf.M, pdf.y, W, h, LIGHT);
        l0.forEach(function (l, k) { pdf.text(pdf.M + 4, pdf.y + 11 + k * 11, l, 8.5, true); });
        l1.forEach(function (l, k) { pdf.text(pdf.M + cw[0] + 4, pdf.y + 11 + k * 11, l, 8.5); });
        l2.forEach(function (l, k) { pdf.text(pdf.M + cw[0] + cw[1] + 2, pdf.y + 10 + k * 9, l, 7, false, GREY); });
        pdf.y += h;
      });
      pdf.y += 4;
    }
    if (sec.table) {
      var t = sec.table, cws = t.widths.map(function (f) { return f * W; });
      pdf.ensure(20);
      pdf.rect(pdf.M, pdf.y, W, 14, [0.12, 0.12, 0.12]);
      var x = pdf.M; t.head.forEach(function (h, i) { pdf.text(x + 4, pdf.y + 10, h, 8, true, [1, 1, 1]); x += cws[i]; });
      pdf.y += 14;
      t.rows.forEach(function (r, ri) {
        var cells = r.map(function (c, i) { return wrap(c, cws[i] - 8, 8); }), nl = Math.max.apply(null, cells.map(function (c) { return c.length; })), h = nl * 10.5 + 6;
        pdf.ensure(h);
        if (ri % 2 === 0) pdf.rect(pdf.M, pdf.y, W, h, LIGHT);
        var xx = pdf.M; cells.forEach(function (c, i) { c.forEach(function (l, k) { pdf.text(xx + 4, pdf.y + 10 + k * 10.5, l, 8, i === 0); }); xx += cws[i]; });
        pdf.y += h;
      });
      pdf.y += 4;
    }
    if (sec.bullets) sec.bullets.forEach(function (b) { pdf.para('• ' + b, 8.5, { indent: 6 }); });
  }

  return { APP_VERSION: APP_VERSION, DISCLAIMER: DISCLAIMER, buildSummary: buildSummary, buildReportModel: buildReportModel, renderPdf: renderPdf, sanitize: sanitize, wrap: wrap };
});
