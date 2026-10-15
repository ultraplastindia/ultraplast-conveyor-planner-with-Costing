/*
 * calculations.js — CALCULATION ENGINE (no DOM, no network)
 * ---------------------------------------------------------------------------
 * Ultraplast Smart Conveyor Planner & Estimator
 *
 * Works in the browser (global UCPCalc) and in Node (require) for testing.
 *
 * INTERNAL UNITS (after normalize): lengths in metres unless the field name
 * ends in Mm; mass in kg; speed in m/min; temperature in degC; angles in deg.
 *
 * DOCUMENTED FORMULAS
 *  F1  floor area            A = L x W
 *  F2  straight segment      s = L
 *  F3  curved segment        s = R x theta(rad)               (R = centre-line radius)
 *  F4  inclined segment      s = sqrt(H^2 + z^2)  or  H / cos(alpha)   (H = horizontal run, z = rise)
 *  F5  product pitch         P = product length along travel + gap   (mm)
 *  F6  required speed        v = (rate per lane) x P / 1000          (m/min)
 *  F7  capacity at speed v   C = lanes x v x 1000 / P                (units/min)
 *  F8  units on conveyor     n = lanes x floor(path x 1000 / P)
 *  F9  two-pulley loop       Lb = 2 x C + pi x D      (SIMPLIFIED: horizontal, two equal pulleys only)
 *  F10 sprocket pitch dia.   D = p / sin(pi / N)      (chordal pitch circle; p = pitch, N = teeth)
 *
 * Nothing here selects a motor, belt strength, shaft, tension or structure.
 * Those are always returned as "Engineering review required".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UCPCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATUS = {
    CUSTOMER: 'Customer-provided',
    CALC: 'Calculated estimate',
    CONFIG: 'Configuration-dependent',
    REVIEW: 'Engineering review required'
  };

  /* ------------------------------------------------------------------ units */
  var M_PER_FT = 0.3048, MM_PER_IN = 25.4, KG_PER_LB = 0.45359237, KG_PER_OZ = 0.028349523125;
  var WEIGHT_UNITS = { g: 0.001, kg: 1, lb: KG_PER_LB, oz: KG_PER_OZ };

  // Field kind map: how each raw form field converts to internal metric.
  //  m = metres|feet   mm = millimetres|inches   speed = m/min|ft/min   temp = C|F   deg = degrees   num = plain
  var FIELD_KINDS = {
    floorLength: 'm', floorWidth: 'm', startX: 'm', startY: 'm', endX: 'm', endY: 'm',
    workingHeight: 'mm', inletHeight: 'mm', dischargeHeight: 'mm',
    prodLength: 'mm', prodWidth: 'mm', prodHeight: 'mm', gap: 'mm',
    temperature: 'temp', speed: 'speed',
    beltWidth: 'mm', routeLength: 'm', pitch: 'mm', pulleyDia: 'mm', centreDistance: 'm',
    rate: 'num', hoursPerDay: 'num', shifts: 'num', lanes: 'num', transfers: 'num',
    infeedPoints: 'num', dischargePoints: 'num', drives: 'num', sprocketTeeth: 'num',
    weight: 'weight', maxWeight: 'weight'
  };
  var OBSTACLE_KINDS = { x: 'm', y: 'm', w: 'm', d: 'm' };
  var SEGMENT_KINDS = { length: 'm', angle: 'deg', radius: 'mm', horizontal: 'm', rise: 'mm', inclineAngle: 'deg' };

  function parseNum(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = String(v).trim();
    if (s === '') return null;
    if (!/^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return Number(s);
  }

  function toMetric(kind, v, sys) {
    if (v === null || v === undefined || isNaN(v)) return v;
    if (sys !== 'imperial') return v;
    switch (kind) {
      case 'm': return v * M_PER_FT;
      case 'mm': return v * MM_PER_IN;
      case 'speed': return v * M_PER_FT;
      case 'temp': return (v - 32) * 5 / 9;
      default: return v;
    }
  }
  function fromMetric(kind, v, sys) {
    if (v === null || v === undefined || isNaN(v)) return v;
    if (sys !== 'imperial') return v;
    switch (kind) {
      case 'm': return v / M_PER_FT;
      case 'mm': return v / MM_PER_IN;
      case 'speed': return v / M_PER_FT;
      case 'temp': return v * 9 / 5 + 32;
      default: return v;
    }
  }
  function weightToKg(v, unit) {
    if (v === null || v === undefined || isNaN(v)) return v;
    var f = WEIGHT_UNITS[unit];
    return f === undefined ? NaN : v * f;
  }

  var deg2rad = function (d) { return d * Math.PI / 180; };
  var round = function (v, dp) { if (v === null || v === undefined || !isFinite(v)) return v; var f = Math.pow(10, dp === undefined ? 3 : dp); return Math.round(v * f) / f; };

  /* -------------------------------------------------------------- normalize */
  /**
   * Convert the raw (string-valued) form model into validated metric numbers.
   * blank -> null ; unparseable -> NaN (reported by validate()).
   */
  function normalize(raw) {
    raw = raw || {};
    var sys = raw.unitSystem === 'imperial' ? 'imperial' : 'metric';
    var inp = { unitSystem: raw.unitSystem === undefined ? 'metric' : raw.unitSystem, _sys: sys };
    var k;
    for (k in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, k) && !FIELD_KINDS[k] && k !== 'obstacles' && k !== 'segments') inp[k] = raw[k];
    }
    for (k in FIELD_KINDS) {
      var kind = FIELD_KINDS[k];
      var n = parseNum(raw[k]);
      if (kind === 'weight') {
        var unitName = k === 'weight' ? 'weightUnit' : 'maxWeightUnit';
        var u = raw[unitName] || 'kg';
        inp[unitName] = u;
        inp[k] = weightToKg(n, u);
      } else inp[k] = toMetric(kind, n, sys);
    }
    // mm-valued fields that are used in metres elsewhere are kept in mm (suffix Mm in analysis).
    inp.obstacles = (raw.obstacles || []).map(function (o) {
      var r = { name: o.name || '' };
      for (var kk in OBSTACLE_KINDS) r[kk] = toMetric('m', parseNum(o[kk]), sys);
      return r;
    }).filter(function (o) { return !(o.x === null && o.y === null && o.w === null && o.d === null); });
    inp.segments = (raw.segments || []).map(function (s) {
      var r = { type: s.type || 'straight', direction: s.direction || 'left' };
      for (var kk in SEGMENT_KINDS) r[kk] = toMetric(SEGMENT_KINDS[kk], parseNum(s[kk]), sys);
      r.radiusM = r.radius === null || isNaN(r.radius) ? r.radius : r.radius / 1000;      // F3 uses metres
      r.riseM = r.rise === null || isNaN(r.rise) ? r.rise : r.rise / 1000;
      return r;
    }).filter(function (s) {
      return !(s.length === null && s.angle === null && s.radius === null && s.horizontal === null && s.rise === null && s.inclineAngle === null);
    });
    inp.conditions = Array.isArray(raw.conditions) ? raw.conditions.slice() : [];
    inp.advanced = !!raw.advanced;
    inp.guideRails = !!raw.guideRails;
    inp.drawingAvailable = !!raw.drawingAvailable;
    return inp;
  }

  /* --------------------------------------------------------------- validate */
  var POSITIVE = ['floorLength', 'floorWidth', 'workingHeight', 'prodLength', 'prodWidth', 'prodHeight', 'weight', 'maxWeight', 'rate', 'speed', 'beltWidth', 'routeLength', 'pitch', 'pulleyDia', 'centreDistance'];
  var NON_NEGATIVE = ['startX', 'startY', 'endX', 'endY', 'inletHeight', 'dischargeHeight', 'gap', 'transfers', 'infeedPoints', 'dischargePoints'];
  var INTEGER_MIN1 = ['lanes', 'drives', 'sprocketTeeth', 'shifts'];
  var LABELS = {
    floorLength: 'Floor length', floorWidth: 'Floor width', workingHeight: 'Working height', startX: 'Start X', startY: 'Start Y',
    endX: 'End X', endY: 'End Y', inletHeight: 'Inlet height', dischargeHeight: 'Discharge height', prodLength: 'Product length',
    prodWidth: 'Product width', prodHeight: 'Product height', weight: 'Product weight', maxWeight: 'Maximum product weight',
    gap: 'Product gap', temperature: 'Product temperature', rate: 'Throughput', speed: 'Conveying speed', hoursPerDay: 'Operating hours per day',
    shifts: 'Shifts per day', beltWidth: 'Conveyor width', routeLength: 'Route length', lanes: 'Number of lanes', transfers: 'Transfer points',
    infeedPoints: 'Infeed points', dischargePoints: 'Discharge points', pitch: 'Belt/chain pitch', pulleyDia: 'Pulley/sprocket diameter',
    centreDistance: 'Centre distance', drives: 'Number of drives', sprocketTeeth: 'Sprocket teeth'
  };
  var STEP_OF = {
    floorLength: 1, floorWidth: 1, workingHeight: 1, startX: 1, startY: 1, endX: 1, endY: 1, inletHeight: 1, dischargeHeight: 1,
    prodLength: 2, prodWidth: 2, prodHeight: 2, weight: 2, maxWeight: 2, gap: 2, temperature: 2,
    rate: 3, speed: 3, hoursPerDay: 3, shifts: 3,
    beltWidth: 4, routeLength: 4, lanes: 4, transfers: 4, infeedPoints: 4, dischargePoints: 4, pitch: 4, pulleyDia: 4, centreDistance: 4, drives: 4, sprocketTeeth: 4
  };

  function validate(inp) {
    var errors = [], warnings = [];
    function err(field, msg, step) { errors.push({ field: field, step: step || STEP_OF[field] || 0, msg: msg }); }
    if (inp.unitSystem !== 'metric' && inp.unitSystem !== 'imperial') err('unitSystem', 'Unit system must be "metric" or "imperial".', 0);
    ['weightUnit', 'maxWeightUnit'].forEach(function (u) {
      if (inp[u] !== undefined && WEIGHT_UNITS[inp[u]] === undefined) err(u === 'weightUnit' ? 'weight' : 'maxWeight', 'Unknown weight unit "' + inp[u] + '". Use g, kg, lb or oz.');
    });
    if (inp.rateUnit !== undefined && inp.rateUnit !== '' && inp.rateUnit !== 'per_min' && inp.rateUnit !== 'per_hour') err('rate', 'Throughput unit must be per minute or per hour.', 3);

    Object.keys(FIELD_KINDS).forEach(function (f) {
      var v = inp[f];
      if (v === null || v === undefined) return;
      var label = LABELS[f] || f;
      if (typeof v === 'number' && isNaN(v)) {
        if ((f === 'weight' || f === 'maxWeight') && WEIGHT_UNITS[inp[f === 'weight' ? 'weightUnit' : 'maxWeightUnit']] === undefined) return; // reported above
        err(f, label + ' must be a number (digits only, no units or text).'); return;
      }
      if (POSITIVE.indexOf(f) >= 0 && v <= 0) err(f, label + ' must be greater than zero.');
      else if (NON_NEGATIVE.indexOf(f) >= 0 && v < 0) err(f, label + ' cannot be negative.');
      else if (INTEGER_MIN1.indexOf(f) >= 0 && (v < 1 || Math.floor(v) !== v)) err(f, label + ' must be a whole number of 1 or more.');
      if (f === 'hoursPerDay' && (v <= 0 || v > 24)) err(f, 'Operating hours per day must be between 0 and 24.');
      if (f === 'transfers' || f === 'infeedPoints' || f === 'dischargePoints') { if (v >= 0 && Math.floor(v) !== v) err(f, label + ' must be a whole number.'); }
      if (f === 'temperature' && (v < -100 || v > 1000)) err(f, 'Product temperature looks unrealistic - check the unit (degC / degF).');
    });
    if (inp.weight > 0 && inp.maxWeight > 0 && inp.maxWeight < inp.weight) err('maxWeight', 'Maximum product weight cannot be less than the typical product weight.');
    if (inp.startX !== null && inp.startX !== undefined && inp.floorLength > 0 && inp.startX > inp.floorLength) warnings.push({ field: 'startX', step: 1, msg: 'Start X is outside the floor length.' });

    (inp.obstacles || []).forEach(function (o, i) {
      ['x', 'y', 'w', 'd'].forEach(function (p) {
        if (o[p] !== null && isNaN(o[p])) err('obstacle' + i, 'Obstacle ' + (i + 1) + ': ' + p.toUpperCase() + ' must be a number.', 1);
        else if (o[p] !== null && (p === 'w' || p === 'd') && o[p] <= 0) err('obstacle' + i, 'Obstacle ' + (i + 1) + ': size must be greater than zero.', 1);
        else if (o[p] !== null && o[p] < 0) err('obstacle' + i, 'Obstacle ' + (i + 1) + ': position cannot be negative.', 1);
      });
    });
    (inp.segments || []).forEach(function (s, i) {
      var tag = 'Segment ' + (i + 1) + ': ';
      ['length', 'angle', 'radius', 'horizontal', 'rise', 'inclineAngle'].forEach(function (p) {
        if (s[p] !== null && isNaN(s[p])) err('segment' + i, tag + p + ' must be a number.', 4);
      });
      if (s.type === 'straight' && s.length !== null && !isNaN(s.length) && s.length <= 0) err('segment' + i, tag + 'length must be greater than zero.', 4);
      if (s.type === 'curve') {
        if (s.angle !== null && !isNaN(s.angle) && (s.angle <= 0 || s.angle > 360)) err('segment' + i, tag + 'curve angle must be between 0 and 360 degrees.', 4);
        if (s.radius !== null && !isNaN(s.radius) && s.radius <= 0) err('segment' + i, tag + 'radius must be greater than zero.', 4);
      }
      if (s.type === 'incline') {
        if (s.horizontal !== null && !isNaN(s.horizontal) && s.horizontal <= 0) err('segment' + i, tag + 'horizontal run must be greater than zero.', 4);
        if (s.inclineAngle !== null && !isNaN(s.inclineAngle) && Math.abs(s.inclineAngle) >= 90) err('segment' + i, tag + 'incline angle must be between -90 and +90 degrees (exclusive).', 4);
      }
    });
    return { errors: errors, warnings: warnings };
  }

  /** Required fields to leave a step (UI gate). Returns [{field,msg}] */
  function requiredForStep(step, inp) {
    var req = {
      1: [['floorLength', 'Enter the available floor length.'], ['floorWidth', 'Enter the available floor width.']],
      2: [['prodLength', 'Enter the product length (mm).'], ['prodWidth', 'Enter the product width (mm).'], ['prodHeight', 'Enter the product height (mm).'], ['weight', 'Enter the product weight.']],
      3: [['rate', 'Enter the required throughput.']],
      4: []
    }[step] || [];
    var out = [];
    req.forEach(function (r) { if (inp[r[0]] === null || inp[r[0]] === undefined) out.push({ field: r[0], msg: r[1] }); });
    if (step === 1 && !inp.layout) out.push({ field: 'layout', msg: 'Choose a layout.' });
    return out;
  }

  /* --------------------------------------------------------------- geometry */
  function norm360(a) { a = a % 360; return a < 0 ? a + 360 : a; }

  function segmentComplete(s) {
    var ok = function (v) { return v !== null && v !== undefined && !isNaN(v); };
    if (s.type === 'straight') return ok(s.length) && s.length > 0;
    if (s.type === 'curve') return ok(s.angle) && s.angle > 0 && ok(s.radiusM) && s.radiusM > 0;
    if (s.type === 'incline') {
      var hasH = ok(s.horizontal) && s.horizontal > 0, hasZ = ok(s.riseM), hasA = ok(s.inclineAngle);
      return (hasH && (hasZ || hasA)) || (hasZ && hasA && s.inclineAngle !== 0);
    }
    return false;
  }

  /**
   * Build the 3-D path of a segment list.  Heading 0 deg = +X, 90 deg = +Y, left turn = +angle.
   * Stops at the first incomplete segment (geometry beyond it is unknown).
   */
  function buildPath(segs, start, heading0) {
    var x = start.x, y = start.y, z = 0, h = heading0;
    var pts = [{ x: x, y: y, z: z }];
    var L = { straight: 0, curved: 0, inclined: 0, total: 0, horizontal: 0 };
    var details = [], incompleteIdx = [], truncated = false, minZ = 0, maxZ = 0;
    var STEP = 0.1;

    segs.forEach(function (s, i) {
      if (truncated) return;
      if (!segmentComplete(s)) { incompleteIdx.push(i); truncated = true; return; }
      var hr = deg2rad(h), d = { index: i, type: s.type, p0: pts.length - 1 };
      if (s.type === 'straight') {                               // F2
        var n = Math.max(1, Math.ceil(s.length / STEP));
        for (var k = 1; k <= n; k++) { var t = s.length * k / n; pts.push({ x: x + t * Math.cos(hr), y: y + t * Math.sin(hr), z: z }); }
        x += s.length * Math.cos(hr); y += s.length * Math.sin(hr);
        L.straight += s.length; L.total += s.length; L.horizontal += s.length;
        d.length = s.length; d.horizontal = s.length;
      } else if (s.type === 'curve') {                           // F3
        var sg = s.direction === 'right' ? -1 : 1, R = s.radiusM, th = deg2rad(s.angle);
        var cx = x + R * sg * (-Math.sin(hr)), cy = y + R * sg * Math.cos(hr);
        var steps = Math.max(6, Math.ceil(s.angle / 5));
        for (var q = 1; q <= steps; q++) {
          var ph = th * q / steps, hh = hr + sg * ph;
          pts.push({ x: cx + R * sg * Math.sin(hh), y: cy - R * sg * Math.cos(hh), z: z });
        }
        var hEnd = hr + sg * th;
        x = cx + R * sg * Math.sin(hEnd); y = cy - R * sg * Math.cos(hEnd);
        h = norm360(h + sg * s.angle);
        var arc = R * th;
        L.curved += arc; L.total += arc;
        L.horizontal += arc;
        d.length = arc; d.horizontal = arc; d.radius = R; d.angle = s.angle; d.direction = s.direction;
      } else {                                                   // incline F4
        var H, rise;
        var hasH = s.horizontal !== null && !isNaN(s.horizontal) && s.horizontal > 0;
        var hasZ = s.riseM !== null && !isNaN(s.riseM);
        var hasA = s.inclineAngle !== null && !isNaN(s.inclineAngle);
        if (hasH && hasZ) { H = s.horizontal; rise = s.riseM; if (hasA && H > 0 && Math.abs(Math.atan2(rise, H) * 180 / Math.PI - s.inclineAngle) > 1) d.inconsistent = true; }
        else if (hasH && hasA) { H = s.horizontal; rise = H * Math.tan(deg2rad(s.inclineAngle)); }
        else { rise = s.riseM; H = Math.abs(rise / Math.tan(deg2rad(s.inclineAngle))); if (s.inclineAngle < 0 && rise > 0) rise = -rise; }
        var len = Math.sqrt(H * H + rise * rise);
        var ns = Math.max(1, Math.ceil(H / STEP));
        for (var m = 1; m <= ns; m++) { var tt = m / ns; pts.push({ x: x + H * tt * Math.cos(hr), y: y + H * tt * Math.sin(hr), z: z + rise * tt }); }
        x += H * Math.cos(hr); y += H * Math.sin(hr); z += rise;
        L.inclined += len; L.total += len; L.horizontal += H;
        d.length = len; d.horizontal = H; d.rise = rise; d.angle = Math.atan2(rise, H) * 180 / Math.PI;
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      d.p1 = pts.length - 1;
      details.push(d);
    });
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    return {
      points: pts, lengths: L, details: details, incompleteIdx: incompleteIdx, truncated: truncated,
      end: { x: x, y: y, z: z, heading: h },
      bbox: { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) },
      netRise: z, minZ: minZ, maxZ: maxZ
    };
  }

  function segmentsFromInputs(inp) {
    if (inp.layout === 'straight' || (!inp.layout && (!inp.segments || !inp.segments.length))) {
      if (inp.routeLength !== null && inp.routeLength !== undefined && !isNaN(inp.routeLength) && inp.routeLength > 0) return [{ type: 'straight', length: inp.routeLength, direction: 'left' }];
      return [];
    }
    return inp.segments || [];
  }

  /* ------------------------------------------------------- recommendation */
  function catById(P, id) { for (var i = 0; i < P.categories.length; i++) if (P.categories[i].id === id) return P.categories[i]; return null; }

  function recommend(inp, geo, P) {
    var hasCurve = geo.hasCurve, hasIncline = geo.hasIncline;
    var layout = inp.layout, h = inp.handling, ind = inp.industry;
    var food = inp.foodContact === 'direct' || inp.foodContact === 'incidental';
    var wetOily = (inp.conditions || []).some(function (c) { return c === 'wet' || c === 'oily'; });
    var rigid = h === 'cartons' || h === 'heavy';
    var reasons = [], alts = [], primary;

    if (layout === 'multi') {
      primary = 'custom'; reasons.push('A multi-conveyor production line needs coordinated transfers, speeds and controls, so it is treated as a custom / integrated line.');
    } else if (hasCurve && hasIncline) {
      primary = 'custom'; reasons.push('Your route combines curves and an incline, which usually needs a custom-engineered conveyor.'); alts = ['side_flex', 'inclined'];
    } else if (hasCurve) {
      if (rigid && !food && !wetOily) { primary = 'powered_curved_roller'; reasons.push('Rigid flat-base loads on a curve can suit a powered curved roller conveyor.'); alts = ['side_flex', 'curved']; }
      else { primary = 'side_flex'; reasons.push('Your route includes a curve; a side-flexing chain/belt can follow the turn on one conveyor.'); alts = ['curved']; }
    } else if (hasIncline) {
      primary = 'inclined'; reasons.push('Your inlet and discharge are at different heights, which needs an inclined (or declined) conveyor.'); alts = ['custom'];
    } else if (inp.electrical === 'none') {
      primary = 'gravity_roller'; reasons.push('You indicated no electrical supply, so an unpowered gravity roller conveyor is the only unpowered option (it needs rigid flat-base product and usually a slight downward slope).'); alts = ['straight_modular'];
    } else if (rigid && !food && !wetOily) {
      primary = 'powered_roller'; reasons.push('Rigid, flat-base cartons or heavy items on a dry straight run can suit a powered roller conveyor.'); alts = ['straight_modular'];
    } else if (food && (h === 'bags' || h === 'loose_food' || h === 'trays')) {
      primary = 'food_pu_pvc'; reasons.push('Food-contact soft or unpacked products usually call for a smooth, cleanable food-grade belt.'); alts = ['straight_modular'];
    } else if (h === 'bottles' || ind === 'beverages' || ind === 'dairy') {
      primary = 'thermoplastic_slat'; reasons.push('Bottles, cans and containers in beverage / dairy lines are commonly carried on slat-chain conveyors.'); alts = ['straight_modular'];
    } else {
      primary = 'straight_modular'; reasons.push('A straight, flat run with general products is a standard fit for a modular belt conveyor.'); alts = ['thermoplastic_slat'];
    }
    if (food) reasons.push('Food contact / hygiene was requested: material grade, cleanability and washdown suitability must be confirmed by Ultraplast.');
    if (inp.lanes > 1 && primary !== 'custom') reasons.push('Several lanes need lane guides and possibly lane dividers - confirm in the detailed design.');
    reasons.push('This is a preliminary suggestion from your answers only, not an engineering approval.');

    // Compatibility check of the user's chosen category.
    var selectedId = inp.categoryPref && inp.categoryPref !== 'auto' ? inp.categoryPref : primary;
    var sel = catById(P, selectedId) || catById(P, primary);
    var issues = [];
    if (inp.categoryPref && inp.categoryPref !== 'auto' && sel.id !== primary) {
      reasons.push('You selected "' + sel.name + '" instead of the automatic suggestion.');
    }
    if (hasCurve && sel.supportsCurves === false) issues.push({ level: 'error', msg: '"' + sel.name + '" is a straight-running type and cannot follow the curve(s) in your layout. Choose a side-flexing, curved or custom conveyor, or split the route into straight sections with transfers. Unsupported configuration.' });
    else if (hasCurve && sel.supportsCurves === null) issues.push({ level: 'warning', msg: 'Curve capability of "' + sel.name + '" is not configured - engineering review required.' });
    if (hasIncline && sel.supportsIncline === false) issues.push({ level: 'error', msg: '"' + sel.name + '" is not configured for inclines. Unsupported configuration.' });
    else if (hasIncline && sel.supportsIncline === null) issues.push({ level: 'warning', msg: 'Incline capability of "' + sel.name + '" is not configured - confirm with Ultraplast (surface profile, cleats and maximum angle depend on the product).' });
    if (sel.id === 'gravity_roller' && (hasCurve || hasIncline)) issues.push({ level: 'error', msg: 'A gravity roller conveyor does not suit powered curves or inclines. Unsupported configuration.' });
    if (sel.powered === false && inp.electrical && inp.electrical !== 'none' && inp.operation === 'continuous') issues.push({ level: 'info', msg: 'Gravity conveyors cannot control spacing or speed; continuous production lines normally use powered conveyors.' });
    if (food && (sel.id === 'gravity_roller' || sel.id === 'powered_roller' || sel.id === 'powered_curved_roller')) issues.push({ level: 'warning', msg: 'Roller conveyors may not meet food-contact / washdown hygiene needs - review required.' });
    if (wetOily && sel.kind === 'roller') issues.push({ level: 'warning', msg: 'Wet or oily products reduce roller traction and are hard to clean - engineering review required.' });
    if (sel.kind === 'roller' && inp.handling && !rigid && inp.handling !== 'trays' && inp.handling !== 'other') issues.push({ level: 'warning', msg: 'Roller conveyors need a rigid, flat product base; soft, small or loose items can fall between rollers.' });
    if (sel.id === 'custom' && layout !== 'multi' && !hasCurve && !hasIncline) issues.push({ level: 'info', msg: 'Custom / integrated line selected - Ultraplast will define the scope in the detailed design.' });
    if (inp.temperature !== null && inp.temperature !== undefined && !isNaN(inp.temperature) && (inp.temperature > 45 || inp.temperature < 0)) issues.push({ level: 'warning', msg: 'Product temperature ' + round(inp.temperature, 1) + ' degC: temperature ratings are not configured for any product, so suitability of the belt/chain material must be confirmed.' });
    if ((inp.conditions || []).indexOf('abrasive') >= 0) issues.push({ level: 'warning', msg: 'Abrasive products increase wear - wear-strip and belt material selection needs engineering review.' });
    if ((inp.conditions || []).indexOf('sticky') >= 0) issues.push({ level: 'warning', msg: 'Sticky products need a belt surface and cleaning method confirmed by Ultraplast.' });
    if (inp.fragility === 'high') issues.push({ level: 'info', msg: 'Fragile product: gentle transfers, guide rails and speed limits should be reviewed.' });

    return { primaryId: primary, selectedId: sel.id, selected: sel, alternatives: alts.filter(function (a) { return a !== primary; }), reasons: reasons, issues: issues };
  }

  /* ------------------------------------------------------------ main analysis */
  function analyse(inp, P) {
    P = P || (typeof require === 'function' ? require('./products.js') : root.UCPProducts);
    var out = {
      statusLabels: STATUS, issues: [], missing: [], assumptions: [], exclusions: [], engineering: [], equipment: [], nextSteps: []
    };
    function issue(level, msg, field) { out.issues.push({ level: level, msg: msg, field: field || null }); }
    var num = function (v) { return v !== null && v !== undefined && !isNaN(v); };

    var v = validate(inp);
    out.validation = v;
    if (v.errors.length) v.errors.forEach(function (e) { issue('error', e.msg, e.field); });
    v.warnings.forEach(function (w) { issue('warning', w.msg, w.field); });

    /* --- floor (F1) --- */
    out.floor = { length: inp.floorLength, width: inp.floorWidth, area: null, status: STATUS.CUSTOMER };
    if (num(inp.floorLength) && num(inp.floorWidth) && inp.floorLength > 0 && inp.floorWidth > 0) {
      out.floor.area = round(inp.floorLength * inp.floorWidth, 3);
      out.floor.areaStatus = STATUS.CALC;
    } else out.missing.push('Available floor length and width');

    /* --- path --- */
    var segs = segmentsFromInputs(inp);
    var geo = { hasCurve: false, hasIncline: false };
    segs.forEach(function (s) { if (s.type === 'curve') geo.hasCurve = true; if (s.type === 'incline') geo.hasIncline = true; });
    if (['L', 'U', 'S', 'curved'].indexOf(inp.layout) >= 0) geo.hasCurve = true;
    if (inp.layout === 'inclined') geo.hasIncline = true;
    var heightDiff = (num(inp.inletHeight) && num(inp.dischargeHeight)) ? (inp.dischargeHeight - inp.inletHeight) / 1000 : null;
    if (heightDiff !== null && Math.abs(heightDiff) > 0.05) geo.hasIncline = true;
    out.geo = geo;

    var startKnown = num(inp.startX) && num(inp.startY);
    var headingEntered = inp.startHeading === undefined || inp.startHeading === '' || inp.startHeading === null ? 0 : Number(inp.startHeading);
    var fl = out.floor.length, fw = out.floor.width, haveFloor = out.floor.area !== null;
    var path = null, placement = 'none';
    if (segs.length) {
      if (startKnown) { path = buildPath(segs, { x: inp.startX, y: inp.startY }, headingEntered); placement = 'entered'; }
      else {
        placement = 'auto';
        var tries = [0, 90, 180, 270].map(function (hd) {
          var p = buildPath(segs, { x: 0, y: 0 }, hd);
          return { hd: hd, p: p, w: p.bbox.maxX - p.bbox.minX, h: p.bbox.maxY - p.bbox.minY };
        });
        var chosen = tries[0];
        if (haveFloor) {
          for (var i = 0; i < tries.length; i++) if (tries[i].w <= fl + 1e-9 && tries[i].h <= fw + 1e-9) { chosen = tries[i]; break; }
        }
        path = chosen.p;
        // translate to the floor origin
        var dx = -path.bbox.minX, dy = -path.bbox.minY;
        path.points.forEach(function (p) { p.x += dx; p.y += dy; });
        path.end.x += dx; path.end.y += dy;
        path.bbox = { minX: 0, minY: 0, maxX: chosen.w, maxY: chosen.h };
        path.startHeading = chosen.hd;
      }
      if (placement === 'entered') path.startHeading = headingEntered;
      var L = path.lengths;
      out.path = {
        placement: placement, points: path.points, end: path.end, bbox: path.bbox, details: path.details,
        straight: round(L.straight), curved: round(L.curved), inclined: round(L.inclined), total: round(L.total), horizontal: round(L.horizontal),
        netRise: round(path.netRise), complete: !path.truncated, incompleteIdx: path.incompleteIdx, segmentCount: segs.length,
        startHeading: path.startHeading,
        status: inp.layout === 'straight' ? STATUS.CUSTOMER : STATUS.CALC,
        totalStatus: path.truncated ? STATUS.REVIEW : (inp.layout === 'straight' ? STATUS.CUSTOMER : STATUS.CALC)
      };
      if (path.truncated) {
        issue('warning', 'Segment ' + (path.incompleteIdx[0] + 1) + ' is missing data, so the route beyond it cannot be calculated. Totals show completed segments only - engineering review required.');
        out.missing.push('Complete data for segment ' + (path.incompleteIdx[0] + 1) + ' (' + segs[path.incompleteIdx[0]].type + ')');
      }
      path.details.forEach(function (d) { if (d.inconsistent) issue('warning', 'Segment ' + (d.index + 1) + ': entered rise and angle disagree by more than 1 degree; the rise was used.'); });
      if (inp.layout === 'multi') issue('info', 'Multi-conveyor layout: only the single chained route you entered is calculated. Parallel lines, merges and transfers need engineering review.');
      if (inp.layout === 'custom') issue('info', 'Custom layout: path length is calculated from the segments you entered; anything else needs engineering review.');
    } else {
      out.path = null;
      out.missing.push(inp.layout === 'straight' || !inp.layout ? 'Total route length (straight conveyor)' : 'Route segments (lengths, curve angles/radii, incline data)');
    }

    /* --- route vs floor, obstacles, end point, heights --- */
    out.fit = { status: 'unknown', detail: null };
    if (out.path && haveFloor) {
      var pb = out.path.bbox, bw = pb.maxX - pb.minX, bh = pb.maxY - pb.minY, eps = 1e-6;
      var inside = pb.minX >= -eps && pb.minY >= -eps && pb.maxX <= fl + eps && pb.maxY <= fw + eps;
      if (placement === 'auto') inside = bw <= fl + eps && bh <= fw + eps;
      out.fit = { status: inside ? 'fits' : 'does_not_fit', detail: round(bw, 2) + ' m x ' + round(bh, 2) + ' m route footprint vs ' + round(fl, 2) + ' m x ' + round(fw, 2) + ' m floor', footprint: { w: round(bw, 3), h: round(bh, 3) } };
      if (!inside) issue('error', 'The route footprint (' + round(bw, 2) + ' x ' + round(bh, 2) + ' m, centre-line only) does not fit inside the available floor (' + round(fl, 2) + ' x ' + round(fw, 2) + ' m). Shorten the route, change the layout, or move the start point.');
      else if (out.path.complete) issue('info', 'Route centre-line fits within the entered floor. Conveyor width, drive/idler overhang, guards and access clearance are not included.');
    }
    out.collisions = [];
    if (out.path && inp.obstacles && inp.obstacles.length) {
      inp.obstacles.forEach(function (o, idx) {
        if (!num(o.x) || !num(o.y) || !num(o.w) || !num(o.d)) return;
        var hit = out.path.points.some(function (p) { return p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.d; });
        if (hit) { out.collisions.push(o.name || ('Obstacle ' + (idx + 1))); issue('error', 'The proposed route passes through "' + (o.name || 'Obstacle ' + (idx + 1)) + '". Move the start point, change the layout, or relocate the obstacle.'); }
      });
    }
    if (out.path && num(inp.endX) && num(inp.endY)) {
      var dd = Math.hypot(out.path.end.x - inp.endX, out.path.end.y - inp.endY);
      out.endCheck = { distance: round(dd, 2) };
      if (dd > Math.max(0.25, 0.02 * (out.path.total || 1))) issue('warning', 'The calculated route ends ' + round(dd, 2) + ' m from your entered end point. Adjust the segments or the end point.');
    }
    if (heightDiff !== null) {
      if (out.path && out.path.netRise === 0 && Math.abs(heightDiff) > 0.05) issue('warning', 'Inlet and discharge heights differ by ' + round(Math.abs(heightDiff) * 1000, 0) + ' mm but no incline segment is defined. Add an incline/decline segment or confirm the heights.');
      else if (out.path && Math.abs(out.path.netRise - heightDiff) > 0.05) issue('warning', 'Net rise from the route (' + round(out.path.netRise * 1000, 0) + ' mm) differs from discharge minus inlet height (' + round(heightDiff * 1000, 0) + ' mm).');
    }
    if (num(inp.workingHeight) && num(inp.inletHeight) && num(inp.dischargeHeight)) {
      var topM = Math.max(inp.inletHeight, inp.dischargeHeight) + (num(inp.prodHeight) ? inp.prodHeight : 0);
      if (out.path) topM = Math.max(topM, inp.inletHeight + out.path.netRise * 1000 + (num(inp.prodHeight) ? inp.prodHeight : 0));
      if (topM > inp.workingHeight) issue('warning', 'Highest conveying surface plus product height (about ' + round(topM, 0) + ' mm) exceeds the available working height (' + round(inp.workingHeight, 0) + ' mm). Structure thickness is not included.');
    }

    /* --- product / throughput (F5-F8) --- */
    var along = null;
    if (num(inp.prodLength) && num(inp.prodWidth)) along = inp.orientation === 'width_leading' ? inp.prodWidth : inp.prodLength;
    var across = null;
    if (num(inp.prodLength) && num(inp.prodWidth)) across = inp.orientation === 'width_leading' ? inp.prodLength : inp.prodWidth;
    var lanes = num(inp.lanes) ? inp.lanes : 1;
    if (!num(inp.lanes)) out.assumptions.push('1 lane assumed (not specified).');
    var ratePerMin = null;
    if (num(inp.rate)) ratePerMin = inp.rateUnit === 'per_hour' ? inp.rate / 60 : inp.rate;
    out.throughput = { ratePerMin: round(ratePerMin, 3), ratePerHour: round(ratePerMin === null ? null : ratePerMin * 60, 1), lanes: lanes, status: STATUS.CUSTOMER };
    if (along !== null) {
      var gap = num(inp.gap) ? inp.gap : 0;
      if (!num(inp.gap)) { out.assumptions.push('Product gap not entered: a zero gap is assumed for the minimum-speed figure, which is the theoretical lower bound.'); out.missing.push('Gap between products (mm)'); }
      var pitchMm = along + gap;                                       // F5
      out.throughput.productPitchMm = round(pitchMm, 1);
      out.throughput.acrossMm = across;
      if (ratePerMin !== null) {
        var vReq = (ratePerMin / lanes) * pitchMm / 1000;              // F6
        out.throughput.requiredSpeed = round(vReq, 3);
        out.throughput.requiredSpeedStatus = STATUS.CALC;
      }
      if (num(inp.speed)) {
        var cap = lanes * inp.speed * 1000 / pitchMm;                  // F7
        out.throughput.capacityPerMin = round(cap, 2);
        out.throughput.capacityStatus = STATUS.CALC;
        if (ratePerMin !== null) {
          out.throughput.utilisation = round(ratePerMin / cap, 3);
          if (ratePerMin > cap + 1e-9) issue('error', 'At ' + round(inp.speed, 2) + ' m/min the conveyor can carry about ' + round(cap, 1) + ' products/min, below the required ' + round(ratePerMin, 1) + '/min. Increase speed, lanes or reduce the gap.');
        }
        if (P.engineering.maxSpeedMPerMin && inp.speed > P.engineering.maxSpeedMPerMin) issue('warning', 'Requested speed exceeds the configured maximum for this product family.');
      } else if (ratePerMin !== null) out.assumptions.push('Conveying speed not entered; the required speed shown is the minimum to meet throughput at the stated spacing.');
      if (out.path && out.path.total > 0) {
        var count = lanes * Math.floor(out.path.total * 1000 / pitchMm);   // F8
        out.throughput.unitsOnConveyor = count;
        if (num(inp.weight)) {
          out.throughput.liveLoadKg = round(count * inp.weight, 2);
          out.throughput.liveLoadStatus = STATUS.CALC;
          out.throughput.loadPerMetreKg = round(lanes * inp.weight * 1000 / pitchMm, 3);
        }
        var accumulating = inp.accumulation && inp.accumulation !== 'none';
        if (accumulating) {
          var w = num(inp.maxWeight) ? inp.maxWeight : inp.weight;
          if (num(w)) {
            var packed = lanes * Math.floor(out.path.total * 1000 / along);
            out.throughput.accumulationLoadKg = round(packed * w, 1);
            out.throughput.accumulationNote = 'Worst case: full conveyor, product touching (no gap).';
            issue('info', 'Accumulation requested: worst-case load with product touching is about ' + round(packed * w, 0) + ' kg over the route. Accumulation friction and drive sizing need engineering review.');
          }
        }
      }
    } else {
      out.missing.push('Product length and width');
    }
    if (num(inp.hoursPerDay) && ratePerMin !== null) {
      out.throughput.perDay = Math.round(ratePerMin * 60 * inp.hoursPerDay);
      out.throughput.perDayNote = 'At the stated rate for ' + inp.hoursPerDay + ' running hours per day.';
    }
    if (!num(inp.weight)) out.missing.push('Product weight');
    if (!num(inp.speed) && ratePerMin === null) out.missing.push('Required throughput or conveying speed');
    if (out.path && num(inp.speed) && out.path.total > 0) out.throughput.transitTimeSec = round(out.path.total / inp.speed * 60, 1);

    /* --- recommendation --- */
    out.recommendation = recommend(inp, geo, P);
    out.recommendation.issues.forEach(function (i) { issue(i.level, i.msg); });
    var sel = out.recommendation.selected;

    /* --- belt / chain width --- */
    out.width = { status: STATUS.REVIEW };
    if (across !== null) {
      var env = lanes * across;
      out.width.productEnvelopeMm = round(env, 1);
      out.width.envelopeNote = lanes + ' lane(s) x ' + round(across, 1) + ' mm across the belt; product only, no guides or side clearance.';
      var allowance = P.engineering.widthAllowancePerSideMm;
      var fams = (sel.families || []).map(function (f) { return P.families[f]; }).filter(Boolean);
      if (allowance !== null && allowance !== undefined) { out.width.minimumWidthMm = round(env + 2 * allowance, 1); out.width.status = STATUS.CONFIG; }
      else { out.width.status = STATUS.REVIEW; out.width.note = 'Side clearance and guide allowance are not configured; Ultraplast engineering must confirm the usable width.'; }
      out.width.candidateFamilies = fams.map(function (f) {
        var okw = !f.widthMm || (env <= f.widthMm.max.value);
        return { label: f.label, publishedRangeMm: f.widthMm ? [f.widthMm.min.value, f.widthMm.max.value] : null, envelopeWithinRange: okw };
      });
      if (num(inp.beltWidth)) {
        out.width.entered = inp.beltWidth; out.width.enteredStatus = STATUS.CUSTOMER;
        if (inp.beltWidth < env) issue('error', 'Entered conveyor width (' + round(inp.beltWidth, 0) + ' mm) is narrower than the product envelope (' + round(env, 0) + ' mm for ' + lanes + ' lane(s)).');
        else if (inp.beltWidth < env * 1.0 + 1) issue('warning', 'Conveyor width equals the product envelope - there is no room for guide rails or side clearance.');
        out.width.candidateFamilies.forEach(function (c) {
          if (c.publishedRangeMm && (inp.beltWidth < c.publishedRangeMm[0] || inp.beltWidth > c.publishedRangeMm[1])) issue('warning', 'Entered width ' + round(inp.beltWidth, 0) + ' mm is outside the published reference range (' + c.publishedRangeMm[0] + '-' + c.publishedRangeMm[1] + ' mm) for "' + c.label + '".');
        });
      } else out.missing.push('Conveyor width (engineering to confirm)');
    }

    /* --- side-flex minimum radius check --- */
    out.radiusChecks = [];
    if (out.path) {
      var curves = out.path.details.filter(function (d) { return d.type === 'curve'; });
      curves.forEach(function (c) {
        var famIds = sel.families || [], limit = null, why = null;
        famIds.forEach(function (fid) {
          var f = P.families[fid]; if (!f || !f.minSideFlexRadius) return;
          var m = f.minSideFlexRadius, lim = null;
          if (m.fixedMm) lim = m.fixedMm.value;
          else if (m.factorOfWidth && num(inp.beltWidth)) lim = m.factorOfWidth.value * inp.beltWidth;
          if (lim !== null) {
            var matches = (inp.material === 'ss304' && fid === 'ss_tab_flex') || (inp.material !== 'ss304' && fid === 'side_flex_plastic') || famIds.length === 1;
            if (matches) { limit = lim; why = f.label; }
          }
        });
        var rMm = c.radius * 1000;
        if (limit !== null) {
          var ok = rMm >= limit;
          out.radiusChecks.push({ segment: c.index + 1, radiusMm: round(rMm, 0), limitMm: round(limit, 0), ok: ok, family: why });
          if (!ok) issue('error', 'Segment ' + (c.index + 1) + ': curve radius ' + round(rMm, 0) + ' mm is below the published minimum side-flex radius (about ' + round(limit, 0) + ' mm) for ' + why + '. Increase the radius.');
          else issue('info', 'Segment ' + (c.index + 1) + ': radius ' + round(rMm, 0) + ' mm vs published minimum about ' + round(limit, 0) + ' mm. The published figure does not say whether it is inside, centre or outside radius - verify.');
        } else {
          out.radiusChecks.push({ segment: c.index + 1, radiusMm: round(rMm, 0), limitMm: null, ok: null });
          issue('warning', 'Segment ' + (c.index + 1) + ': no verified minimum radius is configured for "' + sel.name + '" with the selected material/width - engineering review required.');
        }
      });
    }

    /* --- belt / chain loop (F9, F10) --- */
    out.loop = { status: STATUS.REVIEW, applicable: sel.kind === 'belt' || sel.kind === 'chain', needs: [] };
    if (!out.loop.applicable) { out.loop.note = 'Not applicable to ' + sel.name + ' (no endless belt or chain).'; out.loop.status = null; }
    else {
      var simple = out.path && out.path.complete && out.path.segmentCount === 1 && out.path.details[0].type === 'straight' && !geo.hasCurve && !geo.hasIncline;
      var D = num(inp.pulleyDia) ? inp.pulleyDia : null, Dsrc = D !== null ? 'entered' : null;
      if (D === null && num(inp.pitch) && num(inp.sprocketTeeth) && inp.sprocketTeeth >= 3) { D = inp.pitch / Math.sin(Math.PI / inp.sprocketTeeth); Dsrc = 'calculated from pitch and teeth (F10)'; }
      var C = num(inp.centreDistance) ? inp.centreDistance : (out.path ? out.path.total : null);
      var Csrc = num(inp.centreDistance) ? 'entered' : 'assumed equal to route length';
      if (!simple) out.loop.needs.push('Simple straight, flat, two-pulley geometry (curves, inclines and multi-segment routes need geometry-specific calculation).');
      if (D === null) out.loop.needs.push('Pulley / sprocket diameter, or belt pitch + sprocket teeth');
      if (C === null) out.loop.needs.push('Centre distance or route length');
      if (simple && D !== null && C !== null) {
        var Lb = 2 * C + Math.PI * D / 1000;                           // F9 (C in m, D in mm)
        out.loop = { applicable: true, status: STATUS.CALC, loopLengthM: round(Lb, 3), centreDistanceM: round(C, 3), diameterMm: round(D, 1), diameterSource: Dsrc, centreSource: Csrc, routeLengthM: round(out.path.total, 3), needs: [],
          formula: 'Loop length = 2 x centre distance + pi x pulley diameter (simplified two-equal-pulley horizontal geometry only)' };
        if (num(inp.pitch)) {
          out.loop.pitchRowsMin = Math.ceil(Lb * 1000 / inp.pitch);
          out.loop.pitchRowsNote = 'Minimum pitch rows = loop length / pitch, rounded up. Real belts are built in whole modules/links; final count per engineering.';
        } else out.loop.needs.push('Belt / chain pitch (to convert length into pitch rows)');
        out.assumptions.push('Belt loop: centre distance is ' + Csrc + '; pulley/sprocket diameter ' + Dsrc + '. Return-way support, take-up and catenary allowance are not included.');
        issue('info', 'Running belt/chain loop length (' + round(Lb, 2) + ' m) is different from the conveyor route length (' + round(out.path.total, 2) + ' m).');
      } else {
        out.loop.note = 'Belt/chain quantity cannot be estimated yet.';
        out.loop.routeLengthM = out.path ? round(out.path.total, 3) : null;
        out.missing.push('Belt/chain quantity inputs: ' + out.loop.needs.join('; '));
      }
    }

    /* --- engineering-only items --- */
    var base = [];
    if (!num(inp.speed) && !out.throughput.requiredSpeed) base.push('conveying speed');
    if (!num(inp.weight)) base.push('product weight');
    if (!out.path || !out.path.complete) base.push('complete route geometry');
    out.engineering = [
      ['Motor power and drive selection', ['conveying speed', 'total load incl. belt/chain self-weight', 'friction coefficient (belt/chain vs wear strip)', 'incline/accumulation duty', 'drive efficiency, service factor, duty cycle', 'electrical supply']],
      ['Torque and shaft dimensions', ['drive power and speed', 'sprocket/pulley size', 'bearing spacing', 'overhung loads']],
      ['Belt tension and belt/chain strength', ['verified tension rating of the exact belt/chain', 'effective pull from friction and incline', 'safety factor', 'temperature and wear allowance']],
      ['Sprocket / pulley selection', ['verified sprocket tooth count and bore data', 'drive layout', 'belt width and pitch']],
      ['Roller pitch / spacing (roller conveyors)', ['minimum product base length', 'product weight and stiffness']],
      ['Structure, legs and load capacity', ['verified frame section capacity', 'support spacing', 'floor condition', 'dynamic loads']],
      ['Return supports and wear strips', ['belt/chain construction', 'return-way geometry', 'wear-strip layout']]
    ].map(function (r) { return { item: r[0], status: STATUS.REVIEW, requires: r[1] }; });

    /* --- equipment list (rule based; not every item is included) --- */
    var eq = out.equipment, kind = sel.kind;
    var eng = P.engineering;
    var pathTotal = out.path ? out.path.total : null;
    var straightLen = out.path ? out.path.straight : null;
    function add(item, qty, unit, basis, status) { eq.push({ item: item, qty: qty, unit: unit || null, basis: basis, status: status }); }
    var moduleQty = (eng.moduleLengthMm && straightLen) ? Math.ceil(straightLen * 1000 / eng.moduleLengthMm) : null;
    add('Conveyor frame / modules', moduleQty !== null ? moduleQty : 'To be engineered', moduleQty !== null ? 'modules' : null,
      moduleQty !== null ? 'Straight length / configured module length.' : 'Standard module length is not configured; frame count depends on detailed design.', moduleQty !== null ? STATUS.CONFIG : STATUS.REVIEW);
    if (kind === 'belt' || kind === 'chain') {
      if (out.loop.status === STATUS.CALC) add(kind === 'belt' ? 'Belt' : 'Chain', out.loop.loopLengthM, 'm (loop)', 'Two-pulley formula F9; excludes take-up / return-way allowance.', STATUS.CALC);
      else add(kind === 'belt' ? 'Belt' : 'Chain', 'To be engineered', null, 'Loop length needs: ' + (out.loop.needs.join('; ') || 'more data'), STATUS.REVIEW);
      add('Sprockets / pulleys and shafts', 'To be engineered', null, 'Depends on selected belt/chain and drive layout.', STATUS.REVIEW);
      add('Return supports and wear strips', 'To be engineered', null, 'Depends on belt/chain construction and return-way geometry.', STATUS.REVIEW);
    }
    if (kind === 'roller') add('Rollers', 'To be engineered', null, 'Roller pitch and diameter depend on product base length and weight.', STATUS.REVIEW);
    if (sel.powered) {
      var drv = num(inp.drives) ? inp.drives : null;
      add('Drive assembly and motor', drv !== null ? drv + ' (customer-stated)' : 'To be engineered', drv !== null ? 'drive(s)' : null, 'Motor/gearbox size cannot be derived from floor or route data alone.', STATUS.REVIEW);
    }
    var guideNeeded = inp.guideRails || lanes > 1 || inp.fragility === 'high';
    if (guideNeeded && pathTotal) add('Guide rails', round(2 * pathTotal, 1), 'm (both sides)', 'Both sides along the whole route; brackets and lane dividers extra. ' + (inp.guideRails ? 'Requested.' : 'Suggested for multiple lanes / fragile product.'), STATUS.CALC);
    else if (guideNeeded) add('Guide rails', 'To be engineered', null, 'Requested or suggested; length needs a defined route.', STATUS.REVIEW);
    add('Legs and support stands', eng.legSpacingMm && pathTotal ? Math.ceil(pathTotal * 1000 / eng.legSpacingMm) + 1 : 'To be engineered', null, eng.legSpacingMm ? 'Route length / configured spacing + 1.' : 'Leg spacing is not configured; depends on load and frame.', eng.legSpacingMm ? STATUS.CONFIG : STATUS.REVIEW);
    if (out.path) {
      var cur = out.path.details.filter(function (d) { return d.type === 'curve'; });
      if (cur.length) add('Curve sections', cur.length, 'curve(s)', cur.map(function (c) { return round(c.angle, 0) + ' deg @ R ' + round(c.radius * 1000, 0) + ' mm'; }).join('; '), STATUS.CALC);
      var inc = out.path.details.filter(function (d) { return d.type === 'incline'; });
      if (inc.length) add('Incline / decline sections', inc.length, 'section(s)', inc.map(function (c) { return round(c.angle, 1) + ' deg over ' + round(c.horizontal, 2) + ' m run'; }).join('; ') + '. Cleats / surface profile to be confirmed.', STATUS.CALC);
    }
    if (num(inp.transfers) && inp.transfers > 0) add('Transfer plates / transfer arrangements', inp.transfers, 'transfer(s)', 'Number of transfer points entered by customer.', STATUS.CUSTOMER);
    if (inp.feeding === 'automated' || inp.discharge === 'automated' || (inp.accumulation && inp.accumulation !== 'none') || inp.upstream || inp.downstream) add('Sensors and controls', 'To be engineered', null, 'Suggested because of automated handling, accumulation or connected machines. Count depends on control philosophy.', STATUS.REVIEW);
    if (inp.guarding && inp.guarding !== 'none') add('Guards and safety accessories', 'To be engineered', null, 'Guarding level requested: ' + inp.guarding + '. Risk assessment required.', STATUS.REVIEW);
    if (inp.washdown && inp.washdown !== 'none' || inp.foodContact === 'direct') add('Hygienic / washdown construction', 'To be engineered', null, 'Materials, IP rating and drainage need specification.', STATUS.REVIEW);
    add('Installation and commissioning', 'Optional - to be quoted', null, 'Scope not assumed.', STATUS.REVIEW);

    /* --- assumptions, exclusions, next steps --- */
    out.assumptions.push('Metric internal calculation; imperial inputs are converted.');
    out.assumptions.push('Route lengths are centre-line lengths; conveyor width, end overhang, guards, access and maintenance clearances are not included.');
    out.assumptions.push('Published Ultraplast specifications are used as reference only and are unverified in this tool.');
    if (placement === 'auto' && out.path) out.assumptions.push('Start point not entered: the route was placed automatically at the floor origin (proposed, not confirmed).');
    out.exclusions = ['Prices and quotations', 'Final engineering approval and drawings', 'Motor, gearbox, torque, belt tension, shaft and bearing sizing', 'Structural / floor loading checks', 'Electrical design, controls and safety risk assessment', 'Installation, freight, taxes and commissioning'];
    out.nextSteps = [
      'Review the missing inputs list and add any data you have (drawings help a lot).',
      'Submit the enquiry so Ultraplast can verify the product choice and prepare a detailed design.',
      'Ultraplast confirms belt/chain, drive, structure and accessories, then issues a quotation.',
      'Approve the layout drawing before manufacture.'
    ];
    if (inp.drawingAvailable) out.nextSteps.unshift('Send your floor plan / drawing to Ultraplast with the enquiry.');
    if (out.missing.length === 0) out.missing = [];
    out.missing = out.missing.filter(function (m, i, a) { return a.indexOf(m) === i; });
    if (!inp.electrical) out.missing.push('Available electrical supply (voltage / phase / frequency)');
    if (!inp.material || inp.material === 'unknown') out.missing.push('Belt/chain material (to be confirmed with Ultraplast)');
    out.hasBlockingErrors = out.issues.some(function (i) { return i.level === 'error'; });
    out.summaryStatus = out.hasBlockingErrors ? 'Issues found' : (out.path && out.path.complete ? 'Preliminary results available' : 'Incomplete inputs');
    return out;
  }

  return {
    STATUS: STATUS, FIELD_KINDS: FIELD_KINDS, SEGMENT_KINDS: SEGMENT_KINDS, OBSTACLE_KINDS: OBSTACLE_KINDS, LABELS: LABELS,
    parseNum: parseNum, toMetric: toMetric, fromMetric: fromMetric, weightToKg: weightToKg, round: round,
    normalize: normalize, validate: validate, requiredForStep: requiredForStep,
    buildPath: buildPath, segmentComplete: segmentComplete, segmentsFromInputs: segmentsFromInputs, recommend: recommend, analyse: analyse
  };
});
