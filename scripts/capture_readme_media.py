#!/usr/bin/env python3
"""Regenerate the animated media used by README.md (media/readme/).

Two kinds of media:

* Hand-drawn animated SVGs (hero banner and learning-path map, light and dark). They are written
  from the geometry in this file: pure SVG + CSS @keyframes, no script, no web fonts, so GitHub
  renders them through <img>. The sun-arc positions use the same eras as site/sun-arc.js.
* GIF captures of the live widgets. The script serves site/ locally, opens each page in headless
  Chromium (light theme, motion allowed) with Playwright's fake clock, drives the controls frame
  by frame (press play, move sliders, switch metrics) and screenshots the widget, then encodes
  the frames with ffmpeg (palettegen + paletteuse, infinite loop). The fake clock makes every
  frame land exactly 1/fps of page time apart, so motion is smooth however slow the machine is.

Usage (from the repository root):

    PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 scripts/capture_readme_media.py
    python3 scripts/capture_readme_media.py --svg            # only rewrite the SVGs (no browser)
    python3 scripts/capture_readme_media.py --gif pv-effect,sun-path   # only these GIFs
    python3 scripts/capture_readme_media.py --keep-frames /tmp/frames   # keep the PNG frames

Needs: Python 3.11+, playwright (with Chromium installed) and ffmpeg on PATH.
GIF names: pv-effect, pn-junction, efficiency, cost-decline, system-builder, sun-path, compare.
Each GIF is checked against a 2.5 MB budget; the script prints sizes at the end.
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import functools
import http.server
import math
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Awaitable, Callable

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
OUT = ROOT / "media" / "readme"
GIF_BUDGET = 2_500_000

# ---------------------------------------------------------------------------------------------
# Palette (mirrors site/assets/css/odyssey.css)
# ---------------------------------------------------------------------------------------------
LIGHT = dict(
    paper="#f4f7f9", paper2="#e9eef2", ink="#172231", ink2="#4b5a6b", rule="#c3cdd8",
    silicon="#23407a", sun="#e89f0c", sun_ink="#8a5300", sun_wash="#fdf1d8", sky_top="#f4f7f9",
    sky_low="#fbeccb", glow="#f6c45a", electron="#1f63b5", hole="#b8412c", node="#ffffff",
)
DARK = dict(
    paper="#0f1722", paper2="#16202d", ink="#e5ebf1", ink2="#a3b1c0", rule="#34445a",
    silicon="#86a8e8", sun="#f5b83d", sun_ink="#f5c35d", sun_wash="#2b2413", sky_top="#0f1722",
    sky_low="#232838", glow="#f5b83d", electron="#6aa6ec", hole="#ee7d63", node="#1b2635",
)
DISPLAY = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
BODY = "'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"


def f1(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------------------------------------
# Hero: the Solar Odyssey sun arc
# ---------------------------------------------------------------------------------------------
# Eras exactly as site/sun-arc.js: arc position t in 0..1, dawn rises at the left horizon.
ERAS = [("Dawn", 0.03, 0.25, 1839, 1900), ("Morning", 0.25, 0.49, 1900, 1970),
        ("Midday", 0.49, 0.75, 1970, 2026), ("Afternoon", 0.75, 0.93, None, None)]
TODAY_T, FRONTIER_T = 0.75, 0.93


def year_t(year: int) -> float:
    for _, a, b, y0, y1 in ERAS[:3]:
        if year <= y1:
            return a + (year - y0) / (y1 - y0) * (b - a)
    return TODAY_T


# (label, caption, t, label placement: dx, dy, anchor)
MARKS = [
    ("1839", "Becquerel: light makes a current", year_t(1839), 24, 0, "start"),
    ("1883", "Fritts: the selenium cell", year_t(1883), -16, -14, "end"),
    ("1905", "Einstein: light comes in quanta", year_t(1905), -16, -14, "end"),
    ("1954", "Bell Labs: the silicon cell", year_t(1954), -14, -26, "end"),
    ("1958", "Vanguard 1 in orbit", year_t(1958), 2, 38, "middle"),
    ("1970s", "Oil crises, first markets", year_t(1973), 12, -26, "start"),
    ("2009", "Perovskite cells", year_t(2009), 14, -16, "start"),
    ("Today", "Solar at terawatt scale", TODAY_T, 16, -12, "start"),
]
HERO_W, HERO_H = 1280, 440
BOX = dict(x0=56, x1=1224, horizon=372, rise=292)
CYCLE = 16  # seconds


def arc_xy(t: float) -> tuple[float, float]:
    return (BOX["x0"] + t * (BOX["x1"] - BOX["x0"]),
            BOX["horizon"] - math.sin(math.pi * t) * BOX["rise"])


def arc_d(t0: float, t1: float, steps: int = 90) -> str:
    pts = [arc_xy(t0 + (t1 - t0) * i / steps) for i in range(steps + 1)]
    return "M" + " L".join(f"{f1(x)} {f1(y)}" for x, y in pts)


@functools.lru_cache(maxsize=None)
def _arc_lengths(n: int = 2000) -> list[float]:
    acc, out, prev = 0.0, [0.0], arc_xy(0)
    for i in range(1, n + 1):
        p = arc_xy(i / n)
        acc += math.dist(p, prev)
        out.append(acc)
        prev = p
    return out


def arc_len(t0: float, t1: float) -> float:
    L = _arc_lengths()
    n = len(L) - 1
    return L[round(t1 * n)] - L[round(t0 * n)]


def hero_svg(c: dict, dark: bool) -> str:
    # Timeline of one cycle (fractions of CYCLE):
    #   0.00-0.10  sun rests at today (this is also the frozen first frame)
    #   0.10-0.15  sun fades out at today, trail fades
    #   0.15-0.18  sun reappears at dawn (1839)
    #   0.18-0.78  sun climbs from 1839 to today; each mark lights as it is passed
    #   0.78-0.90  a faint ghost runs along the dashed frontier
    #   0.78-1.00  sun rests at today
    rest_end, fade_end, appear_end, climb_end = 0.10, 0.15, 0.18, 0.78
    t_start = 0.03

    def climb_frac(t: float) -> float:  # keyframe fraction at which the sun passes arc position t
        # ease-in-out in arc length so the sun slows at the ends
        u = arc_len(t_start, t) / arc_len(t_start, TODAY_T)
        # invert smoothstep u = 3s^2 - 2s^3 numerically
        lo, hi = 0.0, 1.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if 3 * mid * mid - 2 * mid ** 3 < u:
                lo = mid
            else:
                hi = mid
        return appear_end + lo * (climb_end - appear_end)

    # sun position keyframes
    tx, ty = arc_xy(TODAY_T)
    dx0, dy0 = arc_xy(t_start)
    sun_kf = [f"0%,{rest_end*100:.1f}%{{transform:translate({f1(tx)}px,{f1(ty)}px);opacity:1}}",
              f"{fade_end*100:.1f}%{{transform:translate({f1(tx)}px,{f1(ty)}px);opacity:0}}",
              f"{fade_end*100+0.1:.1f}%{{transform:translate({f1(dx0)}px,{f1(dy0)}px);opacity:0}}"]
    steps = 60
    for i in range(steps + 1):
        s = i / steps
        u = 3 * s * s - 2 * s ** 3
        # find t with arc_len fraction u
        target = u * arc_len(t_start, TODAY_T)
        lo, hi = t_start, TODAY_T
        for _ in range(30):
            mid = (lo + hi) / 2
            if arc_len(t_start, mid) < target:
                lo = mid
            else:
                hi = mid
        x, y = arc_xy(lo)
        pct = (appear_end + s * (climb_end - appear_end)) * 100
        op = 1 if i else 1
        sun_kf.append(f"{pct:.2f}%{{transform:translate({f1(x)}px,{f1(y)}px);opacity:{op}}}")
    sun_kf.append(f"100%{{transform:translate({f1(tx)}px,{f1(ty)}px);opacity:1}}")

    # lit trail: stroke-dashoffset on the dawn->today path (pathLength=1000)
    trail_kf = [f"0%,{rest_end*100:.1f}%{{stroke-dashoffset:0;opacity:1}}",
                f"{fade_end*100:.1f}%{{stroke-dashoffset:0;opacity:0}}",
                f"{fade_end*100+0.1:.1f}%{{stroke-dashoffset:1000;opacity:0}}",
                f"{appear_end*100:.1f}%{{stroke-dashoffset:1000;opacity:1}}"]
    for i in range(1, steps + 1):
        s = i / steps
        u = 3 * s * s - 2 * s ** 3
        pct = (appear_end + s * (climb_end - appear_end)) * 100
        trail_kf.append(f"{pct:.2f}%{{stroke-dashoffset:{f1(1000*(1-u))}}}")
    trail_kf.append("100%{stroke-dashoffset:0;opacity:1}")

    # frontier ghost
    gx = []
    for i in range(21):
        s = i / 20
        x, y = arc_xy(TODAY_T + s * (FRONTIER_T - TODAY_T))
        pct = (climb_end + 0.02 + s * 0.12) * 100
        gx.append(f"{pct:.2f}%{{transform:translate({f1(x)}px,{f1(y)}px);opacity:{0.9 if 0 < i < 20 else 0}}}")
    ghost_kf = [f"0%,{(climb_end+0.02)*100-0.1:.2f}%{{transform:translate({f1(tx)}px,{f1(ty)}px);opacity:0}}"] + gx + \
               [f"100%{{transform:translate({f1(arc_xy(FRONTIER_T)[0])}px,{f1(arc_xy(FRONTIER_T)[1])}px);opacity:0}}"]

    css = [f"""
