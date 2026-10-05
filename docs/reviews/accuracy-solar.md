# Accuracy review: solar history, physics and records (Milestone 5)

Reviewer: independent accuracy check, 2026-10-02.
Scope: `site/index.html`, `site/timeline.html` (+ `data-src/datasets/timeline.json`), `site/learn/photovoltaic-effect.html`,
`band-gap.html`, `pn-junction.html`, `iv-curve.html`, `site/today/efficiency-records.html`, `cost-decline.html`,
`site/frontier.html`, `site/state-of-the-field.html`, and the datasets timeline, materials, efficiency-records,
state-of-the-field, solar-deployment, module-prices, electricity-mix.

## How sources were reached

- **Crossref could not be queried.** `api.crossref.org` is blocked for shell tools (proxy 403), and WebFetch requests to it
  timed out waiting for permission. DOI records were therefore **not** checked field by field against Crossref.
  Wherever a publisher, OSTI/NLR record, ScienceDirect abstract page or the primary web page could be fetched, it was used
  instead (marked "fetched" below). Records checked only against the reviewer's own knowledge are marked "knowledge".
- Several pages could not be read: Wiley Online Library (403), OSTI (robots), the efficiency-tables summary on
  pv-magazine.com (404), the Fluxim record page and a Manila Times/PR Newswire LONGi release (429 rate limit), NSSDCA
  (error page; Wikipedia's Vanguard 1 article, which quotes NSSDCA, was used instead), and the IEA/IRENA PDFs were not opened.
- Arithmetic in worked examples was recomputed by hand; the unit tests also recompute them.

## Claims checked

Verdicts: confirmed / corrected / softened / removed / unverifiable.

### Fast-moving records and numbers (as of 2026-10-02)

| Page(s) | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| efficiency-records, iv-curve, frontier, timeline, SotF | Silicon cell record 28.29 % (LONGi HIBC, ISFH, 24 Sep 2026), after 28.04 % and 28.13 % earlier in 2026 | pv-magazine-longi-hibc-2026 (fetched) | confirmed | No later silicon record found. Version 68 tables list 28.1 % (140 cm²), consistent. |
| timeline | Up from 27.81 % in 2025 | pv-magazine-longi-hibc-2025 | confirmed (knowledge) | Page not refetched. |
| all | Perovskite/silicon tandem record 35.5 %, LONGi, ESTI-certified, 14 Jul 2026; area not disclosed | longi-tandem-2026, pv-magazine-longi-tandem-2026 (both fetched) | confirmed | Latest found; JinkoSolar 34.82 % (Jun 2026) is lower. |
| frontier, timeline | LONGi 34.3 % on 261 cm²; LONGi puts the tandem ceiling at about 43 % | longi-tandem-2026 (fetched) | confirmed | Both stated in the release; 34.3 % (261 cm²) also appears in efficiency tables v68. |
| efficiency-records dataset | Tandem steps 33.9 % (Nov 2023), 34.6 % (Jun 2024), 34.85 % (Apr 2025, NREL) | longi-tandem-2026, longi-tandem-2025, pv magazine (fetched) | confirmed | |
| efficiency-records, frontier, SotF, dataset | Perovskite single-junction record 27.87 % (SolaEon, Jan 2026) | solaeon-2026 (fetched) | **corrected** | Out of date. Solar cell efficiency tables Version 68 (Joule, online 28 May 2026) list 28.0 % for a 0.05 cm² lead-halide perovskite cell (fetched ScienceDirect highlights); pv magazine USA names Hainan University. Added a 28.0 % point, new sources `green-tables-68` and `pv-magazine-tables-68`, updated the SotF row and the prose; SolaEon kept as an earlier 2026 step. Certifying lab of the 28.0 % cell not found. |
| efficiency-records dataset | 2025 perovskite record 26.95 %, area 0.0583 cm² | acap-perovskite-2025 (fetched) | corrected | ACAP says a 0.05 cm² NREL-certified cell, announced as 27 %; area changed to 0.05 to match the cited source. 26.95 % is corroborated by Hainan University's own news page. |
| efficiency-records, frontier, SotF | Overall record 47.6 %, Fraunhofer ISE four-junction, 665 suns, 2022 | fraunhofer-ise-47-6 (search results) | confirmed | No higher result found. |
| efficiency-records | "Solar cell efficiency tables, published twice a year in Progress in Photovoltaics" | green-tables-68 (fetched) | **corrected** | Version 68 moved to Joule; text now says so. |
| efficiency-records, SotF | Average c-Si module 22.7 % (Q4 2024); ten years earlier about 17 % | fraunhofer-pv-report-2026 (fetched PDF, 14 Jul 2026) | confirmed | Fraunhofer says mono modules went from about 17 % to just under 25 % over the decade. |
| efficiency-records, SotF | Best laboratory module 26.0 % | fraunhofer-pv-report-2026 (fetched) | **corrected** | Fraunhofer does say 26.0 %, but efficiency tables v68 list a certified 26.4 % full-size (1.9 m²) LONGi silicon module. Now 26.4 %, citing v68. |
| cost-decline, SotF | Learning rate 26.6 % per doubling over 45 years (Fraunhofer) | fraunhofer-pv-report-2026 (fetched) | confirmed | Quoted verbatim in the report. |
| cost-decline, timeline, SotF | Module price $132.38/W (1975) and $0.2652/W (2024), constant 2025 US$; 2008 $4.75, 2010 $2.51, 2012 $1.11 | owid-solar-pv-prices (fetched CSV) | confirmed | Exact match. Ratio 499, about 12 %/yr, 400 W panel ≈ $53 000, 2008–12 fall 77 %: recomputed, all correct. |
| cost-decline, SotF | Price series is a "world average" from Nemet then IRENA | OWID page (fetched) | **corrected** | OWID splices Nemet (1975–2003), Farmer & Lafond (2004–2009) and IRENA (2010 on, pvXchange European benchmark prices). Caveat text, SotF label/detail and the chart's aria-label fixed. The generated `module-prices.json` title still says "world average" (set in `scripts/build_data.py`, outside this review). |
| cost-decline, SotF | LCOE ≈ 41 ¢/kWh (2010) to 4.3 ¢ (2024), 2025 flat at 4.35 ¢ | owid-lcoe, irena-costs-2025 | confirmed | IRENA's $0.043/kWh for 2024 confirmed by trade-press headlines; OWID 2025 value not refetched. |
| cost-decline, SotF, timeline | Capacity ≈ 1.2 GW (2000) to ≈ 2 400 GW (end 2025, IRENA via OWID) | owid-solar-capacity (fetched metadata only) | confirmed | OWID describes the indicator as "maximum net generating capacity". The values come from the pipeline and were not refetched. |
| timeline | Nearly 3 TW installed by end 2025, about 700 GW added in 2025 | iea-pvps-snapshot-2026 (fetched) | confirmed; **softened** | IEA PVPS: "approached 3 TW", 698 GW. This clashed with 2 397 GW / 513 GW from IRENA on SotF and cost-decline, so the timeline now names both counts and cites owid-solar-capacity. |
| timeline, index, SotF | Solar 8.7 % of world electricity in 2025; < 0.01 % in 2000 | ember-yearly-electricity (fetched GER 2026), electricity-mix | confirmed | Ember: solar 2 778 TWh, renewables 33.8 %. 2 778/31 772 TWh = 8.75 %. |
| timeline | 2022: about 1.2 TW installed, about 240 GW added | iea-pvps-snapshot-2023 | confirmed (knowledge) | IEA PVPS count; IRENA's count is lower (1 058 GW). |
| frontier | Quantum-dot "certified records have reached 16.6 %" | hao-2020 | **softened** | Later QD records exist; reworded as a dated 2020 result. |
| frontier | Organic cells passed 19 % in 2022 | zhu-2022 | confirmed (knowledge) | Dated statement, left as is. |

### History (timeline and lesson history boxes)

| Page(s) | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| timeline, PV effect | Becquerel, aged 19, 1839, electrodes in a conducting solution; first PV effect; electron discovered 58 years later | becquerel-1839, pveducation-first-pv (fetched) | confirmed | |
| timeline | Smith 1873, selenium resistance falls in light (photoconductivity) | smith-1873 | confirmed (knowledge) | Nature 7, 303. |
| timeline | Adams & Day 1877: heated platinum contacts, first solid-state PV; wrongly blamed light-induced crystallisation | adams-day-1877, pveducation-first-pv (fetched) | confirmed | PVEducation says the same. |
| timeline | Vulcan Street Plant, Appleton, 30 Sep 1882 | asce-vulcan-street, maglab-hydro-1882 | confirmed (knowledge) | Not fetched. |
| timeline | Fritts 1883: selenium plus gold leaf, about 30 cm² | fritts-1883, pveducation-first-pv (fetched) | confirmed | |
| timeline, PV effect | Hertz 1887, UV helps sparks, during the radio-wave work | hertz-1887 | confirmed (knowledge) | |
| timeline | Brush 1887–88, 17 m rotor, 144 blades, battery charging | sciam-brush-1890 | confirmed (knowledge) | |
| timeline | la Cour, Askov, 1891: hydrogen lit the school | la-cour-museum (not fetched); Wikipedia (fetched) | **corrected** | The first mill was 1891, but the school was lit by hydrogen from 1895 to 1902. Text now says "From 1895". |
| timeline | Larderello 1904: Ginori Conti lit five bulbs; 250 kW plant 1913 | lund-2005 (fetched) | confirmed | Lund: five bulbs, 10 kW dynamo; Larderello 1, 250 kW. |
| timeline, PV effect | Einstein 1905, E = hf − W; Nobel 1921, awarded 1922, for the photoelectric law | einstein-1905, nobel-physics-1921 | confirmed (knowledge) | |
| PV effect | Lenard 1902: electron energy depends on colour, not brightness | lenard-1902 | confirmed (knowledge) | Standard textbook attribution. Lenard established independence from intensity; the colour dependence was qualitative. |
| timeline, PV effect | Millikan 1916 confirmed Einstein, slope h/e | millikan-1916 | confirmed (knowledge) | |
| timeline | Czochralski 1918, metal crystallisation-rate method | czochralski-1918 | confirmed (knowledge) | |
| timeline, pn-junction | Ohl, 23 Feb 1940, seam/crack; Scaff; phosphorus/boron; named n-type, p-type, p-n junction | chm-pn-junction-1940 (fetched), riordan-hoddeson-1997 | confirmed | CHM says "slab" with a "seam"; the pages say "rod". Riordan & Hoddeson describe a rod, so left as is. |
| timeline, pn-junction | Ohl patent US 2,402,662, filed May 1941, granted June 1946 | ohl-patent-1946 | confirmed (knowledge) | |
| timeline, pn-junction, efficiency-records | Bell Labs 1954, about 6 %, announced 25 Apr 1954; more than ten times better than selenium | chapin-1954, aps-news-2009, SEIA (fetched) | confirmed | SEIA: "April 1954 … first silicon-based solar cell". |
| timeline | Vanguard 1, 17 Mar 1958, six cells, solar transmitter for more than six years, oldest object in orbit | nasa-vanguard-1, nssdc-vanguard-1 (NSSDCA error page; Wikipedia, which quotes NSSDCA, fetched) | confirmed | |
| timeline, band-gap | Shockley & Queisser 1961: 30 % at 1.1 eV, 6000 K blackbody | shockley-queisser-1961 | confirmed | Wikipedia (fetched) cites SQ for "30 % at 1.1 eV". |
| timeline | La Rance, 26 Nov 1966, 24 turbines, 240 MW, first tidal station | tethys-la-rance | confirmed (knowledge) | |
| timeline, cost-decline | 1973 embargo; oil price "first doubled, then quadrupled" | state-dept-oil-embargo (fetched) | confirmed | Exact phrase in the source. |
| timeline | Carlson & Wronski, RCA, amorphous Si cell 1976 | carlson-wronski-1976 | confirmed (knowledge) | |
| timeline | SERI 1977 → NREL 1991 → renamed National Laboratory of the Rockies, Dec 2025 | nrel-at-40, pv-magazine-nrel-rename-2025 | confirmed | The rename is corroborated by DOE/NLR release titles in search results (3 Dec 2025). |
| timeline | ARCO 1.1 MW Hesperia 1982; 5.2 MW Carrizo Plain "the next year" | seia-solar-century (fetched) | confirmed | SEIA gives 1.1 MW and 5.2 MW and says "later". "Next year" (1983) is standard but not in SEIA's text. |
| timeline, efficiency-records | Blakers, Green et al. 1989, 22.8 % PERC | blakers-1989 | confirmed (knowledge) | |
| timeline | Vindeby 1991: 11 × 450 kW, 1.5–3 km offshore, 243 GWh, retired 2017 | orsted-vindeby-2017 | confirmed (knowledge) | |
| timeline, efficiency-records | O'Regan & Grätzel 1991, 7.1–7.9 % | oregan-gratzel-1991 | confirmed (knowledge) | |
| timeline, cost-decline | EEG 1 Apr 2000: 20-year fixed price, priority access; about 6 % renewables; up to about 50 ct/kWh for PV | bmwk-eeg-15-years | confirmed (knowledge) | 99 Pf/kWh ≈ 50.6 ct. |
| timeline, frontier, efficiency-records | Kojima/Miyasaka 2009, 3.8 %, liquid electrolyte | kojima-2009 | confirmed (knowledge) | |
| timeline, frontier, efficiency-records | Kim, Park, Grätzel 2012, solid-state 9.7 %; Burschka 2013 ≈ 15 % | kim-park-2012, burschka-2013 | confirmed (knowledge) | |
| timeline | Hornsdale 100 MW/129 MWh, 2017; 150 MW 2020 | hornsdale-power-reserve | confirmed (knowledge) | |
| timeline, cost-decline | IEA: China holds more than 80 % of every PV manufacturing step (2022); more than $50 bn invested since 2011 | iea-pv-supply-chains-2022 | confirmed (knowledge) | |
| efficiency-records | "Silicon needed about sixty years to cover the same ground" | (derived) | **corrected** | Silicon went from 6 % (1954) to about 28 % only in 2025–26, roughly seventy years. Changed to "about seventy". |
| efficiency-records dataset | Other milestones (Kaneka 26.3 %/180.4 cm²; LONGi 26.81 %; CIGS 19.9 % and 23.64 %; perovskite 25.5 % (2021); III-V 40.8 %, 47.1 %/143 suns, 39.2 % one-sun; organic 1 % and 19.2 %; dye 13 % and 15.2 %; QD 6 %, 8.55 %, 16.6 %) | cited papers | confirmed (knowledge) | Keller 2024 title (23.6 %) confirmed via nature.com search result. |

### Physics

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| PV effect | E = hc/λ, 1240 eV·nm; 500 nm → 2.48 eV, 3.97e-19 J, 600 THz; Si cutoff 1107 nm; 45 % usable; 2.5e15 photons/s at 1 mW | — | confirmed | Recomputed. h exact since 2019 ✓. |
| PV effect | Photoelectric vs photovoltaic table (work function vs band gap; UV for most metals) | — | confirmed | Correct distinction. |
| PV effect, band-gap | Direct (GaAs, CdTe, CIGS, perovskites) vs indirect (Si, Ge) gaps; phonon-assisted absorption | pveducation-si-optical | confirmed | |
| PV effect | Thermalisation is the biggest single loss (silicon) | — | confirmed | About 33 % vs 23 % below-gap, for silicon in the page's own model. |
| band-gap | Blue light absorbed within a few microns, "red light needs a few hundred" | pveducation-absorption-depth (fetched) | **corrected** | PVEducation uses that loose wording, but visible red (650–700 nm) is absorbed in about 3–5 µm. Only light near the gap (≈ 1000 nm+) needs hundreds of µm. Now "deep-red and near-infrared light close to the gap". |
| band-gap | "Every absorber in use today has a gap between 0.7 and 1.7 eV" | materials.json | **softened** | GaInP top cells (≈ 1.9 eV) and wide-gap perovskites exceed 1.7 eV. Now "Most absorbers". |
| band-gap | Blackbody 5772 K, 1361 W/m², f_ω ≈ 2.16e-5 | prsa-2016 | confirmed | Recomputed: σT⁴f_ω = 1361 W/m². |
| band-gap | Ultimate efficiency 44 % for 1.12 eV (23 % not absorbed, 33 % heat) | — | confirmed | Agrees with SQ's 44 % ultimate efficiency. |
| band-gap, efficiency-records, frontier | AM1.5G detailed-balance maximum 33.16 % at 1.34 eV | ruhle-2016 (abstract fetched; number not in abstract) | confirmed | Wikipedia (fetched) attributes 33.16 % at 1.34 eV to Rühle. 33.7 % is quoted elsewhere. The two pages word the 33.7 % caveat differently, but both say so honestly. |
| band-gap, frontier | De Vos: 30/42/49/68 % unconcentrated; 40/55/63/86 % at maximum concentration | de-vos-1980 | confirmed (knowledge) | Standard values from the paper. |
| pn-junction | Si 5.0e22 atoms/cm³; 1e16 B = 1 per 5 million | — | confirmed | |
| pn-junction | V_bi = 0.895 V; 60 mV per decade; n_i = 9.65e9 (Altermatt), 1.00e10 (Sproul & Green); 2 mV difference | altermatt-2003, sproul-green-1991 | confirmed | Recomputed. |
| pn-junction | W = 0.34 µm; x_n = 0.34 nm; E_max = 5.3e4 V/cm | sze-ng-2007 | confirmed | Recomputed. |
| pn-junction | Field "across a layer a thousand times thinner than a hair" | — | **corrected** | A hair is 50–100 µm, so 0.34 µm is about 150–300 times thinner. Now "a few hundred times". |
| pn-junction | "In short circuit a single line (the Fermi level) runs flat across the cell" | — | **corrected** | Under light the quasi-Fermi levels split inside the cell even at short circuit. Only the contact Fermi levels line up. Reworded. |
| pn-junction | Field points n → p; drift/diffusion balance; open-circuit V where leakage equals generation | — | confirmed | Sign conventions are correct. |
| iv-curve | V_oc = 0.704 V; 18 mV per halving; 59 mV per decade of I₀; FF 0.818; FF₀ 0.847 (Green); η = 23.0 % | green-1981-ff | confirmed | Recomputed. |
| iv-curve | "The lab cell is a good modern commercial cell" (23.0 %) | — | **softened** | Mass-produced TOPCon/HJT/BC cells in 2026 are above 23 %. Now "solid commercial-grade cell, a little below the best cells in mass production today". |
| iv-curve | STC: 1000 W/m², AM1.5G per IEC 60904-3, 25 °C | iec-60904-3-2019 | confirmed (knowledge) | Edition 4.0 (2019) exists. |
| iv-curve | dV_oc/dT = −1.92 mV/K (−0.27 %/°C); PVEducation ≈ −2.2 mV/°C; I_sc +0.06 %/°C; E_g0 ≈ 1.2 eV, γ ≈ 3; I₀ ×5.0 per 10 K | green-2003-temperature, pveducation-temperature | confirmed | Recomputed. Signs are correct. Power coefficient "about −0.3 %/°C" is plausible for a high-V_oc cell. |
| frontier | Two-terminal current matching; 1.77 eV top on Si → 41.2 %; best pair ≈ 1.64/0.95 eV at 41.9 % | de-vos-1980, model | confirmed | Covered by unit tests. |
| frontier | Bifacial: Cuevas 1982 "up to 50 %"; trackers + bifacial ≈ 35 % more energy, lowest LCOE on 93 % of land | cuevas-1982, rodriguez-gallegos-2020 | confirmed (knowledge) | |
| frontier | Hot-carrier (Ross & Nozik 1982); intermediate band (Luque & Martí 1997); Mailoa 2015 first 2T tandem; lead and tin toxicity | cited papers | confirmed (knowledge) | |
| cost-decline | Wright 1936 (aircraft labour); Swanson's law; learning-rate arithmetic (5.50 doublings, 33.5 %) | wright-1936 | confirmed | Recomputed. |
| cost-decline | "Farmer and Lafond tested Wright's law against Moore's-law time trends … equally well" | farmer-lafond-2016 (ScienceDirect abstract fetched) | **corrected** | The paper forecasts with a Moore's-law model only. The tie result is Nagy et al. (2013), which Farmer & Lafond cite. Reworded to say exactly that. |
| cost-decline | Kavlak: after about 2001, scale economies became a bigger driver than R&D | kavlak-2018 | confirmed (knowledge) | Matches the paper's conclusions. |
| index | "to the cheapest power on Earth" | — | **softened** | Now "some of the cheapest power on Earth", matching the timeline's more careful wording. |
| materials.json | Ge 0.66 (ind.), Si 1.12 (ind.), GaAs 1.42, CdTe 1.5, CIGS 1.04–1.68, MAPbI₃ 1.61, a-Si:H 1.7 (optical) | sze-ng-2007, zhang-2020, doe-cigs, street-1991 | confirmed (knowledge) | Standard values. Zhang 2020 bibliographic data matches the NLR/arXiv listings in search results. |

### Bibliography records spot-checked against a fetched page

| Record | Verdict | Note |
|---|---|---|
| green-tables-66 (PiP 33(7), 795–810, 2025) | confirmed | NLR research hub (fetched). |
| green-tables-67 (PiP 34(4), 482–496, 2026) | confirmed | NLR research hub (fetched). |
| green-tables-68 (Joule 10(7), 102494, DOI 10.1016/j.joule.2026.102494) | added | ScienceDirect (fetched). |
| ruhle-2016 (Solar Energy 130, 139–147) | confirmed | ScienceDirect (fetched). |
| farmer-lafond-2016 (Research Policy 45(3), 647–665) | confirmed | ScienceDirect (fetched). |
| keller-2024 (title, Nature Energy) | confirmed | nature.com search result. |
| lund-2005, seia-solar-century, chm-pn-junction-1940, pveducation-first-pv, acap-perovskite-2025, solaeon-2026, longi-tandem-2026, pv-magazine-longi-*, iea-pvps-snapshot-2026, fraunhofer-pv-report-2026, owid-solar-pv-prices | confirmed | Pages fetched. They exist and say what is cited. |
| All other DOI records (≈ 50) | unverifiable here | Crossref was unreachable. Titles, journals and years agree with the reviewer's knowledge, and no discrepancy was noticed, but they were not machine-checked. A Crossref pass is still recommended. |

## Summary

Most of the content is accurate. The physics is correct, the worked examples recompute exactly, the history agrees with
the sources that could be read, and cross-page numbers agree: 8.7 %, 28.29 %, 35.5 %, 47.6 %, $132 → $0.27, 29.4 % and
33.16 %. Changes made:

- **Out-of-date record:** the single-junction perovskite record is now 28.0 % (Hainan University, 0.05 cm², efficiency
  tables Version 68, May 2026), not SolaEon's 27.87 %. Datasets, State of the field, efficiency-over-time and frontier
  are updated, with two new verified sources.
- **Out-of-date venue and module record:** the efficiency tables moved to Joule from Version 68. The best certified silicon
  module is 26.4 % (v68), not 26.0 %.
- **Inconsistency:** the timeline quoted IEA PVPS (nearly 3 TW, 700 GW) while other pages used IRENA (2.4 TW, 513 GW).
  The timeline now names both counts.
- **Physics wording:** absorption depth of red light, the hair comparison, and the short-circuit Fermi level.
- **Attribution:** the Farmer & Lafond sentence, the module-price source description, and la Cour's 1895 date.
- **Overstatements softened:** "every absorber", "good modern commercial cell", "cheapest power on Earth", and the dated
  QD record.

Not done or doubtful:

- No Crossref verification of DOI metadata, because the service was blocked.
- The certifying lab of the 28.0 % perovskite cell is not known.
- The `module-prices.json` title "world average" is set in `scripts/build_data.py`, outside this review's files.

All checks pass after the edits: data build and signature, `check_site.py`, 278 unit tests, and 64 e2e tests for the
touched pages.
