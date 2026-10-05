// Learning curves (Wright's law) fitted to data. Pure functions.
// Wright's law: cost = a · Q^(−b), with Q the cumulative quantity. Each doubling of Q
// multiplies cost by 2^(−b), so the learning rate (fractional fall per doubling) is 1 − 2^(−b).

/**
 * Least-squares fit of log2(cost) against log2(cumulative quantity).
 * points: [[quantity, cost], …] with positive values.
 * Returns { learningRate, progressRatio, exponent b, a (cost at Q = 1), r2, n }.
 */
export function fitLearningCurve(points) {
  const xs = []; const ys = [];
  for (const [q, c] of points) if (q > 0 && c > 0) { xs.push(Math.log2(q)); ys.push(Math.log2(c)); }
  const n = xs.length;
  if (n < 2) return { learningRate: NaN, progressRatio: NaN, b: NaN, a: NaN, r2: NaN, n };
  const mx = xs.reduce((s, x) => s + x, 0) / n; const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx; const dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  const slope = sxy / sxx; // log2 cost per doubling
  const intercept = my - slope * mx;
  return { learningRate: 1 - 2 ** slope, progressRatio: 2 ** slope, b: -slope, a: 2 ** intercept, r2: (sxy * sxy) / (sxx * syy), n };
}

/** Cost predicted by a fitted curve at cumulative quantity q. */
export const learningCurveCost = (fit, q) => fit.a * q ** -fit.b;

/** Join two [year, value] series on year: [[x, y, year], …] for years present in both. */
export function joinByYear(xSeries, ySeries) {
  const y = new Map(ySeries);
  return xSeries.filter(([yr]) => y.has(yr)).map(([yr, x]) => [x, y.get(yr), yr]);
}

/** Number of doublings between two quantities: log2(q1 / q0). */
export const doublings = (q0, q1) => Math.log2(q1 / q0);

/** Fractional fall between two values, e.g. 0.89 for a fall from 0.41 to 0.043. */
export const fractionalFall = (from, to) => 1 - to / from;

// Fixed sample for worked examples and tests: world module price (constant 2025 US$/W, OWID)
// against cumulative installed PV capacity (GW, IRENA via OWID), 2000–2024, as published 2026-07-28.
export const SAMPLE_2000_2024 = [
  [1.2214, 6.4959], [1.3320, 6.2844], [1.6317, 5.7473], [2.3430, 5.4638], [3.4274, 4.6955],
  [4.9233, 4.7457], [6.4868, 5.1727], [8.9562, 5.2111], [15.229, 4.7492], [23.544, 3.1743],
  [41.488, 2.5118], [72.658, 2.0609], [102.82, 1.1107], [139.69, 0.8566], [178.85, 0.7905],
  [226.60, 0.7357], [298.51, 0.6803], [392.34, 0.5714], [487.85, 0.5091], [590.12, 0.4669],
  [721.22, 0.3697], [865.92, 0.3319], [1057.9, 0.3658], [1424.0, 0.3218], [1883.2, 0.2652],
];

/** Learning rate fitted to the fixed 2000–2024 sample (for worked examples). */
export const sampleLearningRate = () => fitLearningCurve(SAMPLE_2000_2024).learningRate;
