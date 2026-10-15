/*
 * simulation.js — RUNNING-CONVEYOR ANIMATION driven by the entered data
 * ---------------------------------------------------------------------------
 * Products are released at the start of the calculated route one every
 *   release interval = product pitch / belt speed
 * and travel along the route centre-line at the belt speed.  So:
 *   position of product k at time t:  s_k = v*t - k*pitch      (0 <= s_k <= route length)
 *   delivered count at time t:        N   = ceil((v*t - L)/pitch)   when v*t > L
 * Belt speed = entered speed, otherwise the minimum speed that meets the throughput.
 * Visual aid only - it does not model friction, accumulation, transfers or drive limits.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UCPSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : {};

  /** Cumulative 3-D track along a list of {x,y,z} points. */
  function buildTrack(points) {
    var cum = [0], i, d;
    for (i = 1; i < points.length; i++) {
      var a = points[i - 1], b = points[i];
      d = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2) + Math.pow((b.z || 0) - (a.z || 0), 2));
      cum.push(cum[i - 1] + d);
    }
    return {
      length: cum[cum.length - 1], cum: cum,
      at: function (s) {
        s = Math.max(0, Math.min(cum[cum.length - 1], s));
        var lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { var m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
        var a = points[lo], b = points[hi], seg = cum[hi] - cum[lo], t = seg > 0 ? (s - cum[lo]) / seg : 0;
        var dx = b.x - a.x, dy = b.y - a.y, dz = (b.z || 0) - (a.z || 0), dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        return { x: a.x + dx * t, y: a.y + dy * t, z: (a.z || 0) + dz * t, angle: Math.atan2(dy, dx), tx: dx / dl, ty: dy / dl, tz: dz / dl };
      }
    };
  }
  /** Distances along the route of every product on the conveyor at time t (seconds). */
  function positions(t, v, pitch, L) {
    var out = [], travelled = v * t;
    var kMin = Math.max(0, Math.ceil((travelled - L) / pitch)), kMax = Math.floor(travelled / pitch);
    for (var k = kMax; k >= kMin; k--) out.push(travelled - k * pitch);
    return out;
  }
  function delivered(t, v, pitch, L) { var x = v * t - L; return x > 0 ? Math.ceil(x / pitch) : 0; }

  /** Create an interactive animation inside `host` (a DOM element). ctx: {svgHtml, points, v (m/min), pitchMm, alongMm, acrossMm, lanes, rate, fmt} */
  function create(host, ctx) {
    var doc = host.ownerDocument, svg = host.querySelector('svg.sc[data-s]');
    if (!svg || !ctx.points || ctx.points.length < 2) return null;
    var tr = buildTrack(ctx.points), s = parseFloat(svg.getAttribute('data-s')), fx = parseFloat(svg.getAttribute('data-fx')), fy = parseFloat(svg.getAttribute('data-fy')), ph = parseFloat(svg.getAttribute('data-ph'));
    var vS = ctx.v / 60, pitch = ctx.pitchMm / 1000, L = tr.length, lanes = Math.max(1, ctx.lanes || 1);
    var NS = 'http://www.w3.org/2000/svg', layer = doc.createElementNS(NS, 'g'); layer.setAttribute('aria-hidden', 'true'); svg.appendChild(layer);
    var wantLen = ctx.alongMm / 1000 * s, wantWid = ctx.acrossMm / 1000 * s, enlarged = wantLen < 8 || wantWid < 8;
    var pl = Math.max(wantLen, 8), pw = Math.max(wantWid, 8), laneStepPx = Math.max(ctx.acrossMm / 1000 * s, pw) * 1.15;
    var pool = [], time = ctx.startTime || 0, playing = false, last = null, raf = null, scale = 1, reduce = false;
    try { reduce = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
    var maxDraw = 500;

    var transit = L / vS, autoScale = [1, 2, 5, 10, 20, 50, 100].reduce(function (b, c) { return Math.abs(c - transit / 15) < Math.abs(b - transit / 15) ? c : b; }, 1);
    scale = autoScale;
    var lines = svg.querySelector('.cv-lines'), prof = host.querySelector('svg.prof'), profPool = [], profLayer = null;
    if (prof) { profLayer = doc.createElementNS(NS, 'g'); prof.appendChild(profLayer); }
    var ui = doc.createElement('div'); ui.className = 'sim-ui';
    ui.innerHTML = '<div class="btnrow"><button type="button" class="btn primary" data-sim="play">Play</button><button type="button" class="btn" data-sim="restart">Restart</button>' +
      '<button type="button" class="btn" data-sim="zoom" aria-pressed="false">Zoom to conveyor</button><label class="sim-speed">Playback speed <select data-sim="scale">' + [1, 2, 5, 10, 20, 50, 100].map(function (x) { return '<option value="' + x + '"' + (x === scale ? ' selected' : '') + '>' + x + '×</option>'; }).join('') + '</select></label></div>' +
      '<dl class="sim-stats"><div><dt>Belt speed</dt><dd>' + ctx.v.toFixed(2) + ' m/min</dd></div><div><dt>Product spacing</dt><dd>' + ctx.pitchMm.toFixed(0) + ' mm</dd></div><div><dt>Simulated time</dt><dd data-o="time">0 s</dd></div>' +
      '<div><dt>On conveyor</dt><dd data-o="on">0</dd></div><div><dt>Delivered</dt><dd data-o="del">0</dd></div><div><dt>Measured output</dt><dd data-o="out">-</dd></div></dl>' +
      '<p class="note" data-o="note"></p>';
    if (!ctx.compact) host.appendChild(ui);
    var o = function (k) { return ui.querySelector('[data-o="' + k + '"]') || { textContent: '' }; }, btn = ui.querySelector('[data-sim="play"]');
    var vb0 = svg.getAttribute('viewBox'), zoomed = false;
    function setZoom(on) {
      zoomed = on; var zb = ui.querySelector('[data-sim="zoom"]'); if (zb) { zb.setAttribute('aria-pressed', on ? 'true' : 'false'); zb.textContent = on ? 'Show whole floor' : 'Zoom to conveyor'; }
      if (!on) { svg.setAttribute('viewBox', vb0); return; }
      var v = vb0.split(' ').map(Number), minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      ctx.points.forEach(function (p) { var px = fx + p.x * s, py = fy + ph - p.y * s; minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); });
      var mg = 46 + pw, w = maxX - minX + 2 * mg, h = maxY - minY + 2 * mg, r = v[2] / v[3];
      if (w / h < r) w = h * r; else h = w / r;
      var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      svg.setAttribute('viewBox', (cx - w / 2).toFixed(1) + ' ' + (cy - h / 2).toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1));
    }
    var notes = [];
    if (ctx.speedAssumed) notes.push('No speed was entered, so the minimum speed that meets your throughput is animated.');
    if (enlarged) notes.push('Products are drawn larger than true size so they stay visible.');
    notes.push('Visual aid only: friction, accumulation, transfers and drive limits are not simulated.');
    o('note').textContent = notes.join(' ');

    function draw() {
      var pos = positions(time, vS, pitch, L), step = Math.max(1, Math.ceil(pos.length * lanes / maxDraw)), n = 0, i, l;
      for (i = 0; i < pos.length; i += step) {
        var p = tr.at(pos[i]), px = fx + p.x * s, py = fy + ph - p.y * s, ang = -p.angle * 180 / Math.PI;
        for (l = 0; l < lanes; l++) {
          var el = pool[n]; if (!el) { el = doc.createElementNS(NS, 'rect'); el.setAttribute('class', 'sim-prod'); el.setAttribute('rx', '1.5'); layer.appendChild(el); pool[n] = el; }
          el.setAttribute('width', pl.toFixed(2)); el.setAttribute('height', pw.toFixed(2)); el.setAttribute('x', (-pl / 2).toFixed(2)); el.setAttribute('y', (-pw / 2).toFixed(2));
          el.setAttribute('transform', 'translate(' + px.toFixed(2) + ' ' + py.toFixed(2) + ') rotate(' + ang.toFixed(1) + ') translate(0 ' + ((l - (lanes - 1) / 2) * laneStepPx).toFixed(2) + ')');
          el.style.display = ''; n++;
        }
      }
      for (; n < pool.length; n++) pool[n].style.display = 'none';
      if (lines) lines.style.strokeDashoffset = (-(vS * time * s) % 9).toFixed(2);
      if (profLayer) {
        var ppad = +prof.getAttribute('data-pad'), psx = +prof.getAttribute('data-sx'), ph2 = +prof.getAttribute('data-h'), pz0 = +prof.getAttribute('data-zmin'), psz = +prof.getAttribute('data-sz'), q = 0;
        for (i = 0; i < pos.length && q < 200; i += Math.max(1, Math.ceil(pos.length / 200))) {
          var pp = tr.at(pos[i]), c = profPool[q]; if (!c) { c = doc.createElementNS(NS, 'circle'); c.setAttribute('r', '3.5'); c.setAttribute('class', 'sim-dot'); profLayer.appendChild(c); profPool[q] = c; }
          c.setAttribute('cx', (ppad + pos[i] * psx).toFixed(1)); c.setAttribute('cy', (ph2 - ppad - (pp.z - pz0) * psz - 7).toFixed(1)); c.style.display = ''; q++;
        }
        for (; q < profPool.length; q++) profPool[q].style.display = 'none';
      }
      var d = delivered(time, vS, pitch, L) * lanes;
      o('time').textContent = time < 120 ? time.toFixed(1) + ' s' : (time / 60).toFixed(1) + ' min';
      o('on').textContent = String(pos.length * lanes);
      o('del').textContent = String(d);
      var steadyFrom = L / vS;
      o('out').textContent = time > steadyFrom + 2 * pitch / vS ? (d / ((time - steadyFrom * 0) / 60)).toFixed(1) + ' /min (incl. start-up)' : '-';
      if (time > steadyFrom + 2 * pitch / vS) { var win = 10 * pitch / vS, t0 = Math.max(0, time - win); o('out').textContent = ((delivered(time, vS, pitch, L) - delivered(t0, vS, pitch, L)) * lanes / ((time - t0) / 60)).toFixed(1) + ' products/min'; }
    }
    function tick(ts) {
      if (!playing) return;
      if (last !== null) time += Math.min(0.1, (ts - last) / 1000) * scale;
      last = ts; draw(); raf = W.requestAnimationFrame(tick);
    }
    function play() { if (playing) return; playing = true; last = null; btn.textContent = 'Pause'; raf = W.requestAnimationFrame(tick); }
    function pause() { playing = false; btn.textContent = 'Play'; if (raf) W.cancelAnimationFrame(raf); }
    ui.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-sim]') : null; if (!b) return;
      if (b.getAttribute('data-sim') === 'play') (playing ? pause : play)();
      if (b.getAttribute('data-sim') === 'zoom') setZoom(!zoomed);
      if (b.getAttribute('data-sim') === 'restart') { time = 0; draw(); if (!playing) play(); }
    });
    ui.addEventListener('change', function (e) { if (e.target.getAttribute('data-sim') === 'scale') scale = +e.target.value; });
    if (!ctx.compact) setZoom(true);
    draw(); if (!reduce) play();
    return { pause: pause, play: play, destroy: function () { pause(); }, state: function () { return { time: time, playing: playing, scale: scale }; }, setTime: function (t) { time = t; draw(); } };
  }
  return { buildTrack: buildTrack, positions: positions, delivered: delivered, create: create };
});
