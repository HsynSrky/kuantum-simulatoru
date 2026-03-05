import * as THREE from 'three';
import { Complex, QuantumRegister, hashStringToUint32, mulberry32 } from './quantum.js';

function makeClickSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  return async function play() {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const duration = 0.03;

    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      const env = Math.pow(1 - t, 3);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(ctx.destination);

    src.start(now);
    src.stop(now + duration);
  };
}

function makeBuzzSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  return async function play() {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const duration = 0.12;

    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      const env = Math.pow(1 - t, 1.6);
      const base = (Math.random() * 2 - 1) * 0.9;
      data[i] = base * env;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);

    src.start(now);
    src.stop(now + duration);
  };
}

const playClick = makeClickSound();
const playBuzz = makeBuzzSound();

let rng = mulberry32(hashStringToUint32('cern'));
let register = new QuantumRegister({ numQubits: 2, rng });

const qubitIdToIndex = new Map([
  ['A', 0],
  ['B', 1]
]);

function setSeed(seedStr) {
  rng = mulberry32(hashStringToUint32(String(seedStr ?? '')));
  register.setRng(rng);
}

function expandRegisterTo(numQubits) {
  if (numQubits <= register.numQubits) return;
  const old = register;
  const oldN = 1 << old.numQubits;
  const newReg = new QuantumRegister({ numQubits, rng });
  const newN = 1 << newReg.numQubits;
  for (let i = 0; i < newN; i++) {
    newReg.state[i].re = 0;
    newReg.state[i].im = 0;
  }
  for (let i = 0; i < oldN; i++) {
    const amp = old.state[i];
    newReg.state[i].re = amp.re;
    newReg.state[i].im = amp.im;
  }
  newReg.renormalize();
  register = newReg;
}

function getIndexForQubitId(id) {
  if (!qubitIdToIndex.has(id)) {
    const idx = qubitIdToIndex.size;
    qubitIdToIndex.set(id, idx);
    expandRegisterTo(idx + 1);
  }
  return qubitIdToIndex.get(id);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();

const qubitVertexShader = /* glsl */`
  uniform float uTime;

  varying vec3 vNormalW;
  varying vec3 vPosW;

  // IQ-style hash noise (cheap)
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f*f*(3.0 - 2.0*f);

    float n000 = hash(i + vec3(0,0,0));
    float n100 = hash(i + vec3(1,0,0));
    float n010 = hash(i + vec3(0,1,0));
    float n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1));
    float n101 = hash(i + vec3(1,0,1));
    float n011 = hash(i + vec3(0,1,1));
    float n111 = hash(i + vec3(1,1,1));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);

    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);

    return mix(nxy0, nxy1, f.z);
  }

  void main() {
    vec3 pos = position;

    vec3 n = normal;
    float n1 = noise(normal * 2.2 + uTime * 0.25);
    float n2 = noise(position * 1.1 - uTime * 0.18);
    float w = (n1 * 0.6 + n2 * 0.4);

    pos += n * (w - 0.5) * 0.12;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vPosW = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const qubitFragmentShader = /* glsl */`
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uZAngle;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uFresnelColor;

  varying vec3 vNormalW;
  varying vec3 vPosW;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float sparkle(vec2 uv, float t) {
    // grid sparkles that blink
    vec2 g = uv * 22.0;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;

    float h = hash21(id);
    float blink = smoothstep(0.92, 1.0, sin(t * (2.2 + h * 4.0) + h * 6.28318) * 0.5 + 0.5);
    float d = length(f);
    float core = smoothstep(0.16, 0.0, d);

    // sparse
    float mask = step(0.965, h);
    return core * blink * mask;
  }

  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);

    // base gradient between deep navy and purple
    float bands = sin((vPosW.y * 1.7 + vPosW.x * 0.9) * 2.0 + uTime * 0.35) * 0.5 + 0.5;
    vec3 base = mix(uColorA, uColorB, bands);

    // Z-rotation as phase (hue shift only)
    vec3 hsv = rgb2hsv(base);
    hsv.x = fract(hsv.x + uZAngle);
    base = hsv2rgb(hsv);

    // Fresnel edge glow
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 col = mix(base, uFresnelColor, fres);

    // Sparkles
    vec2 uv = vec2(atan(N.z, N.x) / 6.28318 + 0.5, N.y * 0.5 + 0.5);
    float sp = sparkle(uv, uTime);
    col += vec3(1.0) * sp * 1.8;

    gl_FragColor = vec4(col, uOpacity);
  }
