// Fuzzing the formula evaluator used by the equation playground. Every input must
// either evaluate to a number or throw ExprError: never another exception, never a
// non-number, never a side effect, never a hang. The corpus runs in a worker thread
// with a hard deadline, so an infinite loop fails the test instead of stalling it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

const EXPR = new URL('../../site/assets/js/safe-expr.js', import.meta.url).href;

// Known JavaScript escape attempts and parser edge cases.
const ESCAPES = [
  'constructor', 'constructor.constructor("return this")()', 'x.constructor', 'x["constructor"]', '__proto__', '__proto__.x',
  'toString', 'toString()', 'valueOf()', 'hasOwnProperty("x")', 'isPrototypeOf(x)', 'propertyIsEnumerable(1)',
  'sin.constructor', 'sin["constructor"]("alert(1)")()', 'sin.call(null,1)', 'sin.apply', 'max.bind', 'pow.length', 'abs.name',
  'Math.sin(1)', 'Math', 'this', 'globalThis', 'window', 'self', 'document', 'process', 'require("fs")', 'import("x")',
  'eval("1")', 'Function("return 1")()', 'new Function', 'alert(1)', 'fetch("//evil")', 'setTimeout("1")',
  'a=1', 'a==1', 'a=>1', '()=>1', 'x?1:2', 'x||1', 'x&&1', '!x', '~1', '1|2', '1&2', '1<<2', '1>>>2', '1%2', '1,2', '(1,2)',
  '"1"', "'1'", '`${1}`', '[1]', '{}', '{a:1}', '1;2', '1\n;2', '//1', '/*1*/', '<!--', '-->', '\\u0061', ' ', '\u0000',
  'ｓｉｎ(1)', 'sin​(1)', 'pí', 'ln(e)', 'deg(rad(180))', 'min()', 'max()', 'pow()', 'sqrt()', 'sin(1,2,3)',
  '1e999', '-1e999', '1e-999', '0/0', '1/0', '9'.repeat(400), '.', '..1', '1..2', '1.2.3', 'e', 'e1', '1e', '1e+', '1E5',
  '((((((((((1))))))))))', '-'.repeat(70) + '1', '+'.repeat(70) + '1', '2^'.repeat(70) + '2', 'sin('.repeat(70) + '1' + ')'.repeat(70),
  '1+'.repeat(249) + '1', '1*'.repeat(249) + '1', 'max(' + '1,'.repeat(240) + '1)', 'x'.repeat(500), 'x'.repeat(501),
  '(', ')', '()', ',', '^', '**', '***', '2***3', '×', '÷1', '−−1', '·', '', ' ', '\t\n', '1 2', 'sin 1', 'pi(1)', 'x(1)',
];

