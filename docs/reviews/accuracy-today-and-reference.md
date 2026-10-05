# Accuracy review: Solar today pages and reference pages (Milestone 5)

Reviewer: independent accuracy pass, 2026-10-02.
Scope: `site/today/technologies.html`, `cell-to-grid.html`, `system-builder.html`, `sun-path.html`, `site/equations.html`, `site/glossary.html` (all 200 terms in `data-src/glossary/*.json`), `site/sources.html`, `site/about.html`, datasets `technologies` and `places`, the bibliography DOIs and the dataset licences.

## Summary

The pages are in good shape. Every worked example was recomputed by hand and agrees with the tested function and the prose. All four standard titles are exact. The figures for market share, efficiency and temperature coefficient match their sources. I found and fixed these problems:

- **Wrong citation (system builder).** The claim that −0.27 %/°C is "close to what datasheets for modern silicon modules show" cited First Solar's CdTe datasheet, which is not silicon. It now cites Paudyal & Imenes (2021). That paper's Table 2 gives datasheet Voc coefficients of −0.28 (mono), −0.31 (multi) and −0.25 (HIT) %/°C. The sentence now says the figure is the open-circuit-voltage coefficient, because the model's power coefficient is −0.30.
- **Citation that did not support the claim (cell to grid).** "About 0.7 V open circuit … whatever its size" cited PVEducation's *Effect of temperature* page, which does not say this. I added a new record, `pveducation-voc` (PVEducation, *Open-circuit voltage*: commercial cells about 690 mV), and cited it instead.
- **Units error (cell to grid).** The cold-string formula `1 + β(Tmin − 25)` defined β in "% per °C", which makes the formula wrong by a factor of 100. β is now defined as a fraction per °C, with the conversion spelled out. The worked example already used 0.0027.
- **Misleading physics for beginners:**
  - The bypass diode "opens" when shaded. In circuit language "open" means *not* conducting, and PVEducation calls the idle diode "effectively an open circuit". It now reads "starts to conduct".
  - On the page and in the glossary, a hot spot was described as current pushed "backwards" through the shaded cell. In fact the cell is driven into reverse bias and absorbs power. Both now say that.
  - Glossary *Lift*: it said most lift "points forward along the rotation". That contradicts the wind page and the physics: near the tips, lift points mostly downwind, and only a small forward lean turns the rotor. Fixed.
  - Glossary *Grid frequency*: it said "60 Hz in the Americas". Argentina, Chile and other countries run at 50 Hz, so it now says "North America, parts of South America".
  - Glossary *Pumped storage*: it said "the largest form of grid storage". This is now qualified "by energy stored", to match the storage page. Grid batteries now rival pumped hydro in power capacity.
  - Smaller wording fixes: the Czochralski crystal is "nearly flawless", not "perfect"; the PERC entry now matches the page ("laser-cut openings"); the Francis turbine's "fixed runner blades" now reads "a spinning runner whose curved blades are fixed in shape".
- **Small factual softenings:**
  - Czochralski "found the method in 1918" now reads "published the method in 1918, having found it…". The paper is dated 1918; the discovery is usually dated 1916.
  - The equinox example now says the Sun is at its highest, "almost exactly overhead" (89.96°), instead of "overhead".
  - About page: "the cheapest electricity in history" is now "some of the cheapest", which is what the IEA actually said.
- **Bibliography:**
  - Paudyal & Imenes: added the missing pages (425–439) and expanded the note to include the Voc coefficients.
  - NREL chart record: added a licence field and updated the note. The page now lives at nlr.gov, says the plot is not copyrighted, and asks for the credit line "courtesy of the National Laboratory of the Rockies".
  - Added `license` fields to `geonames` (CC BY 4.0) and `irena-costs-2025` (© IRENA, free reuse with attribution). The Sources page promises that each dataset's licence is "shown on each entry", and these entries had none.
- **Licence statements:**
  - `solar-deployment.json` and `module-prices.json` (in `scripts/build_data.py`) said only "CC BY 4.0 (Our World in Data)". OWID says that third-party data it republishes keeps the original licence. Both now name IRENA's terms (© IRENA, free reuse with attribution).
  - `electricity-mix.json` now notes that the Energy Institute Statistical Review data are under the EI's own terms.
  - I regenerated `assets/CREDITS.md`. `make_credits.py` itself needed no change.

**What I could not reach:**

