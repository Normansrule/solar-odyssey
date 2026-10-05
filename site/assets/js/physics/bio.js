// Small, pure helpers for the biomass page. Tested in tests/unit/renewables-b.test.mjs.

/** Molar masses (g/mol), IUPAC standard atomic weights (conventional values). */
export const M_C = 12.011;
export const M_CO2 = 44.009;

/** Chemical energy a collector stores in a year (kWh) from annual sunlight (kWh/m²), efficiency (0–1) and area (m²). */
export const storedEnergyKWh = (insolationKWhM2, efficiency, areaM2 = 1) => insolationKWhM2 * efficiency * areaM2;

/** Mass of CO₂ released when a mass of carbon burns completely (kg): each 12 g of carbon becomes 44 g of CO₂. */
export const co2FromCarbonKg = (carbonKg) => carbonKg * (M_CO2 / M_C);

/**
 * Toy carbon bookkeeping for the carbon-loop animation (tonnes of carbon added to the air per cycle).
 * Each cycle burns `burnt` tonnes of carbon. `regrowth` (0–1) is the fraction taken back up by new growth
 * before the next cycle, `captured` (0–1) the fraction captured and stored underground at the chimney (BECCS),
 * `fossil` true when the carbon comes from underground rather than from the air, `debt` a one-off release
 * from clearing land in the first cycle.
 */
export function carbonToAir({ burnt = 1, regrowth = 1, captured = 0, fossil = false, debt = 0, cycles = 1 }) {
  let air = 0; const series = [0];
  for (let k = 0; k < cycles; k += 1) {
    const released = burnt * (1 - captured);
    const uptake = fossil ? 0 : burnt * regrowth;
    air += released - uptake + (k === 0 ? debt : 0);
    series.push(air);
  }
  return { air, series };
}
