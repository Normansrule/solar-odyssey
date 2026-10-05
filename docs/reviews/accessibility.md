# Accessibility review (Milestone 4)

Reviewed 2026-10-02 against WCAG 2.2 level AA, on all 28 pages listed in `site/assets/js/sitemap.js`.
Scope: markup attributes, CSS and script behaviour. Page text was not rewritten (content reviewers
were editing prose in parallel).

## How to run the checks

```
npm ci --ignore-scripts                      # installs axe-core 4.13.0 (pinned devDependency)
python3 -m playwright install chromium
npm run test:a11y                            # python3 -m pytest -q tests/e2e/test_a11y.py
```

CI runs the same file as its own step after the other browser tests (`.github/workflows/ci.yml`).
The suite takes about 8 minutes on a 2-core machine (88 tests). The CI job timeout went from 25 to 35
minutes to make room for it.

## What the tests check

`tests/e2e/test_a11y.py` (with `tests/e2e/a11y_probe.js`, a test-only init script) runs four kinds of check.
Its browser contexts use `bypass_csp=True` so that axe can be injected into pages whose CSP refuses it;
no other test does this.

1. **axe-core, every page, three states.** One page load per page: axe with the `wcag2a`, `wcag2aa`,
   `wcag21a`, `wcag21aa`, `wcag22a` and `wcag22aa` rules in the light theme, again after switching to the
   dark theme, and again at Expert depth. Every violation is printed; any of impact *serious* or
   *critical* fails the test.
2. **Text drawn on canvas.** axe cannot see inside a `<canvas>`. The probe wraps
   `CanvasRenderingContext2D.fillText` and, while the theme is switched dark and back to light (every chart
   and diagram redraws), records each label's fill colour and alpha, font size and weight, and samples the
   canvas pixels under the text box before the glyphs are drawn. Labels must reach 4.5:1 (3:1 for large
   text). This covers ECharts axis labels, data labels and every hand-drawn diagram label.
3. **Keyboard and screen reader**, per page, light theme, reduced motion:
   - nothing changes on its own for 1.5 s after load (canvas pixels, SVG markup, page text);
   - every visible canvas or SVG of diagram size has `role="img"` (or `group`) with an accessible name on
     itself or a close ancestor; no `aria-live="assertive"`;
   - Tab from the top of the page reaches every visible focusable element; no focus lands inside
     `aria-hidden`, off screen, or under the sticky header; for one element of each kind, a screenshot of
     the element focused and unfocused must differ (a visible focus indicator);
   - every slider, select, checkbox, radio, button, radio-group option and interactive SVG in the main
     content is operated from the keyboard (arrow keys, Space or Enter) and must change something (DOM,
     canvas drawing, state attribute or focus). Sliders, selects, checkboxes and arrow-key widgets that
     change text on the page must change it inside a polite live region (`aria-live="polite"`,
     `role="status"` or `<output>`). Play, Pause and Step buttons are covered by this check, under
     reduced motion.
4. **Reflow and resize**, per page at Expert depth: no sideways scrolling and no text cut off by
   `overflow: hidden` or an ellipsis at 640 x 450 CSS px (a 1280 x 900 window at 200 % zoom) and at 320 px
   wide; then, in a 1280 px window, with the browser's default text size doubled (16 to 32 px, through
   Chrome's `Page.setFontSizes`), the same checks.

Plus four site-wide tests: header menus (Enter and Space open, Tab enters the menu, Escape closes and
returns focus, opening one closes the other; depth and theme switches; the phone menu button and Escape
at 390 px), the skip link, glossary tooltips on focus (role, `aria-describedby`, Escape, and hovering
the tooltip itself), and the timeline's J/K keys (move and focus the next and previous event).

One-off audits run during the review but not kept in the suite (they need a human to judge the
results): axe's `best-practice` rules and its "needs review" contrast list; an SVG `<text>` contrast
scan in both themes; Shift+Tab through long pages (focus never hidden under the header); and
normal-motion runs to time every animation that starts by itself.

## Issues found and fixed

