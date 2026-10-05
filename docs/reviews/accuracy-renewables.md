# Accuracy review: renewables section (Milestone 5)

Reviewer: independent accuracy pass, 2026-10-02.
Scope: `site/renewables/{index,wind,hydro,geothermal,ocean,biomass,csp,storage,grid,compare}.html` (and prose strings in their `.js`), `data-src/datasets/renewables-compare.json`, cross-checked against `site/data/electricity-mix.json`, and the bibliography records these pages cite (`data-src/sources/renewables-a.json`, `renewables-b.json`, `compare.json`, plus the shared ids they use).

Method: each non-obvious claim was traced to its cited record and, where the host allowed it, to the source itself (fetched 2026-10-02). Crossref (`api.crossref.org`) was blocked by the egress proxy (HTTP 403), so DOIs were confirmed through the publisher landing page found by search. `ipcc.ch`/`archive.ipcc.ch` PDFs, `eia.gov` Electric Power Annual tables (HTTP 503), `utahforge.com`, SASAC and the SolarPACES database could not be read; those claims are marked accordingly. Equations and worked examples were recomputed by hand and against the site's physics modules (the trip-model and duck-curve captions were reproduced with `physics/grid.js`).

Verdicts: **confirmed** (source read, supports the wording) · **corrected** (wrong, fixed) · **softened** (reworded to what the source supports) · **removed** · **unverifiable** (source not reachable this session; left as is unless noted).

## Claims checked

### Overview (`index.html`) and dataset consistency

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| index | Renewables 33.8 % / 10,727 TWh of world electricity, 2025 | electricity-mix.json (OWID/Ember) | confirmed | 2,778.6 + 2,713.1 + 4,435.0 + 710.4 + 89.3 = 10,726.5 TWh of 31,772 TWh. |
| index | Wind + solar ≈ 1.8 % in 2010, 17 % in 2025; solar passed wind in 2025 | electricity-mix.json | confirmed | 1.78 %, 17.3 %; 2,778.6 > 2,713.1 TWh ("in this dataset" hedge kept). |
| index | Hydro ≈ 4,400 TWh/yr; coal still largest single source | electricity-mix.json | confirmed | 4,435 TWh; coal 10,472 TWh. |
| index | Pumped hydro "by far the largest store of electricity" | iha-outlook-2026 | confirmed | By stored energy; IHA: "the world's dominant form of large-scale energy storage". |
| index | Hydrogen round trip loses "well over half" | inl-hydrogen-2023 | confirmed | Baseline 31 %. |
| wind/hydro/geo/ocean/biomass/csp/storage/grid/compare | Today-figure shares and TWh (8.5 %, 14.0 %, 0.28 %, 2.2 %, 8.7 %, 17.3 % / 5,492 TWh, 42.6 % / 13,538 TWh) | electricity-mix.json | confirmed | All recomputed from the 2025 World row; consistent across pages and with the comparison dataset's `growth` blocks. |
| compare (dataset) | Growth 2015–25: solar 26.9 %/yr, wind 12.6 %/yr, hydro 1.3 %/yr | electricity-mix.json | confirmed | Recomputed CAGRs. |