`;

class QubitObject {
  constructor({ position, name }) {
    this.name = name;
    this.index = getIndexForQubitId(name);

    this.geometry = new THREE.SphereGeometry(0.75, 128, 128);

    this.uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0.7 },
      uZAngle: { value: 0 },
      uColorA: { value: new THREE.Color('#1A237E') },
      uColorB: { value: new THREE.Color('#4A148C') },
      uFresnelColor: { value: new THREE.Color('#29B6F6') }
    };

    this.superpositionMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: qubitVertexShader,
      fragmentShader: qubitFragmentShader,
      transparent: true,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(this.geometry, this.superpositionMaterial);
    this.mesh.position.copy(position);
    this.mesh.userData.__qubit = this;

    this.blackMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: false });
    this.whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false });

    this.isRotating = false;

    this.axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.baseSpeed = 0.22 + Math.random() * 0.18;
    this.phase = Math.random() * Math.PI * 2;

    this.setClassical(0);
  }

  setTime(t) {
    this.uniforms.uTime.value = t;
  }

  update(dt, t) {
    this.setTime(t);

    if (!this.isRotating) return;

    const speedMod = 0.75 + 0.25 * Math.sin(t * 0.55 + this.phase) + 0.08 * Math.sin(t * 1.7 + this.phase * 2.0);
    const dAngle = dt * this.baseSpeed * speedMod;
    this.mesh.rotateOnAxis(this.axis, dAngle);
  }

  syncVisualFromRegister() {
    const { rho00, rho11, rho01 } = register.getReduced1Qubit(this.index);
    const eps = 1e-6;
    const coherence = Complex.abs(rho01);

    if (rho00 > 1 - 1e-4 && coherence < 1e-4) {
      this.isRotating = false;
      this.mesh.material = this.blackMaterial;
      return;
    }
    if (rho11 > 1 - 1e-4 && coherence < 1e-4) {
      this.isRotating = false;
      this.mesh.material = this.whiteMaterial;
      return;
    }

    this.mesh.material = this.superpositionMaterial;
    this.isRotating = true;

    const phase = Math.atan2(rho01.im, rho01.re);
    const norm = (phase / (Math.PI * 2)) + 0.5;
    this.uniforms.uZAngle.value = ((norm % 1) + 1) % 1;

    const p = Math.max(eps, Math.min(1 - eps, rho00));
    this.uniforms.uOpacity.value = 0.45 + 0.35 * (1 - Math.abs(0.5 - p) * 2);
  }

  applyZRotation(angleDeg) {
    const theta = (Number(angleDeg) || 0) * Math.PI / 180;
    register.applyZRotation(this.index, theta);
    this.syncVisualFromRegister();
  }

  setClassical(value) {
    const r = register.measure(this.index);
    if (r !== value) register.applyX(this.index);
    this.syncVisualFromRegister();
  }

  applyHadamard() {
    register.applyH(this.index);
    this.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.baseSpeed = 0.22 + Math.random() * 0.18;
    this.phase = Math.random() * Math.PI * 2;
    this.syncVisualFromRegister();
  }

  applyPauliX() {
    register.applyX(this.index);
    this.syncVisualFromRegister();
  }

  measure() {
    const result = register.measure(this.index);
    playClick();
    this.syncVisualFromRegister();
    return result;
  }
}

const qubitA = new QubitObject({ position: new THREE.Vector3(-1.8, 0, 0), name: 'A' });
const qubitB = new QubitObject({ position: new THREE.Vector3(1.8, 0, 0), name: 'B' });
scene.add(qubitA.mesh);
scene.add(qubitB.mesh);

const shieldGeometry = new THREE.SphereGeometry(0.95, 64, 64);
const shieldMaterial = new THREE.MeshBasicMaterial({
  color: 0x29b6f6,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});
const shieldA = new THREE.Mesh(shieldGeometry, shieldMaterial);
const shieldB = new THREE.Mesh(shieldGeometry, shieldMaterial);
shieldA.visible = false;
shieldB.visible = false;
shieldA.position.copy(qubitA.mesh.position);
shieldB.position.copy(qubitB.mesh.position);
scene.add(shieldA);
scene.add(shieldB);

let shieldedQubit = null;

const noiseParticles = [];
const noiseBounds = { x: 3.4, y: 2.1, z: 2.2 };
const noiseGeom = new THREE.BoxGeometry(0.08, 0.08, 0.08);
const noiseMat = new THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.42 });

for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(noiseGeom, noiseMat);
  m.position.set(
    (Math.random() * 2 - 1) * noiseBounds.x,
    (Math.random() * 2 - 1) * noiseBounds.y,
    (Math.random() * 2 - 1) * noiseBounds.z
  );
  const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
  v.multiplyScalar(0.6 + Math.random() * 0.8);
  noiseParticles.push({ mesh: m, vel: v });
  scene.add(m);
}

let entanglementLine = null;
let lineBaseOpacity = 0.28;

function syncAllQubitsFromRegister() {
  for (const q of sandbox.qubits.values()) {
    q.syncVisualFromRegister();
  }
}

function isEntangledPair(a, b) {
  if (!a || !b) return false;
  const ra = register.getReduced1Qubit(a.index);
  const purity = (ra.rho00 * ra.rho00) + (ra.rho11 * ra.rho11) + 2 * Complex.abs2(ra.rho01);
  return purity < 0.999;
}

const shockwaves = [];
function spawnShockwave(worldPos) {
  const geom = new THREE.RingGeometry(0.05, 0.06, 96);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(worldPos);
  mesh.lookAt(camera.position);
  mesh.scale.setScalar(1);
  scene.add(mesh);
  shockwaves.push({ mesh, born: clock.elapsedTime });
}

const zaps = [];
function spawnZap(from, to) {
  const points = [from.clone(), to.clone()];
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending
  });
  const line = new THREE.Line(geom, mat);
  scene.add(line);
  zaps.push({ line, born: clock.elapsedTime });
}

function removeEntanglementLine() {
  if (!entanglementLine) return;
  scene.remove(entanglementLine);
  entanglementLine.geometry.dispose();
  entanglementLine.material.dispose();
  entanglementLine = null;
}

function ensureEntanglementLine() {
  if (entanglementLine) return;
  const linePoints = [qubitA.mesh.position.clone(), qubitB.mesh.position.clone()];
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: lineBaseOpacity
  });
  entanglementLine = new THREE.Line(lineGeometry, lineMaterial);
  scene.add(entanglementLine);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function getAllQubitMeshes() {
  return Array.from(sandbox?.qubits?.values?.() ?? [qubitA, qubitB]).map((q) => q.mesh);
}

function onPointerDown(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  pointer.set(x, y);

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(getAllQubitMeshes(), false);
  if (!hits.length) return;

  const q = hits[0].object.userData.__qubit;
  if (!q) return;

  q.measure();
  syncAllQubitsFromRegister();
}

window.addEventListener('pointerdown', onPointerDown);

function onPointerMove(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  pointer.set(x, y);

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([qubitA.mesh, qubitB.mesh], false);

  shieldA.visible = false;
  shieldB.visible = false;
  shieldedQubit = null;

  if (!hits.length) return;
  const q = hits[0].object.userData.__qubit;
  if (!q) return;
  shieldedQubit = q;
  if (q === qubitA) shieldA.visible = true;
  if (q === qubitB) shieldB.visible = true;
}

window.addEventListener('pointermove', onPointerMove);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener('resize', onResize);

const btnH = document.getElementById('btnH');
const btnX = document.getElementById('btnX');
const zSlider = document.getElementById('zSlider');
const zValue = document.getElementById('zValue');
const activeQubitSel = document.getElementById('activeQubit');
const btnCX = document.getElementById('btnCX');
const cxControlSel = document.getElementById('cxControl');
const cxTargetSel = document.getElementById('cxTarget');
const btnBell = document.getElementById('btnBell');
const statusEl = document.getElementById('status');
const box1 = document.getElementById('box1');
const box2 = document.getElementById('box2');
const box3 = document.getElementById('box3');
const box4 = document.getElementById('box4');
const btnDeutsch = document.getElementById('btnDeutsch');
const deutschResultEl = document.getElementById('deutschResult');
const deutschHintEl = document.getElementById('deutschHint');

const menuBtn = document.getElementById('menuBtn');
const drawerOverlay = document.getElementById('drawerOverlay');
const drawer = document.getElementById('drawer');
const drawerClose = document.getElementById('drawerClose');

const sandboxToggle = document.getElementById('sandboxToggle');
const sandboxBody = document.getElementById('sandboxBody');
const circuitArea = document.getElementById('circuitArea');
const stepsEl = document.getElementById('steps');
const btnRunCircuit = document.getElementById('btnRunCircuit');
const btnClearCircuit = document.getElementById('btnClearCircuit');
const colorAInput = document.getElementById('colorA');
const colorBInput = document.getElementById('colorB');
const colorFInput = document.getElementById('colorF');
const colorBgInput = document.getElementById('colorBg');
const lineOpacityInput = document.getElementById('lineOpacity');
const lineOpacityValue = document.getElementById('lineOpacityValue');
const btnShare = document.getElementById('btnShare');
const btnLoad = document.getElementById('btnLoad');
const shareText = document.getElementById('shareText');

const seedInput = document.getElementById('seedInput');
const btnReset = document.getElementById('btnReset');
const eventLogEl = document.getElementById('eventLog');

let busy = false;

function logEvent(text) {
  if (!eventLogEl) return;
  const line = document.createElement('div');
  line.textContent = text;
  if (eventLogEl.children.length === 1 && eventLogEl.textContent.trim() === '—') {
    eventLogEl.innerHTML = '';
  }
  eventLogEl.appendChild(line);
  eventLogEl.scrollTop = eventLogEl.scrollHeight;
}

function setBusy(v) {
  busy = v;
  const dis = v;
  const elems = [btnH, btnX, zSlider, btnCX, cxControlSel, cxTargetSel, btnBell, box1, box2, box3, box4, btnDeutsch, btnRunCircuit, btnClearCircuit, btnShare, btnLoad, btnReset];
  for (const el of elems) {
    if (el) el.disabled = dis;
  }
}

let selectedOracle = 1;
function setOracle(n) {
  selectedOracle = n;
  setStatus(`Seçili kutu: ${n}`);
  const selectedBg = 'rgba(255,255,255,0.16)';
  const normalBg = 'rgba(255,255,255,0.08)';
  const buttons = [box1, box2, box3, box4];
  for (let i = 0; i < buttons.length; i++) {
    if (!buttons[i]) continue;
    buttons[i].style.background = (i + 1) === n ? selectedBg : normalBg;
  }
}

function applyOracle(n, A, B) {
  if (n === 1) {
    return;
  }
  if (n === 2) {
    register.applyX(B.index);
    syncAllQubitsFromRegister();
    return;
  }
  if (n === 3) {
    applyCNOT(A, B);
    return;
  }
  if (n === 4) {
    register.applyX(B.index);
    syncAllQubitsFromRegister();
    applyCNOT(A, B);
  }
}

async function runDeutsch() {
  if (busy) return;
  setBusy(true);
  setStatus('Deutsch: çalıştırılıyor...');
  if (deutschResultEl) deutschResultEl.textContent = '…';

  removeEntanglementLine();
  register.resetBasis(1 << qubitB.index);
  syncAllQubitsFromRegister();
  logEvent('Deutsch reset: A=0, B=1');

  await new Promise((r) => setTimeout(r, 60));

  spawnShockwave(qubitA.mesh.position);
  register.applyH(qubitA.index);
  syncAllQubitsFromRegister();
  logEvent('H(A)');
  spawnShockwave(qubitB.mesh.position);
  register.applyH(qubitB.index);
  syncAllQubitsFromRegister();
  logEvent('H(B)');

  await new Promise((r) => setTimeout(r, 120));

  applyOracle(selectedOracle, qubitA, qubitB);
  logEvent(`Oracle Kutu ${selectedOracle}`);

  await new Promise((r) => setTimeout(r, 120));

  spawnShockwave(qubitA.mesh.position);
  register.applyH(qubitA.index);
  syncAllQubitsFromRegister();
  logEvent('H(A)');

  await new Promise((r) => setTimeout(r, 60));

  const result = register.measure(qubitA.index);
  playClick();
  syncAllQubitsFromRegister();
  logEvent(`measure(A) = ${result}`);
  if (deutschResultEl) deutschResultEl.textContent = `Sonuç: ${result}`;

  if (deutschHintEl) {
    deutschHintEl.textContent = result === 0
      ? 'Sonuç SİYAH (0): Kutu SABİT bir fonksiyondur (Kutu 1 veya 2).'
      : 'Sonuç BEYAZ (1): Kutu DENGELİ bir fonksiyondur (Kutu 3 veya 4).';
  }

  setStatus('Deutsch: tamamlandı');
  setBusy(false);
}

function setStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg;
}

function setDrawerOpen(open) {
  document.body.classList.toggle('drawer-open', open);
  if (drawer) drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
}

if (menuBtn) {
  menuBtn.addEventListener('click', () => {
    const open = !document.body.classList.contains('drawer-open');
    setDrawerOpen(open);
  });
}

if (drawerClose) drawerClose.addEventListener('click', () => setDrawerOpen(false));
if (drawerOverlay) drawerOverlay.addEventListener('click', () => setDrawerOpen(false));

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setDrawerOpen(false);
});

function getQubitByName(n) {
  return n === 'B' ? qubitB : qubitA;
}

const sandbox = {
  enabled: false,
  qubits: new Map([
    ['A', qubitA],
    ['B', qubitB]
  ]),
  steps: [],
  visuals: {
    colorA: '#1a237e',
    colorB: '#4a148c',
    fresnel: '#29b6f6',
    background: '#000000',
    lineOpacity: 0.28
  }
};

function listQubitIds() {
  return Array.from(sandbox.qubits.keys());
}

function applyVisuals() {
  const cA = new THREE.Color(sandbox.visuals.colorA);
  const cB = new THREE.Color(sandbox.visuals.colorB);
  const cF = new THREE.Color(sandbox.visuals.fresnel);
  for (const q of sandbox.qubits.values()) {
    q.uniforms.uColorA.value.copy(cA);
    q.uniforms.uColorB.value.copy(cB);
    q.uniforms.uFresnelColor.value.copy(cF);
  }
  scene.background = new THREE.Color(sandbox.visuals.background);
  lineBaseOpacity = sandbox.visuals.lineOpacity;
  if (entanglementLine) entanglementLine.material.opacity = lineBaseOpacity;
}

function updateQubitSelectors() {
  const ids = listQubitIds();
  const ensureOptions = (sel, formatLabel) => {
    if (!sel) return;
    const v = sel.value;
    sel.innerHTML = '';
    for (const id of ids) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = formatLabel ? formatLabel(id) : id;
      sel.appendChild(opt);
    }
    if (ids.includes(v)) sel.value = v;
  };

  ensureOptions(activeQubitSel);
  ensureOptions(cxControlSel, (id) => `Kontrol: ${id}`);
  ensureOptions(cxTargetSel, (id) => `Hedef: ${id}`);
}

function createSandboxQubit() {
  const ids = listQubitIds();
  const nextCharCode = Math.max(...ids.map((s) => s.charCodeAt(0))) + 1;
  const id = String.fromCharCode(nextCharCode);
  const idx = ids.length;
  const posX = (idx - 0.5) * 1.35 - 1.35;
  const q = new QubitObject({ position: new THREE.Vector3(posX, -1.35, 0), name: id });
  q.enterClassical0();
  sandbox.qubits.set(id, q);
  scene.add(q.mesh);
  applyVisuals();
  updateQubitSelectors();
  renderSteps();
}

function clearExtraQubits() {
  for (const [id, q] of Array.from(sandbox.qubits.entries())) {
    if (id === 'A' || id === 'B') continue;
    scene.remove(q.mesh);
    q.geometry.dispose();
    sandbox.qubits.delete(id);
  }
  updateQubitSelectors();
}

function setSandboxEnabled(enabled) {
  sandbox.enabled = enabled;
  if (sandboxBody) sandboxBody.style.display = enabled ? 'block' : 'none';
  if (activeQubitSel) activeQubitSel.disabled = enabled;
  if (btnH) btnH.disabled = enabled;
  if (btnX) btnX.disabled = enabled;
  if (zSlider) zSlider.disabled = enabled;
  if (btnCX) btnCX.disabled = enabled;
  if (cxControlSel) cxControlSel.disabled = enabled;
  if (cxTargetSel) cxTargetSel.disabled = enabled;
  if (btnBell) btnBell.disabled = enabled;
  if (box1) box1.disabled = enabled;
  if (box2) box2.disabled = enabled;
  if (box3) box3.disabled = enabled;
  if (box4) box4.disabled = enabled;
  if (btnDeutsch) btnDeutsch.disabled = enabled;
  setStatus(enabled ? 'Sandbox: açık' : 'Hazır');
}

function addStepFromTool(tool) {
  if (tool === 'Q') sandbox.steps.push({ type: 'Q' });
  if (tool === 'H') sandbox.steps.push({ type: 'H', target: listQubitIds()[0] ?? 'A' });
  if (tool === 'X') sandbox.steps.push({ type: 'X', target: listQubitIds()[0] ?? 'A' });
  if (tool === 'Z') sandbox.steps.push({ type: 'Z', target: listQubitIds()[0] ?? 'A', angle: 0 });
  if (tool === 'CX') {
    const ids = listQubitIds();
    sandbox.steps.push({ type: 'CX', control: ids[0] ?? 'A', target: ids[1] ?? ids[0] ?? 'B' });
  }
  renderSteps();
}

function getShareState() {
  const qubits = Array.from(sandbox.qubits.entries()).map(([id, q]) => ({
    id,
    position: { x: q.mesh.position.x, y: q.mesh.position.y, z: q.mesh.position.z },
    mode: q.mode,
    zAngle: q.uniforms.uZAngle.value
  }));

  return {
    version: 1,
    visuals: sandbox.visuals,
    qubits,
    steps: sandbox.steps
  };
}

function loadShareState(raw) {
  const obj = JSON.parse(raw);
  if (!obj || typeof obj !== 'object') return;

  if (obj.visuals) {
    sandbox.visuals = {
      ...sandbox.visuals,
      ...obj.visuals,
      lineOpacity: Number(obj.visuals.lineOpacity ?? sandbox.visuals.lineOpacity)
    };
  }

  sandbox.steps = Array.isArray(obj.steps) ? obj.steps : [];

  clearExtraQubits();
  qubitA.enterClassical0();
  qubitB.enterClassical0();

  if (Array.isArray(obj.qubits)) {
    const need = obj.qubits.map((q) => q.id).filter((id) => id && id !== 'A' && id !== 'B');
    for (const id of need) {
      createSandboxQubit();
      const createdId = listQubitIds().at(-1);
      if (createdId !== id) {
        const q = sandbox.qubits.get(createdId);
        sandbox.qubits.delete(createdId);
        if (q) {
          q.name = id;
          sandbox.qubits.set(id, q);
        }
      }
    }

    for (const qd of obj.qubits) {
      const q = sandbox.qubits.get(qd.id);
      if (!q) continue;
      if (qd.position) q.mesh.position.set(Number(qd.position.x) || 0, Number(qd.position.y) || 0, Number(qd.position.z) || 0);
      if (qd.mode === 'classical1') q.enterClassical1();
      else if (qd.mode === 'superposition') q.enterSuperposition();
      else q.enterClassical0();
      if (typeof qd.zAngle === 'number') q.uniforms.uZAngle.value = qd.zAngle;
    }
  }

  applyVisuals();
  updateQubitSelectors();
  renderSteps();
}

function renderSteps() {
  if (!stepsEl) return;
  const ids = listQubitIds();
  stepsEl.innerHTML = '';

  sandbox.steps.forEach((step, idx) => {
    const row = document.createElement('div');
    row.className = 'step';

    const label = document.createElement('div');
    label.style.minWidth = '34px';
    label.style.opacity = '0.8';
    label.textContent = `${idx + 1}.`;
    row.appendChild(label);

    const type = document.createElement('div');
    type.style.fontWeight = '800';
    type.style.minWidth = '34px';
    type.textContent = step.type;
    row.appendChild(type);

    const mkSel = (value, onChange) => {
      const s = document.createElement('select');
      for (const id of ids) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = id;
        s.appendChild(o);
      }
      s.value = ids.includes(value) ? value : ids[0];
      s.addEventListener('change', () => onChange(s.value));
      return s;
    };

    if (step.type === 'H' || step.type === 'X') {
      row.appendChild(mkSel(step.target ?? ids[0], (v) => { step.target = v; }));
    }

    if (step.type === 'Z') {
      row.appendChild(mkSel(step.target ?? ids[0], (v) => { step.target = v; }));
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = '0';
      inp.max = '360';
      inp.value = String(step.angle ?? 0);
      inp.style.width = '72px';
      inp.addEventListener('input', () => { step.angle = Number(inp.value) || 0; });
      row.appendChild(inp);
    }

    if (step.type === 'CX') {
      const c = mkSel(step.control ?? ids[0], (v) => { step.control = v; });
      const t = mkSel(step.target ?? (ids[1] ?? ids[0]), (v) => { step.target = v; });
      row.appendChild(c);
      row.appendChild(t);
    }

    if (step.type === 'Q') {
      const hint = document.createElement('div');
      hint.style.opacity = '0.75';
      hint.textContent = 'ekle';
      row.appendChild(hint);
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Sil';
    del.addEventListener('click', () => {
      sandbox.steps.splice(idx, 1);
      renderSteps();
    });
    row.appendChild(del);

    stepsEl.appendChild(row);
  });
}

async function runCircuit() {
  if (busy) return;
  setBusy(true);
  setStatus('Devre: çalışıyor...');
  for (const step of sandbox.steps) {
    if (step.type === 'Q') {
      createSandboxQubit();
      continue;
    }

    if (step.type === 'H') {
      const q = sandbox.qubits.get(step.target);
      if (q) {
        spawnShockwave(q.mesh.position);
        register.applyH(q.index);
        syncAllQubitsFromRegister();
        logEvent(`H(${q.name})`);
      }
    }
    if (step.type === 'X') {
      const q = sandbox.qubits.get(step.target);
      if (q) {
        register.applyX(q.index);
        syncAllQubitsFromRegister();
        logEvent(`X(${q.name})`);
      }
    }
    if (step.type === 'Z') {
      const q = sandbox.qubits.get(step.target);
      if (q) {
        register.applyZRotation(q.index, (Number(step.angle) || 0) * Math.PI / 180);
        syncAllQubitsFromRegister();
        logEvent(`Z(${q.name}, ${Number(step.angle) || 0}°)`);
      }
    }
    if (step.type === 'CX') {
      const c = sandbox.qubits.get(step.control);
      const t = sandbox.qubits.get(step.target);
      if (c && t) applyCNOT(c, t);
    }

    await new Promise((r) => setTimeout(r, 110));
  }
  setStatus('Devre: tamamlandı');
  setBusy(false);
}

function getActiveQubit() {
  return getQubitByName(activeQubitSel?.value ?? 'A');
}

function applyCNOT(controlQubit, targetQubit) {
  if (controlQubit === targetQubit) {
    setStatus('CNOT: kontrol ve hedef aynı olamaz');
    return;
  }

  setStatus('CNOT uygulandı');
  spawnZap(controlQubit.mesh.position, targetQubit.mesh.position);

  register.applyCNOT(controlQubit.index, targetQubit.index);
  syncAllQubitsFromRegister();
  logEvent(`CNOT(${controlQubit.name}→${targetQubit.name})`);
}

async function createBellState() {
  setStatus('Dolaşıklık yaratılıyor...');

  removeEntanglementLine();
  register.resetBasis(0);
  syncAllQubitsFromRegister();
  logEvent('Reset |00⟩');

  spawnShockwave(qubitA.mesh.position);
  register.applyH(qubitA.index);
  syncAllQubitsFromRegister();
  logEvent('H(A)');

  await new Promise((r) => setTimeout(r, 260));

  spawnZap(qubitA.mesh.position, qubitB.mesh.position);
  register.applyCNOT(qubitA.index, qubitB.index);
  syncAllQubitsFromRegister();
  logEvent('CNOT(A→B)');

  if (isEntangledPair(qubitA, qubitB)) ensureEntanglementLine();
  setStatus('Bell durumu hazır');
}

function applyZFromUI() {
  const angle = Number(zSlider.value);
  zValue.textContent = `${angle}°`;
  getActiveQubit().applyZRotation(angle);
}

applyZFromUI();

btnH.addEventListener('click', () => {
  const q = getActiveQubit();
  spawnShockwave(q.mesh.position);
  q.applyHadamard();
});

btnX.addEventListener('click', () => {
  getActiveQubit().applyPauliX();
});

zSlider.addEventListener('input', applyZFromUI);

btnCX.addEventListener('click', () => {
  const c = getQubitByName(cxControlSel.value);
  const t = getQubitByName(cxTargetSel.value);
  applyCNOT(c, t);
});

btnBell.addEventListener('click', () => {
  createBellState();
});

if (sandboxToggle) {
  sandboxToggle.addEventListener('change', () => {
    setSandboxEnabled(!!sandboxToggle.checked);
  });
}

for (const el of document.querySelectorAll('[data-tool]')) {
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer?.setData('text/plain', el.getAttribute('data-tool'));
  });
}

if (circuitArea) {
  circuitArea.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  circuitArea.addEventListener('drop', (e) => {
    e.preventDefault();
    const tool = e.dataTransfer?.getData('text/plain');
    if (!tool) return;
    addStepFromTool(tool);
  });
}

if (btnRunCircuit) btnRunCircuit.addEventListener('click', () => runCircuit());
if (btnClearCircuit) {
  btnClearCircuit.addEventListener('click', () => {
    sandbox.steps = [];
    renderSteps();
  });
}

const bindColor = (input, key) => {
  if (!input) return;
  input.addEventListener('input', () => {
    sandbox.visuals[key] = input.value;
    applyVisuals();
  });
};

bindColor(colorAInput, 'colorA');
bindColor(colorBInput, 'colorB');
bindColor(colorFInput, 'fresnel');
bindColor(colorBgInput, 'background');

if (lineOpacityInput) {
  const sync = () => {
    const v = Number(lineOpacityInput.value);
    sandbox.visuals.lineOpacity = Number.isFinite(v) ? v : 0.28;
    if (lineOpacityValue) lineOpacityValue.textContent = sandbox.visuals.lineOpacity.toFixed(2);
    applyVisuals();
  };
  lineOpacityInput.addEventListener('input', sync);
  sync();
}

if (btnShare) {
  btnShare.addEventListener('click', async () => {
    const txt = JSON.stringify(getShareState());
    if (shareText) shareText.value = txt;
    try {
      await navigator.clipboard.writeText(txt);
      setStatus('Paylaş: panoya kopyalandı');
    } catch {
      setStatus('Paylaş: kopyalama başarısız');
    }
  });
}

if (btnLoad) {
  btnLoad.addEventListener('click', () => {
    if (!shareText?.value) return;
    try {
      loadShareState(shareText.value);
      setStatus('Yükle: tamamlandı');
    } catch {
      setStatus('Yükle: hata');
    }
  });
}

applyVisuals();
updateQubitSelectors();
renderSteps();
setSandboxEnabled(false);

if (seedInput) {
  seedInput.addEventListener('change', () => {
    setSeed(seedInput.value);
    logEvent(`Seed = ${seedInput.value}`);
  });
  setSeed(seedInput.value);
}

function appReset() {
  removeEntanglementLine();
  register.resetBasis(0);
  syncAllQubitsFromRegister();
  setStatus('Reset');
  logEvent('Reset |00⟩');
}

function stateNorm2() {
  let s = 0;
  for (const a of register.state) s += (a.re * a.re + a.im * a.im);
  return s;
}

function runSelfTests() {
  const results = [];
  const push = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
  };

  const saved = {
    numQubits: register.numQubits,
    state: register.state.map((a) => ({ re: a.re, im: a.im })),
    seed: seedInput?.value
  };

  try {
    // Normalization test
    register.resetBasis(0);
    const n0 = stateNorm2();
    push('Normalization after reset', Math.abs(n0 - 1) < 1e-9, `norm2=${n0}`);

    // Deutsch deterministic correctness for all oracles
    // Expected: oracle 1/2 -> 0 (constant), oracle 3/4 -> 1 (balanced)
    const deutschExpected = new Map([[1, 0], [2, 0], [3, 1], [4, 1]]);
    for (const oracle of [1, 2, 3, 4]) {
      // Prepare |0,1>
      register.resetBasis(1 << qubitB.index);
      register.applyH(qubitA.index);
      register.applyH(qubitB.index);
      applyOracle(oracle, qubitA, qubitB);
      register.applyH(qubitA.index);
      const r = register.measure(qubitA.index);
      const exp = deutschExpected.get(oracle);
      push(`Deutsch oracle ${oracle}`, r === exp, `got=${r} expected=${exp}`);
    }

    // Bell: entanglement present + perfect correlation in Z-basis
    register.resetBasis(0);
    register.applyH(qubitA.index);
    register.applyCNOT(qubitA.index, qubitB.index);
    const ent = isEntangledPair(qubitA, qubitB);
    push('Bell entanglement detected', ent, ent ? '' : 'purity ~ 1 (unexpected)');

    // Correlation test (repeat a few times with deterministic seeds)
    let corrOk = true;
    for (let k = 0; k < 6; k++) {
      setSeed(`bell-${k}`);
      register.resetBasis(0);
      register.applyH(qubitA.index);
      register.applyCNOT(qubitA.index, qubitB.index);
      const a = register.measure(qubitA.index);
      const b = register.measure(qubitB.index);
      if (a !== b) {
        corrOk = false;
        break;
      }
    }
    push('Bell Z-correlation (A==B)', corrOk, corrOk ? '' : 'Found mismatch');

    // Restore user seed after test
    if (saved.seed != null) setSeed(saved.seed);

    // Restore previous state approximately
    expandRegisterTo(saved.numQubits);
    for (let i = 0; i < register.state.length; i++) {
      const v = saved.state[i] ?? { re: 0, im: 0 };
      register.state[i].re = v.re;
      register.state[i].im = v.im;
    }
    register.renormalize();
    syncAllQubitsFromRegister();
  } catch (err) {
    push('Self-test runtime', false, String(err?.message ?? err));
  }

  const okAll = results.every((r) => r.ok);
  console.groupCollapsed(`[SelfTest] ${okAll ? 'PASS' : 'FAIL'}`);
  for (const r of results) console[r.ok ? 'log' : 'error'](`${r.ok ? 'PASS' : 'FAIL'} - ${r.name} ${r.detail}`);
  console.groupEnd();

  logEvent(`SelfTest: ${okAll ? 'PASS' : 'FAIL'}`);
  for (const r of results) logEvent(`${r.ok ? 'PASS' : 'FAIL'}: ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
}

