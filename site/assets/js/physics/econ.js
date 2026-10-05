// Capacity factor and levelized cost of energy (LCOE).

/** Capacity factor: energy actually produced ÷ energy at full nameplate output all the time. */
export const capacityFactor = (energyMWh, capacityMW, hours = 8760) => energyMWh / (capacityMW * hours);

/** Annual energy (MWh) from nameplate capacity (MW) and capacity factor. */
export const annualEnergyMWh = (capacityMW, cf, hours = 8760) => capacityMW * cf * hours;

/** Capital recovery factor: turns an up-front cost into an equal annual payment over n years at rate r. */
export const capitalRecoveryFactor = (r, n) => (r === 0 ? 1 / n : (r * (1 + r) ** n) / ((1 + r) ** n - 1));

/**
 * LCOE in $/MWh with the annuity method:
 *   LCOE = (CAPEX·CRF + fixed O&M) / (8.76·CF) + variable O&M + fuel
 * capex in $/kW, fixedOM in $/kW-year, varOM and fuel in $/MWh, cf as a fraction,
 * r as a fraction (real discount rate), n in years. 8.76·CF is MWh produced per kW per year.
 */
export function lcoe({ capex, fixedOM = 0, varOM = 0, fuel = 0, cf, r, n }) {
  return (capex * capitalRecoveryFactor(r, n) + fixedOM) / (8.76 * cf) + varOM + fuel;
}

/**
 * LCOE from explicit yearly cash flows: Σ cost_t/(1+r)^t ÷ Σ energy_t/(1+r)^t.
 * costs[0] and energy[0] are year 0 (construction). Equivalent to lcoe() for level annual values.
 */
export function lcoeDiscounted(costs, energy, r) {
  let c = 0; let e = 0;
  for (let t = 0; t < Math.max(costs.length, energy.length); t++) {
    const d = (1 + r) ** t;
    c += (costs[t] ?? 0) / d; e += (energy[t] ?? 0) / d;
  }
  return c / e;
}

/** Wright's law: cost after cumulative production grows by `doublings`, with learning rate LR (e.g. 0.2 = 20 % per doubling). */
export const wrightsLaw = (c0, learningRate, doublings) => c0 * (1 - learningRate) ** doublings;

/** Learning rate implied by two (cumulative production, cost) points. */
export const impliedLearningRate = (q0, c0, q1, c1) => 1 - 2 ** (Math.log(c1 / c0) / Math.log(q1 / q0));
