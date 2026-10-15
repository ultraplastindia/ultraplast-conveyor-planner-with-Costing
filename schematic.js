/*
 * schematic.js — 2D PLAN-VIEW SCHEMATIC (SVG string builder, no dependencies)
 * Entered dimensions: solid black.  Calculated / proposed layout: red, dashed when position is only auto-placed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UCPSchematic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function f(n) { return (Math.round(n * 100) / 100).toFixed(2); }
  var ok = function (v) { return typeof v === 'number' && isFinite(v) && v > 0; };

  /**
   * opts: { floorL, floorW (m), path (res.path or null), obstacles [{name,x,y,w,d}], fmt(m)->string }
   */
  function render(opts) {
    var W = 640, pad = 46, fmt = opts.fmt || function (m) { return f(m) + ' m'; };
    if (!ok(opts.floorL) || !ok(opts.floorW)) {
      return '<svg viewBox="0 0 640 200" role="img" aria-label="Schematic placeholder" class="sc"><rect x="1" y="1" width="638" height="198" class="sc-empty"/><text x="320" y="105" text-anchor="middle" class="sc-text">Enter the floor length and width to see the schematic</text></svg>';
    }
    var fl = opts.floorL, fw = opts.floorW;
    var s = Math.min((W - 2 * pad) / fl, 340 / fw), fx = (W - fl * s) / 2, fy = pad - 8, pw = fl * s, ph = fw * s, H = ph + pad + 52;
    var X = function (x) { return fx + x * s; }, Y = function (y) { return fy + ph - y * s; };
    var o = [];
    o.push('<svg viewBox="0 0 ' + W + ' ' + f(H) + '" data-s="' + s + '" data-fx="' + f(fx) + '" data-fy="' + f(fy) + '" data-ph="' + f(ph) + '" role="img" aria-label="Plan view schematic of the available floor and proposed conveyor route" class="sc" xmlns="http://www.w3.org/2000/svg">');
    o.push('<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="sc-hatch"/></pattern></defs>');
    o.push('<rect x="' + f(fx) + '" y="' + f(fy) + '" width="' + f(pw) + '" height="' + f(ph) + '" class="sc-floor"/>');
    (opts.obstacles || []).forEach(function (b, i) {
      if (!ok(b.w) || !ok(b.d) || b.x === null || b.y === null || isNaN(b.x) || isNaN(b.y)) return;
      o.push('<rect x="' + f(X(b.x)) + '" y="' + f(Y(b.y + b.d)) + '" width="' + f(b.w * s) + '" height="' + f(b.d * s) + '" class="sc-obst"/>');
      o.push('<text x="' + f(X(b.x) + 3) + '" y="' + f(Y(b.y + b.d) + 12) + '" class="sc-text sc-small">' + esc(b.name || 'Obstacle ' + (i + 1)) + '</text>');
    });
    var p = opts.path, auto = p && p.placement === 'auto';
    if (p && p.points.length > 1) {
      var d = p.points.map(function (q, i) { return (i ? 'L' : 'M') + f(X(q.x)) + ' ' + f(Y(q.y)); }).join(' ');
      var bb = p.bbox;
      o.push('<rect x="' + f(X(bb.minX)) + '" y="' + f(Y(bb.maxY)) + '" width="' + f((bb.maxX - bb.minX) * s) + '" height="' + f((bb.maxY - bb.minY) * s) + '" class="sc-bbox"/>');
      if (opts.conveyor) {
        var cv = opts.conveyor, wpx = Math.max(cv.widthM * s, 12), n = p.points.length;
        o.push('<path d="' + d + '" class="cv-rail" style="stroke-width:' + f(wpx + 8) + 'px"/>');
        o.push('<path d="' + d + '" class="cv-belt" style="stroke-width:' + f(wpx) + 'px"/>');
        o.push('<path d="' + d + '" class="cv-lines" style="stroke-width:' + f(wpx - 2) + 'px"/>');
        var ang = function (a, b) { return Math.atan2(Y(b.y) - Y(a.y), X(b.x) - X(a.x)) * 180 / Math.PI; };
        var k0 = Math.min(n - 1, 3), k1 = Math.max(0, n - 4);
        o.push('<g transform="translate(' + f(X(p.points[0].x)) + ' ' + f(Y(p.points[0].y)) + ') rotate(' + f(ang(p.points[0], p.points[k0])) + ')"><rect x="-6" y="' + f(-wpx / 2 - 6) + '" width="12" height="' + f(wpx + 12) + '" rx="3" class="cv-roller"/></g>');
        o.push('<g transform="translate(' + f(X(p.points[n - 1].x)) + ' ' + f(Y(p.points[n - 1].y)) + ') rotate(' + f(ang(p.points[k1], p.points[n - 1])) + ')"><rect x="-6" y="' + f(-wpx / 2 - 6) + '" width="12" height="' + f(wpx + 12) + '" rx="3" class="cv-roller"/><rect x="-2" y="' + f(wpx / 2 + 6) + '" width="22" height="14" rx="3" class="cv-motor"/><text transform="translate(9 ' + f(wpx / 2 + 17) + ') rotate(' + f(-ang(p.points[k1], p.points[n - 1])) + ')" text-anchor="middle" class="sc-text sc-small cv-mt">M</text></g>');
      } else o.push('<path d="' + d + '" class="sc-path' + (auto ? ' sc-auto' : '') + '"/>');
      (p.details || []).forEach(function (dt) {
        var q = p.points[Math.round((dt.p0 + dt.p1) / 2)]; if (!q) return;
        var txt = dt.type === 'curve' ? 'R' + f(dt.radius) + ' ' + Math.round(dt.angle) + '°' : (dt.type === 'incline' ? f(dt.length) + ' m ↗' + (dt.rise < 0 ? '(decl.)' : '') : fmt(dt.length));
        o.push('<text x="' + f(X(q.x)) + '" y="' + f(Y(q.y) - 8) + '" text-anchor="middle" class="sc-text sc-small sc-halo">' + esc(txt) + '</text>');
      });
      var a = p.points[0], z = p.points[p.points.length - 1];
      o.push('<circle cx="' + f(X(a.x)) + '" cy="' + f(Y(a.y)) + '" r="5" class="sc-start"/>');
      o.push('<text x="' + f(X(a.x) + 8) + '" y="' + f(Y(a.y) + 16) + '" class="sc-text sc-small sc-halo">IN ' + (auto ? '(proposed)' : '(entered)') + '</text>');
      o.push('<rect x="' + f(X(z.x) - 5) + '" y="' + f(Y(z.y) - 5) + '" width="10" height="10" class="sc-end"/>');
      o.push('<text x="' + f(X(z.x) + 8) + '" y="' + f(Y(z.y) - 8) + '" class="sc-text sc-small sc-halo">OUT (est.)</text>');
      if (!p.complete) o.push('<text x="' + f(fx + 6) + '" y="' + f(fy + ph - 8) + '" class="sc-text sc-warn">Route incomplete - segment data missing</text>');
      // route footprint label (calculated)
      o.push('<text x="' + f(X(bb.minX)) + '" y="' + f(Y(bb.maxY) - 4) + '" class="sc-text sc-small sc-est">Route footprint ' + fmt(bb.maxX - bb.minX) + ' x ' + fmt(bb.maxY - bb.minY) + ' (calculated)</text>');
    }
    var by = fy + ph + 18;
    o.push('<line x1="' + f(fx) + '" y1="' + f(by) + '" x2="' + f(fx + pw) + '" y2="' + f(by) + '" class="sc-dim"/>');
    o.push('<line x1="' + f(fx) + '" y1="' + f(by - 5) + '" x2="' + f(fx) + '" y2="' + f(by + 5) + '" class="sc-dim"/><line x1="' + f(fx + pw) + '" y1="' + f(by - 5) + '" x2="' + f(fx + pw) + '" y2="' + f(by + 5) + '" class="sc-dim"/>');
    o.push('<text x="' + f(fx + pw / 2) + '" y="' + f(by + 16) + '" text-anchor="middle" class="sc-text">Floor length ' + esc(fmt(fl)) + ' (entered)</text>');
    var rx = fx + pw + 18;
    o.push('<line x1="' + f(rx) + '" y1="' + f(fy) + '" x2="' + f(rx) + '" y2="' + f(fy + ph) + '" class="sc-dim"/>');
    o.push('<line x1="' + f(rx - 5) + '" y1="' + f(fy) + '" x2="' + f(rx + 5) + '" y2="' + f(fy) + '" class="sc-dim"/><line x1="' + f(rx - 5) + '" y1="' + f(fy + ph) + '" x2="' + f(rx + 5) + '" y2="' + f(fy + ph) + '" class="sc-dim"/>');
    o.push('<text transform="translate(' + f(rx + 14) + ' ' + f(fy + ph / 2) + ') rotate(90)" text-anchor="middle" class="sc-text">Floor width ' + esc(fmt(fw)) + ' (entered)</text>');
    o.push('</svg>');
    return o.join('');
  }
  /** Side elevation (distance along route vs height) - only when the route changes height. */
  function profile(path, fmt) {
    if (!path || !path.points || path.points.length < 2) return '';
    var pts = path.points, cum = [0], i, zmin = 0, zmax = 0;
    for (i = 1; i < pts.length; i++) { cum.push(cum[i - 1] + Math.sqrt(Math.pow(pts[i].x - pts[i - 1].x, 2) + Math.pow(pts[i].y - pts[i - 1].y, 2) + Math.pow(pts[i].z - pts[i - 1].z, 2))); zmin = Math.min(zmin, pts[i].z); zmax = Math.max(zmax, pts[i].z); }
    if (zmax - zmin < 0.02) return '';
    var W = 640, H = 150, pad = 40, L = cum[cum.length - 1], sx = (W - 2 * pad) / L, sz = (H - 2 * pad) / (zmax - zmin);
    var X = function (c) { return pad + c * sx; }, Y = function (z) { return H - pad - (z - zmin) * sz; };
    var d = pts.map(function (q, k) { return (k ? 'L' : 'M') + f(X(cum[k])) + ' ' + f(Y(q.z)); }).join(' ');
    var last = pts[pts.length - 1];
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="sc prof" role="img" aria-label="Side elevation of the conveyor showing height change" data-pad="' + pad + '" data-sx="' + sx + '" data-h="' + H + '" data-zmin="' + zmin + '" data-sz="' + sz + '">' +
      '<line x1="' + pad + '" y1="' + f(Y(zmin)) + '" x2="' + (W - pad) + '" y2="' + f(Y(zmin)) + '" class="sc-dim"/>' +
      '<path d="' + d + '" class="cv-belt" style="stroke-width:8px;fill:none"/><path d="' + d + '" class="cv-lines" style="stroke-width:6px"/>' +
      '<text x="' + pad + '" y="16" class="sc-text">Side view (not to scale vertically): height change ' + esc(fmt(last.z)) + ' relative to the inlet</text>' +
      '<text x="' + pad + '" y="' + (H - 8) + '" class="sc-text sc-small">IN</text><text x="' + (W - pad) + '" y="' + (H - 8) + '" text-anchor="end" class="sc-text sc-small">OUT (est.)</text></svg>';
  }
  var LEGEND = '<ul class="sc-legend" aria-label="Schematic legend"><li><i class="k-floor"></i> Entered floor dimensions</li><li><i class="k-path"></i> Proposed conveyor centre-line (calculated)</li><li><i class="k-auto"></i> Dashed = position auto-placed, not confirmed</li><li><i class="k-obst"></i> Entered obstacle</li></ul>';
  var LEGEND_CV = '<ul class="sc-legend" aria-label="Legend"><li><i class="k-floor"></i> Entered floor dimensions</li><li><i class="k-belt"></i> Belt / chain (moving)</li><li><i class="k-prod"></i> Products</li><li><i class="k-obst"></i> Obstacle</li></ul><p class="note">Drawn width, drive position and slat pattern are illustrative. Real frame, drive and supports are defined by Ultraplast engineering.</p>';
  return { render: render, profile: profile, LEGEND: LEGEND, LEGEND_CV: LEGEND_CV };
});
