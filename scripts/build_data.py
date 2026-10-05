#!/usr/bin/env python3
"""Build site/data/*.json from data-src/ (no network).

  data-src/sources/*.json    -> site/data/sources.json    (bibliography, merged)
  data-src/glossary/*.json   -> site/data/glossary.json   (definitions, merged)
  data-src/datasets/*.json   -> site/data/<name>.json     (curated datasets, validated)
  data-src/raw/*.csv         -> site/data/module-prices.json, electricity-mix.json

Every dataset must carry meta.sources (ids that exist in the bibliography),
meta.license and meta.last_verified. The script fails loudly on any problem;
afterwards run `npm run sign` to rebuild and sign the manifest.
"""
import csv, json, re, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src"
OUT = ROOT / "site" / "data"
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")
errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def dump(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=False) + "\n", encoding="utf-8")


def merge_dir(folder: Path, kind: str) -> dict:
    merged: dict = {}
    origin: dict = {}
    for f in sorted(folder.glob("*.json")):
        try:
            part = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(f"{f.relative_to(ROOT)}: invalid JSON ({e})")
            continue
        for key, val in part.items():
            if not ID.match(key):
                err(f"{f.name}: {kind} id '{key}' must be lowercase letters, digits and hyphens")
            if key in merged and merged[key] != val:
                warnings.append(f"{f.name}: {kind} '{key}' is also defined in {origin[key]}; keeping that one")
                continue
            merged.setdefault(key, val)
            origin.setdefault(key, f.name)
    return dict(sorted(merged.items()))


def check_source(sid: str, s: dict) -> None:
    for field in ("type", "title", "verified"):
        if not s.get(field):
            err(f"source {sid}: missing '{field}'")
    if s.get("type") not in {"article", "book", "report", "dataset", "web", "standard", "patent", "chart", "thesis"}:
        err(f"source {sid}: unknown type {s.get('type')!r}")
    if not (s.get("doi") or s.get("url")):
        err(f"source {sid}: needs a doi or a url")
    if s.get("url") and not str(s["url"]).startswith("https://") and not str(s["url"]).startswith("http://"):
        err(f"source {sid}: url must be http(s)")
    if s.get("doi") and not re.match(r"^10\.\d{4,9}/\S+$", s["doi"]):
        err(f"source {sid}: malformed DOI {s['doi']!r}")
    if s.get("verified") and not DATE.match(s["verified"]):
        err(f"source {sid}: 'verified' must be YYYY-MM-DD")
    if s.get("year") is not None and not (isinstance(s["year"], int) and 1600 <= s["year"] <= 2100):
        err(f"source {sid}: bad year {s.get('year')!r}")


def check_meta(name: str, meta: dict, sources: dict) -> None:
    required = ("title", "license", "last_verified") if meta.get("internal") else ("title", "sources", "license", "last_verified")
    for field in required:
        if not meta.get(field):
            err(f"dataset {name}: meta.{field} is required")
    for sid in meta.get("sources", []):
        if sid not in sources:
            err(f"dataset {name}: meta.sources refers to unknown source '{sid}'")
    if meta.get("last_verified") and not DATE.match(meta["last_verified"]):
        err(f"dataset {name}: meta.last_verified must be YYYY-MM-DD")