if (btnReset) btnReset.addEventListener('click', () => appReset());

appReset();
runSelfTests();

if (box1) box1.addEventListener('click', () => setOracle(1));
if (box2) box2.addEventListener('click', () => setOracle(2));
if (box3) box3.addEventListener('click', () => setOracle(3));
if (box4) box4.addEventListener('click', () => setOracle(4));
if (btnDeutsch) btnDeutsch.addEventListener('click', () => runDeutsch());

setOracle(1);

function animate() {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  for (const q of sandbox.qubits.values()) {
    q.update(dt, t);
  }

  for (let i = 0; i < noiseParticles.length; i++) {
    const p = noiseParticles[i];
    p.mesh.position.x += p.vel.x * dt;
    p.mesh.position.y += p.vel.y * dt;
    p.mesh.position.z += p.vel.z * dt;

    if (p.mesh.position.x < -noiseBounds.x || p.mesh.position.x > noiseBounds.x) p.vel.x *= -1;
    if (p.mesh.position.y < -noiseBounds.y || p.mesh.position.y > noiseBounds.y) p.vel.y *= -1;
    if (p.mesh.position.z < -noiseBounds.z || p.mesh.position.z > noiseBounds.z) p.vel.z *= -1;
  }

  const threshold = 0.82;
  const checkDecoherence = (q) => {
    if (shieldedQubit === q) return;

    for (let i = 0; i < noiseParticles.length; i++) {
      const p = noiseParticles[i].mesh.position;
      if (p.distanceTo(q.mesh.position) < threshold) {
        register.applyDephasing(q.index, 0.35);
        register.applyAmplitudeDamping(q.index, 0.08);
        playBuzz();
        syncAllQubitsFromRegister();
        logEvent(`Decoherence(${q.name})`);
        return;
      }
    }
  };

  for (const q of sandbox.qubits.values()) {
    checkDecoherence(q);
  }

  if (isEntangledPair(qubitA, qubitB)) ensureEntanglementLine();
  else removeEntanglementLine();

  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    const age = t - s.born;
    const life = 0.45;
    const k = age / life;
    if (k >= 1) {
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      shockwaves.splice(i, 1);
      continue;
    }
    const scale = 1 + k * 14.0;
    s.mesh.scale.setScalar(scale);
    s.mesh.material.opacity = 0.55 * (1 - k);
    s.mesh.lookAt(camera.position);
  }

  for (let i = zaps.length - 1; i >= 0; i--) {
    const z = zaps[i];
    const age = t - z.born;
    const life = 0.10;
    const k = age / life;
    if (k >= 1) {
      scene.remove(z.line);
      z.line.geometry.dispose();
      z.line.material.dispose();
      zaps.splice(i, 1);
      continue;
    }
    z.line.material.opacity = 0.95 * (1 - k);
  }

  if (entanglementLine) {
    const a = qubitA.mesh.position;
    const b = qubitB.mesh.position;
    const dir = new THREE.Vector3().subVectors(b, a);
    const up = new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3().crossVectors(dir, up);
    if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
    perp.normalize();

    const jitter = perp.multiplyScalar(0.02 * Math.sin(t * 8.0));
    const p0 = new THREE.Vector3().copy(a).add(jitter);
    const p1 = new THREE.Vector3().copy(b).sub(jitter);

    const posAttr = entanglementLine.geometry.getAttribute('position');
    posAttr.setXYZ(0, p0.x, p0.y, p0.z);
    posAttr.setXYZ(1, p1.x, p1.y, p1.z);
    posAttr.needsUpdate = true;

    entanglementLine.material.opacity = (lineBaseOpacity * 0.7) + (lineBaseOpacity * 0.3) * (Math.sin(t * 6.0) * 0.5 + 0.5);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
