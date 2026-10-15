/*
 * conveyor3d.js — INTERACTIVE 3-D CONVEYOR (no libraries, canvas 2-D with its own 3-D maths)
 * ---------------------------------------------------------------------------
 * buildScene(input)  -> solids + dimension annotations, in metres, Z up (pure geometry, testable in Node)
 * describe(input)    -> dimension schedule (segments, elevations, belt, product) for tables / reports
 * create(host, opts) -> drag-to-rotate / zoom / pan viewer with a running conveyor (browser)
 *
 * DRAWN TO SCALE FROM YOUR ENTRIES: floor, obstacles (footprint), route length, curve radius and
 * angle, incline rise and run, elevations, belt width, product length / width / height, product spacing.
 * INDICATIVE ONLY (not yet specified by Ultraplast engineering): side-frame section, guide rails,
 * support legs, rollers, motor, belt thickness.  They are drawn so the picture reads like a conveyor
 * and are always labelled "indicative".  Nothing here is a structural or mechanical design.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./simulation.js'));
  else root.UCP3D = factory(root.UCPSim);
})(typeof self !== 'undefined' ? self : this, function (SIM) {
  'use strict';
  var W = typeof window !== 'undefined' ? window : {};

  /* Indicative drawing constants (metres) - NOT specifications. */
  var IND = { beltThk: 0.012, frameDepth: 0.08, frameThk: 0.025, guideH: 0.06, guideThk: 0.012, legSec: 0.04, legSpacing: 1.5, rollerDia: 0.08, slat: 0.05, obstacleH: 1.0, defaultElevation: 0.9, defaultWidth: 0.3 };
  var COL = {
    belt: [52, 58, 68], frame: [176, 182, 190], guide: [214, 217, 222], leg: [150, 156, 164], roller: [120, 126, 132], motor: [196, 30, 45],
    floor: [236, 238, 241], obst: [196, 70, 70], prodA: [226, 164, 72], prodB: [212, 146, 56]
  };

  var num = function (v) { return typeof v === 'number' && isFinite(v); };
  var pos = function (v) { return num(v) && v > 0; };
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [1, 0, 0]; }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function frameFrom(p, t) { var l = norm([-t[1], t[0], 0]); return { p: p, t: t, l: l, u: norm(cross(t, l)) }; }
  function at3(fr, a, b, c) { return [fr.p[0] + fr.t[0] * a + fr.l[0] * b + fr.u[0] * c, fr.p[1] + fr.t[1] * a + fr.l[1] * b + fr.u[1] * c, fr.p[2] + fr.t[2] * a + fr.l[2] * b + fr.u[2] * c]; }
  function centroid(ps) { var c = [0, 0, 0]; ps.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }); return mul(c, 1 / ps.length); }
  function poly(ps, n, color, o) { o = o || {}; return { p: ps, n: n, c: color, a: o.a === undefined ? 1 : o.a, two: !!o.two, tag: o.tag || 'belt', layer: o.layer || 0, cen: centroid(ps), top: null }; }

  /** Oriented box: corners p + t*a + l*b + u*c for a in rt, b in rl, c in ru. Returns 6 outward-facing polys. */
  function obox(p, t, l, u, rt, rl, ru, color, o) {
    function C(a, b, c) { return [p[0] + t[0] * a + l[0] * b + u[0] * c, p[1] + t[1] * a + l[1] * b + u[1] * c, p[2] + t[2] * a + l[2] * b + u[2] * c]; }
    var out = [], skipBottom = o && o.skipBottom;
    out.push(poly([C(rt[1], rl[0], ru[0]), C(rt[1], rl[1], ru[0]), C(rt[1], rl[1], ru[1]), C(rt[1], rl[0], ru[1])], t, color, o));
    out.push(poly([C(rt[0], rl[1], ru[0]), C(rt[0], rl[0], ru[0]), C(rt[0], rl[0], ru[1]), C(rt[0], rl[1], ru[1])], mul(t, -1), color, o));
    out.push(poly([C(rt[0], rl[1], ru[0]), C(rt[0], rl[1], ru[1]), C(rt[1], rl[1], ru[1]), C(rt[1], rl[1], ru[0])], l, color, o));
    out.push(poly([C(rt[0], rl[0], ru[0]), C(rt[1], rl[0], ru[0]), C(rt[1], rl[0], ru[1]), C(rt[0], rl[0], ru[1])], mul(l, -1), color, o));
    out.push(poly([C(rt[0], rl[0], ru[1]), C(rt[1], rl[0], ru[1]), C(rt[1], rl[1], ru[1]), C(rt[0], rl[1], ru[1])], u, color, o));
    if (!skipBottom) out.push(poly([C(rt[0], rl[0], ru[0]), C(rt[0], rl[1], ru[0]), C(rt[1], rl[1], ru[0]), C(rt[1], rl[0], ru[0])], mul(u, -1), color, o));
    return out;
  }

  /** Sweep a 2-D section [[l,u],...] along a list of station frames. Returns {sides:[[polys per edge]...], caps:[]}. */
  function extrude(sts, sec, color, o) {
    var n = sec.length, cl = 0, cu = 0, sides = [], caps = [], k, e;
    sec.forEach(function (q) { cl += q[0] / n; cu += q[1] / n; });
    for (k = 0; k < sts.length - 1; k++) {
      var A = sts[k], B = sts[k + 1], mid = mul(add(at3(A, 0, cl, cu), at3(B, 0, cl, cu)), 0.5), row = [];
      for (e = 0; e < n; e++) {
        var e1 = (e + 1) % n, q = [at3(A, 0, sec[e][0], sec[e][1]), at3(A, 0, sec[e1][0], sec[e1][1]), at3(B, 0, sec[e1][0], sec[e1][1]), at3(B, 0, sec[e][0], sec[e][1])];
        var nn = norm(cross(sub(q[1], q[0]), sub(q[3], q[0]))), cen = centroid(q);
        if (dot(nn, sub(cen, mid)) < 0) nn = mul(nn, -1);
        row.push(poly(q, nn, color, o));
      }
      sides.push(row);
    }
    var f0 = sts[0], f1 = sts[sts.length - 1];
    caps.push(poly(sec.map(function (q) { return at3(f0, 0, q[0], q[1]); }), mul(f0.t, -1), color, o));
    caps.push(poly(sec.map(function (q) { return at3(f1, 0, q[0], q[1]); }), f1.t, color, o));
    return { sides: sides, caps: caps };
  }

  /** Cylinder with axis = fr.l, centre fr.p, radius R, spanning l in [l0,l1]. */
  function cylinder(fr, R, l0, l1, color, o) {
    var N = 14, out = [], i, ringA = [], ringB = [];
    for (i = 0; i < N; i++) {
      var ph = i / N * 2 * Math.PI, d = [fr.t[0] * Math.cos(ph) + fr.u[0] * Math.sin(ph), fr.t[1] * Math.cos(ph) + fr.u[1] * Math.sin(ph), fr.t[2] * Math.cos(ph) + fr.u[2] * Math.sin(ph)];
      ringA.push(add(add(fr.p, mul(d, R)), mul(fr.l, l0))); ringB.push(add(add(fr.p, mul(d, R)), mul(fr.l, l1)));
    }
    for (i = 0; i < N; i++) {
      var j = (i + 1) % N, pm = (i + 0.5) / N * 2 * Math.PI;
      var nn = [fr.t[0] * Math.cos(pm) + fr.u[0] * Math.sin(pm), fr.t[1] * Math.cos(pm) + fr.u[1] * Math.sin(pm), fr.t[2] * Math.cos(pm) + fr.u[2] * Math.sin(pm)];
      out.push(poly([ringA[i], ringA[j], ringB[j], ringB[i]], nn, color, o));
    }
    out.push(poly(ringA.slice().reverse(), mul(fr.l, -1), color, o)); out.push(poly(ringB, fr.l, color, o));
    return out;
  }

  /* --------------------------------------------------------- shared inputs */
  function baseElevation(inp) {
    var path = inp.path, pts = path && path.points, lastZ = pts && pts.length ? (pts[pts.length - 1].z || 0) : 0;
    if (num(inp.inletMm)) return { z: inp.inletMm / 1000, basis: 'entered' };
    if (num(inp.dischargeMm)) return { z: inp.dischargeMm / 1000 - lastZ, basis: 'from discharge height' };
    return { z: IND.defaultElevation, basis: 'illustrative' };
  }
  function beltWidthOf(inp) { return pos(inp.beltWidthM) ? inp.beltWidthM : IND.defaultWidth; }

  /** Dimension schedule - every number is taken from the calculated route / your entries. */
  function describe(inp) {
    var path = inp.path, base = baseElevation(inp), W_ = beltWidthOf(inp), fmt = inp.fmt || function (m) { return m.toFixed(2) + ' m'; };
    var out = { segments: [], elevations: null, belt: { widthM: W_, note: inp.widthNote ? inp.widthNote.replace(/^entered width$/, 'entered') : (pos(inp.beltWidthM) ? 'entered' : 'illustrative') }, product: null, overall: null, notes: [] };
    if (!path || !path.points || path.points.length < 2) return out;
    var pts = path.points, zs = pts.map(function (p) { return base.z + (p.z || 0); });
    (path.details || []).forEach(function (d, i) {
      var r = { no: i + 1, type: d.type, lengthM: d.length, horizontalM: d.horizontal, startZ: zs[d.p0], endZ: zs[d.p1] };
      if (d.type === 'curve') { r.radiusM = d.radius; r.angleDeg = d.angle; r.direction = d.direction; }
      if (d.type === 'incline') { r.riseM = d.rise; r.slopeDeg = d.angle; }
      out.segments.push(r);
    });
    var zmin = Math.min.apply(null, zs), zmax = Math.max.apply(null, zs), ph = inp.prod && pos(inp.prod.heightMm) ? inp.prod.heightMm / 1000 : null;
    out.elevations = { inletM: zs[0], dischargeM: zs[zs.length - 1], minM: zmin, maxM: zmax, basis: base.basis, topOfProductM: ph !== null ? zmax + ph : null };
    if (base.basis === 'illustrative') out.notes.push('Inlet height was not entered, so the conveyor is drawn at an illustrative ' + Math.round(IND.defaultElevation * 1000) + ' mm.');
    if (zmin < -1e-6) out.notes.push('Part of the route is below floor level (lowest ' + Math.round(zmin * 1000) + ' mm). Check inlet height and the incline / decline segments.');
    if (num(inp.workingH) && out.elevations.topOfProductM !== null && out.elevations.topOfProductM > inp.workingH + 1e-6) out.notes.push('Highest product surface exceeds the working height you entered.');
    var bb = path.bbox;
    out.overall = { pathM: path.total, planLengthM: bb.maxX - bb.minX + W_, planWidthM: bb.maxY - bb.minY + W_, complete: !!path.complete };
    if (inp.prod && pos(inp.prod.alongMm) && pos(inp.prod.acrossMm)) out.product = { alongMm: inp.prod.alongMm, acrossMm: inp.prod.acrossMm, heightMm: pos(inp.prod.heightMm) ? inp.prod.heightMm : null, pitchMm: inp.prod.pitchMm || null, lanes: inp.prod.lanes || 1 };
    return out;
  }

  /* ------------------------------------------------------------ the scene */
  function buildScene(inp) {
    var fmt = inp.fmt || function (m) { return m.toFixed(2) + ' m'; }, fmtMm = inp.fmtMm || function (mm) { return Math.round(mm) + ' mm'; };
    var detail = inp.detail !== false;
    var sc = { polys: [], dims: [], tags: [], arrows: [], notes: [], grid: null, floor: null, ceiling: null, stations: [], track: null, belt: null, conv: null, all: null, slat: IND.slat, empty: true };
    var FL = pos(inp.floorL) ? inp.floorL : null, FW = pos(inp.floorW) ? inp.floorW : null, hasFloor = FL !== null && FW !== null;
    var path = inp.path, hasPath = !!(path && path.points && path.points.length > 1);
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], clo = [1e9, 1e9, 1e9], chi = [-1e9, -1e9, -1e9];
    function grow(a, b, p) { for (var i = 0; i < 3; i++) { a[i] = Math.min(a[i], p[i]); b[i] = Math.max(b[i], p[i]); } }
    function dim(a, b, text, kind, o) { sc.dims.push({ a: a, b: b, text: text, kind: kind || 'calc', dashed: !!(o && o.dashed), off: (o && o.off) || [0, -9] }); }
    function tag(p, text, kind, short) { sc.tags.push({ p: p, text: text, kind: kind || 'calc', short: short || null }); }

    /* floor, grid, obstacles, ceiling */
    if (hasFloor) {
      sc.floor = { x0: 0, y0: 0, x1: FL, y1: FW };
      obox([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, FL], [0, FW], [-0.04, 0], COL.floor, { tag: 'floor', layer: 0, skipBottom: false }).forEach(function (q) { sc.polys.push(q); });
      grow(lo, hi, [0, 0, -0.04]); grow(lo, hi, [FL, FW, 0]);
      var off = Math.max(0.35, Math.max(FL, FW) * 0.04);
      dim([0, -off, 0], [FL, -off, 0], 'Floor length ' + fmt(FL), 'entered', { off: [0, 12] });
      dim([FL + off, 0, 0], [FL + off, FW, 0], 'Floor width ' + fmt(FW), 'entered', { off: [0, 12] });
      grow(lo, hi, [-off, -off, 0]); grow(lo, hi, [FL + off, FW + off, 0]);
      if (pos(inp.workingH)) {
        var wh = inp.workingH;
        sc.ceiling = { z: wh, x1: FL, y1: FW };
        dim([0, 0, 0], [0, 0, wh], 'Working height ' + fmtMm(wh * 1000), 'entered', { off: [-4, 0] });
        grow(lo, hi, [0, 0, wh]);
      }
    }
    (inp.obstacles || []).forEach(function (b, i) {
      if (!pos(b.w) || !pos(b.d) || !num(b.x) || !num(b.y)) return;
      var h = IND.obstacleH;
      obox([b.x, b.y, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, b.w], [0, b.d], [0, h], COL.obst, { tag: 'obst', a: 0.4 }).forEach(function (q) { sc.polys.push(q); });
      tag([b.x + b.w / 2, b.y + b.d / 2, h], (b.name || 'Obstacle ' + (i + 1)) + ' ' + fmt(b.w) + ' × ' + fmt(b.d), 'obst');
      grow(lo, hi, [b.x, b.y, 0]); grow(lo, hi, [b.x + b.w, b.y + b.d, h]);
    });
    if (!sc.obstacleNote && (inp.obstacles || []).some(function (b) { return pos(b.w) && pos(b.d); })) sc.notes.push('Obstacle height was not entered; blocks are drawn at an illustrative ' + fmtMm(IND.obstacleH * 1000) + ' (footprint is to scale).');

    if (!hasPath) {
      sc.all = hasFloor ? { min: lo, max: hi } : { min: [0, 0, 0], max: [4, 3, 2] }; sc.conv = sc.all;
      if (hasFloor) sc.grid = gridFor(0, 0, FL, FW); else sc.grid = gridFor(0, 0, 4, 3);
      return sc;
    }
    sc.empty = false;

    /* conveyor geometry */
    var base = baseElevation(inp), W_ = beltWidthOf(inp), hw = W_ / 2;
    var pts3 = path.points.map(function (p) { return [p.x, p.y, base.z + (p.z || 0)]; });
    var track = SIM.buildTrack(pts3.map(function (p) { return { x: p[0], y: p[1], z: p[2] }; }));
    sc.track = track;
    var total = track.length, details = path.details || [], R = pos(inp.pulleyDiaMm) ? inp.pulleyDiaMm / 2000 : IND.rollerDia / 2;
    var fd = Math.max(IND.frameDepth, 2 * R + IND.beltThk + 0.02), thk = IND.frameThk, bt = IND.beltThk;
    var wEntered = inp.widthNote ? inp.widthNote === 'entered width' : pos(inp.beltWidthM);
    if (!wEntered) sc.notes.push('Belt width was not entered; ' + fmtMm(W_ * 1000) + ' is drawn (' + (inp.widthNote || 'illustrative') + ').');
    if (base.basis === 'illustrative') sc.notes.push('Inlet height was not entered; the conveyor is drawn at an illustrative ' + fmtMm(IND.defaultElevation * 1000) + ' above the floor.');
    if (path.complete === false) sc.notes.push('The route is incomplete; only the completed segments are drawn.');

    /* stations (decimated, always keeping segment ends) */
    var keep = {}; keep[0] = 1; keep[pts3.length - 1] = 1; details.forEach(function (d) { keep[d.p0] = 1; keep[d.p1] = 1; });
    var ds = Math.max(0.1, total / 300), idx = [0], lastS = 0, i;
    for (i = 1; i < pts3.length; i++) if (keep[i] || track.cum[i] - lastS >= ds) { idx.push(i); lastS = track.cum[i]; }
    var sts = idx.map(function (pi, k) {
      var prev = k > 0 ? pts3[idx[k - 1]] : null, nxt = k < idx.length - 1 ? pts3[idx[k + 1]] : null, here = pts3[pi], t;
      var dIn = prev ? norm(sub(here, prev)) : null, dOut = nxt ? norm(sub(nxt, here)) : null;
      t = dIn && dOut ? norm(add(dIn, dOut)) : (dIn || dOut);
      var fr = frameFrom(here, t); fr.s = track.cum[pi]; return fr;
    });
    sc.stations = sts;

    // belt slab (top strips carry the moving slat lines and direction arrows)
    var belt = extrude(sts, [[-hw, -bt], [hw, -bt], [hw, 0], [-hw, 0]], COL.belt, { tag: 'belt' });
    belt.sides.forEach(function (row, k) {
      row.forEach(function (q, e) { sc.polys.push(q); });
      var A = sts[k], B = sts[k + 1], q = row[2];
      q.top = { s0: A.s, s1: B.s, aL: at3(A, 0, hw, 0), aR: at3(A, 0, -hw, 0), bL: at3(B, 0, hw, 0), bR: at3(B, 0, -hw, 0) };
      q.p = [q.top.aL, q.top.aR, q.top.bR, q.top.bL]; q.cen = centroid(q.p);
    });
    belt.caps.forEach(function (q) { sc.polys.push(q); });
    sc.slat = pos(inp.pitchMm) ? inp.pitchMm / 1000 : IND.slat;
    if (total / sc.slat > 500) sc.slat = total / 500;
    var nArrows = Math.max(1, Math.min(8, Math.round(total / 1.5)));
    for (i = 0; i < nArrows; i++) sc.arrows.push({ s: total * (i + 0.5) / nArrows, size: Math.max(0.03, Math.min(0.15, W_ * 0.22)) });

    // side frame + guide rails (indicative)
    var prodH = inp.prod && pos(inp.prod.heightMm) ? inp.prod.heightMm / 1000 : null, gH = prodH !== null ? Math.min(IND.guideH, prodH * 0.5) : IND.guideH;
    [1, -1].forEach(function (sg) {
      var sec = sg > 0 ? [[hw, -fd], [hw + thk, -fd], [hw + thk, 0.015], [hw, 0.015]] : [[-hw - thk, -fd], [-hw, -fd], [-hw, 0.015], [-hw - thk, 0.015]];
      var pl = extrude(sts, sec, COL.frame, { tag: 'frame' }); pl.sides.forEach(function (r) { r.forEach(function (q) { sc.polys.push(q); }); }); pl.caps.forEach(function (q) { sc.polys.push(q); });
      var g0 = sg > 0 ? hw : -hw - IND.guideThk, gsec = [[g0, 0.015], [g0 + IND.guideThk, 0.015], [g0 + IND.guideThk, 0.015 + gH], [g0, 0.015 + gH]];
      var gr = extrude(sts, gsec, COL.guide, { tag: 'frame' }); gr.sides.forEach(function (r) { r.forEach(function (q) { sc.polys.push(q); }); }); gr.caps.forEach(function (q) { sc.polys.push(q); });
    });

    // end rollers (idler at the inlet, drive at the discharge) + motor (indicative)
    var fS = sts[0], fE = sts[sts.length - 1];
    [fS, fE].forEach(function (fr) {
      var c = frameFrom(add(fr.p, mul(fr.u, -(bt + R))), fr.t); c.l = fr.l; c.u = fr.u;
      cylinder(c, R, -hw - 0.01, hw + 0.01, COL.roller, { tag: 'drive' }).forEach(function (q) { sc.polys.push(q); });
    });
    obox(fE.p, fE.t, fE.l, fE.u, [-0.30, -0.04], [hw + thk + 0.02, hw + thk + 0.18], [-0.20, -0.04], COL.motor, { tag: 'drive' }).forEach(function (q) { sc.polys.push(q); });

    // support legs (indicative spacing unless configured)
    var spacing = pos(inp.legSpacingMm) ? inp.legSpacingMm / 1000 : IND.legSpacing, legPos = [];
    if (total < 0.6) legPos = [total / 2]; else { var nSeg = Math.max(1, Math.ceil((total - 0.5) / spacing)); for (i = 0; i <= nSeg; i++) legPos.push(0.25 + (total - 0.5) * i / nSeg); }
    sc.legCount = 0;
    legPos.forEach(function (s) {
      var pt = track.at(s), tH = norm([pt.tx, pt.ty, 0]), lH = norm([-tH[1], tH[0], 0]), uu = [0, 0, 1], slopeCos = Math.sqrt(Math.max(0, 1 - pt.tz * pt.tz));
      var zb = pt.z - fd * slopeCos; if (zb < 0.06) return;
      var P0 = [pt.x, pt.y, 0], off = hw + thk / 2, sec = IND.legSec / 2;
      sc.legCount++;
      [1, -1].forEach(function (sg) {
        var pp = add(P0, mul(lH, off * sg));
        obox(pp, tH, lH, uu, [-sec, sec], [-sec, sec], [0, zb], COL.leg, { tag: 'support', skipBottom: true }).forEach(function (q) { sc.polys.push(q); });
        obox(pp, tH, lH, uu, [-0.07, 0.07], [-0.07, 0.07], [0, 0.01], COL.leg, { tag: 'support', skipBottom: true }).forEach(function (q) { sc.polys.push(q); });
      });
      obox(P0, tH, lH, uu, [-0.015, 0.015], [-off, off], [zb - 0.05, zb - 0.02], COL.leg, { tag: 'support' }).forEach(function (q) { sc.polys.push(q); });
    });

    /* bounds */
    sts.forEach(function (st) {
      [-1, 1].forEach(function (sg) { var q = at3(st, 0, sg * (hw + thk + 0.2), 0); grow(clo, chi, q); grow(lo, hi, q); });
      grow(clo, chi, [st.p[0], st.p[1], 0]); grow(clo, chi, [st.p[0], st.p[1], st.p[2] + (prodH || 0.1) + 0.2]);
      grow(lo, hi, [st.p[0], st.p[1], 0]); grow(lo, hi, [st.p[0], st.p[1], st.p[2] + (prodH || 0.1) + 0.2]);
    });

    /* floor grid fallback + shadows are drawn by the viewer */
    if (hasFloor) sc.grid = gridFor(0, 0, FL, FW);
    else { sc.grid = gridFor(Math.floor(clo[0] - 1), Math.floor(clo[1] - 1), Math.ceil(chi[0] + 1), Math.ceil(chi[1] + 1)); grow(lo, hi, [sc.grid.x0, sc.grid.y0, 0]); grow(lo, hi, [sc.grid.x1, sc.grid.y1, 0]); }

    /* ----- annotations ----- */
    var upv = [0, 0, 1];
    dim(add(at3(fS, -0.3, hw, 0), [0, 0, 0.002]), add(at3(fS, -0.3, -hw, 0), [0, 0, 0.002]), 'Belt width ' + fmtMm(W_ * 1000) + (wEntered ? '' : ' (not entered)'), wEntered ? 'entered' : 'ind', { off: [0, -10] });
    tag(add(at3(fS, -0.45, 0, 0.12), [0, 0, 0]), 'IN', 'io'); tag(add(at3(fE, 0.45, 0, 0.12), [0, 0, 0]), 'OUT', 'io');
    if (detail) {
      tag(add(at3(fE, 0, hw + thk + 0.1, -0.12), [0, 0, 0]), 'Drive end + motor (indicative)', 'ind');
      tag(add(at3(fS, 0, -hw - thk - 0.05, -0.12), [0, 0, 0]), 'Idler end (indicative)', 'ind');
      var zS = fS.p[2], zE = fE.p[2], offW = hw + thk + 0.35, lS = fS.l, lE = fE.l;
      if (zS > 0.15) dim([fS.p[0] + lS[0] * offW, fS.p[1] + lS[1] * offW, 0], [fS.p[0] + lS[0] * offW, fS.p[1] + lS[1] * offW, zS], 'Inlet ' + fmtMm(zS * 1000) + (base.basis === 'illustrative' ? ' (illustrative)' : ''), base.basis === 'illustrative' ? 'ind' : 'entered', { off: [-4, 0] });
      if (zE > 0.15 && Math.abs(zE - zS) > 0.02) dim([fE.p[0] + lE[0] * offW, fE.p[1] + lE[1] * offW, 0], [fE.p[0] + lE[0] * offW, fE.p[1] + lE[1] * offW, zE], 'Discharge ' + fmtMm(zE * 1000), 'calc', { off: [-4, 0] });
    }
    details.forEach(function (d, k) {
      var n = k + 1, m = Math.round((d.p0 + d.p1) / 2), pm = pts3[m], txt = 'S' + n;
      if (detail && details.length <= 10) {
        if (d.type === 'straight') txt += ' Straight ' + fmt(d.length);
        else if (d.type === 'curve') txt += ' Curve ' + (d.direction === 'right' ? 'right' : 'left') + ' R ' + fmtMm(d.radius * 1000) + ' × ' + Math.round(d.angle * 10) / 10 + '° (arc ' + fmt(d.length) + ')';
        else txt += ' Incline ' + fmt(d.length) + ' · rise ' + fmtMm(Math.abs(d.rise) * 1000) + ' · ' + Math.round(Math.abs(d.angle) * 10) / 10 + '°';
      }
      tag([pm[0], pm[1], pm[2] + 0.3 + (prodH || 0)], txt, 'seg', 'S' + n);
      if (!detail) return;
      var a = pts3[d.p0], b = pts3[d.p1];
      if (d.type === 'curve' && pos(d.radius)) {
        var tt = norm(sub(pts3[Math.min(d.p0 + 1, pts3.length - 1)], a)); tt[2] = 0; tt = norm(tt);
        var sg = d.direction === 'right' ? -1 : 1, cen = [a[0] + sg * d.radius * (-tt[1]), a[1] + sg * d.radius * tt[0], a[2]];
        dim(cen, [pm[0], pm[1], a[2]], 'R ' + fmtMm(d.radius * 1000), 'calc', { dashed: true, off: [0, -8] });
      }
      if (d.type === 'incline') {
        var th = norm([b[0] - a[0], b[1] - a[1], 0]), lh = [-th[1], th[0], 0], o2 = hw + thk + 0.3, zLo = Math.min(a[2], b[2]);
        var pa = [a[0] + lh[0] * o2, a[1] + lh[1] * o2, zLo], pb = [b[0] + lh[0] * o2, b[1] + lh[1] * o2, zLo], pc = [pb[0], pb[1], Math.max(a[2], b[2])];
        dim(pa, pb, 'Run ' + fmt(d.horizontal), 'calc', { dashed: true, off: [0, 12] });
        dim(pb, pc, 'Rise ' + fmtMm(Math.abs(d.rise) * 1000), 'calc', { off: [6, 0] });
      }
    });
    if (!(sc.floor)) { sc.floorUnknown = true; }
    sc.all = { min: lo, max: hi }; sc.conv = { min: clo, max: chi };
    var d0 = pts3[0], d1 = pts3[pts3.length - 1], hd = Math.atan2(d1[1] - d0[1], d1[0] - d0[0]); if (Math.abs(d1[0] - d0[0]) + Math.abs(d1[1] - d0[1]) < 1e-6) hd = Math.atan2(sts[0].t[1], sts[0].t[0]);
    sc.axisTheta = Math.round(hd / (Math.PI / 2)) * 90;
    sc.geom = { widthM: W_, baseZ: base.z, baseBasis: base.basis, totalM: total, frameDepth: fd, prodH: prodH, upv: upv };
    return sc;
  }

  function gridFor(x0, y0, x1, y1) {
    var span = Math.max(x1 - x0, y1 - y0), steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100], step = steps[steps.length - 1], i;
    for (i = 0; i < steps.length; i++) if (span / steps[i] <= 30) { step = steps[i]; break; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, step: step };
  }

  /* ============================================================= viewer */
  var FOV = 32 * Math.PI / 180, NEAR = 0.05, LIGHT = norm([-0.45, -0.35, 0.82]);

  function create(host, opts) {
    var doc = host.ownerDocument, compact = !!opts.compact;
    var sc = buildScene(opts.scene), desc = describe(opts.scene);
    var vS = opts.speedMPerMin > 0 ? opts.speedMPerMin / 60 : 0, pitch = opts.pitchMm > 0 ? opts.pitchMm / 1000 : 0, lanes = Math.max(1, opts.lanes || 1);
    var prod = opts.scene.prod, along = prod && pos(prod.alongMm) ? prod.alongMm / 1000 : 0, across = prod && pos(prod.acrossMm) ? prod.acrossMm / 1000 : 0, ph = prod && pos(prod.heightMm) ? prod.heightMm / 1000 : 0;
    var canRun = !sc.empty && vS > 0 && pitch > 0 && along > 0 && across > 0 && ph > 0 && sc.track && sc.track.length > 0;
    var fmt = opts.scene.fmt || function (m) { return m.toFixed(2) + ' m'; };
    var show = { dims: !compact, prods: true, frame: true, floor: true };
    var cam = { yaw: -0.9, pitch: 0.5, dist: 10, target: [0, 0, 0], ortho: false }, fitMode = 'conveyor';
    if (sc.empty) fitMode = 'floor';
    if (opts.view) { if (typeof opts.view.yaw === 'number') cam.yaw = opts.view.yaw; if (typeof opts.view.pitch === 'number') cam.pitch = opts.view.pitch; cam.ortho = !!opts.view.ortho; }
    var time = opts.startTime || 0, playing = false, last = null, raf = null, scale = 1, auto = false, destroyed = false, reduce = false;
    try { reduce = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
    var transit = canRun ? sc.track.length / vS : 0, scales = [1, 2, 5, 10, 20, 50];
    if (canRun) scale = scales.reduce(function (b, c) { return Math.abs(c - transit / 18) < Math.abs(b - transit / 18) ? c : b; }, 1);

    /* ---- DOM ---- */
    var root = doc.createElement('div'); root.className = 'v3d' + (compact ? ' compact' : '');
    var views = [['iso', 'Isometric'], ['top', 'Top'], ['front', 'Front'], ['back', 'Back'], ['inlet', 'Inlet end'], ['outlet', 'Outlet end']];
    if (compact) views = views.slice(0, 3);
    root.innerHTML = '<div class="v3d-bar" role="toolbar" aria-label="3D view controls">' + views.map(function (v) { return '<button type="button" class="btn sm" data-v="' + v[0] + '">' + v[1] + '</button>'; }).join('') +
      '<button type="button" class="btn sm" data-a="fit">Fit conveyor</button>' + (compact ? '' : '<button type="button" class="btn sm" data-a="floor">Whole floor</button>' +
      '<button type="button" class="btn sm" data-a="ortho" aria-pressed="false">Orthographic</button><button type="button" class="btn sm" data-a="auto" aria-pressed="false">Auto-rotate</button>') +
      (compact ? '' : '<button type="button" class="btn sm" data-a="full">Full screen</button><button type="button" class="btn sm" data-a="png">Save image</button>') + '</div>' +
      '<div class="v3d-stage"><canvas tabindex="0" role="img" aria-label="Interactive 3D model of the conveyor. Drag to rotate, scroll to zoom, shift-drag to pan."></canvas>' +
      '<div class="v3d-hint">Drag to rotate · Shift+drag or right-drag to pan · Scroll or pinch to zoom · Double-click to refit</div></div>' +
      '<div class="v3d-bar v3d-opts">' + (canRun ? '<button type="button" class="btn sm primary" data-a="play">Play</button><button type="button" class="btn sm" data-a="restart">Restart</button><label class="sim-speed">Speed <select data-a="scale">' + scales.map(function (x) { return '<option value="' + x + '"' + (x === scale ? ' selected' : '') + '>' + x + '×</option>'; }).join('') + '</select></label>' : '') +
      '<label class="chk"><input type="checkbox" data-t="dims"' + (show.dims ? ' checked' : '') + '> Dimensions</label><label class="chk"><input type="checkbox" data-t="prods" checked> Products</label>' +
      '<label class="chk"><input type="checkbox" data-t="frame" checked> Frame, supports, drive (indicative)</label><label class="chk"><input type="checkbox" data-t="floor" checked> Floor and obstacles</label></div>' +
      (compact ? '' : '<dl class="sim-stats">' + (canRun ? '<div><dt>Belt speed</dt><dd>' + (vS * 60).toFixed(2) + ' m/min</dd></div><div><dt>Product spacing</dt><dd>' + pitch * 1000 + ' mm</dd></div><div><dt>Simulated time</dt><dd data-o="time">0 s</dd></div><div><dt>On conveyor</dt><dd data-o="on">0</dd></div><div><dt>Delivered</dt><dd data-o="del">0</dd></div><div><dt>Measured output</dt><dd data-o="out">-</dd></div>' : '') + '</dl>');
    var noteTxt = sc.notes.concat(desc.notes.filter(function (n) { return sc.notes.indexOf(n) < 0 && !/Inlet height was not entered/.test(n); }));
    if (canRun) noteTxt.push('Products are drawn at their entered length, width and height.');
    if (!compact) noteTxt.push('Drawn to scale from your entries: floor, route, curve radii, inclines, elevations, belt width, product size. Frame, guides, supports, rollers and motor are indicative only; no structural or drive design is implied.');
    var noteEl = doc.createElement('p'); noteEl.className = 'note'; noteEl.setAttribute('data-o', 'note'); noteEl.textContent = noteTxt.join(' ');
    host.innerHTML = ''; host.appendChild(root); if (!compact || noteTxt.length) root.appendChild(noteEl);
    var canvas = root.querySelector('canvas'), stage = root.querySelector('.v3d-stage'), ctx = canvas.getContext('2d'), cw = 600, chh = 400, dpr = 1;
    var o = function (k) { return root.querySelector('[data-o="' + k + '"]') || { textContent: '' }; };

    /* ---- camera ---- */
    function bounds(mode) { return mode === 'floor' ? sc.all : sc.conv; }
    function fit(mode) {
      fitMode = mode || fitMode; var b = bounds(fitMode) || sc.all, c = mul(add(b.min, b.max), 0.5), r = Math.max(0.3, len(sub(b.max, b.min)) / 2 + 0.3);
      var aspect = cw / chh, fv = FOV, fh = 2 * Math.atan(Math.tan(FOV / 2) * aspect), f = Math.min(fv, fh);
      cam.target = c; cam.dist = r / Math.sin(f / 2) * 1.05; need();
    }
    function setView(name) {
      var th = (sc.axisTheta || 0) * Math.PI / 180, p = { iso: [th - 0.85, 0.5, false], top: [-Math.PI / 2, 1.5607, true], front: [th - Math.PI / 2, 0, true], back: [th + Math.PI / 2, 0, true], inlet: [th + Math.PI, 0, true], outlet: [th, 0, true] }[name]; if (!p) return;
      cam.yaw = p[0]; cam.pitch = p[1]; cam.ortho = p[2]; syncBtns(); fit();
    }
    function syncBtns() { var b = root.querySelector('[data-a="ortho"]'); if (b) b.setAttribute('aria-pressed', cam.ortho ? 'true' : 'false'); var a = root.querySelector('[data-a="auto"]'); if (a) a.setAttribute('aria-pressed', auto ? 'true' : 'false'); }
    var cp, camPos, fv3, rv, uv, F, Sx;
    function setupCam() {
      cp = [Math.cos(cam.pitch) * Math.cos(cam.yaw), Math.cos(cam.pitch) * Math.sin(cam.yaw), Math.sin(cam.pitch)];
      camPos = add(cam.target, mul(cp, cam.dist)); fv3 = mul(cp, -1); rv = norm(cross(fv3, [0, 0, 1])); uv = cross(rv, fv3);
      F = (chh / 2) / Math.tan(FOV / 2); Sx = F / cam.dist;
    }
    function toCam(p) { var v = sub(p, camPos); return [dot(v, rv), dot(v, uv), dot(v, fv3)]; }
    function scr(c) { return cam.ortho ? [cw / 2 + c[0] * Sx, chh / 2 - c[1] * Sx] : [cw / 2 + c[0] / c[2] * F, chh / 2 - c[1] / c[2] * F]; }
    function clipPoly(cs) {
      if (cam.ortho) return cs; var out = [], i, n = cs.length;
      for (i = 0; i < n; i++) {
        var a = cs[i], b = cs[(i + 1) % n], ain = a[2] >= NEAR, bin = b[2] >= NEAR;
        if (ain) out.push(a);
        if (ain !== bin) { var t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
      }
      return out;
    }
    function visible(q) { if (q.two) return true; return cam.ortho ? dot(q.n, fv3) < 0 : dot(q.n, sub(camPos, q.cen)) > 0; }
    function shade(q, c) {
      var d = dot(q.n, LIGHT); if (q.two) d = Math.abs(d); else d = Math.max(0, d);
      var k = 0.52 + 0.48 * d, hl = dot(q.n, mul(fv3, -1)); k = Math.min(1.08, k + 0.1 * Math.max(0, hl));
      return 'rgb(' + Math.min(255, Math.round(c[0] * k)) + ',' + Math.min(255, Math.round(c[1] * k)) + ',' + Math.min(255, Math.round(c[2] * k)) + ')';
    }

    /* ---- products ---- */
    var maxProd = 320;
    function productPolys() {
      if (!canRun || !show.prods) return [];
      var out = [], tr = sc.track, L = tr.length, posn = SIM.positions(time, vS, pitch, L), step = Math.max(1, Math.ceil(posn.length * lanes / maxProd)), i, l, shown = 0;
      sc.hidden = 0;
      for (i = 0; i < posn.length; i += step) {
        var pt = tr.at(posn[i]), fr = frameFrom([pt.x, pt.y, pt.z], norm([pt.tx, pt.ty, pt.tz])), col = ((Math.round((time * vS - posn[i]) / pitch)) % 2) ? COL.prodA : COL.prodB;
        for (l = 0; l < lanes; l++) {
          var lo_ = lanes === 1 ? 0 : -sc.geom.widthM / 2 + (l + 0.5) * sc.geom.widthM / lanes;
          obox(add(fr.p, mul(fr.l, lo_)), fr.t, fr.l, fr.u, [-along / 2, along / 2], [-across / 2, across / 2], [0, ph], col, { tag: 'prod', skipBottom: true }).forEach(function (q) { out.push(q); });
          shown++;
        }
      }
      sc.shown = shown; return out;
    }

    /* ---- drawing ---- */
    function draw() {
      if (destroyed) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, chh);
      var g = ctx.createLinearGradient(0, 0, 0, chh); g.addColorStop(0, '#f7f8fa'); g.addColorStop(1, '#e4e7ec'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, chh);
      setupCam();
      var below = camPos[2] < 0, items = [], hid = { floor: !show.floor, obst: !show.floor, frame: !show.frame, support: !show.frame, drive: !show.frame };
      var all = sc.polys.concat(productPolys()), k;
      for (k = 0; k < all.length; k++) {
        var q = all[k]; if (hid[q.tag]) continue;
        var layer = q.tag === 'floor' ? (below ? 2 : 0) : 1;
        if (q.tag === 'floor' && !below && !visible(q)) continue;
        if (q.tag !== 'floor' && !visible(q)) continue;
        var cs = q.p.map(toCam); if (!cam.ortho) { var anyBehind = cs.some(function (c) { return c[2] < NEAR; }); if (anyBehind) { cs = clipPoly(cs); if (cs.length < 3) continue; } }
        items.push({ q: q, cs: cs, d: toCam(q.cen)[2], layer: layer });
      }
      items.sort(function (a, b) { return a.layer - b.layer || b.d - a.d; });
      var gridDrawn = false;
      function drawGrid() {
        if (gridDrawn || !show.floor || !sc.grid) return; gridDrawn = true;
        var gr = sc.grid, x, y, a, b, s0, s1;
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,130,145,.35)'; ctx.beginPath();
        for (x = Math.ceil(gr.x0 / gr.step - 1e-9) * gr.step; x <= gr.x1 + 1e-9; x += gr.step) { a = toCam([x, gr.y0, 0]); b = toCam([x, gr.y1, 0]); seg(a, b); }
        for (y = Math.ceil(gr.y0 / gr.step - 1e-9) * gr.step; y <= gr.y1 + 1e-9; y += gr.step) { a = toCam([gr.x0, y, 0]); b = toCam([gr.x1, y, 0]); seg(a, b); }
        ctx.stroke();
        if (sc.ceiling) {
          ctx.strokeStyle = 'rgba(30,30,30,.45)'; ctx.setLineDash([6, 4]); ctx.beginPath(); var z = sc.ceiling.z, cr = [[0, 0, z], [sc.ceiling.x1, 0, z], [sc.ceiling.x1, sc.ceiling.y1, z], [0, sc.ceiling.y1, z]];
          for (x = 0; x < 4; x++) seg(toCam(cr[x]), toCam(cr[(x + 1) % 4])); ctx.stroke(); ctx.setLineDash([]);
        }
        // conveyor footprint shadow on the floor
        if (sc.stations.length > 1 && !sc.empty) {
          ctx.fillStyle = 'rgba(20,24,32,.13)';
          for (var m = 0; m < sc.stations.length - 1; m++) {
            var A = sc.stations[m], B = sc.stations[m + 1], hw = sc.geom.widthM / 2 + IND.frameThk, w = [[A.p[0] + A.l[0] * hw, A.p[1] + A.l[1] * hw, 0], [A.p[0] - A.l[0] * hw, A.p[1] - A.l[1] * hw, 0], [B.p[0] - B.l[0] * hw, B.p[1] - B.l[1] * hw, 0], [B.p[0] + B.l[0] * hw, B.p[1] + B.l[1] * hw, 0]];
            var cs = clipPoly(w.map(toCam)); if (cs.length < 3) continue; pathOf(cs); ctx.fill();
          }
        }
      }
      function seg(a, b) {
        if (!cam.ortho) { if (a[2] < NEAR && b[2] < NEAR) return; if (a[2] < NEAR) { var t = (NEAR - a[2]) / (b[2] - a[2]); a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]; } else if (b[2] < NEAR) { var t2 = (NEAR - b[2]) / (a[2] - b[2]); b = [b[0] + (a[0] - b[0]) * t2, b[1] + (a[1] - b[1]) * t2, NEAR]; } }
        var p = scr(a), r = scr(b); ctx.moveTo(p[0], p[1]); ctx.lineTo(r[0], r[1]);
      }
      function pathOf(cs) { ctx.beginPath(); for (var i = 0; i < cs.length; i++) { var p = scr(cs[i]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.closePath(); }

      var slat = sc.slat, phase = canRun ? (vS * time) % slat : 0, i;
      for (i = 0; i < items.length; i++) {
        var it = items[i], q = it.q;
        if (it.layer === 1) drawGrid();
        pathOf(it.cs);
        var rgb = shade(q, q.c);
        if (q.tag === 'floor' && below) { ctx.globalAlpha = 0.3; ctx.fillStyle = rgb; ctx.fill(); ctx.globalAlpha = 1; }
        else if (q.a < 1) { ctx.globalAlpha = q.a; ctx.fillStyle = rgb; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(90,30,30,.7)'; ctx.lineWidth = 1; ctx.stroke(); }
        else { ctx.fillStyle = rgb; ctx.fill(); ctx.strokeStyle = q.tag === 'floor' ? 'rgba(60,70,85,.5)' : 'rgba(15,20,30,.38)'; ctx.lineWidth = q.tag === 'prod' ? 0.8 : 0.5; ctx.stroke(); }
        if (q.top) detailsOnStrip(q.top, slat, phase);
        if (it.layer === 2 && q.tag === 'floor') { /* underside floor drawn last */ }
      }
      drawGrid();
      if (show.dims) overlay();
      hud();
    }
    function detailsOnStrip(t, slat, phase) {
      var span = t.s1 - t.s0; if (span <= 0) return;
      var j0 = Math.ceil((t.s0 - phase) / slat - 1e-9), j1 = Math.floor((t.s1 - phase) / slat - 1e-9), j;
      if (j1 - j0 < 60) {
        ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1; ctx.beginPath();
        for (j = j0; j <= j1; j++) { var f = (j * slat + phase - t.s0) / span, a = lerp(t.aL, t.bL, f), b = lerp(t.aR, t.bR, f), ca = toCam(a), cb = toCam(b); if (ca[2] < NEAR && !cam.ortho) continue; if (cb[2] < NEAR && !cam.ortho) continue; var pa = scr(ca), pb = scr(cb); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); }
        ctx.stroke();
      }
      sc.arrows.forEach(function (ar) {
        if (ar.s < t.s0 || ar.s >= t.s1) return;
        var f = (ar.s - t.s0) / span, cA = mul(add(t.aL, t.aR), 0.5), cB = mul(add(t.bL, t.bR), 0.5), c = lerp(cA, cB, f), dir = norm(sub(cB, cA)), lat = norm(sub(t.aL, t.aR)), z = [0, 0, 0.0015], sz = ar.size;
        var tri = [add(add(c, mul(dir, sz)), z), add(add(add(c, mul(dir, -sz * 0.6)), mul(lat, sz * 0.7)), z), add(add(add(c, mul(dir, -sz * 0.6)), mul(lat, -sz * 0.7)), z)].map(toCam);
        if (!cam.ortho && tri.some(function (p) { return p[2] < NEAR; })) return;
        ctx.beginPath(); tri.forEach(function (p, n) { var s = scr(p); if (n) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath(); ctx.fillStyle = 'rgba(214,40,57,.95)'; ctx.fill();
      });
    }
    var placed = [];
    function label(x, y, text, kind) {
      ctx.font = (kind === 'seg' ? '600 ' : '500 ') + '11.5px system-ui,-apple-system,Segoe UI,Roboto,sans-serif'; var w = ctx.measureText(text).width + 10, h = 17, tries = [0, -18, 18, -36, 36, -54, 54], i, j, bx, by, free;
      x = Math.max(w / 2 + 2, Math.min(cw - w / 2 - 2, x));
      for (i = 0; i < tries.length; i++) {
        by = Math.max(h, Math.min(chh - 4, y + tries[i])); bx = x; free = true;
        for (j = 0; j < placed.length; j++) { var r = placed[j]; if (bx - w / 2 < r[2] && bx + w / 2 > r[0] && by - h + 4 < r[3] && by + 4 > r[1]) { free = false; break; } }
        if (free) break;
      }
      y = by; placed.push([x - w / 2, y - h + 4, x + w / 2, y + 4]);
      ctx.fillStyle = kind === 'seg' ? 'rgba(214,40,57,.95)' : kind === 'io' ? 'rgba(20,24,32,.92)' : 'rgba(255,255,255,.93)';
      roundRect(x - w / 2, y - h + 4, w, h, 4); ctx.fill();
      ctx.strokeStyle = kind === 'entered' ? '#222' : kind === 'obst' ? '#a33' : kind === 'ind' ? '#7b828b' : '#c4182a'; ctx.lineWidth = 1; if (kind !== 'seg' && kind !== 'io') ctx.stroke();
      ctx.fillStyle = kind === 'seg' || kind === 'io' ? '#fff' : kind === 'ind' ? '#555' : '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, x, y);
    }
    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function overlay() {
      var queue = []; placed = [];
      sc.dims.forEach(function (d) {
        var a = toCam(d.a), b = toCam(d.b); if (!cam.ortho && (a[2] < NEAR || b[2] < NEAR)) return;
        var pa = scr(a), pb = scr(b), col = d.kind === 'entered' ? '#111' : d.kind === 'ind' ? '#7b828b' : '#c4182a';
        ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.setLineDash(d.dashed ? [5, 4] : []); ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); ctx.setLineDash([]);
        var dx = pb[0] - pa[0], dy = pb[1] - pa[1], dl = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / dl * 5, ny = dx / dl * 5;
        ctx.beginPath(); ctx.moveTo(pa[0] - nx, pa[1] - ny); ctx.lineTo(pa[0] + nx, pa[1] + ny); ctx.moveTo(pb[0] - nx, pb[1] - ny); ctx.lineTo(pb[0] + nx, pb[1] + ny); ctx.stroke();
        if (dl >= 14) queue.push([(pa[0] + pb[0]) / 2 + d.off[0], (pa[1] + pb[1]) / 2 + d.off[1], d.text, d.kind, d.kind === 'entered' ? 1 : 2]);
      });
      sc.tags.forEach(function (t) { var narrow = cw < 520; if (narrow && t.kind === 'ind') return; var c = toCam(t.p); if (!cam.ortho && c[2] < NEAR) return; var p = scr(c); queue.push([p[0], p[1], narrow && t.short ? t.short : t.text, t.kind, t.kind === 'seg' ? 0 : t.kind === 'io' ? 0 : t.kind === 'ind' ? 3 : 2]); });
      queue.sort(function (a, b) { return a[4] - b[4]; }).forEach(function (q) { label(q[0], q[1], q[2], q[3]); });
    }
    function hud() {
      var ox = 38, oy = chh - 34, ax = [[[1, 0, 0], '#d6283a', 'X'], [[0, 1, 0], '#2a9d54', 'Y'], [[0, 0, 1], '#2b6fd6', 'Z']];
      ctx.lineWidth = 2; ctx.font = '700 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ax.forEach(function (a) { var dx = dot(a[0], rv) * 24, dy = -dot(a[0], uv) * 24; ctx.strokeStyle = a[1]; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + dx, oy + dy); ctx.stroke(); ctx.fillStyle = a[1]; ctx.fillText(a[2], ox + dx * 1.3, oy + dy * 1.3); });
      if (sc.grid && show.floor) { ctx.fillStyle = '#555'; ctx.font = '500 11px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('Floor grid: ' + fmt(sc.grid.step) + (cam.ortho ? ' · orthographic' : ''), 78, chh - 10); }
    }

    /* ---- loop ---- */
    function need() { if (!raf && !destroyed) raf = W.requestAnimationFrame(tick); }
    function tick(ts) {
      raf = null; if (destroyed) return;
      var dt = last === null ? 0 : Math.min(0.1, (ts - last) / 1000); last = ts;
      if (playing) time += dt * scale; if (auto) cam.yaw += dt * 0.35;
      draw(); if (playing) stats();
      if (playing || auto) need(); else last = null;
    }
    function stats() {
      if (!canRun) return; var L = sc.track.length, pos_ = SIM.positions(time, vS, pitch, L), d = SIM.delivered(time, vS, pitch, L) * lanes;
      o('time').textContent = time < 120 ? time.toFixed(1) + ' s' : (time / 60).toFixed(1) + ' min'; o('on').textContent = String(pos_.length * lanes); o('del').textContent = String(d);
      var steady = L / vS; if (time > steady + 2 * pitch / vS) { var win = 10 * pitch / vS, t0 = Math.max(0, time - win); o('out').textContent = ((SIM.delivered(time, vS, pitch, L) - SIM.delivered(t0, vS, pitch, L)) * lanes / ((time - t0) / 60)).toFixed(1) + ' products/min'; } else o('out').textContent = '-';
    }
    function play() { if (playing || !canRun) return; playing = true; var b = root.querySelector('[data-a="play"]'); if (b) b.textContent = 'Pause'; need(); }
    function pause() { playing = false; var b = root.querySelector('[data-a="play"]'); if (b) b.textContent = 'Play'; }

    /* ---- sizing ---- */
    function resize() {
      var w = stage.clientWidth || 600, h = compact ? Math.round(Math.min(300, w * 0.75)) : w < 520 ? Math.round(Math.min(520, w * 1.1)) : (doc.fullscreenElement === stage ? (W.innerHeight || 700) : Math.round(Math.max(340, Math.min(640, w * 0.62))));
      dpr = Math.min(2, W.devicePixelRatio || 1); cw = w; chh = h; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; need();
    }
    var ro = null; try { if (W.ResizeObserver) { ro = new W.ResizeObserver(function () { if (Math.abs(stage.clientWidth - cw) > 1) { var d0 = cam.dist; resize(); } }); ro.observe(stage); } } catch (e) { }
    W.addEventListener && W.addEventListener('resize', resize);
    var onFs = function () { resize(); fit(); }; doc.addEventListener('fullscreenchange', onFs);

    /* ---- input ---- */
    var ptr = {}, pinch0 = null;
    function panBy(dx, dy) { var wpp = 2 * cam.dist * Math.tan(FOV / 2) / chh; cam.target = add(cam.target, add(mul(rv, -dx * wpp), mul(uv, dy * wpp))); }
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) { try { canvas.setPointerCapture(e.pointerId); } catch (er) { } ptr[e.pointerId] = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 1 || e.button === 2 }; pinch0 = null; canvas.focus && canvas.focus(); });
    canvas.addEventListener('pointermove', function (e) {
      var p = ptr[e.pointerId]; if (!p) return; var ids = Object.keys(ptr);
      if (ids.length === 1) {
        var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        if (p.pan) panBy(dx, dy); else { cam.yaw -= dx * 0.008; cam.pitch = Math.max(-1.55, Math.min(1.5607, cam.pitch + dy * 0.008)); }
        if (cam.ortho && !p.pan && (Math.abs(dx) + Math.abs(dy)) > 0) { cam.ortho = false; syncBtns(); }
      } else if (ids.length === 2) {
        p.x = e.clientX; p.y = e.clientY; var a = ptr[ids[0]], b = ptr[ids[1]], d = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (pinch0) { cam.dist = Math.max(0.3, Math.min(500, cam.dist * pinch0.d / d)); panBy(mx - pinch0.mx, my - pinch0.my); }
        pinch0 = { d: d, mx: mx, my: my };
      }
      need();
    });
    function up(e) { delete ptr[e.pointerId]; pinch0 = null; }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); cam.dist = Math.max(0.3, Math.min(500, cam.dist * Math.exp(e.deltaY * 0.0015))); need(); }, { passive: false });
    canvas.addEventListener('dblclick', function () { fit(); });
    canvas.addEventListener('keydown', function (e) {
      var k = e.key, used = true;
      if (k === 'ArrowLeft') cam.yaw += 0.1; else if (k === 'ArrowRight') cam.yaw -= 0.1; else if (k === 'ArrowUp') cam.pitch = Math.min(1.5607, cam.pitch + 0.08); else if (k === 'ArrowDown') cam.pitch = Math.max(-1.55, cam.pitch - 0.08);
      else if (k === '+' || k === '=') cam.dist *= 0.88; else if (k === '-') cam.dist *= 1.14; else if (k === '0') fit(); else used = false;
      if (used) { e.preventDefault(); need(); }
    });
    root.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
      var v = b.getAttribute('data-v'), a = b.getAttribute('data-a');
      if (v) setView(v);
      else if (a === 'fit') fit('conveyor'); else if (a === 'floor') fit('floor');
      else if (a === 'ortho') { cam.ortho = !cam.ortho; syncBtns(); need(); }
      else if (a === 'auto') { auto = !auto; syncBtns(); need(); }
      else if (a === 'play') (playing ? pause : play)();
      else if (a === 'restart') { time = 0; if (!playing) play(); need(); }
      else if (a === 'full') { try { if (doc.fullscreenElement) doc.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen(); } catch (er) { } }
      else if (a === 'png') { try { draw(); var link = doc.createElement('a'); link.download = 'Ultraplast-conveyor-3d.png'; link.href = canvas.toDataURL('image/png'); doc.body.appendChild(link); link.click(); doc.body.removeChild(link); } catch (er) { } }
    });
    root.addEventListener('change', function (e) {
      var t = e.target.getAttribute('data-t'), a = e.target.getAttribute('data-a');
      if (t) { show[t] = e.target.checked; need(); } else if (a === 'scale') scale = +e.target.value;
    });

    resize(); syncBtns();
    if (opts.view && typeof opts.view.yaw === 'number') fit('conveyor'); else setView('iso');
    draw(); stats(); if (canRun && !reduce && opts.autoplay !== false) play();
    return {
      destroy: function () { destroyed = true; playing = false; if (raf) W.cancelAnimationFrame(raf); if (ro) ro.disconnect(); W.removeEventListener && W.removeEventListener('resize', resize); doc.removeEventListener('fullscreenchange', onFs); },
      pause: pause, play: play, setView: setView, fit: fit, render: draw, scene: sc, description: desc,
      state: function () { return { time: time, playing: playing, scale: scale, yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, ortho: cam.ortho, canRun: canRun, shown: sc.shown || 0 }; },
      view: function () { return { yaw: cam.yaw, pitch: cam.pitch, ortho: cam.ortho }; },
      setTime: function (t) { time = t; draw(); stats(); }, setCamera: function (c) { for (var k in c) cam[k] = c[k]; need(); }
    };
  }

  return { IND: IND, buildScene: buildScene, describe: describe, baseElevation: baseElevation, create: create, extrude: extrude, obox: obox };
});