### Wind (`wind.html`)

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| wind | ~1,290 GW of wind at end-2025, ~7 % offshore | irena-capacity-2026 (IRENA PDF) | confirmed | 1,291 GW; offshore 7.1 % of wind. |
| wind | Onshore wind cheapest new source in IRENA's 2024 survey, ~3.4 ¢/kWh | irena-costs-2025 (IRENA summary, Table S1) | confirmed | USD 0.034/kWh. |
| wind | Blyth 1887, ~8 m cloth-sailed turbine, "probably the first ... in Britain" | price-2005-blyth, mollerstrom-2025 | confirmed | DOIs resolve (SAGE). Hedge appropriate. |
| wind | Brush 1888: 17 m, 144 blades, 12 kW, ~20 years | mollerstrom-2025, sciam-brush-1890 | confirmed | From record notes; Möllerström DOI resolves. |
| wind | 1891 la Cour "tests blade shapes in a wind tunnel" | la-cour-museum | **corrected** | 1891 was his first electricity-generating turbine at Askov; the wind-tunnel work began in 1896 (plct.dk; Gipe & Möllerström). Item reworded; new record `plct-la-cour`. |
| wind | Smith–Putnam "has two 53 m blades" | ethw-smith-putnam | **corrected** | 53 m is the rotor diameter (175 ft); each blade was ~23 m. Now "a two-bladed rotor 53 m across". |
| wind | Gedser 1957, 200 kW, 24 m | mollerstrom-2025 | confirmed | |
| wind | Vindeby 1991, 11 × 0.45 MW, 243 GWh in 25 years | orsted-vindeby-2017 | confirmed (record) | Trade-press copy rate-limited; arithmetic of "a few years" for a 15 MW turbine holds (~66 GWh/yr). |
| wind | V236: 15 MW, 236 m, 43,742 m², cut-in 3 / cut-out 31 m/s, Feb 2021, CF > 60 % | vestas-v236 (Vestas page) | confirmed | Vestas: "capacity factor exceeds 60 %", up to 80 GWh/yr. |
| wind | Dongfang 26 MW, 310 m rotor, installed 2025 at Shandong test base | offshorewind-dongfang-2025 | confirmed (trade press) | Second trade source added (`windtech-dongfang-2025`: 1 Sep 2025, Dongying, 153 m blades). Official SASAC pages (4 Sep, "now operational" 6 Nov 2025) exist but are HTTP-only and could not be fetched; no manufacturer page found. Date stamp updated. |
| wind | Betz: 16/27 at a = 1/3; Lanchester/Betz/Joukowsky 1915–20; derivation, dC_p/da = 4(1−a)(1−3a) | van-kuik-2007, okulov-van-kuik-2012, manwell-2009 | confirmed | Derivation checked; far-wake v(1−2a) and T = 2ρAv²a(1−a) correct. |
| wind | P = ½ρAv³; 26.8 MW through a V236 at 10 m/s; 12.1 MW at C_p 0.45 | worked examples | confirmed | Recomputed. |
| wind | Tip-speed ratio 8.65 at 7 rpm, R = 118 m; tips 86 m/s | worked example | confirmed | |
| wind | Blade-element note: tan φ = v(1−a)/(ωr), α = φ − θ, torque L sin φ − D cos φ | manwell-2009 | confirmed | |
| wind | Readout placeholder "Apparent wind 60 m/s" | `physics/fluids.js` | **corrected** | At 50 % span, 6.5 rpm, 10 m/s the model gives 40.7 m/s; placeholder (shown before JS runs) now matches. |
| wind | CF 52 %, 68 GWh for 15 MW at Rayleigh mean 9 m/s; presets labelled as illustrations | worked example, page note | confirmed | Illustrative status stated in the note under the widget. |

### Hydropower (`hydro.html`)

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| hydro | ~1,300 GW conventional + ~200 GW pumped storage, end-2025 | irena-capacity-2026, iha-outlook-2026 | confirmed | IRENA 1,296 GW; IHA 201 GW PSH (IHA total 1,469 GW). |
| hydro | Pumped storage passes 200 GW after a record 11.7 GW in 2025 | iha-outlook-2026 (IHA launch release, 24 Jun 2026) | confirmed | Record URL updated to the launch release. |
| hydro | Cragside 1878/1880, first home lit by hydroelectricity | nt-cragside | confirmed (record) | |
| hydro | Vulcan Street 1882, ~12.5 kW, weeks after Pearl Street | asme-vulcan-street, asce-vulcan-street | confirmed (record) | 30 Sep vs 4 Sep 1882. |
| hydro | Adams 1895; ten 5,000 hp generators by 1900 | ethw-adams-1895 | confirmed (record) | |
| hydro | Hoover: first power to LA 9 Oct 1936; 17 units, ~2,080 MW | census-hoover-2025, usbr-hoover-power | confirmed (record) | |
| hydro | Itaipu: 20 × 700 MW, from 1984, "a record 103 TWh" in 2016 | itaipu-faq | **softened** | Now "its own record"; Three Gorges has since exceeded Itaipu's 2016 output, so an unqualified "record" misleads. |
| hydro | Three Gorges 22,500 MW, world's largest in 2012; yearly output similar to Itaipu's | usgs-three-gorges (USGS page) | confirmed | USGS wording matches. |
| hydro | Francis heads ~40–600 m (130–2,000 ft); Pelton very high head; Kaplan low head/high flow | doe-hydro-turbines (DOE page) | confirmed | Record URL updated to the current DOE path. |
| hydro | Modern plant ~90 % efficient | usbr-hydro-pamphlet | confirmed (record) | |
| hydro | P = ηρgQH: 176.5 MW; jet speed 99 m/s at 500 m; specific-speed formula | worked examples | confirmed | |
| hydro | E = ρVgH: 2.94 × 10¹² J ≈ 817 MWh ≈ 100 MW for ~8 h | worked example | confirmed | |

