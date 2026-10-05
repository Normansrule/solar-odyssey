# Raw data provenance

| File | Origin | Retrieved | Licence |
|---|---|---|---|
| `owid-energy-subset.csv` | `owid-energy-data.csv` from github.com/owid/energy-data at commit `7e387a16f70a510e433f8aac7efeac6faa1e5059` (full file SHA-256 `266f2e2baad7975351bc9bb4aa061d22b1da9fe4c47d51d2ac6071e01e171f76`), filtered to 32 entities and years 1985 onward by `scripts/fetch_raw.py` | 2026-09-30 | CC BY 4.0 (Our World in Data). Underlying electricity data: Ember Yearly Electricity Data (CC BY 4.0) and Energy Institute Statistical Review of World Energy. |
| `owid-solar-pv-prices.csv` | ourworldindata.org/grapher/solar-pv-prices.csv, indicator "Solar PV module cost", constant 2025 US$ per watt; OWID metadata last updated 2026-07-28 | 2026-09-30 | CC BY 4.0 (Our World in Data). Underlying sources: IRENA (2025); Nemet (2009); Farmer and Lafond (2016). |

Re-fetch with `python3 scripts/fetch_raw.py` (network needed). The build (`npm run data`)
never touches the network: it only reads the files in this folder.