| # | Issue (WCAG) | Where | Fix |
|---|---|---|---|
| 1 | Citation links `[n]` were about 17 x 16 px with neighbours under 12 px away (2.5.8 Target Size) | every page with citations (63 of 84 axe runs failed) | `sup.cite a` is an inline block at least 24 x 24 px that grows with the text. Negative margins stop it pushing lines apart (`odyssey.css`) |
| 2 | Two stacked links in one table cell 22 px apart (2.5.8) | State of the field | `.sf-rec` is an inline block with a small top margin |
| 3 | System map `<svg role="img">` contained focusable `role="button"` nodes. Children of an image are presentational, so screen readers could not reach the buttons (4.1.2, axe nested-interactive) | Renewables hub | `role="group"`, keeping the same `aria-label` |
| 4 | Display equations wider than their box scroll sideways but could not be reached by keyboard (2.1.1, axe scrollable-region-focusable) | Equation atlas, and any page on a phone | `core.js` `renderMath` watches each display equation. While it overflows it gets `tabindex="0"`, `role="group"` and `aria-label="Equation (scrolls sideways)"`, and loses them when it fits again |
| 5 | Canvas labels below 4.5:1: "Isc …"/"Voc …" (4.31:1) and the year labels on the learning curve (3.88:1) | I-V curve, Cost collapse | label colour `ink` instead of `ink-2` |
| 6 | Light theme: focus ring `--focus` #e89f0c was 2.1:1 against the page (2.4.13 / 1.4.11) | site-wide | light `--focus` #b37400 (3.3 to 3.9:1 on paper, paper-2 and panel). Dark keeps #e89f0c (6.8:1 or better) |
| 7 | Light theme: the solar series colour (#e89f0c) was 1.9 to 2.2:1, and so was the sunlight amber used for chart lines, bars and markers (1.4.11) | Compare, Renewables hub, Cost collapse, Sun path, CSP, I-V curve, Storage, Grid | `--r-solar` #b37400. New token `--sun-line` (light #b37400, dark #f5b83d), which `charts.js` `palette().sun` now returns. `--sun` stays the bright amber for decorative fills (sun discs, washes). `--r-csp` moved to #a8520a (5.0:1) so it stays distinct from the darker solar colour |
| 8 | Form-field borders used `--rule` (1.3:1), so text boxes and selects had no visible edge (1.4.11) | site-wide | new `--control-border` #6f8194 (3.4:1 or better in both themes) on `select`, `input`, `textarea` |
| 9 | The pressed option of the Intro/Expert switch and the sun-path view switch was shown only by a faint fill (1.2:1) (1.4.11) | header, Sun path | inset 1.5 px `--silicon` ring on the pressed option |
| 10 | Glossary tooltip heading in the dark theme: amber on the light tooltip, 1.5:1 (1.4.3) | every page with glossary terms | `--tip-accent` (dark: #8a5300, 5:1) |
| 11 | Translucent stacked-bar segments (Still needed, Into storage, Wasted) were 1.1 to 1.6:1 against the page (1.4.11) | Storage, Grid day charts | each translucent segment gets a solid 1 px outline in its own colour |
| 12 | Carrier "+"/"−" glyphs were white on light blue in the dark theme, about 2.5:1 (decorative but legible) | Cell technologies | glyphs use `--paper` (5:1 or better in both themes) |
| 13 | Escape did not close the phone navigation (2.1.1) | header, under 70 rem | Escape closes it and returns focus to the menu button (`core.js`) |
| 14 | Glossary tooltip vanished when the pointer moved onto it (1.4.13 hoverable). After Escape, `aria-describedby` still pointed at the removed tooltip | every page with glossary terms | 200 ms grace period, and the tooltip stays while the pointer is on it. Hiding it always clears `aria-describedby` from its term |
| 15 | Equation-atlas plots are focusable and move a crosshair with the arrow keys, but the value appeared only inside the image (4.1.3) | Equation atlas | a polite live region beside each plot announces the readout; `aria-keyshortcuts="ArrowLeft ArrowRight"` |
| 16 | Radio groups: "Show TWh / %" had no arrow-key support; both groups put every option in the Tab order (2.1.1, ARIA radio pattern) | Compare | roving `tabindex`; arrow keys select the next or previous option in both groups |
| 17 | Changing the country select or the "Include nuclear, gas and coal" box rewrote the chart title or summary without announcing it (4.1.3) | Renewables hub, Compare | `aria-live="polite"` on `#mix-title` and `#growth-summary` |
| 18 | 15 Play/Pause-style buttons changed their label and also carried `aria-pressed`. Screen readers said "Pause, pressed" while playing; the p-n junction button had the meaning reversed (4.1.2) | Photovoltaic effect, p-n junction, Cell to grid, System builder (2), Sun path, Efficiency records, Wind, Hydro (2), Geothermal, Ocean (2), Biomass, CSP | `aria-pressed` removed (HTML and scripts). The label carries the state, as the ARIA authoring practices require for buttons whose label changes |
| 19 | At 320 px several pages were 334 to 373 px wide. `body { overflow-x: hidden }` hid the overflow, so the end of long reference lines was cut off (1.4.10) | Timeline, Wind, Hydro, Geothermal, Ocean, Biomass, CSP, Storage, Grid, Equations, Sources | long DOIs/URLs in reference lists and source records wrap (`overflow-wrap: anywhere`); every `div.tex` scrolls inside its own box; inline atlas formulas may wrap below 30 rem |
| 20 | Values cut off with an ellipsis at 320 px ("880 W/m²") (1.4.10) | Sun path | the three-up readout uses `auto-fit` columns and drops to two before values are cut |
| 21 | Symbol definitions used `overflow: hidden` to contain a float, which clipped tall maths by 6 px | Equation atlas | `display: flow-root` |
| 22 | Empty `<th>` in a table header (axe best-practice) | Photovoltaic effect | the corner cell is a `<td>`, styled like the header row |
| 23 | Links that read as plain text: the "Renewables" kicker link had no underline and the kicker colour; visited path links on the home page were ink with no underline | Biomass, CSP, Storage, Grid, Home | underlines restored |

After these fixes the whole suite passes: no serious or critical axe violation on any page in either
theme or at Expert depth, and none of moderate or minor impact under the WCAG tags.

## Checked and found fine

- Contrast of every text colour token on paper, paper-2 and panel in both themes. The lowest is `--good`
  on paper-2 at 4.50:1. Light-theme technology and source colours used as lines are all 3.3:1 or better.
- Drag interactions all have keyboard and single-pointer alternatives. Band gap: the canvas and the
  "Band gap" slider. p-n junction: the I-V canvas and the "Load" slider. System builder: the drag handles
  and the number fields, plus/minus buttons and "Connect to the grid".
- Reduced motion: no page animates by itself. Every Play, Pause and Step control works.
- Normal motion: animations that start by themselves (p-n junction, Wind, Hydro, Geothermal, Ocean)
  have a Pause button next to them. The first chart draw on Cost collapse finishes in about 3 s. The
  home-page arc intro finishes about 4.5 s after load, which is close to the 5 s limit in WCAG 2.2.2
  (see "Left as is").
- Focus order follows the visual order (no positive `tabindex`; the CSS grid placements that exist keep
  DOM order). Focus is never hidden under the sticky header, going forwards or backwards.
- Skip link, landmarks, one `<h1>` per page, heading order, page language and titles, form labels, image
  alternatives and duplicate ids: no axe findings.
- Text at 200 % through the browser's text-size setting reflows at 1280 px with nothing cut off. The
  header switches to the menu button, because its breakpoint is in `rem`.

## Left as is, with reasons

- **Home-page arc intro** runs about 4.5 s and has no pause control. It is under the 5 s limit of
  WCAG 2.2.2 and does not run with reduced motion. If it is ever lengthened, it needs a pause control.

- **Heading self-links** (timeline event titles, glossary terms, home "station" titles) are ink-coloured
  and underline only on hover. They are headings, not links inside running text, so WCAG 1.4.1 does not
  apply. Underlining every heading is a design decision.
- **Decorative canvas fills in `--sun`** (sun discs, the band-gap "heat" band, CSP mirror glints) stay
  2:1 in the light theme. They are illustration, and the numbers they show are also in text readouts
  beside each canvas.
- **CSP (#a8520a) and geothermal (#b8412c)** are close in hue in the light theme. Every chart that shows
  both labels its lines or bars directly, so colour is not the only cue.
- **Glossary letter index**: letters with no entries use `--rule` and are `aria-hidden`. They are inactive
  decoration, which WCAG exempts from contrast.
- **SVG text contrast** is not in the automated suite. Text drawn on top of shapes makes a simple
  "fill against page background" check give false positives. The one-off scan found only the carrier
  glyphs (fixed above).
- **Not tested:** a real screen reader (NVDA, JAWS, VoiceOver, TalkBack) end to end, Windows forced-colours
  mode, and speech input. The suite checks names, roles, states and live regions in the accessibility
  tree, which catches most problems, but a session with a real screen reader user is still worth doing
  before a major release.