### Geothermal (`geothermal.html`)

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| geo | 16 GW geothermal at end-2025 | irena-capacity-2026 | confirmed | |
| geo | Larderello 1904 five bulbs; 1913 250 kW; Wairākei 1958 first wet-steam (flash) plant; Geysers Unit 1 1960; Paratunka 1967 first organic binary fluid | lund-2005 (Stanford PDF) | confirmed | All five read in Lund (2005). |
| geo | Wairākei still runs at 133 MW | contact-wairakei | unverifiable | Operator page not fetched. |
| geo | Iceland: Reykjavík district heating from 1930; ~90 % of space heating geothermal | on-iceland-heating | confirmed (record) | |
| geo | Flash plants use fluid above ~182 °C; "most common kind"; binary brine never touches the turbine | doe-geothermal-plants | confirmed (record) | DOE wording; not re-fetched. |
| geo | Project Red (2023) "sends about 2 MW to the grid" | fervo-red-2026 (Fervo, 13 Apr 2026) | **corrected** | 2.1 MW is gross; net is ~1.4 MW. Timeline and expert note now give both, plus ~36 kg/s at 347 °F (175 °C). |
| geo | Pilot "has run for more than 600 days" | fervo-red-2026 | confirmed | >614 days; no observable thermal decline for >500 days (added "little sign of cooling"). |
| geo | Utah FORGE 2024: wells connected, ~139 °C outflow, ~70 % recovery, max M1.9 | utah-forge-2024 | confirmed | Via ThinkGeoEnergy's report of the press release (utahforge.com did not load). |
| geo | Cape Station first power, 33 MW block, Sept 2026 | fervo-cape-2026 | confirmed, updated | First power 24 Sep 2026; Fervo then declared commercial operation on 30 Sep 2026 (release 1 Oct). Added with new record `fervo-cod-2026`; company claims flagged as such. |
| geo | Carnot 40 % at 250/40 °C; cooling-stream ceiling 27.6 %; Q̇ = ṁcΔT = 33.6 MW | worked examples | confirmed | Stream-limit integral checked. |
| geo | Real plants ~1–21 %, world average ~12 % (94 plants) | zarrouk-moon-2014 | confirmed (record) | |

