"""Cross-check the browser's solar geometry (site/assets/js/physics/solar.js)
against pvlib, the reference open-source PV modelling library."""
import json, subprocess
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

pvlib = pytest.importorskip("pvlib")
ROOT = Path(__file__).resolve().parents[2]
SOLAR = (ROOT / "site/assets/js/physics/solar.js").as_uri()


def js(expr: str):
    """Evaluate an expression with the solar module imported as `m`; returns parsed JSON."""
    code = f"import('{SOLAR}').then(m => process.stdout.write(JSON.stringify({expr})))"
    return json.loads(subprocess.run(["node", "-e", code], check=True, capture_output=True, text=True).stdout)


CASES = [  # (UTC time, lat, lon)
    ("2026-06-21T19:00:00Z", 33.74, -118.29), ("2026-12-21T12:00:00Z", 51.5, -0.1),
    ("2026-03-20T03:00:00Z", -33.9, 151.2), ("2026-09-30T08:00:00Z", 78.2, 15.6),
    ("2026-01-10T06:30:00Z", 0.0, 100.0), ("1985-07-04T15:00:00Z", 40.0, -105.0),
    ("2040-11-11T11:11:00Z", -23.5, -46.6), ("2026-04-01T22:00:00Z", 64.1, -21.9),
]


@pytest.mark.parametrize("iso,lat,lon", CASES)
def test_sun_position_matches_pvlib(iso, lat, lon):
    ours = js(f"m.sunPosition(new Date('{iso}'), {lat}, {lon})")
    ref = pvlib.solarposition.get_solarposition(pd.DatetimeIndex([iso]), lat, lon, method="nrel_numpy").iloc[0]
    assert abs(ours["zenith"] - ref["zenith"]) < 0.02
    if ref["zenith"] < 89:
        assert abs(((ours["azimuth"] - ref["azimuth"] + 180) % 360) - 180) < 0.02
    assert abs(ours["equationOfTime"] - ref["equation_of_time"]) < 0.1  # minutes


@pytest.mark.parametrize("z", [0, 30, 60, 75, 85, 89])
def test_air_mass_matches_pvlib(z):
    assert js(f"m.airMass({z})") == pytest.approx(pvlib.atmosphere.get_relative_airmass(z, model="kastenyoung1989"), rel=1e-9)


@pytest.mark.parametrize("tilt,saz,zen,az", [(30, 180, 40, 160), (90, 180, 70, 250), (20, 90, 10, 180), (45, 270, 80, 100)])
def test_aoi_and_isotropic_poa_match_pvlib(tilt, saz, zen, az):
    assert js(f"m.aoi({tilt},{saz},{zen},{az})") == pytest.approx(pvlib.irradiance.aoi(tilt, saz, zen, az), abs=1e-9)
    ours = js(f"m.poaIsotropic({{dni:800, dhi:100, ghi:700, tilt:{tilt}, surfaceAzimuth:{saz}, zenith:{zen}, azimuth:{az}, albedo:0.25}})")
    ref = pvlib.irradiance.get_total_irradiance(tilt, saz, zen, az, dni=800, ghi=700, dhi=100, albedo=0.25, model="isotropic")
    assert ours["total"] == pytest.approx(ref["poa_global"], rel=1e-9)
    assert ours["beam"] == pytest.approx(ref["poa_direct"], abs=1e-9)


def test_daily_insolation_is_consistent_with_pvlib_geometry():
    """Integrate the same clear-sky model with pvlib geometry and compare daily totals."""
    lat, lon, tilt = 33.74, -118.29, 30
    ours = js(f"m.dailyInsolation(new Date(Date.UTC(2026,5,21)), {{lat:{lat}, lon:{lon}, tilt:{tilt}, surfaceAzimuth:180, stepMin:10}}).kwhm2")
    noon = pd.Timestamp("2026-06-21 12:00", tz="UTC") - pd.Timedelta(hours=lon / 15)
    times = noon + pd.to_timedelta(np.arange(-720, 720, 10) + 5, unit="min")
    sp = pvlib.solarposition.get_solarposition(times, lat, lon, method="nrel_numpy")
    zen = sp["zenith"].to_numpy()
    am = pvlib.atmosphere.get_relative_airmass(zen, model="kastenyoung1989")
    dni = np.where(zen < 90, 1353 * 0.7 ** (np.nan_to_num(am) ** 0.678), 0)
    dhi = 0.1 * dni
    ghi = dni * np.cos(np.radians(zen)) + dhi
    poa = pvlib.irradiance.get_total_irradiance(tilt, 180, zen, sp["azimuth"].to_numpy(), dni=dni, ghi=ghi, dhi=dhi, albedo=0.2, model="isotropic")["poa_global"]
    ref = np.nansum(np.where(zen < 90, poa, 0)) * (10 / 60) / 1000
    assert ours == pytest.approx(ref, rel=0.002)
