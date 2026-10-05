// Sky dome for the sun path page: a three.js scene with the horizon, the Sun's arcs, a tilted
// panel with its normal, and the angle of incidence. Renders on demand (no idle loop).
// East is +x, up is +y, north is −z. Loaded lazily by sun-path.js.
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { cssVar } from '../assets/js/dom.js';

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const skyPoint = (el, az, r = 1) => new THREE.Vector3(r * Math.cos(rad(el)) * Math.sin(rad(az)), r * Math.sin(rad(el)), -r * Math.cos(rad(el)) * Math.cos(rad(az)));
const UP = new THREE.Vector3(0, 1, 0);
const PANEL_W = 0.46; const PANEL_D = 0.3; const PANEL_T = 0.014;
const TARGET_Y = 0.3;

/** True when this browser can make a WebGL context (checked before loading three.js). */
export function webglAvailable() {
  try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

let OUTLINE = 'rgba(0,0,0,0)';
function textCanvas(text, color, { size = 44, weight = 650, family = 'Atkinson Next, system-ui, sans-serif' } = {}) {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = `${weight} ${size}px ${family}`;
  const w = Math.ceil(g.measureText(text).width) + Math.ceil(size * 0.5); const hgt = Math.ceil(size * 1.3);
  c.width = w; c.height = hgt;
  g.font = `${weight} ${size}px ${family}`; g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.lineJoin = 'round'; g.lineWidth = size * 0.22; g.strokeStyle = OUTLINE; g.strokeText(text, w / 2, hgt / 2 + 1);
  g.fillText(text, w / 2, hgt / 2 + 1);
  return c;
}

class Label {
  constructor(height = 0.085, opts = {}) {
    this.height = height; this.opts = opts; this.text = null; this.color = null;
    this.material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.renderOrder = 5;
  }
  set(text, color) {
    if (text === this.text && color === this.color) return;
    this.text = text; this.color = color;
    const c = textCanvas(text, color, this.opts);
    this.material.map?.dispose();
    this.material.map = new THREE.CanvasTexture(c);
    this.material.map.colorSpace = THREE.SRGBColorSpace;
    this.material.needsUpdate = true;
    this.sprite.scale.set((this.height * c.width) / c.height, this.height, 1);
  }
}

function cellTexture(color, lineColor) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = lineColor; g.lineWidth = 3;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo((i * c.width) / 6, 0); g.lineTo((i * c.width) / 6, c.height); g.stroke(); }
  for (let j = 1; j < 4; j++) { g.beginPath(); g.moveTo(0, (j * c.height) / 4); g.lineTo(c.width, (j * c.height) / 4); g.stroke(); }
  g.lineWidth = 8; g.strokeRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** A thin cylinder from a to b (unit cylinder reused, oriented and scaled). */
function rod(radius, material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 8, 1), material);
  m.place = (a, b) => {
    const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
    m.visible = len > 1e-4; if (!m.visible) return;
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    m.scale.set(1, len, 1);
  };
  return m;
}

