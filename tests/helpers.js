'use strict';
// Tiny dependency-free test harness (no npm install needed).
var passed = 0, failed = 0, failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL  ' + name + '\n        ' + (e && e.message)); }
}
function approx(a, b, tol, msg) {
  tol = tol === undefined ? 1e-3 : tol;
  if (typeof a !== 'number' || isNaN(a) || Math.abs(a - b) > tol) throw new Error((msg || 'approx') + ': expected ' + b + ' +/- ' + tol + ', got ' + a);
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'eq') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function summary() { console.log('\n' + passed + ' passed, ' + failed + ' failed'); return failed; }
module.exports = { test: test, approx: approx, ok: ok, eq: eq, summary: summary };
