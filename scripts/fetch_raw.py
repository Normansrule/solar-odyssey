#!/usr/bin/env python3
"""Re-download the raw datasets into data-src/raw (network required).

The OWID energy file is fetched at a pinned commit and checked against a pinned
SHA-256 before it is filtered, so a changed upstream file cannot slip in silently.
To move to newer data: update OWID_COMMIT and OWID_SHA256, rerun, review the diff.
"""
import csv, hashlib, io, sys, urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data-src" / "raw"
OWID_COMMIT = "7e387a16f70a510e433f8aac7efeac6faa1e5059"
OWID_SHA256 = "266f2e2baad7975351bc9bb4aa061d22b1da9fe4c47d51d2ac6071e01e171f76"
OWID_URL = f"https://raw.githubusercontent.com/owid/energy-data/{OWID_COMMIT}/owid-energy-data.csv"
PRICES_URL = "https://ourworldindata.org/grapher/solar-pv-prices.csv"

COLS = ["country", "iso_code", "year", "electricity_generation", "solar_electricity", "wind_electricity",
        "hydro_electricity", "biofuel_electricity", "other_renewable_exc_biofuel_electricity", "nuclear_electricity",
        "coal_electricity", "gas_electricity", "oil_electricity", "solar_share_elec", "wind_share_elec",
        "hydro_share_elec", "renewables_share_elec", "low_carbon_share_elec", "fossil_share_elec"]
ENTITIES = ["World", "United States", "China", "India", "Germany", "United Kingdom", "Japan", "Brazil", "Australia",
            "Spain", "Chile", "South Africa", "Kenya", "Iceland", "Norway", "Denmark", "Mexico", "Indonesia", "Egypt",
            "France", "Italy", "Vietnam", "Netherlands", "Pakistan", "Morocco", "Saudi Arabia", "Europe", "Africa",
            "Asia", "North America", "South America", "Oceania"]


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "solar-odyssey-data-fetch"})
    with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310 (fixed https URLs)
        return r.read()


def main() -> int:
    blob = get(OWID_URL)
    digest = hashlib.sha256(blob).hexdigest()
    if digest != OWID_SHA256:
        print(f"OWID file hash {digest} != pinned {OWID_SHA256}; refusing to continue", file=sys.stderr)
        return 1
    rows = [r for r in csv.DictReader(io.StringIO(blob.decode("utf-8")))
            if r["country"] in ENTITIES and int(r["year"]) >= 1985]
    with open(RAW / "owid-energy-subset.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLS)
        for r in rows:
            w.writerow([r[c] for c in COLS])
    print(f"wrote owid-energy-subset.csv ({len(rows)} rows)")
    try:
        (RAW / "owid-solar-pv-prices.csv").write_bytes(get(PRICES_URL))
        print("wrote owid-solar-pv-prices.csv (review the diff: this endpoint is not pinned)")
    except Exception as e:  # the grapher endpoint may be unreachable from CI sandboxes
        print(f"could not refresh PV prices ({e}); kept the existing file", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