- The DOI check in this review could not reach Crossref. A second pass on 2026-10-02 re-checked all 97 DOIs online. It still could not use the Crossref API, but it confirmed 75 DOIs on pages that tie the DOI to the work. See [Crossref pass (2026-10-02)](#crossref-pass-2026-10-02); its results replace the verdicts in section 3.
- The URL spot checks for `doe-cigs` and `nrel-atb-equations` were completed in the same pass (see that section).
- Other reviewers edited `sun-path.html`, `system-builder.html` and `cell-to-grid.html` while I was working. My edits applied cleanly, but I did not re-review their changes.

**Left for others (outside my pages):**

- ~~`cost-decline.html` and `state-of-the-field.json` quote Fraunhofer's learning rate as 26.6 %. The July 2026 report says "26.7%".~~ Resolved 2026-10-02: the report gives both figures (see [Crossref pass (2026-10-02)](#crossref-pass-2026-10-02)).

All checks pass after the changes:

- `build_data.py`, `sign-manifest`, `--verify`
- `check_site.py`
- 278/278 unit tests
- 57 e2e tests for the touched pages

## 1. Claims checked

| Page | Claim | Source checked | Verdict |
|---|---|---|---|
| technologies | MG-Si ~98 % pure; Siemens: trichlorosilane, distilled, deposited on hot rods "over more than a week" | PVEducation *Refining silicon*: 98 %; 1100 °C; deposition ~200–300 h | OK |
| technologies | Czochralski 1918 while measuring crystallisation speed of metals | czochralski-1918 (De Gruyter) | Reworded ("published … 1918") |
| technologies | Wafers ~140 µm, diamond wire; Si use 16 g/W (2004) → ~2 g/W (2024) | Fraunhofer PV Report, 14 Jul 2026 | OK (verbatim) |
| technologies | Grain boundaries recombine and shunt; mono dominant from 2018; multi hard to buy by 2020 | PVEducation *Multi-crystalline silicon* ("by 2020 and 2021") | OK |
| technologies | 2025: mono 690 of 706 GW, multi 0, thin film 16 GW (First Solar only) | Fraunhofer PV Report 2026 | OK |
| technologies | ~10¹⁸ cm⁻³ O in Cz; B-O LID; P-doped and Ga-doped wafers immune | PVEducation *Czochralski silicon* | OK |
| technologies | n-type share > 80 % (ITRPV and Fraunhofer) | PV Tech: ITRPV ~82 %; Fraunhofer: 86 % | OK |
| technologies | PERC: UNSW 1989, 22.8 % | blakers-1989 | OK |
| technologies | TOPCon published by Fraunhofer ISE 2014; overtook PERC in 2024 | feldmann-2014; PV Tech ITRPV article | OK |
| technologies | Back-contact HJT > 26 % (2017); back contact holds Si record | yoshikawa-2017; pv magazine 24 Sep 2026: LONGi HIBC 28.29 %, ISFH | OK |
| technologies | Bare Si reflects > 30 %; n₁ = √(n₀n₂); d = λ₀/4n₁; n_Si 3.5 | PVEducation *Anti-reflection coatings* | OK; √3.5 = 1.871, 600/(4×1.87) = 80.2 nm |
| technologies | First Solar 18–20 %; table 18.1–19.7 %, −0.32 %/°C, 0.3 %/yr | Series 7 FT1 datasheet MPD-00671-07-IN, May 2024 | OK |
| technologies | Thin film ~2 % of 2025 production | Fraunhofer (16/706 = 2.3 %); ITRPV ~2 % | OK |
| technologies | CIGS 19.9 % in 2008; a-Si at RCA 1976 | repins-2008; carlson-wronski-1976 | OK |
| technologies | Cell shares 2025: TOPCon 75, PERC 14, HJT 5, TBC 5, HBC 0.1 % | TaiyangNews, 7 Sep 2026 (Markus Fischer, ITRPV) | OK |
| technologies | Module η 2025: PERC 21.7, TOPCon 23.5, HJT 23.5, TBC 24.1 % | PV Tech, 25 Jun 2026 | OK |
| technologies | Tiger Neo −0.29 %/°C vs p-type −0.35; ≤1 % then 0.4 %/yr | jinkosolar.com/en/site/tigerneo | OK |
| technologies | HJT −0.29, CIGS −0.38 %/°C (datasheet) | Paudyal & Imenes Table 2 (ScienceDirect) | OK |
| technologies | Field median ~0.5 %/yr over nearly 2000 measurements | jordan-kurtz-2013 | OK |
| technologies | Worked example 580 W / 2.58 m² = 22.5 % | arithmetic | OK (0.2248) |
| cell-to-grid | Cell ≈ 0.7 V open circuit, independent of size | PVEducation *Open-circuit voltage* (≈690 mV commercial) | Citation replaced |
| cell-to-grid | 72 × 0.70 = 50.4 V; model 50.7 V; I²R 1.74 W vs 0.436 W; 3 × 13.2 = 39.6 A | arithmetic / system.js | OK |
| cell-to-grid | Bypass diode behaviour; ≤ ~15 Si cells per diode | PVEducation *Bypass diodes* | OK; "opens" → "starts to conduct" |
| cell-to-grid | Voc rises ~2 mV/°C as it cools | PVEducation: 2.2 mV/°C | OK |
| cell-to-grid | NEC: Voc corrected to lowest expected temperature using maker's coefficient | Holt, EC&M 18 Jul 2016 (690.7, 110.3(B)) | OK |
| cell-to-grid | Cold-string rule: 18 × 50.7 × 1.0945 = 998.8 V; 19 → 1054 V | arithmetic | OK; β unit fixed |
| cell-to-grid | NOCT at 800 W/m², 20 °C, 1 m/s; most modules 40–45 °C | PVEducation *NOCT* (also cites a "typical 48 °C" older study) | OK |
| cell-to-grid | 25 + 25×1000/800 = 56.25 °C; 550 × 0.90625 = 498.4 W | arithmetic | OK |
| cell-to-grid | P&O, incremental conductance (dI/dV vs −I/V); local maxima under shading near multiples of group voltage | esram-chapman-2007; patel-agarwal-2008 | OK |
| cell-to-grid | IEC 61215-1:2021 title and Ed. 2.0, 23 Feb 2021 | webstore.iec.ch/publication/61345 | Exact |
| cell-to-grid | IEC 61730-1:2023 title, Ed. 3.0 | ANSI/SIS/iTeh listings (2023-09) | Exact |
| cell-to-grid | IEEE 1547-2018 full title | IEEE Xplore 8332112 | Exact |
| cell-to-grid | UL 1741 title; supplements IEEE 1547 / 1547.1 for grid-connected units | shopulstandards.com (Ed. 3, 28 Sep 2021, rev. Aug 2026) | Exact |
| cell-to-grid | Grid-forming inverters | Lin et al. 2020, NREL/TP-5D00-73476 | OK |
| system-builder | Model Voc coefficient −0.27 %/°C ≈ datasheets | was CdTe datasheet; now Paudyal & Imenes (Si: −0.25 to −0.31) | Citation fixed |
| system-builder | 25 % margin on Isc; 70 °C hot-cell check; 0.97 inverter; 10 % losses | system.js / system-builder.js | Matches code |
| system-builder | 12 × 548 W = 6.58 kWp; /5 = 1.316 | arithmetic | OK |
| system-builder | Half-sine clipping closed form; 10 kW peak, 8 kW cap → 8.52 % | θ = asin 0.8; (6 − 8(π/2 − θ))/10 = 0.0852 | OK |
| sun-path | NOAA calculator equations from Meeus | gml.noaa.gov calcdetails | OK |
| sun-path | Kasten–Young AM formula; ≈38 at horizon; AM 1.994 at 60° | PVEducation *Air mass*; arithmetic (37.9) | OK |
| sun-path | Meinel: 1353·[(1 − ah)0.7^(AM^0.678) + ah], a = 0.14/km; diffuse ≈10 % | PVEducation *Air mass* | OK; 846, 947, 1074 W/m² recomputed |
| sun-path | Declination ±23.4° | PVEducation (±23.45°) | OK |
| sun-path | Peak sun hours = kWh/m²/day; clear-sky values not for sizing | PVEducation *Average solar radiation*, *Calculation of solar insolation* | OK |
| sun-path | Tilt = latitude rule of thumb | PVEducation *Solar radiation on a tilted surface* | OK |
| sun-path | Calgary 45° vs Beek 34°; NH fit; 28.76° at 34.05° N | Jacobson & Jadhav 2018 (author PDF, verbatim) | OK |
| sun-path | Albedo grass 0.20, concrete 0.30, sand 0.40, fresh snow 0.75 | pvlib 0.16.1 SURFACE_ALBEDOS | OK |
| sun-path | NREL renamed National Laboratory of the Rockies, Dec 2025 | pv magazine 3 Dec 2025 | OK |
| sun-path | Isotropic model: Liu & Jordan 1963; correct results back to 1942; anisotropic recommended | kamphuis-2020 (ScienceDirect abstract) | OK |
| sun-path | Zenith 10.61° LA June noon; −11.66° Longyearbyen Dec; cos AOI 0.9654; POA 772.3 + 74.6 + 9.3 = 856.2 (+24 %) | arithmetic | OK |
| sun-path | NH summer half-year ~1 week longer; distance effect ±3.3 % | standard orbital facts | OK |
| sun-path | Equinox example "overhead" at 89.96° | arithmetic | Reworded |
| equations | All 31 worked examples (photon, gap, diode, Voc, FF, η, SQ, yield, AM, AOI, CF, CRF/LCOE, Wright, wind, Betz, hydro, tidal, wave, Carnot, round trip) | recomputed | All agree with prose. Hydro and tidal use g = 9.80665 in code; the prose shows 9.81 but rounds to the same 44.1 MW / 3.2 × 10¹² J. Tidal 893.5 MWh is quoted as "about 890". The energy-yield symbol list defines G, which is not in that equation (harmless). |
| equations | SQ: 30 % at 1.1 eV (6000 K); Rühle 33.16 % at 1.34 eV; T_sun 5772 K | shockley-queisser-1961; ruhle-2016; prsa-2016 | OK |
| equations | STC = 1000 W/m², AM1.5, 25 °C; IEC 60904-3:2019 title | PVEducation *Solar cell efficiency*; webstore.iec.ch/publication/61084 | OK |
| equations | LCOE capital-recovery form | ATB page not reachable; formula standard | OK (source page unverified) |
| about | "laboratory curiosity in 1839"; "cheapest electricity in history" | Becquerel 1839; IEA wording is "some of the lowest-cost electricity ever seen" | Softened |
| sources/about | Licence statements (MIT code, CC BY text, data per source) | see §4 | OK after licence fields added |
| places dataset | 28 presets: coordinates, elevations, standard UTC offsets | spot-checked (Calama 2260 m, Quito 2850 m, Lhasa 3650 m; Chile −4, India +5.5, Alice Springs +9.5) | OK; GeoNames CC BY 4.0 confirmed |

## 2. Glossary

All 207 entries (200 unique terms; 7 duplicates across files are identical) were read. Changed:

| Term | Problem | Fix |
|---|---|---|
| aerodynamic-lift | "most of the lift points forward along the rotation" (wrong; contradicts wind page) | mostly downwind, small forward lean drives rotor |
| hot-spot | current "backwards" | forced into reverse bias, absorbs power |
| grid-frequency | "60 Hz in the Americas" | North America, parts of South America, parts of Asia |
| pumped-storage | "largest form of grid storage" (unqualified) | "By energy stored, the largest…" |
| czochralski-process | "perfect crystal" | "nearly flawless crystal" |
| perc | "small spots" vs page "laser-cut openings" | aligned with page |
| francis-turbine | "fixed runner blades" could read as non-rotating | "a spinning runner whose curved blades are fixed in shape (not adjustable)" |

Checked and left as they are (accurate at beginner level): the band-gap, electronvolt (1.6–3.3 eV visible), full-load hours (0.17 × 8760 = 1489), intrinsic density 10¹⁰ cm⁻³, built-in potential 0.6–0.9 V, absorption depth (63 %), Betz 16/27, flash steam > 182 °C, molten salt 240–565 °C, equation of time ≤ ~16 min, NOCT 40–45 °C, wafer 0.14 mm, CdTe gap ~1.5 eV, SQ ~33 % at 1.34 eV, and the rest.

## 3. DOI and URL audit

### 3a. DOIs (all 97 DOIs in `site/data/sources.json`)

The script is equivalent to `python3 -c "import json;s=json.load(open('site/data/sources.json'));[print(k,v['doi'],v.get('year'),v['title']) for k,v in s.items() if v.get('doi')]"`. Crossref could not be reached (see Summary), so the verdicts say how each DOI was checked. The [Crossref pass (2026-10-02)](#crossref-pass-2026-10-02) at the end of this file replaces these verdicts.

| Source id | DOI | Recorded title (year) | Verdict |
|---|---|---|---|
| `adams-day-1877` | 10.1098/rspl.1876.0024 | The action of light on selenium (1877) | Confirmed: Royal Society PDF at this DOI (page header dated 1876; vol. 25 spans 1876–77, so 1877 is defensible) |
| `altermatt-2003` | 10.1063/1.1529297 | Reassessment of the intrinsic carrier density in crystalline silicon in view of band-ga… (2003) | Title/venue/pages confirmed (AIP page J. Appl. Phys. 93(3) 1598); DOI not resolved |
| `babayigit-2016` | 10.1038/nmat4572 | Toxicity of organometal halide perovskite solar cells (2016) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `blakers-1989` | 10.1063/1.101596 | 22.8% efficient silicon solar cell (1989) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `blankenship-2011` | 10.1126/science.1200165 | Comparing photosynthetic and photovoltaic efficiencies and recognizing the potential fo… (2011) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `burschka-2013` | 10.1038/nature12340 | Sequential deposition as a route to high-performance perovskite-sensitized solar cells (2013) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `carlson-wronski-1976` | 10.1063/1.88617 | Amorphous silicon solar cell (1976) | Title/venue/pages confirmed (AIP page APL 28(11) 671); DOI not resolved |
| `chapin-1954` | 10.1063/1.1721711 | A new silicon p-n junction photocell for converting solar radiation into electrical power (1954) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `chuang-2014` | 10.1038/nmat3984 | Improved performance and stability in quantum dot solar cells through band alignment en… (2014) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `cuevas-1982` | 10.1016/0038-092X(82)90078-0 | 50 per cent more output power from an albedo-collecting flat panel using bifacial solar… (1982) | Title/venue/pages confirmed (ADS 1982SoEn...29..419C); DOI not resolved |
| `czochralski-1918` | 10.1515/zpch-1918-9212 | Ein neues Verfahren zur Messung der Kristallisationsgeschwindigkeit der Metalle (1918) | Confirmed: De Gruyter landing page carries this DOI |
| `de-vos-1980` | 10.1088/0022-3727/13/5/018 | Detailed balance limit of the efficiency of tandem solar cells (1980) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `de-vos-pauwels-1981` | 10.1007/BF00901283 | On the thermodynamic limit of photovoltaic energy conversion (1981) | Confirmed: Springer landing page; ADS 1981ApPhy..25..119D |
| `dorfler-gross-2023` | 10.1146/annurev-control-052622-032657 | Control of low-inertia power systems (2023) | Confirmed: Annual Reviews landing page; vol. 6 (2023) |
| `dupre-2015` | 10.1016/j.solmat.2015.03.025 | Physics of the temperature coefficients of solar cells (2015) | Title/venue/pages confirmed (140, 92–100 confirmed); DOI not resolved |
| `einstein-1905` | 10.1002/andp.19053220607 | Über einen die Erzeugung und Verwandlung des Lichtes betreffenden heuristischen Gesicht… (1905) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `esram-chapman-2007` | 10.1109/TEC.2006.874230 | Comparison of photovoltaic array maximum power point tracking techniques (2007) | Title/venue/pages confirmed (ADS 2007ITEnC..22..439E); DOI not resolved |
| `falnes-2007` | 10.1016/j.marstruc.2007.09.001 | A review of wave-energy extraction (2007) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `fargione-2008` | 10.1126/science.1152747 | Land clearing and the biofuel carbon debt (2008) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `farmer-lafond-2016` | 10.1016/j.respol.2015.11.001 | How predictable is technological progress? (2016) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `feldmann-2014` | 10.1016/j.solmat.2013.09.017 | Passivated rear contacts for high-efficiency n-type Si solar cells providing high inter… (2014) | Title/venue/pages confirmed (title and authors confirmed); DOI not resolved |
| `fritts-1883` | 10.2475/ajs.s3-26.156.465 | On a new form of selenium cell, and some electrical discoveries made by its use (1883) | Title/venue/pages confirmed (ADS 1883AmJS...26..465F); DOI not resolved |
| `gaertner-2020-iea15` | 10.2172/1603478 | IEA Wind TCP Task 37: Definition of the IEA 15-Megawatt Offshore Reference Wind Turbine (2020) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `geisz-2008` | 10.1063/1.2988497 | 40.8% efficient inverted triple-junction solar cell with two independently metamorphic … (2008) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `geisz-2020` | 10.1038/s41560-020-0598-5 | Six-junction III–V solar cells with 47.1% conversion efficiency under 143 Suns concentr… (2020) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `goldemberg-2008` | 10.1186/1754-6834-1-6 | The Brazilian biofuels industry (2008) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `green-1981-ff` | 10.1016/0038-1101(81)90062-9 | Solar cell fill factors: general graph and empirical expressions (1981) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `green-2003-temperature` | 10.1002/pip.496 | General temperature dependence of solar cell performance and implications for device mo… (2003) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `green-tables-66` | 10.1002/pip.3919 | Solar cell efficiency tables (Version 66) (2025) | Confirmed: Wiley landing page (2025) |
| `green-tables-67` | 10.1002/pip.70068 | Solar cell efficiency tables (Version 67) (2026) | Confirmed: Wiley landing page (2026) |
| `green-tables-68` | 10.1016/j.joule.2026.102494 | Solar cell efficiency tables: Version 68 (2026) | Confirmed: ScienceDirect: Joule 10(7), 102494, online 28 May 2026 |
| `hao-2020` | 10.1038/s41560-019-0535-7 | Ligand-assisted cation-exchange engineering for high-efficiency colloidal Cs1−xFAxPbI3 … (2020) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `haschke-2017` | 10.1039/c7ee00286f | The impact of silicon solar cell architecture and cell interconnection on energy yield … (2017) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `henry-1980` | 10.1063/1.328272 | Limiting efficiencies of ideal single and multiple energy gap terrestrial solar cells (1980) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `hertz-1887` | 10.1002/andp.18872670827 | Ueber einen Einfluss des ultravioletten Lichtes auf die electrische Entladung (1887) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `ieee-1547-2018` | 10.1109/IEEESTD.2018.8332112 | IEEE 1547-2018 Standard for Interconnection and Interoperability of Distributed Energy … (2018) | Confirmed: IEEE Xplore document 8332112 |
| `ipcc-ar6-wg3-ch7` | 10.1017/9781009157926.009 | Agriculture, Forestry and Other Land Uses (AFOLU). In: Climate Change 2022: Mitigation … (2022) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `jacobson-jadhav-2018` | 10.1016/j.solener.2018.04.030 | World estimates of PV optimal tilt angles and ratios of sunlight incident upon tilted a… (2018) | Confirmed: Author PDF prints this DOI; Solar Energy 169, 55–66 |
| `jordan-2016` | 10.1002/pip.2744 | Compendium of photovoltaic degradation rates (2016) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `jordan-kurtz-2013` | 10.1002/pip.1182 | Photovoltaic degradation rates — an analytical review (2013) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `kalogirou-2004` | 10.1016/j.pecs.2004.02.001 | Solar thermal collectors and applications (2004) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `kamphuis-2020` | 10.1016/j.solener.2020.02.067 | Perspectives on the origin, derivation, meaning, and significance of the isotropic sky … (2020) | Confirmed: ScienceDirect: Solar Energy 201, 8–12 |
| `kasten-young-1989` | 10.1364/AO.28.004735 | Revised optical air mass tables and approximation formula (1989) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `kavlak-2018` | 10.1016/j.enpol.2018.08.015 | Evaluating the causes of cost reduction in photovoltaic modules (2018) | Title/venue/pages confirmed (RePEc v123 p700–710); DOI not resolved |
| `keller-2024` | 10.1038/s41560-024-01472-3 | High-concentration silver alloying and steep back-contact gallium grading enabling copp… (2024) | Confirmed: Nature Energy article s41560-024-01472-3 |
| `khenkin-2020` | 10.1038/s41560-019-0529-5 | Consensus statement for stability assessment and reporting for perovskite photovoltaics… (2020) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `kim-park-2012` | 10.1038/srep00591 | Lead iodide perovskite sensitized all-solid-state submicron thin film mesoscopic solar … (2012) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `kojima-2009` | 10.1021/ja809598r | Organometal halide perovskites as visible-light sensitizers for photovoltaic cells (2009) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `kumar-rao-2014` | 10.1039/C3EE41981A | Physics and chemistry of CdTe/CdS thin film heterojunction photovoltaic devices: fundam… (2014) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `lenard-1902` | 10.1002/andp.19023130510 | Ueber die lichtelektrische Wirkung (1902) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `lin-2023` | 10.1038/s41560-023-01255-2 | Silicon heterojunction solar cells with up to 26.81% efficiency achieved by electricall… (2023) | Confirmed: Nature Energy article s41560-023-01255-2 |
| `liu-jordan-1963` | 10.1016/0038-092X(63)90006-9 | The long-term average performance of flat-plate solar-energy collectors: with design da… (1963) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `lovering-2022` | 10.1371/journal.pone.0270155 | Land-use intensity of electricity production and tomorrow's energy landscape (2022) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `luque-marti-1997` | 10.1103/PhysRevLett.78.5014 | Increasing the efficiency of ideal solar cells by photon induced transitions at interme… (1997) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `mailoa-2015` | 10.1063/1.4914179 | A 2-terminal perovskite/silicon multijunction solar cell enabled by a silicon tunnel ju… (2015) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `manwell-2009` | 10.1002/9781119994367 | Wind Energy Explained: Theory, Design and Application (2nd edition) (2009) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `mathew-2014` | 10.1038/nchem.1861 | Dye-sensitized solar cells with 13% efficiency achieved through the molecular engineeri… (2014) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `millikan-1916` | 10.1103/PhysRev.7.355 | A direct photoelectric determination of Planck's "h" (1916) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `min-2021` | 10.1038/s41586-021-03964-8 | Perovskite solar cells with atomically coherent interlayers on SnO2 electrodes (2021) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `mollerstrom-2025` | 10.1177/0309524X241260061 | Wind power development: A historical review (2025) | Confirmed: SAGE landing page; ADS 2025WiEng..49..499M |
| `nemet-2009` | 10.1016/j.enpol.2008.10.031 | Interim monitoring of cost dynamics for publicly supported energy technologies (2009) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `nemet-2019` | 10.4324/9780367136604 | How Solar Energy Became Cheap: A Model for Low-Carbon Innovation (2019) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `nsrdb-2018` | 10.1016/j.rser.2018.03.003 | The National Solar Radiation Data Base (NSRDB) (2018) | Title/venue/pages confirmed (RePEc v89 p51–60); DOI not resolved |
| `okulov-van-kuik-2012` | 10.1002/we.464 | The Betz–Joukowsky limit: on the contribution to rotor aerodynamics by the British, Ger… (2012) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `oregan-gratzel-1991` | 10.1038/353737a0 | A low-cost, high-efficiency solar cell based on dye-sensitized colloidal TiO2 films (1991) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `patel-agarwal-2008` | 10.1109/TIE.2008.917118 | Maximum power point tracking scheme for PV systems operating under partially shaded con… (2008) | Title/venue/pages confirmed (55(4), 1689–1698 confirmed); DOI not resolved |
| `paudyal-imenes-2021` | 10.1016/j.solener.2021.06.013 | Investigation of temperature coefficients of PV modules through field measured data (2021) | Confirmed: ScienceDirect page: Solar Energy 224, 425–439 (container pages were missing: fixed) |
| `pena-2025-mutriku` | 10.26748/KSOE.2024.099 | The Mutriku Breakwater Wave Plant: Improvements and Their Influence on the Levelized Co… (2025) | Confirmed: Journal PDF prints this DOI; 39(2), 205–211 |
| `polman-2016` | 10.1126/science.aad4424 | Photovoltaic materials: Present efficiencies and future challenges (2016) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `price-2005-blyth` | 10.1260/030952405774354921 | James Blyth — Britain's first modern wind power pioneer (2005) | Confirmed: SAGE landing page; ADS 2005WiEng..29..191P |
| `prsa-2016` | 10.3847/0004-6256/152/2/41 | Nominal values for selected solar and planetary quantities: IAU 2015 Resolution B3 (2016) | Confirmed: IOPscience landing page |
| `pvlib-2023` | 10.21105/joss.05994 | pvlib python: 2023 project update (2023) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `pvwatts-v5-2014` | 10.2172/1158421 | PVWatts Version 5 Manual (2014) | Confirmed: OSTI biblio 1158421 (NREL/TP-6A20-62641) |
| `ramanujam-singh-2017` | 10.1039/C7EE00826K | Copper indium gallium selenide based solar cells – a review (2017) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `reda-andreas-2004` | 10.1016/j.solener.2003.12.003 | Solar position algorithm for solar radiation applications (2004) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `ren-2023` | 10.1038/s41586-022-05460-z | Hydroxamic acid pre-adsorption raises the efficiency of cosensitized solar cells (2023) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `repins-2008` | 10.1002/pip.822 | 19.9%-efficient ZnO/CdS/CuInGaSe2 solar cell with 81.2% fill factor (2008) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `richter-2013` | 10.1109/JPHOTOV.2013.2270351 | Reassessment of the limiting efficiency for crystalline silicon solar cells (2013) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `riordan-hoddeson-1997` | 10.1109/6.591664 | The origins of the pn junction (1997) | Confirmed: ACM DL record of this DOI |
| `rodriguez-gallegos-2020` | 10.1016/j.joule.2020.05.005 | Global techno-economic performance of bifacial and tracking photovoltaic systems (2020) | Title/venue/pages confirmed (ScienceDirect/Sandia record); DOI not resolved |
| `ross-nozik-1982` | 10.1063/1.331124 | Efficiency of hot-carrier solar energy converters (1982) | Title/venue/pages confirmed (title confirmed (NREL record)); DOI not resolved |
| `ruhle-2016` | 10.1016/j.solener.2016.02.015 | Tabulated values of the Shockley–Queisser limit for single junction solar cells (2016) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `shockley-1949` | 10.1002/j.1538-7305.1949.tb03645.x | The theory of p-n junctions in semiconductors and p-n junction transistors (1949) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `shockley-queisser-1961` | 10.1063/1.1736034 | Detailed balance limit of efficiency of p-n junction solar cells (1961) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `smith-1873` | 10.1038/007303e0 | Effect of light on selenium during the passage of an electric current (1873) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `sproul-green-1991` | 10.1063/1.349645 | Improved value for the silicon intrinsic carrier concentration from 275 to 375 K (1991) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `street-1991` | 10.1017/CBO9780511525247 | Hydrogenated Amorphous Silicon (1991) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `sze-ng-2007` | 10.1002/0470068329 | Physics of Semiconductor Devices, 3rd edition (2007) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `tang-1986` | 10.1063/1.96937 | Two-layer organic photovoltaic cell (1986) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `tang-2011` | 10.1038/nmat3118 | Colloidal-quantum-dot photovoltaics using atomic-ligand passivation (2011) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `van-kuik-2007` | 10.1002/we.218 | The Lanchester–Betz–Joukowsky limit (2007) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `wright-1936` | 10.2514/8.155 | Factors affecting the cost of airplanes (1936) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `yoshikawa-2017` | 10.1038/nenergy.2017.32 | Silicon heterojunction solar cell with interdigitated back contacts for a photoconversi… (2017) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `zarrouk-moon-2014` | 10.1016/j.geothermics.2013.11.001 | Efficiency of geothermal power plants: A worldwide review (2014) | Title/venue/pages confirmed (ScienceDirect record); DOI not resolved |
| `zhang-2020` | 10.1016/j.mattod.2020.01.001 | Comparative studies of optoelectrical properties of prominent PV materials: Halide pero… (2020) | Confirmed: ScienceDirect: Materials Today 36, 18–29 |
| `zhu-2022` | 10.1038/s41563-022-01244-y | Single-junction organic solar cells with over 19% efficiency enabled by a refined doubl… (2022) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |
| `zhu-long-ort-2008` | 10.1016/j.copbio.2008.02.004 | What is the maximum efficiency with which photosynthesis can convert solar energy into … (2008) | Not resolved online (Crossref/doi.org blocked); DOI, title and venue match reviewer knowledge |

Corrections made: `paudyal-imenes-2021` container now "Solar Energy 224, 425–439". No wrong DOI, title, year or author was found among the DOIs that could be checked. One borderline year: `adams-day-1877` (the paper was read in June 1876 in vol. 25, 1876–77; left as 1877).

### 3b. Non-DOI URLs spot-checked (31)

| Source id | URL host | Result |
|---|---|---|
| pveducation-noct, -refining, -czochralski, -multicrystalline, -bypass, -temperature, -arc, -air-mass, -insolation, -tilted-surface, -average-radiation, -declination, -arbitrary-tilt, -efficiency (14) | pveducation.org | All load and support the cited wording |
| pveducation-voc (new) | pveducation.org | Loads; ~690 mV commercial, 764 mV best |
| fraunhofer-pv-report-2026 | ise.fraunhofer.de | Loads; report dated 14 July 2026; figures verbatim |
| pv-tech-itrpv-2026 | pv-tech.org | Loads; 25 Jun 2026; figures verbatim |
| taiyangnews-itrpv-2026 | taiyangnews.info | Loads; 7 Sep 2026, R. Gattu; shares verbatim |
| itrpv-2026 | vdma.eu | Loads; 17th edition 2026 downloadable |
| holt-nec-690-2016 | ecmweb.com | Loads; Mike Holt, 18 Jul 2016 |
| first-solar-series-7 | firstsolar.com | Loads; MPD-00671-07-IN May 2024 |
| jinko-tiger-neo | jinkosolar.com | Loads; figures verbatim |
| iec-61215-1-2021, iec-60904-3-2019 | webstore.iec.ch | Load; titles and editions exact |
| ul-1741 | shopulstandards.com | Loads; Ed. 3, 28 Sep 2021 |
| pv-magazine-longi-hibc-2026 | pv-magazine.com | Loads; 24 Sep 2026, 28.29 %, ISFH |
| pv-magazine-nrel-rename-2025 | pv-magazine.com | Loads (via http redirect); 3 Dec 2025 |
| noaa-solar-calc | gml.noaa.gov | Loads; Meeus |
| pvlib-albedo | pvlib-python.readthedocs.io | Loads; v0.16.1 values match |
| lin-2020-grid-forming | research-hub.nrel.gov | Listed in search (also docs.nrel.gov/docs/fy21osti/73476.pdf) |
| pvwatts-calculator | pvwatts.nlr.gov | Exists (search results, version page) |
| nrel-cell-efficiency-chart | nrel.gov → nlr.gov | Content now at nlr.gov/pv/cell-efficiency; reuse terms confirmed |
| doe-cigs | energy.gov | **Not reached** (fetch permission timed out; not found in search) |
| nrel-atb-equations | atb.nrel.gov | **Not reached** (2024 page not confirmed) |

## 4. Licence audit

| Dataset | Statement (after review) | Source terms checked | Verdict |
|---|---|---|---|
| technologies.json | CC BY 4.0 compilation; figures from cited sources | facts from reports/datasheets | OK |
| places.json | CC BY 4.0; GeoNames data CC BY 4.0 | geonames.org/about: CC BY 4.0 | OK |
| efficiency-records.json | CC BY 4.0 compilation; values are facts | NREL/NLR chart: "not copyrighted… with a notation" | OK |
| materials.json, timeline.json, state-of-the-field.json | CC BY 4.0 compilations | facts | OK |
| renewables-compare.json | Compilation CC BY 4.0; OWID/Ember CC BY 4.0 | Ember CC BY 4.0 (ember-energy.org/creative-commons); OWID CC BY | OK |
| solar-deployment.json | was "CC BY 4.0 (OWID; underlying IRENA data)" | OWID: third-party data "subject to the license terms from the original third-party authors"; IRENA: free use with attribution "© IRENA" | **Fixed**: names IRENA's terms |
| module-prices.json (build_data.py) | was "CC BY 4.0 (Our World in Data)" | as above (IRENA among underlying sources) | **Fixed** |
| electricity-mix.json (build_data.py) | was "CC BY 4.0 (OWID; Ember CC BY 4.0)" | EI Statistical Review: free to access, but reuse terms not found on the pages I could reach | **Fixed**: notes EI's own terms |
| assets/CREDITS.md | regenerated by make_credits.py | MIT/CC BY statement matches About; Tauri MIT/Apache-2.0, pvlib BSD-3, Playwright Apache-2.0, pytest MIT correct | OK; no script change needed |
| sources.html | "OWID and Ember series are CC BY 4.0" | true of OWID's own processing and Ember | OK |

Source-record licence fields added: `geonames` (CC BY 4.0), `irena-costs-2025` (© IRENA, free reuse with attribution), `nrel-cell-efficiency-chart` (not copyrighted; credit line).

## Crossref pass (2026-10-02)

**Method.** The Crossref REST API was still unreachable. `api.crossref.org`, `doi.org` and publisher URLs typed in by hand were refused by WebFetch: the permission prompts timed out, and curl to these hosts gets a 403 from the egress proxy. So each of the 97 DOIs was checked this way instead:

1. Search the web for the DOI string, or for the title plus the DOI.
2. Accept the DOI as confirmed only when a result page ties that exact DOI to the work, and the title (and, where shown, the volume, issue and pages) matches our record. The page could be a URL containing the DOI (publisher, doi.org, RePEc, oa.mg, colab.ws, Research Solutions), an ADS bibcode, an AIP or Optica URL that encodes volume, issue and page, or a fetched page that prints the DOI.
3. Where the search result could be fetched (nature.com, the NREL/NLR research hub, RePEc, JOSS, JOET, cambridge.org, ipcc.ch), read the full metadata and compare it field by field.

This is not a Crossref lookup, and no record claims one. "verified" was set to 2026-10-02 only on records whose DOI-to-work link was confirmed this way. The per-DOI log, with evidence, is in the session scratchpad as `doi-log.tsv`.

**Counts (97 DOIs):**

| Result | Count |
|---|---|
| OK: DOI confirmed for this work, metadata consistent | 75 (20 of them with full metadata read from the publisher or a repository page) |
| Minor, fixed: issue and/or pages were missing from the container | 7 (included in the 75) |
| Wrong DOI (points to a different work) | 0 |
| Missing DOI (does not resolve) | 0 |
| Not confirmed: title, venue and pages match, but no page tied the DOI to the work | 22 (listed below; "verified" left unchanged) |

No year changes were needed. No record had an online-first versus issue-year mismatch: `jordan-kurtz-2013`, online 2011, already uses the issue year 2013.

**Changes:**

| id | What changed | Evidence |
|---|---|---|
| `burschka-2013` | container `Nature 499` → `Nature 499(7458), 316–319` | nature.com/articles/nature12340: vol. 499, issue 7458, pp. 316–319, 18 Jul 2013 (online 10 Jul) |
| `geisz-2020` | `Nature Energy 5` → `Nature Energy 5(4), 326–335` | nature.com article page and NLR research hub: 5(4) 326–335, Apr 2020 |
| `khenkin-2020` | `Nature Energy 5` → `Nature Energy 5(1), 35–49` | RePEc natene v5y2020i1 (URL encodes the DOI): pp. 35–49 |
| `ren-2023` | `Nature 613` → `Nature 613(7942), 60–65` | RePEc nature v613y2023i7942: pp. 60–65 |
| `yoshikawa-2017` | `Nature Energy 2, 17032` → `Nature Energy 2(5), 17032` (both copies) | RePEc natene v2y2017i5; 11 authors match |
| `ross-nozik-1982` | `Journal of Applied Physics 53, 3813–3818` → `53(5), 3813–3818` | NREL research hub: issue 5, pp. 3813–3818; ADS 1982JAP....53.3813R |
| `hao-2020` | `Nature Energy 5` → `Nature Energy 5(1)` | RePEc natene v5y2020i1 search result; nature.com title match |
| `doe-cigs` (both copies) | URL `energy.gov/eere/solar/copper-indium-gallium-diselenide` → `https://www.energy.gov/cmei/systems/copper-indium-gallium-diselenide`; year 2024 → 2025; authors → "U.S. Department of Energy"; note adds the page history | The old URL serves a page whose canonical URL is the new one (breadcrumb "Integrated Energy Systems Office"). Published 24 Jan 2014, modified 29 Sep 2025. The band-gap sentence (1.04 eV CIS to 1.68 eV CGS by substituting Ga for In) is unchanged, so no page text changed. |
| `nrel-atb-equations` | verified only | atb.nrel.gov/electricity/2024/equations_&_variables loads; LCOE = (FCR × CAPEX + FOM)/(CF × 8,760) + VOM + FUEL − PTC and the CRF definition match our note |
| `fraunhofer-pv-report-2026` (both copies) | note now says where each figure appears; verified | Report PDF, version of 14 July 2026. Slide "Price Experience Curve" (p. 53): "the module price dropped about 26.6% over the past 45 years". Executive summary (p. 9) and the web page: 26.7 %. p. 34: 22.7 % (Q4 2024); p. 33: 26.0 % lab module. |
| `state-of-the-field.json` → `learning-rate` | value stays 26.6 (the fitted slide value); `as_of` 2026 → 2026-07; detail names the 14 July 2026 report and notes the 26.7 % rounding in its summary; `last_verified` 2026-10-02 | as above |
| `site/today/cost-decline.html` | sentence now reads "…about 26.6 % (Photovoltaics Report, 14 July 2026; its executive summary rounds this to 26.7 %)" | as above |
| 75 DOI records | `verified` → 2026-10-02 | see Method |

**Not confirmed (22).** For these, the title, venue and usually volume and pages were found, but no reachable page tied the DOI string to the work. Most are Elsevier articles that searches return only as ScienceDirect PII URLs. Nothing suggests an error. A Crossref API run from an unrestricted machine would close them out.

| id | DOI | What was found |
|---|---|---|
| `chapin-1954` | 10.1063/1.1721711 | search: no hit; retry search: pubs.aip.org/aip/jap/article/25/5/676 title (DOI not in URL) |
| `dupre-2015` | 10.1016/j.solmat.2015.03.025 | search: no hit; retry search: sciencedirect pii S0927024815001403 title + ADS 2015SEMSC.140...92D |
| `esram-chapman-2007` | 10.1109/TEC.2006.874230 | search: researchgate title only; retry search: only citation listings (TEC 22, 439-449); no page with DOI |
| `falnes-2007` | 10.1016/j.marstruc.2007.09.001 | search: sciencedirect pii S0951833907000482 "A review of wave-energy extraction" (pii, not DOI) |
| `farmer-lafond-2016` | 10.1016/j.respol.2015.11.001 | search: no hit; retry search: ideas.repec.org respol v45y2016i3p647-665 title |
| `feldmann-2014` | 10.1016/j.solmat.2013.09.017 | search: sciencedirect pii S0927024813004868 title match (pii only) |
| `fritts-1883` | 10.2475/ajs.s3-26.156.465 | search: ADS 1883AmJS...26..465F + ajsonline.org title match |
| `henry-1980` | 10.1063/1.328272 | search: osti.gov/biblio/5321775 title only |
| `jacobson-jadhav-2018` | 10.1016/j.solener.2018.04.030 | search: sciencedirect pii S0038092X1830375X title (pii only) |
| `kalogirou-2004` | 10.1016/j.pecs.2004.02.001 | search: ADS 2004PECS...30..231K + sciencedirect pii S0360128504000103 title |
| `kamphuis-2020` | 10.1016/j.solener.2020.02.067 | search: sciencedirect pii S0038092X20301948 title (pii only) |
| `kavlak-2018` | 10.1016/j.enpol.2018.08.015 | search: osti.gov/pages/biblio/1613333 title |
| `lenard-1902` | 10.1002/andp.19023130510 | search: ADS 1902AnP...313..149L + semanticscholar title |
| `nemet-2009` | 10.1016/j.enpol.2008.10.031 | search: sciencedirect pii S0301421508005910 + osti etdeweb title |
| `patel-agarwal-2008` | 10.1109/TIE.2008.917118 | search: researchgate title "IEEE TIE 55(4), 1689-1698" only |
| `paudyal-imenes-2021` | 10.1016/j.solener.2021.06.013 | search: sciencedirect pii S0038092X21004837 + core.ac.uk title |
| `repins-2008` | 10.1002/pip.822 | NREL research hub fetched: PiP 16(3) 235-239 2008, 8 authors match (DOI not shown); zenodo record title |
| `richter-2013` | 10.1109/JPHOTOV.2013.2270351 | search: researchgate/publica title only (publica fetch denied) |
| `rodriguez-gallegos-2020` | 10.1016/j.joule.2020.05.005 | search: cell.com joule fulltext S2542-4351(20)30188-4 + osti 1634789 title |
| `ross-nozik-1982` | 10.1063/1.331124 | NREL research hub fetched: JAP (5) 3813-3818 1982, Ross, Nozik; ADS 1982JAP....53.3813R |
| `zarrouk-moon-2014` | 10.1016/j.geothermics.2013.11.001 | search: sciencedirect pii S0375650513001120 title + ADS 2014Geoth..51..142Z |
| `zhu-long-ort-2008` | 10.1016/j.copbio.2008.02.004 | search: sciencedirect pii S0958166908000165 + PubMed 18374559 title |

Rebuild after these edits: `build_data.py`, `sign-manifest` and `--verify`, `make_credits.py` and `check_site.py` all pass, and the unit tests pass 278/278.
