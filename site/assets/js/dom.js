// Safe DOM helpers. Data and user input are only ever inserted as text or as
// validated attribute values; nothing from a data file reaches innerHTML.

const SAFE_URL = /^(https:\/\/|http:\/\/|mailto:|#|\.{0,2}\/|[a-z0-9_-]+(\/[a-z0-9_.-]+)*\.html(#[\w-]+)?$)/i;

/** Returns the URL if it is http(s), mailto, a fragment or a relative path; otherwise '#'. */
export function safeHref(url) {
  const s = String(url ?? '').trim();
  if (!s || /^\s*(javascript|data|vbscript|file):/i.test(s)) return '#';
  return SAFE_URL.test(s) ? s : '#';
}

/**
 * h('a', { href: url, class: 'x' }, 'text', child) -> Element.
 * Strings become text nodes. Attributes named on* are refused. href/src are sanitised.
 * Use h.svg(...) for SVG elements.
 */
export function h(tag, attrs = {}, ...children) {
  return build(document.createElement(tag), attrs, children);
}
h.svg = (tag, attrs = {}, ...children) =>
  build(document.createElementNS('http://www.w3.org/2000/svg', tag), attrs, children);

function build(el, attrs, children) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (/^on/i.test(k)) throw new Error(`refusing event-handler attribute ${k}`);
    if (k === 'style') throw new Error('inline style attributes are not allowed (CSP); use classes or el.style');
    if (k === 'href' || k === 'src' || k === 'xlink:href') el.setAttribute(k, safeHref(v));
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Escape text for the rare places that must build an HTML string (ECharts HTML tooltips). */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Remove all children. */
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

/** Format a number with a fixed number of significant digits, for readouts. */
export function fmt(x, digits = 3) {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) return x.toExponential(digits - 1).replace('e+', 'e');
  return Number(x.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** True when the user asked the OS for reduced motion. Widgets must honour it. */
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Read a CSS custom property from :root (for canvas drawing in the current theme). */
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Call fn now and whenever the theme changes (explicit toggle or OS change). */
export function onTheme(fn) {
  fn();
  document.addEventListener('so:theme', fn);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
}

/** Size a canvas for crisp drawing on high-DPI screens. Returns the 2D context scaled to CSS pixels. */
export function fitCanvas(canvas, cssWidth, cssHeight) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cssWidth ?? canvas.clientWidth; const hgt = cssHeight ?? canvas.clientHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Run an animation loop that pauses when off-screen or when the tab is hidden. */
export function animate(el, step) {
  let visible = true; let raf = 0; let last = performance.now();
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { threshold: 0 });
  io.observe(el);
  const loop = (t) => {
    raf = 0; const dt = Math.min(0.05, (t - last) / 1000); last = t;
    step(dt, t / 1000);
    if (visible && !document.hidden) kick();
  };
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) kick(); });
  kick();
  return { stop() { io.disconnect(); if (raf) cancelAnimationFrame(raf); raf = 0; visible = false; }, kick };
}
