// Single source of truth for every page on the site. core.js builds the header,
// footer, lesson order and progress tracking from this list; scripts/check-site.mjs
// fails the build if a page exists that is not listed here, or vice versa.
// `path` is relative to the site root. `order` defines the recommended learning path.

export const GROUPS = [
  { id: 'story', label: 'Story' },
  { id: 'cell', label: 'How a cell works' },
  { id: 'today', label: 'Solar today' },
  { id: 'frontier', label: 'Frontier' },
  { id: 'renewables', label: 'Renewables' },
  { id: 'reference', label: 'Reference' },
];

export const PAGES = [
  { id: 'home', path: 'index.html', group: null, title: 'Solar Odyssey', blurb: 'Start here: the learning path from 1839 to the clean-energy grid.' },
  { id: 'timeline', path: 'timeline.html', group: 'story', title: 'The Solar Odyssey timeline', blurb: 'Walk from Becquerel in 1839 to today’s records and tomorrow’s research.', lesson: true },

  { id: 'photovoltaic-effect', path: 'learn/photovoltaic-effect.html', group: 'cell', title: 'The photovoltaic effect', blurb: 'Light arrives in packets, and a packet with enough energy frees an electron.', lesson: true },
  { id: 'band-gap', path: 'learn/band-gap.html', group: 'cell', title: 'The band gap', blurb: 'Why silicon eats some colours of sunlight and wastes others.', lesson: true },
  { id: 'pn-junction', path: 'learn/pn-junction.html', group: 'cell', title: 'The p-n junction', blurb: 'The built-in field that pushes electrons and holes apart.', lesson: true },
  { id: 'iv-curve', path: 'learn/iv-curve.html', group: 'cell', title: 'Current, voltage and power', blurb: 'The I-V curve, fill factor, efficiency and the maximum power point.', lesson: true },

  { id: 'technologies', path: 'today/technologies.html', group: 'today', title: 'Cell technologies today', blurb: 'Monocrystalline, polycrystalline and thin-film: how they are made and how they differ.', lesson: true },
  { id: 'cell-to-grid', path: 'today/cell-to-grid.html', group: 'today', title: 'From cell to grid', blurb: 'Modules, arrays, inverters, MPPT and the balance of system.', lesson: true },
  { id: 'system-builder', path: 'today/system-builder.html', group: 'today', title: 'System builder', blurb: 'Wire cells into modules, strings and an inverter, and watch power flow.', lesson: true, tool: true },
  { id: 'sun-path', path: 'today/sun-path.html', group: 'today', title: 'Sun path and energy yield', blurb: 'Pick a place and a season; see how much sunlight a tilted panel catches.', lesson: true, tool: true },
  { id: 'efficiency-records', path: 'today/efficiency-records.html', group: 'today', title: 'Efficiency over time', blurb: 'Record lab efficiencies by technology, decade by decade.', lesson: true, tool: true },
  { id: 'cost-decline', path: 'today/cost-decline.html', group: 'today', title: 'The cost collapse', blurb: 'How a watt of solar went from over a hundred dollars to a few dimes.', lesson: true, tool: true },

  { id: 'frontier', path: 'frontier.html', group: 'frontier', title: 'The frontier', blurb: 'Perovskites, tandems, bifacial modules and the distance to the theoretical limit.', lesson: true },
  { id: 'state-of-the-field', path: 'state-of-the-field.html', group: 'frontier', title: 'State of the field', blurb: 'The fast-moving numbers in one place, each with its source and date.' },

  { id: 'renewables', path: 'renewables/index.html', group: 'renewables', title: 'The clean-energy system', blurb: 'How solar, wind, water, heat, storage and the grid fit together.', lesson: true },
  { id: 'wind', path: 'renewables/wind.html', group: 'renewables', title: 'Wind', blurb: 'Blades, the cube of wind speed, and the Betz limit.', lesson: true },
  { id: 'hydro', path: 'renewables/hydro.html', group: 'renewables', title: 'Hydropower', blurb: 'Falling water, dams and turbines.', lesson: true },
  { id: 'geothermal', path: 'renewables/geothermal.html', group: 'renewables', title: 'Geothermal', blurb: 'Heat from the Earth’s interior, brought up in a loop.', lesson: true },
  { id: 'ocean', path: 'renewables/ocean.html', group: 'renewables', title: 'Tidal and wave', blurb: 'Barrages, tidal streams and wave energy converters.', lesson: true },
  { id: 'biomass', path: 'renewables/biomass.html', group: 'renewables', title: 'Biomass', blurb: 'Stored sunlight in plants, burned or digested for power.', lesson: true },
  { id: 'csp', path: 'renewables/csp.html', group: 'renewables', title: 'Concentrated solar power', blurb: 'Mirrors, heat and molten-salt storage.', lesson: true },
  { id: 'storage', path: 'renewables/storage.html', group: 'renewables', title: 'Energy storage', blurb: 'Batteries, pumped hydro and hydrogen.', lesson: true },
  { id: 'grid', path: 'renewables/grid.html', group: 'renewables', title: 'The smart grid', blurb: 'Balancing a grid built on variable sources.', lesson: true },
  { id: 'compare', path: 'renewables/compare.html', group: 'renewables', title: 'Comparison dashboard', blurb: 'Capacity factor, land use, cost and growth across sources.', lesson: true, tool: true },

  { id: 'equations', path: 'equations.html', group: 'reference', title: 'Equation atlas', blurb: 'Every equation on the site with symbols, units and a checked example.' },
  { id: 'glossary', path: 'glossary.html', group: 'reference', title: 'Glossary', blurb: 'Every term, defined in plain language.' },
  { id: 'teach', path: 'teach.html', group: 'reference', title: 'For teachers', blurb: 'Objectives, timings and a printable question bank for every lesson.' },
  { id: 'sources', path: 'sources.html', group: 'reference', title: 'Sources', blurb: 'Every reference, with links and verification dates.' },
  { id: 'about', path: 'about.html', group: 'reference', title: 'About, privacy and download', blurb: 'How the site works, what it stores, and the offline desktop app.' },
];

export const LESSONS = PAGES.filter((p) => p.lesson);
export const byId = (id) => PAGES.find((p) => p.id === id);
