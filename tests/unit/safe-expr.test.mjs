import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calc, parse, variablesOf, ExprError } from '../../site/assets/js/safe-expr.js';

test('arithmetic, precedence and associativity', () => {
  assert.equal(calc('1 + 2 * 3'), 7);
  assert.equal(calc('(1 + 2) * 3'), 9);
  assert.equal(calc('2^3^2'), 512);
  assert.equal(calc('-2^2'), -4);
  assert.equal(calc('2^-1'), 0.5);
  assert.equal(calc('2**3'), 8);
  assert.equal(calc('6 ÷ 3 × 2 − 1'), 3);
  assert.equal(calc('1.5e3 + .5'), 1500.5);
});

test('functions, constants and variables', () => {
  assert.ok(Math.abs(calc('sin(pi/2)') - 1) < 1e-12);
  assert.equal(calc('max(1, 4, 2)'), 4);
  assert.equal(calc('0.5 * rho * A * v^3', { rho: 1.225, A: 1, v: 10 }), 612.5);
  assert.deepEqual([...variablesOf(parse('0.5*rho*A*v^3 + pi'))].sort(), ['A', 'rho', 'v']);
});

test('rejects anything that is not arithmetic', () => {
  for (const bad of [
    'alert(1)', 'constructor', 'x.constructor', '__proto__', 'this', 'window', 'globalThis.fetch',
    '1; 2', '"a"', '`x`', '[1]', '{}', 'a=1', 'eval("1")', 'Function("x")', '(1', '1)', '', '1 +',
    'toString()', 'valueOf', 'hasOwnProperty(1)',
  ]) {
    assert.throws(() => calc(bad, {}), ExprError, bad);
  }
});

test('prototype names are not reachable as variables', () => {
  assert.throws(() => calc('toString'), ExprError);
  assert.throws(() => calc('x', { x: 'a string' }), ExprError);
});

test('limits length and nesting', () => {
  assert.throws(() => calc('1+'.repeat(300) + '1'), ExprError);
  assert.throws(() => calc('('.repeat(100) + '1' + ')'.repeat(100)), ExprError);
});
