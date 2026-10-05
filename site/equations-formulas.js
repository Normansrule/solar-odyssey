// Formulas for the equation atlas playground, written in the safe-expr syntax
// (see assets/js/safe-expr.js). Pure data: no DOM, so tests/unit/reference.test.mjs
// imports this file and checks every formula, at its default values, against the
// tested physics modules through `check`.
//
// Each entry: id (matches an #eq-… block on equations.html, or names it in `block`), title, formula,
// tex (for display), vars { name: { label, unit, value } }, result { label, unit },
// check(mods, vars) -> the same quantity computed by site/assets/js/physics/;
// liveCheck: false when check() only holds at the default values.

export const FORMULAS = [
  {
    id: 'eq-photon-energy', title: 'Photon energy', formula: '1239.84198 / lambda',
    tex: 'E = \\frac{hc}{\\lambda}',
    vars: { lambda: { label: 'Wavelength', unit: 'nm', value: 500 } },
    result: { label: 'Photon energy', unit: 'eV' },
    check: (m, v) => m.pv.photonEnergyEV(v.lambda),
  },
  {
    id: 'eq-band-gap', title: 'Band-gap cutoff wavelength', formula: '1239.84198 / Eg',
    tex: '\\lambda_{\\max} = \\frac{hc}{E_g}',
    vars: { Eg: { label: 'Band gap', unit: 'eV', value: 1.12 } },
    result: { label: 'Longest wavelength absorbed', unit: 'nm' },
    check: (m, v) => m.pv.cutoffWavelengthNm(v.Eg),
  },
  {
    id: 'eq-diode', title: 'Single-diode I-V equation (ideal)', formula: 'Iph - I0 * (exp(V / (n * Vt)) - 1)',
    tex: 'I = I_{ph} - I_0\\left(e^{V/(nV_t)} - 1\\right)',
    vars: {
      Iph: { label: 'Light-generated current', unit: 'A', value: 9.72 },
      I0: { label: 'Saturation current', unit: 'A', value: 1.215e-11 },
      V: { label: 'Voltage', unit: 'V', value: 0.6 },
      n: { label: 'Ideality factor', unit: '', value: 1 },
      Vt: { label: 'Thermal voltage at 25 °C', unit: 'V', value: 0.0256926 },
    },
    result: { label: 'Current', unit: 'A' },
    check: (m, v) => m.pv.diodeCurrent(v.V, { Iph: v.Iph, I0: v.I0, n: v.n }),
  },
  {
    id: 'eq-voc', title: 'Open-circuit voltage', formula: 'n * Vt * ln(Iph / I0 + 1)',
    tex: 'V_{oc} = nV_t \\ln\\!\\left(\\frac{I_{ph}}{I_0} + 1\\right)',
    vars: {
      n: { label: 'Ideality factor', unit: '', value: 1 },
      Vt: { label: 'Thermal voltage at 25 °C', unit: 'V', value: 0.0256926 },
      Iph: { label: 'Light-generated current', unit: 'A', value: 9.72 },
      I0: { label: 'Saturation current', unit: 'A', value: 1.215e-11 },
    },
    result: { label: 'Open-circuit voltage', unit: 'V' },
    check: (m, v) => m.pv.idealVoc({ Iph: v.Iph, I0: v.I0, n: v.n }),
  },
  {
    id: 'eq-fill-factor', title: 'Fill factor', formula: 'Pmp / (Voc * Isc)',
    tex: 'FF = \\frac{P_{mp}}{V_{oc}\\, I_{sc}}',
    vars: {
      Pmp: { label: 'Maximum power', unit: 'W', value: 5.7991 },
      Voc: { label: 'Open-circuit voltage', unit: 'V', value: 0.70418 },
      Isc: { label: 'Short-circuit current', unit: 'A', value: 9.72 },
    },
    result: { label: 'Fill factor', unit: '' },
    // The module computes FF from the diode parameters, so it only matches at the default values.
    check: (m) => m.pv.fillFactor({ Iph: 9.72, I0: 1.215e-11 }),
    liveCheck: false,
  },
  {
    id: 'eq-efficiency', title: 'Conversion efficiency', formula: 'Pout / (G * A)',
    tex: '\\eta = \\frac{P_{out}}{G\\,A}',
    vars: {
      Pout: { label: 'Electrical power out', unit: 'W', value: 5.8 },
      G: { label: 'Irradiance', unit: 'W/m²', value: 1000 },
      A: { label: 'Cell area', unit: 'm²', value: 0.0243 },
    },
    result: { label: 'Efficiency (fraction)', unit: '' },
    check: (m, v) => m.pv.efficiency(v.Pout, v.G, v.A),
  },
  {
    id: 'eq-energy-yield', title: 'Energy yield of an array', formula: 'kWp * PSH * PR',
    tex: 'E = P_{STC} \\times PSH \\times PR',
    vars: {
      kWp: { label: 'Array rating', unit: 'kWp', value: 5 },
      PSH: { label: 'Peak sun hours per day', unit: 'h', value: 4.5 },
      PR: { label: 'Performance ratio', unit: '', value: 0.8 },
    },
    result: { label: 'Energy per day', unit: 'kWh' },
    check: (m, v) => m.solar.arrayEnergyKWh(v.kWp, v.PSH, v.PR),
  },
  {
    id: 'eq-air-mass', title: 'Air mass (Kasten and Young)', formula: '1 / (cos(rad(z)) + 0.50572 * (96.07995 - z)^(-1.6364))',
    tex: 'AM = \\frac{1}{\\cos\\theta_z + 0.50572\\,(96.07995 - \\theta_z)^{-1.6364}}',
    vars: { z: { label: 'Solar zenith angle', unit: '°', value: 60 } },
    result: { label: 'Air mass', unit: '' },
    check: (m, v) => m.solar.airMass(v.z),
  },
  {
    id: 'eq-incidence', title: 'Cosine of the angle of incidence',
    formula: 'cos(rad(z)) * cos(rad(tilt)) + sin(rad(z)) * sin(rad(tilt)) * cos(rad(sunAz - panelAz))',
    tex: '\\cos\\theta = \\cos\\theta_z\\cos\\beta + \\sin\\theta_z\\sin\\beta\\cos(\\gamma_s - \\gamma)',
    vars: {
      z: { label: 'Solar zenith angle', unit: '°', value: 50 },
      tilt: { label: 'Panel tilt', unit: '°', value: 30 },
      sunAz: { label: 'Sun azimuth', unit: '°', value: 225 },
      panelAz: { label: 'Panel azimuth', unit: '°', value: 180 },
    },
    result: { label: 'cos θ', unit: '' },
    check: (m, v) => m.solar.cosAOI(v.tilt, v.panelAz, v.z, v.sunAz),
  },
  {
    id: 'eq-capacity-factor', title: 'Capacity factor', formula: 'E / (P * 8760)',
    tex: 'CF = \\frac{E_{year}}{P_{rated} \\times 8760\\ \\text{h}}',
    vars: {
      E: { label: 'Energy in a year', unit: 'MWh', value: 219000 },
      P: { label: 'Rated capacity', unit: 'MW', value: 100 },
    },
    result: { label: 'Capacity factor', unit: '' },
    check: (m, v) => m.econ.capacityFactor(v.E, v.P),
  },
  {
    id: 'eq-crf', block: 'eq-lcoe', title: 'Capital recovery factor', formula: 'r * (1 + r)^n / ((1 + r)^n - 1)',
    tex: 'CRF = \\frac{r(1+r)^n}{(1+r)^n - 1}',
    vars: {
      r: { label: 'Discount rate', unit: '', value: 0.07 },
      n: { label: 'Lifetime', unit: 'years', value: 25 },
    },
    result: { label: 'Capital recovery factor', unit: 'per year' },
    check: (m, v) => m.econ.capitalRecoveryFactor(v.r, v.n),
  },
  {
    id: 'eq-lcoe', title: 'Levelized cost of energy',
    formula: '(capex * r * (1 + r)^n / ((1 + r)^n - 1) + fom) / (8.76 * cf) + vom',
    tex: 'LCOE = \\frac{CAPEX \\cdot CRF + FOM}{8.76 \\cdot CF} + VOM',
    vars: {
      capex: { label: 'Capital cost', unit: '$/kW', value: 1000 },
      fom: { label: 'Fixed running cost', unit: '$/kW-yr', value: 20 },
      vom: { label: 'Variable running cost', unit: '$/MWh', value: 0 },
      cf: { label: 'Capacity factor', unit: '', value: 0.2 },
      r: { label: 'Discount rate', unit: '', value: 0.07 },
      n: { label: 'Lifetime', unit: 'years', value: 25 },
    },
    result: { label: 'LCOE', unit: '$/MWh' },
    check: (m, v) => m.econ.lcoe({ capex: v.capex, fixedOM: v.fom, varOM: v.vom, cf: v.cf, r: v.r, n: v.n }),
  },
  {
    id: 'eq-wrights-law', title: "Wright's law", formula: 'C0 * (1 - LR)^d',
    tex: 'C = C_0\\,(1 - LR)^{d}',
    vars: {
      C0: { label: 'Starting cost', unit: '$', value: 100 },
      LR: { label: 'Learning rate', unit: '', value: 0.2 },
      d: { label: 'Doublings of cumulative production', unit: '', value: 10 },
    },
    result: { label: 'Cost after d doublings', unit: '$' },
    check: (m, v) => m.econ.wrightsLaw(v.C0, v.LR, v.d),
  },
  {
    id: 'eq-wind-power', title: 'Power of a wind turbine', formula: '0.5 * rho * pi * (D / 2)^2 * v^3 * Cp',
    tex: 'P = \\tfrac{1}{2}\\rho A v^3 C_p',
    vars: {
      rho: { label: 'Air density', unit: 'kg/m³', value: 1.225 },
      D: { label: 'Rotor diameter', unit: 'm', value: 120 },
      v: { label: 'Wind speed', unit: 'm/s', value: 10 },
      Cp: { label: 'Power coefficient', unit: '', value: 0.45 },
    },
    result: { label: 'Power', unit: 'W' },
    check: (m, v) => m.renewables.rotorPower(v.rho, v.D, v.v, v.Cp),
  },
  {
    id: 'eq-betz', title: 'Actuator-disc power coefficient', formula: '4 * a * (1 - a)^2',
    tex: 'C_p = 4a(1-a)^2',
    vars: { a: { label: 'Axial induction factor', unit: '', value: 1 / 3 } },
    result: { label: 'Power coefficient', unit: '' },
    check: (m, v) => m.renewables.actuatorDiscCp(v.a),
  },
  {
    id: 'eq-hydropower', title: 'Hydropower', formula: 'eta * rho * g * Q * H',
    tex: 'P = \\eta\\,\\rho\\, g\\, Q\\, H',
    vars: {
      eta: { label: 'Turbine and generator efficiency', unit: '', value: 0.9 },
      rho: { label: 'Water density', unit: 'kg/m³', value: 1000 },
      g: { label: 'Gravity', unit: 'm/s²', value: 9.80665 },
      Q: { label: 'Flow', unit: 'm³/s', value: 100 },
      H: { label: 'Head', unit: 'm', value: 50 },
    },
    result: { label: 'Power', unit: 'W' },
    check: (m, v) => m.renewables.hydroPower(v.Q, v.H, v.eta),
  },
  {
    id: 'eq-tidal-basin', title: 'Energy of a tidal basin', formula: '0.5 * rho * g * A * R^2',
    tex: 'E = \\tfrac{1}{2}\\rho g A R^2',
    vars: {
      rho: { label: 'Seawater density', unit: 'kg/m³', value: 1025 },
      g: { label: 'Gravity', unit: 'm/s²', value: 9.80665 },
      A: { label: 'Basin area', unit: 'm²', value: 1e7 },
      R: { label: 'Tidal range', unit: 'm', value: 8 },
    },
    result: { label: 'Energy per emptying', unit: 'J' },
    check: (m, v) => m.renewables.tidalBasinEnergyJ(v.A, v.R),
  },
  {
    id: 'eq-wave-flux', title: 'Wave energy flux', formula: 'rho * g^2 * Hs^2 * Te / (64 * pi)',
    tex: 'P = \\frac{\\rho g^2 H_s^2 T_e}{64\\pi}',
    vars: {
      rho: { label: 'Seawater density', unit: 'kg/m³', value: 1025 },
      g: { label: 'Gravity', unit: 'm/s²', value: 9.80665 },
      Hs: { label: 'Significant wave height', unit: 'm', value: 2 },
      Te: { label: 'Energy period', unit: 's', value: 8 },
    },
    result: { label: 'Power per metre of wave crest', unit: 'W/m' },
    check: (m, v) => m.renewables.waveEnergyFlux(v.Hs, v.Te),
  },
  {
    id: 'eq-carnot', title: 'Carnot efficiency', formula: '1 - Tc / Th',
    tex: '\\eta_{C} = 1 - \\frac{T_c}{T_h}',
    vars: {
      Th: { label: 'Hot side temperature', unit: 'K', value: 838.15 },
      Tc: { label: 'Cold side temperature', unit: 'K', value: 313.15 },
    },
    result: { label: 'Carnot efficiency (fraction)', unit: '' },
    check: (m, v) => m.renewables.carnotEfficiency(v.Th, v.Tc),
  },
  {
    id: 'eq-round-trip', title: 'Round-trip efficiency', formula: 'etaIn * etaOut',
    tex: '\\eta_{rt} = \\eta_{in}\\,\\eta_{out}',
    vars: {
      etaIn: { label: 'Charging efficiency', unit: '', value: 0.95 },
      etaOut: { label: 'Discharging efficiency', unit: '', value: 0.95 },
    },
    result: { label: 'Round-trip efficiency (fraction)', unit: '' },
    check: (m, v) => m.renewables.roundTrip(v.etaIn, v.etaOut),
  },
];

export const byId = (id) => FORMULAS.find((f) => f.id === id);