export function createDome(host, { onRender } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'sp-gl';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Sky dome');
  host.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1.5, 0.05, 60);
  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = false;
  controls.target.set(0, TARGET_Y, 0);
  controls.minPolarAngle = 0.02; controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.rotateSpeed = 0.7;

  const C = {};
  const readColors = () => {
    for (const k of ['paper', 'paper-2', 'panel', 'ink', 'ink-2', 'rule', 'sun', 'sun-ink', 'silicon', 'hole', 'electron']) C[k] = cssVar(`--${k}`) || '#888';
  };
  readColors();

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.6);
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  scene.add(hemi, sunLight, sunLight.target);

  // ---- static sky and ground ----
  const mats = {
    ground: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    domeFill: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }),
    grid: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 }),
    horizon: new THREE.LineBasicMaterial(),
    jun: new THREE.MeshBasicMaterial(), eq: new THREE.MeshBasicMaterial(), dec: new THREE.MeshBasicMaterial(),
    day: new THREE.MeshBasicMaterial(), sun: new THREE.MeshBasicMaterial(),
    ray: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }),
    normal: new THREE.MeshBasicMaterial(), arc: new THREE.MeshBasicMaterial(),
    post: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    frame: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 }),
    cells: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 }),
    glow: new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false }),
  };

  const ground = new THREE.Mesh(new THREE.CircleGeometry(1.24, 96), mats.ground);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.002;
  scene.add(ground);
  const domeFill = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), mats.domeFill);
  scene.add(domeFill);

  const lineOf = (pts, mat) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
  const ring = (el, mat) => { const pts = []; for (let a = 0; a <= 360; a += 3) pts.push(skyPoint(el, a)); return lineOf(pts, mat); };
  scene.add(ring(0, mats.horizon), ring(30, mats.grid), ring(60, mats.grid));
  for (let a = 0; a < 360; a += 30) { const pts = []; for (let e = 0; e <= 90; e += 3) pts.push(skyPoint(e, a)); scene.add(lineOf(pts, mats.grid)); }

  const compass = [['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([t, a]) => {
    const l = new Label(0.15, { size: 56, weight: 750 }); l.sprite.position.copy(skyPoint(0, a, 1.14)).setY(0.06); scene.add(l.sprite); return [l, t];
  });
  const elevLabels = [30, 60].map((e) => { const l = new Label(0.07); scene.add(l.sprite); return [l, e]; });

  // ---- dynamic: paths, sun, panel ----
  const pathGroup = new THREE.Group(); scene.add(pathGroup);
  const pathLabels = { jun: new Label(0.085), eq: new Label(0.085), dec: new Label(0.085) };
  for (const l of Object.values(pathLabels)) scene.add(l.sprite);
  const hourGroup = new THREE.Group(); scene.add(hourGroup);

  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 16), mats.sun);
  const glow = new THREE.Sprite(mats.glow); glow.scale.set(0.3, 0.3, 1); glow.renderOrder = 2;
  scene.add(sun, glow);
  const ray = rod(0.0055, mats.ray); scene.add(ray);

  const panel = new THREE.Group(); panel.rotation.order = 'YXZ';
  let cellTex = null;
  const panelBox = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W, PANEL_T, PANEL_D), [mats.frame, mats.frame, mats.cells, mats.frame, mats.frame, mats.frame]);
  panel.add(panelBox);
  const normalLen = 0.5;
  const nShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, normalLen - 0.06, 10), mats.normal);
  nShaft.position.y = PANEL_T / 2 + (normalLen - 0.06) / 2;
  const nHead = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.08, 16), mats.normal);
  nHead.position.y = PANEL_T / 2 + normalLen - 0.035;
  panel.add(nShaft, nHead);
  scene.add(panel);
  const post = rod(0.012, mats.post); scene.add(post);

  let arcMesh = null; const aoiLabel = new Label(0.1, { size: 48, weight: 700 }); scene.add(aoiLabel.sprite);

  function applyColors() {
    renderer.setClearColor(new THREE.Color(C['paper-2']));
    OUTLINE = C['paper-2'];
    mats.ground.color.set(C.paper);
    mats.domeFill.color.set(C.silicon);
    mats.grid.color.set(C.rule); mats.horizon.color.set(C['ink-2']);
    mats.jun.color.set(C.hole); mats.eq.color.set(C['ink-2']); mats.dec.color.set(C.electron);
    mats.day.color.set(C.sun); mats.sun.color.set(C.sun); mats.glow.color.set(C.sun);
    mats.ray.color.set(C.sun); mats.normal.color.set(C.ink); mats.arc.color.set(C['sun-ink']);
    mats.post.color.set(C['ink-2']); mats.frame.color.set(C['ink-2']);
    cellTex?.dispose(); cellTex = cellTexture(C.silicon, C.rule); mats.cells.map = cellTex; mats.cells.needsUpdate = true;
    hemi.color.set(0xffffff); hemi.groundColor.set(C.rule);
    for (const [l, t] of compass) l.set(t, C.ink);
    for (const [l, e] of elevLabels) l.set(`${e}°`, C['ink-2']);
    for (const m of hourGroup.children) if (m.isMesh) m.material = mats.day;
    for (const [k, l] of Object.entries(pathLabels)) if (l.text) l.set(l.text, C.ink);
    last.labelsDirty = true;
  }

  // ---- camera ----
  const HOME = { N: { el: 30, az: 212 }, S: { el: 30, az: 328 } };
  let view = { ...HOME.N };
  function placeCamera() {
    const vh = rad(camera.fov / 2); const hh = Math.atan(Math.tan(vh) * camera.aspect);
    const dist = Math.max(1.32 / Math.tan(hh), 0.98 / Math.tan(vh));
    camera.position.copy(skyPoint(view.el, view.az, dist)).add(controls.target);
    camera.lookAt(controls.target);
    controls.update();
  }
  function currentView() {
    const v = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    return { el: deg(Math.asin(v.y)), az: (deg(Math.atan2(v.x, -v.z)) + 360) % 360 };
  }

  function resize() {
    const w = host.clientWidth || 600; const hgt = host.clientHeight || 400;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt; camera.updateProjectionMatrix();
    view = currentView(); placeCamera(); render();
  }

  function render() { renderer.render(scene, camera); onRender?.(); }
  controls.addEventListener('change', render);

  // ---- updates ----
  const last = { pathKey: null, hemi: null, labelsDirty: false };
  const tubeFor = (run, radius, mat) => {
    const pts = run.map((p) => skyPoint(p.elevation, p.azimuth));
    if (pts.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), radius, 6, false), mat);
  };
  function rebuildPaths(S) {
    for (const c of [...pathGroup.children]) { c.geometry.dispose(); pathGroup.remove(c); }
    for (const c of [...hourGroup.children]) { c.geometry?.dispose(); hourGroup.remove(c); }
    const add = (runs, r, mat) => { for (const run of runs) { const m = tubeFor(run, r, mat); if (m) pathGroup.add(m); } };
    add(S.paths.jun, 0.006, mats.jun); add(S.paths.eq, 0.006, mats.eq); add(S.paths.dec, 0.006, mats.dec);
    if (S.showDay) add(S.paths.day, 0.011, mats.day);
    const names = { jun: '21 Jun', eq: 'Equinox', dec: '21 Dec' };
    for (const [k, l] of Object.entries(pathLabels)) {
      const noon = S.noon[k];
      l.sprite.visible = Boolean(noon && noon.elevation > 2);
      if (l.sprite.visible) {
        l.set(names[k], C.ink);
        l.sprite.position.copy(skyPoint(Math.min(noon.elevation, 84), noon.azimuth, 1.12));
      }
    }
    const dot = new THREE.SphereGeometry(0.017, 12, 8);
    for (const hm of S.hourMarks) {
      const m = new THREE.Mesh(dot, mats.day); m.position.copy(skyPoint(hm.elevation, hm.azimuth)); hourGroup.add(m);
      if (hm.label) {
        const l = new Label(0.075); l.set(hm.label, C['ink-2']);
        l.sprite.position.copy(skyPoint(hm.elevation, hm.azimuth, 1.14)); hourGroup.add(l.sprite);
      }
    }
  }

  function update(S) {
    if (S.hemisphere !== last.hemi) {
      last.hemi = S.hemisphere; view = { ...HOME[S.hemisphere] }; placeCamera();
      // elevation labels on the meridian nearest the camera's side
      for (const [l, e] of elevLabels) l.sprite.position.copy(skyPoint(e + 3, S.hemisphere === 'N' ? 0 : 180, 1.03));
    }
    if (S.pathKey !== last.pathKey || last.labelsDirty) { last.pathKey = S.pathKey; last.labelsDirty = false; rebuildPaths(S); }

    // panel: tilt about the east-west axis towards its azimuth
    const lift = 0.06 + (PANEL_D / 2) * Math.sin(rad(S.tilt));
    panel.position.set(0, lift, 0);
    panel.rotation.set(rad(S.tilt), Math.PI - rad(S.az), 0);
    post.place(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, lift, 0));
    const centre = new THREE.Vector3(0, lift, 0);

    const up = Boolean(S.sun && S.sun.elevation > 0); // three.js hides only on visible === false
    sun.visible = glow.visible = ray.visible = up;
    if (arcMesh) { arcMesh.geometry.dispose(); scene.remove(arcMesh); arcMesh = null; }
    aoiLabel.sprite.visible = false;
    if (up) {
      const p = skyPoint(S.sun.elevation, S.sun.azimuth);
      sun.position.copy(p); glow.position.copy(p);
      ray.place(p, centre);
      sunLight.position.copy(p).multiplyScalar(4); sunLight.target.position.set(0, 0, 0);
      sunLight.intensity = 2.4 * Math.min(1, Math.sin(rad(S.sun.elevation)) * 3);
      // angle-of-incidence arc between the normal and the sun direction, around the panel centre
      const n = new THREE.Vector3(0, 1, 0).applyEuler(panel.rotation).normalize();
      const s = new THREE.Vector3().subVectors(p, centre).normalize();
      const ang = n.angleTo(s);
      if (ang > rad(1.5)) {
        const pts = []; const qa = new THREE.Quaternion(); const axis = new THREE.Vector3().crossVectors(n, s).normalize();
        for (let i = 0; i <= 24; i++) { qa.setFromAxisAngle(axis, (ang * i) / 24); pts.push(n.clone().applyQuaternion(qa).multiplyScalar(0.24).add(centre)); }
        arcMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0055, 6, false), mats.arc);
        scene.add(arcMesh);
        qa.setFromAxisAngle(axis, ang / 2);
        aoiLabel.set(`θ ${Math.round(S.aoi)}°`, C.ink);
        aoiLabel.sprite.position.copy(n.clone().applyQuaternion(qa).multiplyScalar(0.36).add(centre));
        aoiLabel.sprite.visible = true;
      }
    } else {
      sunLight.intensity = 0;
    }
    canvas.setAttribute('aria-label', S.label);
    render();
  }

  function setView(kind) {
    const v = currentView();
    if (kind === 'left') view = { el: v.el, az: (v.az + 30) % 360 };
    else if (kind === 'right') view = { el: v.el, az: (v.az + 330) % 360 };
    else if (kind === 'top') view = { el: 89, az: last.hemi === 'S' ? 180 : 0 };
    else view = { ...HOME[last.hemi || 'N'] };
    placeCamera(); render();
  }

  applyColors();
  const ro = new ResizeObserver(() => resize());
  ro.observe(host);
  resize();

  return {
    canvas, update, setView, render, resize,
    theme() { readColors(); applyColors(); render(); },
  };
}