const worker = `
import { workerData, parentPort } from 'node:worker_threads';
const { calc, parse, evaluate, variablesOf, ExprError } = await import(workerData.expr);
// Deterministic PRNG (mulberry32) so failures are reproducible.
let seed = workerData.seed >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const TOKENS = ['1', '0', '2.5', '.5', '1e3', '1e-3', '9e999', 'x', 'y', 'rho', 'pi', 'e', 'sin', 'cos', 'sqrt', 'ln', 'log10', 'pow', 'max',
  'min', 'deg', 'rad', 'abs', '(', ')', '(', ')', ',', '+', '-', '*', '/', '^', '**', '×', '÷', '−', '·', ' ', '.', '[', ']', '{', '}', '"', "'",
  '\`', '=', ';', '!', '?', ':', '<', '>', '&', '|', '%', '#', '@', '$', '\\\\', 'constructor', '__proto__', 'toString', 'valueOf', 'prototype',
  'this', 'alert', 'eval', 'Function', 'Math', '\\u0000', '\\n', 'é', '😀', 'NaN', 'Infinity', 'undefined', 'null', 'true'];
const VARS = [{}, { x: 2, y: -3, rho: 1.225 }, Object.assign(Object.create(null), { x: 0, y: 0 }), { x: NaN, y: Infinity }, { x: 'str' }, { x: () => 1 }];
const failures = [];
let numbers = 0; let errors = 0; let slowest = 0;
function check(src, vars) {
  const t0 = performance.now();
  let kind;
  try {
    const v = calc(src, vars);
    if (typeof v !== 'number') failures.push({ src, why: 'returned ' + typeof v }); else numbers++;
    kind = 'num';
  } catch (e) {
    if (!(e instanceof ExprError)) failures.push({ src, why: (e && e.name) + ': ' + (e && e.message) }); else errors++;
  }
  // parse() alone must also only throw ExprError, and variablesOf must cope with any tree it returns.
  try { const tree = parse(src); variablesOf(tree); } catch (e) { if (!(e instanceof ExprError)) failures.push({ src, why: 'parse ' + e.name }); }
  slowest = Math.max(slowest, performance.now() - t0);
}
for (const src of workerData.escapes) for (const vars of VARS) check(src, vars);
for (let i = 0; i < workerData.iterations; i++) {
  const len = 1 + Math.floor(rnd() * (rnd() < 0.1 ? 200 : 24));
  let src = '';
  for (let k = 0; k < len; k++) src += pick(TOKENS) + (rnd() < 0.3 ? ' ' : '');
  check(src, pick(VARS));
  // Random characters, including astral and control code points.
  let raw = '';
  for (let k = 0; k < 1 + Math.floor(rnd() * 30); k++) raw += String.fromCodePoint(Math.floor(rnd() * (rnd() < 0.8 ? 128 : 0x1ffff)));
  check(raw, pick(VARS));
}
// Well-formed expressions from a small grammar, so evaluation (not just parsing) is exercised.
const FN = ['sin', 'cos', 'tan', 'sqrt', 'exp', 'ln', 'log10', 'abs', 'floor', 'deg', 'rad'];
const gen = (d) => {
  const r = rnd();
  if (d > 6 || r < 0.3) return pick(['1', '2.5', '.5', '3e2', '1e-4', 'x', 'y', 'rho', 'pi', 'e', '0']);
  if (r < 0.55) return gen(d + 1) + pick([' + ', '-', ' * ', '/', '^', '**', '×', '÷', '−']) + gen(d + 1);
  if (r < 0.7) return '(' + gen(d + 1) + ')';
  if (r < 0.8) return pick(['-', '+', '−']) + gen(d + 1);
  if (r < 0.92) return pick(FN) + '(' + gen(d + 1) + ')';
  return pick(['max', 'min', 'pow']) + '(' + gen(d + 1) + ', ' + gen(d + 1) + ')';
};
const GOOD = { x: 2, y: -3, rho: 1.225 };
for (let i = 0; i < workerData.iterations; i++) {
  const src = gen(0);
  if (src.length > 500) continue;
  try { const v = calc(src, GOOD); if (typeof v !== 'number') failures.push({ src, why: 'returned ' + typeof v }); else numbers++; }
  catch (e) { failures.push({ src, why: 'well-formed input threw ' + (e && e.name) + ': ' + (e && e.message) }); }
}
// Non-string input
for (const bad of [null, undefined, 1, {}, [], { toString: () => '1' }]) {
  try { calc(bad); failures.push({ src: String(bad), why: 'accepted non-string' }); } catch (e) { if (!(e instanceof ExprError)) failures.push({ src: String(bad), why: e.name }); }
}
parentPort.postMessage({ failures: failures.slice(0, 20), nFail: failures.length, numbers, errors, slowest,
  polluted: Object.prototype.polluted !== undefined || typeof globalThis.alert !== 'undefined' });
`;

function runWorker(data, deadlineMs) {
  return new Promise((resolve, reject) => {
    const w = new Worker(worker, { eval: true, type: 'module', workerData: data });
    const timer = setTimeout(() => { w.terminate(); reject(new Error(`fuzz corpus did not finish within ${deadlineMs} ms (possible hang)`)); }, deadlineMs);
    w.once('message', (m) => { clearTimeout(timer); w.terminate(); resolve(m); });
    w.once('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

test('fuzz: every input evaluates to a number or throws ExprError, quickly', async () => {
  const r = await runWorker({ expr: EXPR, escapes: ESCAPES, iterations: 20000, seed: 0x501a4 }, 60000);
  assert.deepEqual(r.failures, [], `${r.nFail} inputs escaped the contract`);
  assert.equal(r.polluted, false);
  assert.ok(r.numbers > 10000 && r.errors > 1000, `corpus exercised both outcomes (${r.numbers} numbers, ${r.errors} errors)`);
  assert.ok(r.slowest < 250, `slowest single input took ${r.slowest.toFixed(1)} ms`);
});

test('known escape strings are all rejected', async () => {
  const { calc, ExprError } = await import(EXPR);
  const mustReject = ESCAPES.filter((s) => /[A-Za-z_]{2,}\s*[.[(=]|[`'"{}[\];=!?<>&|%~\\]|constructor|__proto__|toString|valueOf|this|window|globalThis|document|process/.test(s)
    && !/^(sin|cos|deg|rad|ln|max|min|pow|sqrt)\(/.test(s));
  assert.ok(mustReject.length > 40);
  for (const s of mustReject) assert.throws(() => calc(s, { x: 1 }), ExprError, s);
});