### Tidal and wave (`ocean.html`)

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| ocean | ~0.5 GW marine energy end-2025 | irena-capacity-2026 | confirmed | |
| ocean | La Rance 1966, 240 MW, 24 bulb units, two-way | edf-rance-2026, tethys-la-rance | confirmed | |
| ocean | La Rance "about 600 GWh a year"; real output ≈ 0.85 GWh/tide ≈ 40 % of ideal | tethys-la-rance | **softened** | Tethys says ~600 GWh; EDF's own 2009 operating review says 540 GWh/yr. Now "roughly 500–600 GWh", "0.7–0.85 GWh per tide", "35–40 % of this ideal"; new record `delaleu-2009-rance`. |
| ocean | Basin 22 km², mean range 8.2 m; E_max = ½ρgAR² = 7.4 × 10¹² J ≈ 2.1 GWh | tethys-la-rance, delaleu-2009-rance | confirmed | |
| ocean | Barrage widget | — | **softened (labelled)** | Caption now says it is a simplified time-step model, not EDF operating data (its 733 GWh/yr exceeds the real plant's). |
| ocean | Aguçadoura 2008, 3 Pelamis, 2.25 MW, withdrawn within months | guinness-first-wave-farm, powertech-pelamis | confirmed (record) | |
| ocean | Mutriku 2011, 296 kW, 16 turbines, >3 GWh | wiki-mutriku | **corrected, source replaced** | Peer-reviewed Peña et al. 2025 (JOET, doi 10.26748/KSOE.2024.099): 16 chambers, 296 kW design, but only 14 turbines (259 kW) in use; 3 GWh passed in 2023. Text and both citations updated. |
| ocean | Sihwa 2011, 10 × 25.4 MW, ~550 GWh/yr, flood generation, largest tidal plant | tethys-sihwa, iha-sihwa | confirmed (record) | Tethys page not re-fetched (permission timeout). |
| ocean | MeyGen: 4 × 1.5 MW, 18 m rotors, commercial operation 2018, >50 GWh | powermag-meygen-2018, ampeak-meygen | confirmed | Ampeak: >51 GWh (Feb 2026), operating since March 2018. |
| ocean | Seawater ~840× denser than air; 2.5 m/s ≡ 23.6 m/s wind; 18 m rotor at 3 m/s, C_p 0.43 → 1.51 MW | worked examples | confirmed | |
| ocean | Wave flux ρg²H_s²T_e/(64π) = 15.7 kW/m; E = ρgH_s²/16, c_g = gT/4π; λ/2π absorption width | falnes-2007 | confirmed | Physics and arithmetic checked. |

### Biomass (`biomass.html`)

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| bio | Calvin Nobel 1961 | nobel-chemistry-1961 | confirmed | |
| bio | Pró-Álcool launched 1975 | wiki-ethanol-brazil | **source replaced** | Agência FAPESP: created by government decree in November 1975 (`fapesp-proalcool-2016`). |
| bio | 2003 flex-fuel cars; text ended "ethanol,." | wiki-ethanol-brazil | **corrected, source replaced** | Goldemberg 2008, *Biotechnology for Biofuels* 1:6: flex-fuel motors introduced in 2003. Typo fixed, "the first ... car" reworded to "flexible-fuel cars ... go on sale". |
| bio | Carbon debt (Fargione 2008) | fargione-2008 | confirmed | |
| bio | Photosynthesis ceilings 4.6 % (C3) and 6 % (C4) | zhu-long-ort-2008 | confirmed (record) | |
| bio | PV-driven electrolysis ~10× crops annually; crops ~1 % | blankenship-2011, ort-durham-2012, fao-bioenergy-future | confirmed (record) | |
| bio | Decatur capture from 2011; 2017 commercial phase "designed to store over a million tonnes a year" | wiki-beccs | **corrected, source replaced** | ADM and Bioenergy International: IBDP ran 2011–2014 (1 Mt over three years); the Illinois Industrial CCS project started 7 Apr 2017 with capacity up to 2,000 t/day (~0.7 Mt/yr). Heading now "BECCS at commercial scale". |
| bio | "As of 2024, three large-scale BECCS plants, all at ethanol plants" | wiki-beccs (citing GCCSI) | **removed** | No primary source reachable. Replaced with the verifiable fact that the Decatur projects had stored ~3.4 Mt in total by 2021 (ADM). |
| bio | IPCC AR6: residues 5–50 EJ/yr and dedicated biomass 50–250 EJ/yr (medium agreement); BECCS 5.9 (0.5–11.3) Gt/yr, 1.6 below $100/t; poorly planned deployment conflicts (high confidence) | ipcc-ar6-wg3-ch7 (IPCC chapter web page) | confirmed | Economic range in AR6 is 0.8–3.5 Gt; page quotes only the central 1.6. |
| bio | 18 kWh/m²/yr at 1 %; 0.3 % chain; CO₂/C = 44.009/12.011 = 3.664 | worked examples | confirmed | "1,800 kWh/m²" and "30 %" flagged as assumptions on the page. |
| bio | Carbon-loop widget | — | confirmed (labelled) | Tagged "Toy model". |

### Concentrated solar power (`csp.html`)

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| csp | Meadi 1913, 62 m troughs, ~1,200 m², 37–45 kW, closed by 1915 | kalogirou-2004 | confirmed (record) | |
| csp | Solar One 1982–88, 10 MW; Solar Two 1996, ~565 °C salt, 3 h | doe-csp-mirrors-2001 | confirmed (record) | |
| csp | SEGS 354 MW "the world's largest solar plant for three decades" | solarpaces-segs-i, wiki-segs | **corrected** | It was overtaken as a solar thermal facility by Ivanpah in 2014 (the page's own next item), and PV parks outgrew it around then. Now "remain the world's largest solar thermal facility until 2014". |
| csp | Gemasolar 2011: 20 MW, 2,650 heliostats of 120 m², 15 h; Noor III 2018: 150 MW, 247 m, 7 h | solarpaces-gemasolar, solarpaces-noor-iii | unverifiable | SolarPACES/NREL database host did not resolve. Values agree with the records. |
| csp | SolarPACES database "lists more than 80 plants in operation" | solarpaces-csp-db | **softened** | SolarPACES says the database has not been updated since Oct 2023, and the count could not be checked. Now "last updated in 2023, lists dozens". |
| csp | PG&E ending Ivanpah contracts (Jan 2025) | pge-ivanpah-2025 | confirmed (record) | |
| csp | Heliostat normal n̂ = (ŝ + t̂)/|ŝ + t̂|; north-field advantage in the northern hemisphere | geometry | confirmed | |
| csp | C = 800; Carnot 0.638 at 565/30 °C; 1,000 t salt × 1,500 J/kgK × 275 K = 115 MWh_th → 46 MWh_e → 2.3 h at 20 MW | worked examples | confirmed | c_p ≈ 1.5 kJ/kgK is right for nitrate solar salt. |
| csp | "After sunset" widget | — | confirmed (labelled) | Tagged "Teaching model", assumptions listed. |

### Energy storage (`storage.html`)

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| storage | 1907: Engeweiher "the first pumped storage" | wiki-pumped-storage | **corrected, source replaced** | The operator, quoted by Schaffhauser Nachrichten (2 Sep 2026), says it was built in 1909. ASME records an earlier Zurich scheme from 1882. Item now "1909, an early pumped store", mentioning Zurich 1882 (`shn-engeweiher-2026`, `asme-rocky-river`). |
| storage | Rocky River 1929, first large-scale US storage | umich-css-storage-2026, wiki-pumped-storage | **corrected, source replaced** | ASME landmark brochure: built 1926–1928, "the first large-scale pumped-storage development in the United States". Date set to 1928. The UMich factsheet's 1929 is the only dissent left. |
| storage | Li-ion: Whittingham 1970s, Goodenough 1980, Yoshino 1985, on sale 1991 | wiki-li-ion | **source replaced** | Nobel 2019 popular information confirms every date (it says "a major Japanese electronics company" without naming Sony). |
| storage | Hornsdale 2017, 100 MW / 129 MWh, world's largest Li-ion battery | wiki-hornsdale | **source replaced** | Operator FAQ (completed 1 Dec 2017; 2020 expansion) and ARENA ("the world's biggest battery"). Also replaced on the grid page. |
| storage | 2023: batteries 55.7 GW, 83 % of utility-scale additions; PSH ≈ three quarters | ren21-gsr-2024-storage | confirmed (record) | 179/(179 + 55.7) = 76 %. |
| storage | 2025: +11.7 GW PSH, 201 GW, 243 GW under construction | iha-outlook-2026 | confirmed | |
| storage | Li-ion ~1 s response, ~85 % round trip; $334/kWh for 4 h (2024) | pnnl-storage-2019, nrel-battery-cost-2025 | confirmed | NREL/TP-6A40-93281: $334/kWh, 85 % RTE. |
| storage | PSH ~80 %; >90 % of stored electricity | pnnl-storage-2019, iha-outlook-2025 | confirmed (record) | |
| storage | PNNL 2022, 100 MW: LFP 4 h $385, VRFB 10 h $385, PSH 10 h $263, CAES 10 h $122 /kWh (2021 $) | pnnl-storage-2022 (DOE PDF) | confirmed | |
| storage | H₂: 73 % × 51 % = 0.372; baseline 31 % | inl-hydrogen-2023 (DOE PDF) | confirmed, wording softened | The source does not itemise the remaining loss as "compression and storage". Now "compression, storage and the rest of the plant". |
| storage | "At 31 % ... returns about 10 MWh of the roughly 33 MWh it took" | worked example | **corrected** | 33 MWh is the hydrogen's LHV; making it takes ~46 MWh of electricity at 73 %. Now "every 33 MWh of electricity put into the chain gives back only about 10 MWh". |
| storage | Duration 1.29 h; 650 MWh ≈ 40 min of 1,000 MW; toy share 0.905 | worked examples | confirmed | Recomputed (√0.81 split per leg). |
| storage | Day widget | — | confirmed (labelled) | Tagged "Illustrative profiles". |

### The smart grid (`grid.html`)

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| grid | Gotland 1954, first commercial HVDC, 100 kV, 20 MW | wiki-hvdc | **source replaced** | IEEE Milestone (approved, docket 2015-05) and Hitachi Energy; added "96 km undersea cable". |
| grid | 2019: 1,100 kV, 12 GW, 3,300 km | wiki-hvdc | **softened, source replaced** | Hitachi Energy (supplier) gives "over 3,000 km" for Changji–Guquan; now named, with "more than 3,000 km". |
| grid | HVDC loses ~3.5 %/1,000 km, about half of AC | wiki-hvdc | **source replaced** | EIA/ICF 2018: 3.5 % vs 6.7 %; converter losses 0.6–1 % added to the sentence. |
| grid | RoCoF tolerances "1–4 Hz/s" | wiki-utility-frequency | **corrected, source replaced** | GHD for AEMC (2022): Ireland and GB 1 Hz/s, ENTSO-E 2 Hz/s, Australia's ideal standard 4 Hz/s over 250 ms. Sentence now says which is which. |
| grid | Swing equation df/dt = −ΔP f₀/(2HS); 0.125 Hz/s | worked example, dorfler-gross-2023 | confirmed | DOI resolves (Annual Reviews). |
| grid | H = 1 s: nadir ~49.8 Hz with 1 s reserves, ~49.2 Hz with 20 s; deeper than H = 4 s ever goes | `physics/grid.js` | confirmed | Model: 49.81 / 49.24 Hz; worst case at H = 4 s is 49.50 Hz (1,000 MW loss). Widget tagged "Simplified model". |
| grid | NREL 2015: ~20 % solar → marginal curtailment > 30 % | nrel-duck-2015 (NREL abstract) | confirmed | Author list corrected to Denholm, Brinkman, Jorgenson. |
| grid | CAISO: 13,000 MW in ~3 h on spring days | caiso-duck-2016 (CAISO PDF) | **softened** | This is a projection for 2020. Now "by 2020 it expects to need". |
| grid | CAISO batteries 0.2 GW (2018) → 4.9 GW (Apr 2023) | eia-duck-2023 | confirmed, **record URL corrected** | The article is EIA Today in Energy id=61103; the record pointed at id=56880 (an unrelated article). |
| grid | DOE: 30 % better solar forecasts | doe-duck-2017 (DOE page) | confirmed | IBM machine-learning project. |
| grid | Duck caption: ramp ~230 MW, midday −2,200 MW, ramp ~2,060 MW | `physics/grid.js` | confirmed | Reproduced; labelled "Illustrative, not CAISO data". |
| grid | Hornsdale 2017 | see storage | source replaced | |

### Comparison dashboard (`compare.html`, `renewables-compare.json`)

| Page | Claim | Source | Verdict | Note |
|---|---|---|---|---|
| compare | IRENA 2024 global weighted averages: installed cost, CF and LCOE for solar 691/17 %/0.043, onshore 1,041/34 %/0.034, offshore 2,852/42 %/0.079, hydro 2,267/48 %/0.057, geothermal 4,015/88 %/0.060, bioenergy 3,242/73 %/0.087, CSP 3,677/41 %/0.092; coal 0.073, CCGT 0.085 | irena-costs-2025 (IRENA summary PDF, Table S1) | confirmed | Every value matches. |
| compare | WACC 3.8 % (Europe) to 12 % (Africa) | irena-costs-2025 | confirmed | |
| compare | Geothermal "nearly six times" solar per kW | derived | confirmed | 4,015/691 = 5.8. |
| compare | Lazard LCOE+ v18: LCOE, capex, O&M, CF, life and fuel-price ranges for 8 technologies; 60 % debt at 8 % / 40 % equity at 12 %; gas $3.45/MMBtu; lab midpoints | lazard-lcoeplus-2025 (Lazard PDF) | confirmed | All ranges and midpoints match. Record URL updated to the PDF path that resolves. |
| compare | Lovering et al. 2022 land-use medians (ha/TWh/y → m² per MWh/yr), n values, hydro mean 15,000 | lovering-2022 (PLOS ONE Table 1) | confirmed | Primary table read: nuclear 7.1, geothermal 45, wind 130/12,000, residue biomass 130 (n = 4), gas 410/1,900, hydro 650 (n = 952), coal 1,000, CSP 1,300, PV 2,000 (n = 94), dedicated biomass 58,000. |
| compare | Wind farm "turbines and roads cover about 1 %" | derived | confirmed | 130/12,000 = 1.1 %. |
| compare | IPCC AR5 Annex III Table A.III.2 lifecycle min/median/max for 11 technologies | ipcc-ar5-wg3-annex3 | unverifiable (primary) | ipcc.ch and archive.ipcc.ch PDFs returned HTTP 403. Values unchanged; record URL now points to the annex's own page, with the limitation noted. **Still needs a check against the PDF.** |
| compare | EIA 2024 fleet capacity factors (coal 42.6 %, NGCC 60.5 %, nuclear 90.8 %, hydro 34.6 %, wind 34.3 %, PV 23.2 %, solar thermal 25.0 %, geothermal 64.6 %, wood 55.8 %) | eia-epa-table-4-08-a/b | unverifiable | EIA tables returned HTTP 503 or an index page. |
| compare | EIA AEO2026 overnight costs and hydro/bio O&M; AEO2023 CSP O&M | eia-aeo2026-emm, eia-aeo2023-costs | unverifiable | Not reachable this session. |
| compare | Worked examples: CF 0.17; 1,489 full-load hours; CRF 0.0690; LCOE 40.4 $/MWh, capital 32.0 | worked examples | confirmed | Recomputed. |
| compare | Takeaway strings in `compare.js` (3.4/4.3 ¢ vs 7.3/8.5; medians 11–48 g vs 490/820) | IRENA, IPCC | confirmed | Consistent with the dataset. |

## Summary

The physics is sound throughout: Betz, the cube law, ηρgQH, the barrage and wave-flux formulas, the Carnot and cooling-stream ceilings, heliostat geometry, molten-salt storage and the swing equation all check out, and every worked example agrees with a hand recalculation. Shares, TWh and growth rates agree across the ten pages, `renewables-compare.json` and `electricity-mix.json` (2025 World row). The IRENA, Lazard and Lovering figures in the comparison dataset match their primary tables exactly, and the illustrative models are labelled. The tidal-barrage widget is now labelled too.

**Corrected:** Smith–Putnam's "53 m blades" (that is the rotor diameter); la Cour's wind tunnel dated 1891 (it came in 1896); Project Red's "2 MW to the grid" (2.1 MW gross, 1.4 MW net); Mutriku (14 of 16 turbines run, 3 GWh reached in 2023); Engeweiher as "the first pumped storage" in 1907 (built 1909, preceded by Zurich in 1882); Rocky River 1929 changed to 1928; SEGS "largest solar plant for three decades"; the hydrogen "10 of the 33 MWh it took" arithmetic; the Illinois BECCS capacity (~0.7 Mt/yr, not "over a million"); a "60 m/s" readout placeholder; a punctuation typo; and a wrong EIA article URL. Cape Station is updated with the commercial operation Fervo announced on 30 Sep 2026.

**Softened:** La Rance output (500–600 GWh), the SolarPACES plant count, Itaipu's "record", the CAISO 13,000 MW ramp (a projection for 2020), and the "over 3,000 km" for the UHVDC line. The unsourced claim of "three large-scale BECCS plants as of 2024" is removed.

**Sources replaced:** every Wikipedia citation in the section except `wiki-segs` (Mutriku, ethanol in Brazil, BECCS, pumped storage, lithium-ion, Hornsdale, HVDC, utility frequency) now points to primary or near-primary sources: a peer-reviewed paper, IEEE, ASME, Nobel, ARENA and the operator, EIA/ICF, an AEMC study, FAPESP, Goldemberg (2008) and ADM. The `wiki-segs` record is still co-cited for the SEGS/Ivanpah comparison. The Dongfang 26 MW turbine still rests on trade press (two outlets now); official SASAC pages exist but could not be fetched.

**Still doubtful:** IPCC AR5 Table A.III.2 has still not been read from the PDF (ipcc.ch returns 403 to this environment), and the EIA fleet capacity factors and AEO costs, the SolarPACES project pages, Wairākei's 133 MW and Sihwa's figures were not re-fetched. Crossref was blocked, so DOIs were confirmed through publisher pages instead.
