/*
 * costing.js — FLEXIBLE, RATE-CARD-DRIVEN COST ESTIMATE (internal tool)
 * ---------------------------------------------------------------------------
 * The app ships with NO prices.  Ultraplast staff enter their own rates (or load a rate-card file);
 * the engine multiplies each rate by a quantity taken from the calculated conveyor:
 *
 *   line amount = rate x quantity               (quantity = driver value, or a manual override)
 *   subtotal    = sum of enabled lines
 *   + wastage % of subtotal
 *   + overhead % of (subtotal + wastage)
 *   + margin % of (that)
 *   - discount % of (that)
 *   + tax (GST) % of (that)                      = total
 *
 * Any enabled line without a rate is flagged and the total is marked INCOMPLETE - never silently zero.
 * Output is an internal estimate, not a quotation.  Rates are never sent, exported with customer data, or stored by default.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UCPCosting = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DRIVERS = {
    path_m: { label: 'Belt path length', unit: 'm' },
    straight_m: { label: 'Straight length', unit: 'm' },
    curved_m: { label: 'Curved length', unit: 'm' },
    incline_m: { label: 'Inclined length', unit: 'm' },
    belt_area_m2: { label: 'Belt area (path x belt width)', unit: 'm2' },
    frame_m: { label: 'Side frame length (2 sides)', unit: 'm' },
    guide_m: { label: 'Guide rail length (2 sides)', unit: 'm' },
    legs: { label: 'Support legs (indicative count from the 3D model)', unit: 'nos' },
    end_units: { label: 'End assemblies (idler + drive)', unit: 'nos' },
    drives: { label: 'Drive units', unit: 'nos' },
    curves: { label: 'Curve segments', unit: 'nos' },
    inclines: { label: 'Incline segments', unit: 'nos' },
    lanes: { label: 'Lanes', unit: 'nos' },
    transfers: { label: 'Transfer points', unit: 'nos' },
    fixed: { label: 'Fixed (1 lot)', unit: 'lot' },
    manual: { label: 'Manual quantity', unit: 'nos' }
  };

  /** Starter lines - labels only. Every rate is null: the company must enter its own. */
  function templateCard() {
    function L(id, label, driver) { return { id: id, label: label, driver: driver, unit: DRIVERS[driver].unit, rate: null, qty: null, enabled: true, note: '' }; }
    return {
      schema: 'ultraplast-conveyor-planner/rate-card/1', currency: 'INR', name: 'My rate card',
      lines: [
        L('belt', 'Belt / chain (per m2 of belt)', 'belt_area_m2'), L('frame', 'Side frame (per m)', 'frame_m'), L('guides', 'Guide rails (per m)', 'guide_m'),
        L('legs', 'Support legs with foot (each)', 'legs'), L('ends', 'End assemblies - idler and drive shaft, sprockets, bearings (each)', 'end_units'),
        L('drive', 'Drive unit - motor, gearbox (each)', 'drives'), L('curve', 'Extra for each curve segment', 'curves'), L('incline', 'Extra for each incline segment', 'inclines'),
        L('transfer', 'Transfer point (each)', 'transfers'), L('controls', 'Controls and electrical (lot)', 'fixed'), L('freight', 'Packing and freight (lot)', 'fixed'), L('install', 'Installation and commissioning (lot)', 'fixed')
      ],
      percents: { wastage: 0, overhead: 0, margin: 0, discount: 0, tax: 0 }
    };
  }

  /** Quantities from the calculated conveyor. `extra`: { legs (from 3D model), beltWidthM }. Missing data -> null (never guessed). */
  function quantities(inp, res, extra) {
    extra = extra || {}; var p = res && res.path, q = {}, n = function (v) { return typeof v === 'number' && isFinite(v); };
    var total = p && n(p.total) ? p.total : null;
    q.path_m = total; q.straight_m = p ? p.straight : null; q.curved_m = p ? p.curved : null; q.incline_m = p ? p.inclined : null;
    q.belt_area_m2 = total !== null && n(extra.beltWidthM) && extra.beltWidthM > 0 ? total * extra.beltWidthM : null;
    q.frame_m = total !== null ? 2 * total : null; q.guide_m = total !== null ? 2 * total : null;
    q.legs = n(extra.legs) ? extra.legs : null; q.end_units = total !== null ? 2 : null;
    q.drives = inp && n(inp.drives) && inp.drives > 0 ? inp.drives : (total !== null ? 1 : null);
    q.curves = p && p.details ? p.details.filter(function (d) { return d.type === 'curve'; }).length : null;
    q.inclines = p && p.details ? p.details.filter(function (d) { return d.type === 'incline'; }).length : null;
    q.lanes = res && res.throughput && n(res.throughput.lanes) ? res.throughput.lanes : null;
    q.transfers = inp && n(inp.transfers) ? inp.transfers : 0; q.fixed = 1; q.manual = null;
    return q;
  }

  function numOrNull(v) { if (v === null || v === undefined || v === '') return null; var x = Number(v); return isFinite(x) ? x : NaN; }

  /** Calculate. Returns lines, build-up and flags. */
  function compute(card, q) {
    var lines = [], missing = [], sub = 0, i;
    (card.lines || []).forEach(function (l) {
      var qtyOver = numOrNull(l.qty), driverQty = l.driver === 'manual' ? null : (q ? q[l.driver] : null);
      var qty = qtyOver !== null && !isNaN(qtyOver) ? qtyOver : (driverQty === undefined ? null : driverQty), rate = numOrNull(l.rate);
      var row = { id: l.id, label: l.label, driver: l.driver, unit: l.unit || (DRIVERS[l.driver] || {}).unit || '', qty: qty, qtySource: qtyOver !== null && !isNaN(qtyOver) ? 'manual' : 'calculated', rate: rate, amount: 0, status: 'ok', enabled: l.enabled !== false, note: l.note || '' };
      if (!row.enabled) row.status = 'off';
      else if (rate === null || isNaN(rate) || rate < 0) { row.status = 'rate-missing'; missing.push(l.label + ': rate needed'); }
      else if (qty === null || isNaN(qty)) { row.status = 'qty-missing'; missing.push(l.label + ': quantity unknown (enter the route / dimensions, or type a quantity)'); }
      else { row.amount = rate * qty; sub += row.amount; }
      lines.push(row);
    });
    var pc = card.percents || {}, pct = function (k) { var v = numOrNull(pc[k]); return v === null || isNaN(v) ? 0 : v; };
    var wastage = sub * pct('wastage') / 100, base = sub + wastage, overhead = base * pct('overhead') / 100, cost = base + overhead;
    var margin = cost * pct('margin') / 100, priced = cost + margin, discount = priced * pct('discount') / 100, taxable = priced - discount, tax = taxable * pct('tax') / 100;
    return { lines: lines, subtotal: sub, wastage: wastage, overhead: overhead, costBeforeMargin: cost, margin: margin, priceBeforeDiscount: priced, discount: discount, taxable: taxable, tax: tax, total: taxable + tax, complete: missing.length === 0 && lines.some(function (l) { return l.status === 'ok'; }), missing: missing, currency: card.currency || 'INR' };
  }

  /** Validate / normalise an imported rate card. Throws Error with a readable message. */
  function importCard(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.lines)) throw new Error('This is not a rate card file (no "lines" list).');
    if (obj.lines.length > 200) throw new Error('Too many lines (max 200).');
    var t = templateCard(), out = { schema: t.schema, currency: String(obj.currency || 'INR').slice(0, 8), name: String(obj.name || 'Imported rate card').slice(0, 80), lines: [], percents: { wastage: 0, overhead: 0, margin: 0, discount: 0, tax: 0 } };
    obj.lines.forEach(function (l, i) {
      if (!l || typeof l !== 'object') throw new Error('Line ' + (i + 1) + ' is not valid.');
      var driver = DRIVERS[l.driver] ? l.driver : 'manual', rate = numOrNull(l.rate), qty = numOrNull(l.qty);
      if (rate !== null && (isNaN(rate) || rate < 0)) throw new Error('Line ' + (i + 1) + ' ("' + l.label + '"): rate must be a number, zero or more.');
      if (qty !== null && (isNaN(qty) || qty < 0)) throw new Error('Line ' + (i + 1) + ' ("' + l.label + '"): quantity must be a number, zero or more.');
      out.lines.push({ id: String(l.id || 'line' + i).slice(0, 40), label: String(l.label || 'Line ' + (i + 1)).slice(0, 120), driver: driver, unit: String(l.unit || DRIVERS[driver].unit).slice(0, 12), rate: rate, qty: qty, enabled: l.enabled !== false, note: String(l.note || '').slice(0, 200) });
    });
    var pc = obj.percents || {};
    Object.keys(out.percents).forEach(function (k) { var v = numOrNull(pc[k]); if (v !== null && (isNaN(v) || v < 0 || v > 1000)) throw new Error('Percentage "' + k + '" must be between 0 and 1000.'); out.percents[k] = v === null ? 0 : v; });
    return out;
  }

  function fmtMoney(v, cur) { if (v === null || v === undefined || isNaN(v)) return '-'; var s = (Math.round(v * 100) / 100).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (cur === 'INR' ? 'Rs ' : cur + ' ') + s; }

  function toCsv(card, r, projectName) {
    function c(v) { v = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var rows = [['Internal cost estimate - not a quotation'], ['Project', projectName || ''], ['Rate card', card.name || ''], ['Currency', r.currency], [], ['Item', 'Basis', 'Quantity', 'Unit', 'Quantity source', 'Rate', 'Amount', 'Status']];
    r.lines.forEach(function (l) { rows.push([l.label, (DRIVERS[l.driver] || {}).label || l.driver, l.qty === null ? '' : Math.round(l.qty * 1000) / 1000, l.unit, l.qtySource, l.rate === null ? '' : l.rate, Math.round(l.amount * 100) / 100, l.status]); });
    rows.push([]); [['Subtotal', r.subtotal], ['Wastage %' + (card.percents.wastage || 0), r.wastage], ['Overhead %' + (card.percents.overhead || 0), r.overhead], ['Margin %' + (card.percents.margin || 0), r.margin], ['Discount %' + (card.percents.discount || 0), -r.discount], ['Tax %' + (card.percents.tax || 0), r.tax], ['TOTAL' + (r.complete ? '' : ' (INCOMPLETE - rates/quantities missing)'), r.total]].forEach(function (x) { rows.push([x[0], '', '', '', '', '', Math.round(x[1] * 100) / 100, '']); });
    return rows.map(function (r2) { return r2.map(c).join(','); }).join('\r\n');
  }

  return { DRIVERS: DRIVERS, templateCard: templateCard, quantities: quantities, compute: compute, importCard: importCard, fmtMoney: fmtMoney, toCsv: toCsv };
});
