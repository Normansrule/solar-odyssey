// Injected by tests/e2e/test_a11y.py with page.add_init_script before any page code runs.
// It records (1) the colour, size and background of every piece of text drawn on a
// <canvas> while window.__so.collectText is true, so chart labels can be checked for
// contrast, and (2) how many drawing calls each canvas receives, so the test can tell
// whether pressing a control redrew anything. Test-only; never shipped with the site.
(() => {
  const so = { collectText: false, text: [], draws: 0 };
  Object.defineProperty(window, '__so', { value: so });

  const P = CanvasRenderingContext2D.prototype;
  for (const m of ['fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'putImageData', 'fillText', 'strokeText']) {
    const orig = P[m];
    P[m] = function (...a) { so.draws += 1; return orig.apply(this, a); };
  }

  const parse = (c) => {
    if (typeof c !== 'string') return null;
    let m = c.match(/^#([0-9a-f]{6})$/i);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
    m = c.match(/^rgba?\(([^)]+)\)$/i);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
    return null;
  };
  // Background colour behind the canvas element (first opaque ancestor).
  const cssBg = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0.99) return c;
    }
    return parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
  };
  const origFill = P.fillText;
  P.fillText = function (text, x, y, ...rest) {
    if (so.collectText && String(text).trim() && so.text.length < 4000 && this.canvas.isConnected && this.canvas.offsetWidth > 0) {
      try {
        const fg = parse(this.fillStyle);
        const size = parseFloat((this.font.match(/([\d.]+)px/) || [])[1] || '10');
        const bold = /\b(bold|[6-9]00)\b/.test(this.font);
        const mt = this.measureText(String(text));
        const t = this.getTransform();
        const box = [x - mt.actualBoundingBoxLeft, y - mt.actualBoundingBoxAscent, x + mt.actualBoundingBoxRight, y + mt.actualBoundingBoxDescent];
        const cv = this.canvas;
        // sample a 5 x 3 grid inside the text box before the glyphs are drawn
        const counts = new Map();
        for (let i = 0; i < 5; i += 1) for (let j = 0; j < 3; j += 1) {
          const ux = box[0] + ((box[2] - box[0]) * (i + 0.5)) / 5; const uy = box[1] + ((box[3] - box[1]) * (j + 0.5)) / 3;
          const px = Math.round(t.a * ux + t.c * uy + t.e); const py = Math.round(t.b * ux + t.d * uy + t.f);
          if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) continue;
          const d = this.getImageData(px, py, 1, 1).data;
          const k = `${d[0]},${d[1]},${d[2]},${d[3]}`;
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        if (fg && counts.size) {
          const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
          const under = cssBg(cv);
          const a = top[3] / 255; // canvas pixel over the page background
          const bg = [0, 1, 2].map((k) => top[k] * a + under[k] * (1 - a));
          const fa = fg[3] * this.globalAlpha;
          const col = [0, 1, 2].map((k) => fg[k] * fa + bg[k] * (1 - fa));
          const scale = Math.hypot(t.a, t.b) / (window.devicePixelRatio || 1);
          so.text.push({ text: String(text).slice(0, 40), fg: col, bg, size: size * scale, bold,
            canvas: cv.id || cv.closest('[id]')?.id || cv.className || 'canvas' });
        }
      } catch { /* tainted or detached canvas: skip */ }
    }
    return origFill.call(this, text, x, y, ...rest);
  };
})();
