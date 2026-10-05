// A small, safe arithmetic evaluator for user-entered formulas.
// It never calls eval/Function: input is tokenised, parsed by recursive descent
// into a tree, and evaluated against a whitelist of operators, functions,
// constants and caller-supplied variables. Anything else is a parse error.

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log10: Math.log10, log2: Math.log2, abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, pow: Math.pow,
  deg: (r) => (r * 180) / Math.PI, rad: (d) => (d * Math.PI) / 180,
};
const CONSTS = { pi: Math.PI, e: Math.E };
const MAX_LEN = 500;
const MAX_DEPTH = 64;

export class ExprError extends Error {}

function tokenize(src) {
  if (typeof src !== 'string') throw new ExprError('formula must be text');
  if (src.length > MAX_LEN) throw new ExprError(`formula is longer than ${MAX_LEN} characters`);
  const tokens = []; let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { tokens.push({ t: 'num', v: parseFloat(num[0]), at: i }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { tokens.push({ t: 'id', v: id[0], at: i }); i += id[0].length; continue; }
    if (src.startsWith('**', i)) { tokens.push({ t: 'op', v: '^', at: i }); i += 2; continue; }
    if ('+-*/^(),×·÷−'.includes(ch)) {
      const v = { '×': '*', '·': '*', '÷': '/', '−': '-' }[ch] ?? ch;
      tokens.push({ t: 'op', v, at: i }); i++; continue;
    }
    throw new ExprError(`unexpected character "${ch}" at position ${i + 1}`);
  }
  return tokens;
}

/** Parse a formula into a tree. Throws ExprError with a readable message. */
export function parse(src) {
  const tk = tokenize(src); let p = 0; let depth = 0;
  const peek = () => tk[p];
  const eat = (v) => { const x = tk[p]; if (!x || x.v !== v) throw new ExprError(`expected "${v}"${x ? ` at position ${x.at + 1}` : ' at the end'}`); p++; return x; };
  const guard = () => { if (++depth > MAX_DEPTH) throw new ExprError('formula is nested too deeply'); };

  function expr() { guard(); let n = term(); while (peek() && (peek().v === '+' || peek().v === '-')) { const op = tk[p++].v; n = { op, a: n, b: term() }; } depth--; return n; }
  function term() { let n = unary(); while (peek() && (peek().v === '*' || peek().v === '/')) { const op = tk[p++].v; n = { op, a: n, b: unary() }; } return n; }
  function unary() { if (peek() && (peek().v === '-' || peek().v === '+')) { const op = tk[p++].v; guard(); const n = unary(); depth--; return op === '-' ? { op: 'neg', a: n } : n; } return power(); }
  function power() { const base = atom(); if (peek() && peek().v === '^') { p++; guard(); const e = unary(); depth--; return { op: '^', a: base, b: e }; } return base; }
  function atom() {
    const x = tk[p++];
    if (!x) throw new ExprError('formula ends too early');
    if (x.t === 'num') return { num: x.v };
    if (x.t === 'id') {
      if (peek() && peek().v === '(') {
        if (!Object.hasOwn(FUNCS, x.v)) throw new ExprError(`unknown function "${x.v}"`);
        p++; const args = [];
        if (peek() && peek().v !== ')') { args.push(expr()); while (peek() && peek().v === ',') { p++; args.push(expr()); } }
        eat(')');
        return { fn: x.v, args };
      }
      return { id: x.v };
    }
    if (x.v === '(') { const n = expr(); eat(')'); return n; }
    throw new ExprError(`unexpected "${x.v}" at position ${x.at + 1}`);
  }
  const tree = expr();
  if (p < tk.length) throw new ExprError(`unexpected "${tk[p].v}" at position ${tk[p].at + 1}`);
  return tree;
}

/** Evaluate a parsed tree with variables { name: number }. */
export function evaluate(tree, vars = {}) {
  const ev = (n) => {
    if ('num' in n) return n.num;
    if ('id' in n) {
      if (Object.hasOwn(vars, n.id)) { const v = vars[n.id]; if (typeof v !== 'number') throw new ExprError(`variable "${n.id}" is not a number`); return v; }
      if (Object.hasOwn(CONSTS, n.id)) return CONSTS[n.id];
      throw new ExprError(`unknown name "${n.id}"`);
    }
    if ('fn' in n) return FUNCS[n.fn](...n.args.map(ev));
    switch (n.op) {
      case '+': return ev(n.a) + ev(n.b);
      case '-': return ev(n.a) - ev(n.b);
      case '*': return ev(n.a) * ev(n.b);
      case '/': return ev(n.a) / ev(n.b);
      case '^': return ev(n.a) ** ev(n.b);
      case 'neg': return -ev(n.a);
      default: throw new ExprError('bad formula tree');
    }
  };
  return ev(tree);
}

/** Parse and evaluate in one go. */
export const calc = (src, vars) => evaluate(parse(src), vars);

/** Names a formula refers to (variables only, not functions or constants). */
export function variablesOf(tree, out = new Set()) {
  if ('id' in tree && !Object.hasOwn(CONSTS, tree.id)) out.add(tree.id);
  for (const k of ['a', 'b']) if (tree[k]) variablesOf(tree[k], out);
  for (const a of tree.args ?? []) variablesOf(a, out);
  return out;
}

export const FUNCTION_NAMES = Object.keys(FUNCS);