.bg{{fill:url(#sky)}}
.title{{font-family:{DISPLAY};font-weight:700;font-size:76px;fill:{c['ink']};letter-spacing:-1px}}
.promise{{font-family:{BODY};font-size:23px;fill:{c['ink2']}}}
.yr{{font-family:{DISPLAY};font-weight:700;font-size:20px;fill:{c['ink']}}}
.cap{{font-family:{BODY};font-size:16px;fill:{c['ink2']}}}
.era{{font-family:{BODY};font-size:16px;font-weight:600;fill:{c['ink2']}}}
.arc{{fill:none;stroke:{c['rule']};stroke-width:1.5}}
.front{{fill:none;stroke:{c['sun_ink']};stroke-width:2.2;stroke-dasharray:7 7;stroke-linecap:round}}
.trail{{fill:none;stroke:{c['sun']};stroke-width:5;stroke-linecap:round;stroke-dasharray:1000 1000}}
.halo{{fill:none;stroke:{c['sun']};stroke-width:12;stroke-linecap:round;opacity:.18}}
.horizon{{stroke:{c['rule']};stroke-width:1.5}}
.tick{{stroke:{c['rule']};stroke-width:1.5}}
.dot{{fill:{c['node']};stroke:{c['ink2']};stroke-width:2}}
.dot.on{{fill:{c['sun']};stroke:{c['sun_ink']}}}
.today-line{{stroke:{c['sun_ink']};stroke-width:1.2;stroke-dasharray:2 4;opacity:.7}}
.sun{{animation:sun {CYCLE}s linear infinite}}
.sun .core{{fill:{c['sun']}}}
.sun .ring{{fill:url(#glow)}}
.trail{{animation:trail {CYCLE}s linear infinite}}
.ghost{{animation:ghost {CYCLE}s linear infinite;opacity:0}}
.ghost circle{{fill:none;stroke:{c['sun']};stroke-width:2.5;stroke-dasharray:4 3}}
.pulse{{transform-box:fill-box;transform-origin:center;animation:pulse 4s ease-in-out infinite}}
@keyframes sun{{{''.join(sun_kf)}}}
@keyframes trail{{{''.join(trail_kf)}}}
@keyframes ghost{{{''.join(ghost_kf)}}}
@keyframes pulse{{0%,100%{{transform:scale(1);opacity:.9}}50%{{transform:scale(1.18);opacity:.55}}}}
"""]
    # marks light up when passed; they are lit in the resting state (first frame)
    for i, (_, _, t, *_rest) in enumerate(MARKS):
        p = climb_frac(t) * 100
        lit = f"fill:{c['sun']};stroke:{c['sun_ink']}"
        dim = f"fill:{c['node']};stroke:{c['ink2']}"
        css.append(f".m{i}{{animation:m{i} {CYCLE}s linear infinite}}"
                   f"@keyframes m{i}{{0%,{fade_end*100:.1f}%{{{lit}}}{fade_end*100+0.5:.1f}%,{max(p-0.3, fade_end*100+0.6):.2f}%{{{dim}}}"
                   f"{p:.2f}%,100%{{{lit}}}}}")
        css.append(f".l{i}{{animation:l{i} {CYCLE}s linear infinite}}"
                   f"@keyframes l{i}{{0%,{fade_end*100:.1f}%{{opacity:1}}{fade_end*100+1:.1f}%,{max(p-0.5, fade_end*100+1.1):.2f}%{{opacity:.38}}"
                   f"{p+0.8:.2f}%,100%{{opacity:1}}}}")
    css.append("@media (prefers-reduced-motion:reduce){.sun,.trail,.ghost,.pulse,[class^=m],[class^=l]{animation:none!important}}")

    o = []
    o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {HERO_W} {HERO_H}" width="{HERO_W}" height="{HERO_H}" '
             f'role="img" aria-labelledby="t d">')
    o.append('<title id="t">Solar Odyssey</title>')
    o.append('<desc id="d">The history of solar power drawn as one day: the sun rises along an arc from 1839 '
             'through Fritts, Einstein, Bell Labs, Vanguard 1, the 1970s and perovskites to today, with the '
             'research frontier as a dashed path beyond.</desc>')
    o.append(f"<style>{''.join(css)}</style>")
    o.append('<defs>')
    o.append(f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{c["sky_top"]}"/>'
             f'<stop offset="1" stop-color="{c["sky_low"]}"/></linearGradient>')
    o.append(f'<radialGradient id="glow"><stop offset="0" stop-color="{c["glow"]}" stop-opacity=".55"/>'
             f'<stop offset=".55" stop-color="{c["glow"]}" stop-opacity=".18"/><stop offset="1" stop-color="{c["glow"]}" stop-opacity="0"/></radialGradient>')
    o.append('</defs>')
    o.append(f'<rect class="bg" width="{HERO_W}" height="{BOX["horizon"]}"/>')
    o.append(f'<rect y="{BOX["horizon"]}" width="{HERO_W}" height="{HERO_H-BOX["horizon"]}" fill="{c["paper"]}"/>')
    # arc
    o.append(f'<path class="arc" d="{arc_d(0, 1)}"/>')
    o.append(f'<path class="halo" d="{arc_d(t_start, TODAY_T)}"/>')
    o.append(f'<path class="trail" pathLength="1000" d="{arc_d(t_start, TODAY_T)}"/>')
    o.append(f'<path class="front" d="{arc_d(TODAY_T, FRONTIER_T, 40)}"/>')
    # horizon and era ticks
    o.append(f'<line class="horizon" x1="0" x2="{HERO_W}" y1="{BOX["horizon"]}" y2="{BOX["horizon"]}"/>')
    for name, a, b, *_ in ERAS:
        xa, xb = arc_xy(a)[0], arc_xy(b)[0]
        o.append(f'<line class="tick" x1="{f1(xa)}" x2="{f1(xa)}" y1="{BOX["horizon"]}" y2="{BOX["horizon"]+10}"/>')
        o.append(f'<text class="era" x="{f1((xa+xb)/2)}" y="{BOX["horizon"]+38}" text-anchor="middle">{name}</text>')
    xe = arc_xy(FRONTIER_T)[0]
    o.append(f'<line class="tick" x1="{f1(xe)}" x2="{f1(xe)}" y1="{BOX["horizon"]}" y2="{BOX["horizon"]+10}"/>')
    o.append(f'<line class="today-line" x1="{f1(tx)}" x2="{f1(tx)}" y1="{f1(ty+10)}" y2="{BOX["horizon"]}"/>')
    # title
    o.append(f'<text class="title" x="{HERO_W/2}" y="262" text-anchor="middle">Solar Odyssey</text>')
    o.append(f'<text class="promise" x="{HERO_W/2}" y="306" text-anchor="middle">'
             'How sunlight became electricity, from 1839 to the research still under way</text>')
    # frontier label
    fx, fy = arc_xy(0.865)
    o.append(f'<g><text class="yr" x="{f1(fx+18)}" y="{f1(fy-8)}">The frontier</text>'
             f'<text class="cap" x="{f1(fx+18)}" y="{f1(fy+12)}">tandems, new materials</text></g>')
    # marks
    for i, (yr, cap, t, dx, dy, anchor) in enumerate(MARKS):
        x, y = arc_xy(t)
        o.append(f'<circle class="dot m{i}" cx="{f1(x)}" cy="{f1(y)}" r="6"/>')
        o.append(f'<g class="l{i}" text-anchor="{anchor}"><text class="yr" x="{f1(x+dx)}" y="{f1(y+dy)}">{yr}</text>'
                 f'<text class="cap" x="{f1(x+dx)}" y="{f1(y+dy+19)}">{cap}</text></g>')
    # sun + ghost (drawn at origin, moved by CSS transform)
    o.append('<g class="ghost"><circle r="11"/></g>')
    o.append(f'<g class="sun" style="transform:translate({f1(tx)}px,{f1(ty)}px)">'
             '<circle class="ring pulse" r="46"/><circle class="core" r="15"/></g>')
    o.append('</svg>')
    return "\n".join(o) + "\n"


# ---------------------------------------------------------------------------------------------
# Learning-path map: six stations on two rows joined like a line of text
# ---------------------------------------------------------------------------------------------
STAGES = [
    ("The story", "1839 to today, as one day"),
    ("How a cell works", "Photons, band gap, p-n junction, I-V"),
    ("Solar today", "Cells, systems, sun path, costs"),
    ("The frontier", "Perovskites, tandems, bifacial"),
    ("Other renewables", "Wind, hydro, geothermal, ocean, biomass"),
    ("Storage and grid", "Storage, the smart grid, comparisons"),
]
LP_W, LP_H = 1000, 490
LP_CYCLE = 12


def path_svg(c: dict, dark: bool) -> str:
    """Two rows of three stations joined like a line of text, with U-turns at the ends."""
    xs = [150, 490, 830]
    y1, ym, y2 = 100, 235, 370
    xl, xr = 80, 920          # where the straight runs end and the U-turns start
    r1, r2 = (ym - y1) / 2, (y2 - ym) / 2
    start, end = (xl - 40, y1), (xr, y2)
    route = (f"M{start[0]} {y1} L{xr} {y1} A{r1} {r1} 0 0 1 {xr} {ym} "
             f"L{xl} {ym} A{r2} {r2} 0 0 0 {xl} {y2} L{end[0]} {y2}")

    # the same route as points, to drive the travelling pulse
    def line(a, b, n):
        return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]

    def arc(cx, cy, r, a0, a1, n=30):
        return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
    pts = line(start, (xr, y1), 90)
    pts += arc(xr, y1 + r1, r1, -math.pi / 2, math.pi / 2)[1:]
    pts += line((xr, ym), (xl, ym), 90)[1:]
    pts += arc(xl, ym + r2, r2, -math.pi / 2, -3 * math.pi / 2)[1:]
    pts += line((xl, y2), end, 90)[1:]
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    total = cum[-1]
    stations = [(xs[i % 3], y1 if i < 3 else y2) for i in range(6)]

    def frac_at(p):
        k = min(range(len(pts)), key=lambda j: math.dist(pts[j], p))
        return cum[k] / total

    run = 0.80  # share of the cycle the pulse spends travelling; then it rests and fades
    kf = []
    for k in range(0, len(pts), 3):
        x, y = pts[k]
        kf.append(f"{cum[k] / total * run * 100:.2f}%{{transform:translate({f1(x)}px,{f1(y)}px);opacity:{0 if k == 0 else 1}}}")
    x, y = pts[-1]
    kf.append(f"{run * 100:.2f}%{{transform:translate({f1(x)}px,{f1(y)}px);opacity:1}}")
    kf.append(f"{run * 100 + 4:.2f}%,100%{{transform:translate({f1(x)}px,{f1(y)}px);opacity:0}}")

    num_on = c['paper'] if dark else '#3a2400'
    css = [f"""
.bg{{fill:{c['paper']}}}
.rail{{fill:none;stroke:{c['rule']};stroke-width:6;stroke-linecap:round}}
.lit{{fill:none;stroke:{c['sun']};stroke-width:6;stroke-linecap:round;stroke-dasharray:1000 1000;animation:lit {LP_CYCLE}s linear infinite}}
.st{{fill:{c['node']};stroke:{c['silicon']};stroke-width:3}}
.num{{font-family:{DISPLAY};font-weight:700;font-size:22px;fill:{c['silicon']}}}
.name{{font-family:{DISPLAY};font-weight:700;font-size:27px;fill:{c['ink']}}}
.sub{{font-family:{BODY};font-size:17px;fill:{c['ink2']}}}
.end{{font-family:{BODY};font-size:16px;fill:{c['ink2']}}}
.cap{{fill:{c['ink2']}}}
.pulse{{animation:pulse {LP_CYCLE}s linear infinite;opacity:0}}
.pulse .c{{fill:{c['sun']}}}
.pulse .g{{fill:url(#pg)}}
@keyframes pulse{{{''.join(kf)}}}
@keyframes lit{{0%{{stroke-dashoffset:1000;opacity:1}}{run * 100:.1f}%,{run * 100 + 4:.1f}%{{stroke-dashoffset:0;opacity:1}}97%{{stroke-dashoffset:0;opacity:0}}100%{{stroke-dashoffset:1000;opacity:0}}}}
"""]
    for i, s_ in enumerate(stations):
        p = frac_at(s_) * run * 100
        on = f"fill:{c['sun']};stroke:{c['sun_ink']}"
        off = f"fill:{c['node']};stroke:{c['silicon']}"
        css.append(f".s{i}{{animation:s{i} {LP_CYCLE}s linear infinite}}"
                   f"@keyframes s{i}{{0%,{max(p - 0.4, 0.1):.2f}%{{{off}}}{p:.2f}%,94%{{{on}}}99%,100%{{{off}}}}}")
        css.append(f".n{i}{{animation:n{i} {LP_CYCLE}s linear infinite}}"
                   f"@keyframes n{i}{{0%,{max(p - 0.4, 0.1):.2f}%{{fill:{c['silicon']}}}{p:.2f}%,94%{{fill:{num_on}}}99%,100%{{fill:{c['silicon']}}}}}")
    css.append("@media (prefers-reduced-motion:reduce){.lit,.pulse,.st,.num{animation:none!important}}")

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {LP_W} {LP_H}" width="{LP_W}" height="{LP_H}" role="img" aria-labelledby="t d">',
         '<title id="t">The Solar Odyssey learning path</title>',
         '<desc id="d">Six stations in order: the story, how a cell works, solar today, the frontier, '
         'other renewables, storage and grid. A point of light travels along the line from the first to the last.</desc>',
         f"<style>{''.join(css)}</style>",
         f'<defs><radialGradient id="pg"><stop offset="0" stop-color="{c["glow"]}" stop-opacity=".6"/>'
         f'<stop offset="1" stop-color="{c["glow"]}" stop-opacity="0"/></radialGradient></defs>',
         f'<rect class="bg" width="{LP_W}" height="{LP_H}"/>',
         f'<path class="rail" d="{route}"/>',
         f'<path class="lit" pathLength="1000" d="{route}"/>',
         f'<text class="end" x="{start[0]}" y="{y1 - 28}">Start here</text>',
         f'<circle class="cap" cx="{start[0]}" cy="{y1}" r="5"/>',
         f'<circle class="cap" cx="{end[0]}" cy="{y2}" r="5"/>']
    for i, ((name, sub), (x, y)) in enumerate(zip(STAGES, stations)):
        o.append(f'<circle class="st s{i}" cx="{x}" cy="{y}" r="22"/>')
        o.append(f'<text class="num n{i}" x="{x}" y="{y + 8}" text-anchor="middle">{i + 1}</text>')
        o.append(f'<text class="name" x="{x}" y="{y + 62}" text-anchor="middle">{name}</text>')
        o.append(f'<text class="sub" x="{x}" y="{y + 88}" text-anchor="middle">{sub}</text>')
    o.append('<g class="pulse"><circle class="g" r="30"/><circle class="c" r="8"/></g>')
    o.append('</svg>')
    return "\n".join(o) + "\n"


def write_svgs() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("hero", hero_svg), ("learning-path", path_svg)):
        for theme, pal in (("light", LIGHT), ("dark", DARK)):
            p = OUT / f"{name}-{theme}.svg"
            p.write_text(fn(pal, theme == "dark"), encoding="utf-8")
            print(f"wrote {p.relative_to(ROOT)} ({p.stat().st_size/1024:.1f} kB)")


# ---------------------------------------------------------------------------------------------
# GIF captures
# ---------------------------------------------------------------------------------------------
Drive = Callable[["Page", float], Awaitable[None]]  # noqa: F821  (page, seconds into the GIF)


@dataclass
class Shot:
    name: str
    url: str
    widget: str                       # CSS selector of the widget section
    top: str                          # selector whose top edge starts the crop
    bottom: str                       # selector whose bottom edge ends the crop
    seconds: float                    # GIF length
    setup: Callable | None = None     # async (page) before the first frame
    drive: Callable | None = None     # async (page, t) before each frame
    speed: float = 1.0                # page seconds per GIF second (time-lapse)
    fps: int = 12
    width: int = 880
    colors: int = 128
    hide: list[str] = field(default_factory=list)  # selectors hidden inside the crop
    settle: int = 500                 # page ms between scrolling to the widget and the setup step
    pad_bottom: int = 10              # px kept below the `bottom` element


async def set_range(page, sel: str, value: float) -> None:
    await page.evaluate(
        "([s, v]) => { const el = document.querySelector(s); el.value = String(v);"
        " el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }",
        [sel, value])


def ramp(t: float, keys: list[tuple[float, float]]) -> float:
    """Piecewise smooth (eased) interpolation through (time, value) keys."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (ta, va), (tb, vb) in zip(keys, keys[1:]):
        if t <= tb:
            u = (t - ta) / (tb - ta) if tb > ta else 1
            u = u * u * (3 - 2 * u)
            return va + (vb - va) * u
    return keys[-1][1]


# --- per-widget drivers ---------------------------------------------------------------------
async def pv_setup(page):
    await set_range(page, "#pv-int", 70)
    await page.click("#pv-play")
    await page.mouse.move(2, 2)
    await page.clock.run_for(3000)  # let the slab fill with photons before the first frame


async def pv_drive(page, t):
    wl = ramp(t, [(0, 500), (2.5, 500), (4.5, 420), (6.0, 420), (8.5, 1250), (10.5, 1250), (12.0, 500)])
    await set_range(page, "#pv-wl", round(wl))


async def pn_drive(page, t):
    load = ramp(t, [(0, 46), (1.0, 46), (3.0, 0), (4.5, 0), (7.5, 100), (9.0, 100), (11.0, 46)])
    await set_range(page, "#pnj-load", round(load, 1))


async def click_setup(sel: str):
    async def _s(page):
        await page.click(sel)
        await page.mouse.move(2, 2)
    return _s


async def sb_setup(page):
    await page.click("#sb-connect")
    await set_range(page, "#sb-hour", 4)
    await page.clock.run_for(400)
    await page.click("#sb-play")
    await page.mouse.move(2, 2)


SP_SECONDS = 7.0


async def sp_setup(page):
    await set_range(page, "#sp-day", 275)  # 2 October, so captures match whatever day they are made


async def sp_drive(page, t):
    """Sunrise to sunset in Los Angeles on the page's default date, by moving the time slider.
    (Driving the slider rather than the play button keeps the pace even; at night the 3D dome
    keeps the last daytime sun on screen, so the loop covers daylight only.)"""
    await set_range(page, "#sp-time", round(360 + (1055 - 360) * t / SP_SECONDS))


async def cd_drive(page, t):
    """The draw starts on scroll; then sweep the pointer along the years so the tooltip reads prices."""
    r = await page.evaluate("() => { const r = document.querySelector('#cd-price').getBoundingClientRect();"
                            " return [r.left, r.top, r.width, r.height]; }")
    x0, x1 = r[0] + 62, r[0] + r[2] - 112
    if t < 3.0 or t > 9.6:
        await page.mouse.move(r[0] + r[2] + 40, r[1] - 30)
        return
    u = min(1.0, (t - 3.0) / 5.6)
    await page.mouse.move(x0 + (x1 - x0) * u, r[1] + r[3] * 0.55)


async def cmp_drive_factory():
    """Hold each measure for 2.2 s, starting from the selected one and going round in button order."""
    state: dict = {"order": None, "last": None}

    async def _d(page, t):
        if state["order"] is None:
            vals = await page.evaluate("() => [...document.querySelectorAll('#metric-switch button')]"
                                       ".map(b => [b.value, b.getAttribute('aria-checked') === 'true'])")
            start = next((i for i, (_, on) in enumerate(vals) if on), 0)
            state["order"] = [v for v, _ in vals[start:] + vals[:start]]
        order = state["order"]
        want = order[int(t // 2.2) % len(order)]
        if want != state["last"]:
            await page.click(f"#metric-switch button[value='{want}']")
            await page.mouse.move(2, 2)  # keep the pointer off the chart (it highlights rows)
            state["last"] = want
    return _d


async def make_shots() -> list[Shot]:
    return [
        Shot("pv-effect", "learn/photovoltaic-effect.html", ".pv-lab", "#pv-canvas", ".pv-readout > div:nth-child(6)",
             seconds=12.0, setup=pv_setup, drive=pv_drive),
        Shot("pn-junction", "learn/pn-junction.html", "#explorer", "#pnj-canvas", ".pnj-iv",
             seconds=11.0, drive=pn_drive),
        Shot("efficiency", "today/efficiency-records.html", "#records", "#er-chart", ".er-time",
             seconds=10.5, setup=await click_setup("#er-play"), speed=1.5),
        Shot("cost-decline", "today/cost-decline.html", "#price", "#cd-price", "#cd-price",
             seconds=10.5, settle=0, drive=cd_drive, pad_bottom=4),  # rings appear when the chart scrolls into view
        Shot("system-builder", "today/system-builder.html", "#builder", "#sb-svg", ".sb-time",
             seconds=8.0, setup=sb_setup, speed=2.0),
        Shot("sun-path", "today/sun-path.html", "#sky", "#sp-stage", "#sp-stage",
             seconds=SP_SECONDS, setup=sp_setup, drive=sp_drive, hide=["#sp-status"]),
        Shot("compare", "renewables/compare.html", "#board", ".cmp-board-head", "#chart-wrap",
             seconds=11.0, drive=await cmp_drive_factory(), colors=96),
    ]


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):  # noqa: D401
        pass


@contextlib.contextmanager
def serve_site():
    handler = functools.partial(_QuietHandler, directory=str(SITE))
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as httpd:
        th = threading.Thread(target=httpd.serve_forever, daemon=True)
        th.start()
        try:
            yield f"http://127.0.0.1:{httpd.server_address[1]}/"
        finally:
            httpd.shutdown()


MEASURE = """([w, a, b]) => { const W = document.querySelector(w), A = document.querySelector(a), B = document.querySelector(b);
  const rw = W.getBoundingClientRect(), ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
  return { x: rw.left, w: rw.width, top: ra.top, bottom: rb.bottom, sy: scrollY, vh: innerHeight }; }"""
PAD = 10


async def capture(shot: Shot, base: str, browser, frames_dir: Path) -> Path:
    # A short viewport at load, so widgets that start when scrolled into view wait for the capture.
    ctx = await browser.new_context(viewport={"width": 1280, "height": 480}, color_scheme="light",
                                    reduced_motion="no-preference", bypass_csp=True, device_scale_factor=1)
    page = await ctx.new_page()
    await page.clock.install()
    await page.goto(base + shot.url)
    await page.add_style_tag(content="#site-header{display:none!important} html{scroll-behavior:auto!important}"
                             + "".join(f"{s}{{visibility:hidden!important}}" for s in shot.hide))
    await page.clock.run_for(1500)
    # wait for fonts, data and charts to settle: the crop must not move once recording starts
    args = [shot.widget, shot.top, shot.bottom]
    last, stable = None, 0
    for _ in range(40):
        await page.wait_for_timeout(200)
        await page.clock.run_for(200)
        m = await page.evaluate(MEASURE, args)
        key = (round(m["top"] + m["sy"]), round(m["bottom"] - m["top"]))
        stable = stable + 1 if key == last else 0
        last = key
        if stable >= 3:
            break
    height = round(m["bottom"] - m["top"]) + PAD + shot.pad_bottom
    await page.set_viewport_size({"width": 1280, "height": height + 40})
    await page.evaluate("y => window.scrollTo(0, y)", m["top"] + m["sy"] - PAD - 20)
    await page.clock.run_for(shot.settle)
    if shot.setup:
        await shot.setup(page)
    d = frames_dir / shot.name
    shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True)
    n = int(round(shot.seconds * shot.fps))
    step_ms = 1000 / shot.fps * shot.speed
    elapsed = 0.0  # page milliseconds, rounded per frame without drift
    for i in range(n):
        t = i / shot.fps
        if shot.drive:
            await shot.drive(page, t)
        tick = round(elapsed + step_ms) - round(elapsed)
        elapsed += step_ms
        await page.clock.run_for(tick)
        m = await page.evaluate(MEASURE, args)
        y = m["top"] - PAD
        if y < 0 or y + height > m["vh"]:  # something scrolled the page: put the crop back in view
            await page.evaluate("y => window.scrollTo(0, y)", m["top"] + m["sy"] - PAD - 20)
            m = await page.evaluate(MEASURE, args)
            y = m["top"] - PAD
        clip = {"x": m["x"] + 1, "y": y, "width": m["w"] - 2, "height": height}
        await page.screenshot(path=str(d / f"f{i:04d}.png"), clip=clip, animations="allow")
    await ctx.close()
    out = OUT / f"{shot.name}.gif"
    encode_gif(d, out, shot.fps, shot.width, shot.colors)
    return out


def encode_gif(frames: Path, out: Path, fps: int, width: int, colors: int) -> None:
    vf = (f"scale={width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors={colors}:stats_mode=full[p];"
          f"[b][p]paletteuse=dither=none:diff_mode=rectangle")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(frames / "f%04d.png"),
                    "-vf", vf, "-loop", "0", str(out)], check=True)
    size = out.stat().st_size
    if size > GIF_BUDGET and colors > 48:
        encode_gif(frames, out, fps, width, colors // 2)


async def capture_all(names: set[str] | None, keep: str) -> None:
    from playwright.async_api import async_playwright
    OUT.mkdir(parents=True, exist_ok=True)
    frames_dir = Path(keep) if keep else Path(tempfile.mkdtemp(prefix="readme-frames-"))
    shots = [s for s in await make_shots() if not names or s.name in names]
    try:
        with serve_site() as base:
            async with async_playwright() as p:
                browser = await p.chromium.launch()
                for s in shots:
                    out = await capture(s, base, browser, frames_dir)
                    size = out.stat().st_size
                    flag = "" if size <= GIF_BUDGET else "  OVER BUDGET"
                    print(f"wrote {out.relative_to(ROOT)} ({size/1e6:.2f} MB){flag}")
                await browser.close()
    finally:
        if not keep:
            shutil.rmtree(frames_dir, ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--svg", action="store_true", help="only rewrite the SVGs")
    ap.add_argument("--gif", default="", help="comma-separated GIF names to capture (default: all)")
    ap.add_argument("--keep-frames", metavar="DIR", default="", help="keep the PNG frames in DIR (default: deleted)")
    a = ap.parse_args()
    write_svgs()
    if a.svg:
        return 0
    if not shutil.which("ffmpeg"):
        print("ffmpeg not found on PATH", file=sys.stderr)
        return 1
    names = {n.strip() for n in a.gif.split(",") if n.strip()} or None
    asyncio.run(capture_all(names, a.keep_frames))
    return 0


if __name__ == "__main__":
    sys.exit(main())
