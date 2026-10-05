// LCOE helpers for the comparison dashboard's LCOE lab: the cost split into
// capital, fixed O&M, variable O&M and fuel, full-load hours, and the discount
// rate that reproduces a published LCOE. Builds on econ.js (not a copy of it).

import { lcoe, capitalRecoveryFactor } from './econ.js';

/** Hours per year at nameplate output that give the same energy: CF × 8760. */
export const fullLoadHours = (cf, hours = 8760) => cf * hours;

/**
 * LCOE split into parts, all in $/MWh. Inputs as for econ.lcoe:
 * capex $/kW, fixedOM $/kW-yr, varOM and fuel $/MWh, cf fraction, r real discount rate, n years.
 * The parts add up to econ.lcoe(p).
 */
export function lcoeBreakdown(p) {
  const mwhPerKw = 8.76 * p.cf;
  const capital = (p.capex * capitalRecoveryFactor(p.r, p.n)) / mwhPerKw;
  const fixedOM = (p.fixedOM ?? 0) / mwhPerKw;
  const varOM = p.varOM ?? 0;
  const fuel = p.fuel ?? 0;
  return { capital, fixedOM, varOM, fuel, total: lcoe(p) };
}

/**
 * The discount rate r at which econ.lcoe(p with r) equals target ($/MWh), by bisection on [lo, hi].
 * LCOE rises monotonically with r, so the root is unique. Returns NaN when the target lies outside
 * the LCOE reachable in that interval.
 */
export function impliedDiscountRate(p, target, lo = 0, hi = 0.5) {
  const f = (r) => lcoe({ ...p, r }) - target;
  if (f(lo) > 0 || f(hi) < 0) return NaN;
  for (let i = 0; i < 100; i++) {
    const m = (lo + hi) / 2;
    if (f(m) < 0) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}