def walk_source_refs(obj, name: str, sources: dict) -> None:
    """Any key named 'source' or 'sources' anywhere in a dataset must point at known ids."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("source", "sources") and k != "meta":
                ids = v if isinstance(v, list) else [v]
                for sid in ids:
                    if isinstance(sid, str) and sid not in sources:
                        err(f"dataset {name}: unknown source id '{sid}'")
            else:
                walk_source_refs(v, name, sources)
    elif isinstance(obj, list):
        for v in obj:
            walk_source_refs(v, name, sources)


def num(x: str):
    return None if x in ("", None) else round(float(x), 4)


def build_module_prices() -> dict:
    rows = list(csv.DictReader(open(SRC / "raw" / "owid-solar-pv-prices.csv", encoding="utf-8")))
    series = [[int(r["Year"]), round(float(r["Solar PV module cost"]), 4)] for r in rows if r["Entity"] == "World"]
    return {
        "meta": {
            "title": "Solar PV module price",
            "units": "constant 2025 US$ per watt (peak)",
            "description": "Price of crystalline-silicon PV modules, inflation-adjusted, as joined by Our World in Data: Nemet (2009) to 2003, Farmer and Lafond (2016) for 2004-2009, then IRENA benchmark prices for modules sold in Europe.",
            "sources": ["owid-solar-pv-prices", "nemet-2009", "farmer-lafond-2016", "irena-costs-2025"],
            "license": "CC BY 4.0 (Our World in Data processing); underlying IRENA data © IRENA, free to reuse with attribution under IRENA's terms",
            "last_verified": "2026-09-30",
        },
        "data": series,
    }


def build_electricity_mix() -> dict:
    rows = list(csv.DictReader(open(SRC / "raw" / "owid-energy-subset.csv", encoding="utf-8")))
    fields = ["electricity_generation", "solar_electricity", "wind_electricity", "hydro_electricity",
              "biofuel_electricity", "other_renewable_exc_biofuel_electricity", "nuclear_electricity",
              "coal_electricity", "gas_electricity", "oil_electricity", "solar_share_elec", "wind_share_elec",
              "hydro_share_elec", "renewables_share_elec", "low_carbon_share_elec", "fossil_share_elec"]
    out: dict = {}
    for r in rows:
        ent = out.setdefault(r["country"], {"iso": r["iso_code"] or None, "years": [], **{f: [] for f in fields}})
        ent["years"].append(int(r["year"]))
        for f in fields:
            ent[f].append(num(r[f]))
    return {
        "meta": {
            "title": "Electricity generation by source",
            "units": "terawatt-hours (TWh) for *_electricity; percent of generation for *_share_elec",
            "description": "Annual electricity generation by source for selected countries and regions, 1985 onward. "
                           "'other_renewable_exc_biofuel' is mostly geothermal plus tidal and wave.",
            "sources": ["owid-energy-data", "ember-yearly-electricity", "ei-statistical-review"],
            "license": "CC BY 4.0 (Our World in Data; Ember data CC BY 4.0); Energy Institute Statistical Review data under the Energy Institute's own terms",
            "last_verified": "2026-09-30",
        },
        "fields": fields,
        "data": out,
    }


def build_search(glossary: dict) -> dict:
    """Search index built from the pages themselves: title, description, section headings
    and each page's own text (lower-cased words only), plus glossary terms. Deterministic,
    so CI can rebuild it and compare byte for byte."""
    from html.parser import HTMLParser

    class Text(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.title = ""; self.desc = ""; self.heads: list[str] = []; self.words: list[str] = []
            self.stack: list[str] = []; self.skip = 0; self.buf = ""
        def handle_starttag(self, tag, attrs):
            a = dict(attrs)
            if tag == "meta" and a.get("name") == "description":
                self.desc = a.get("content") or ""
            if tag in ("script", "style", "nav", "footer", "noscript"):
                self.skip += 1
            if tag in ("h1", "h2", "h3", "title"):
                self.stack.append(tag); self.buf = ""
        def handle_endtag(self, tag):
            if tag in ("script", "style", "nav", "footer", "noscript"):
                self.skip = max(0, self.skip - 1)
            if self.stack and tag == self.stack[-1]:
                t = " ".join(self.buf.split())
                if tag == "title":
                    if not self.title:  # the page <title>, not an inline SVG <title>
                        self.title = t.replace(" – Solar Odyssey", "")
                elif tag in ("h2", "h3") and t:
                    self.heads.append(t)
                self.stack.pop()
        def handle_data(self, data):
            if self.stack:
                self.buf += data
            if not self.skip:
                self.words.extend(re.findall(r"[a-z][a-z0-9-]{2,}", data.lower()))

    order = re.findall(r"id: '([^']+)', path: '([^']+)'", (ROOT / "site/assets/js/sitemap.js").read_text(encoding="utf-8"))
    pages = []
    for pid, path in order:
        f = ROOT / "site" / path
        if not f.exists():
            continue
        t = Text(); t.feed(f.read_text(encoding="utf-8"))
        seen: dict[str, int] = {}
        for w in t.words:
            seen[w] = seen.get(w, 0) + 1
        common = {"the", "and", "for", "that", "with", "this", "are", "from", "but", "its", "into", "than", "you", "your",
                  "was", "has", "have", "can", "not", "one", "each", "they", "their", "which", "more", "about", "when",
                  "what", "how", "all", "only", "also", "out", "two", "any", "per", "most", "much", "very", "here", "there"}
        words = sorted(w for w in seen if w not in common)
        pages.append({"id": pid, "path": path, "title": t.title, "desc": t.desc, "heads": t.heads, "words": " ".join(words)})
    terms = [{"id": k, "term": v["term"], "short": v["short"]} for k, v in glossary.items()]
    return {"meta": {"title": "Site search index", "internal": True, "license": "CC BY 4.0 (Solar Odyssey text)",
                     "last_verified": "2026-10-04",
                     "description": "Generated by scripts/build_data.py from the pages in site/. Do not edit."},
            "data": {"pages": pages, "terms": terms}}


def main() -> int:
    sources = merge_dir(SRC / "sources", "source")
    for sid, s in sources.items():
        check_source(sid, s)
    glossary = merge_dir(SRC / "glossary", "term")
    for tid, t in glossary.items():
        if not t.get("term") or not t.get("short"):
            err(f"glossary {tid}: needs 'term' and 'short'")
        for see in t.get("see", []):
            if see not in glossary:
                err(f"glossary {tid}: 'see' refers to unknown term '{see}'")

    generated = {"module-prices.json": build_module_prices(), "electricity-mix.json": build_electricity_mix(),
                 "search.json": build_search(glossary)}
    for f in sorted((SRC / "datasets").glob("*.json")):
        try:
            generated[f.name] = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(f"{f.relative_to(ROOT)}: invalid JSON ({e})")

    for name, ds in generated.items():
        if not isinstance(ds, dict) or "meta" not in ds or "data" not in ds:
            err(f"dataset {name}: must be an object with 'meta' and 'data'")
            continue
        check_meta(name, ds["meta"], sources)
        walk_source_refs(ds["data"], name, sources)

    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    if errors:
        print("build_data FAILED:\n  " + "\n  ".join(errors), file=sys.stderr)
        return 1

    expected = {"sources.json", "glossary.json", *generated}
    for stale in OUT.glob("*.json"):
        if stale.name not in expected and stale.name != "manifest.json":
            stale.unlink()
            print(f"removed stale {stale.name}")
    dump("sources.json", sources)
    dump("glossary.json", glossary)
    for name, ds in generated.items():
        dump(name, ds)
    print(f"built {len(generated) + 2} datasets: {len(sources)} sources, {len(glossary)} glossary terms "
          f"({date.today().isoformat()}); now run `npm run sign`")
    return 0


if __name__ == "__main__":
    sys.exit(main())
