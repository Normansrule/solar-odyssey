// Exact SI defining constants (2019 SI redefinition) and a few derived values.
export const H = 6.62607015e-34;      // Planck constant, J·s (exact)
export const C = 299792458;           // speed of light, m/s (exact)
export const Q = 1.602176634e-19;     // elementary charge, C (exact)
export const KB = 1.380649e-23;       // Boltzmann constant, J/K (exact)
export const SIGMA = 5.670374419e-8;  // Stefan–Boltzmann constant, W/(m²·K⁴)
export const G0 = 9.80665;            // standard gravity, m/s² (exact by definition)
export const EV = Q;                  // one electronvolt in joules
export const HC_EV_NM = (H * C) / Q * 1e9; // h·c in eV·nm, ≈ 1239.842
export const T_SUN = 5772;            // Sun's nominal effective temperature, K (IAU 2015 Resolution B3)
// Sun's solid angle seen from Earth divided by π: (R_sun / 1 au)²
export const SUN_DILUTION = (6.957e8 / 1.495978707e11) ** 2;
