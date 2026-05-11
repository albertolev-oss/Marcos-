import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = id => document.getElementById(id);
const ui = {
  loader: $('loader'),
  status: $('status'),
  panel: $('panel'),
  toast: $('toast'),
  labels: $('labelLayer'),
  controls: $('controls'),
  closePanel: $('closePanel'),
  inclination: $('inclination'),
  anteversion: $('anteversion'),
  offset: $('offset'),
  modular: $('neck'),
  boneOpacity: $('boneOpacity')
};

const state = {
  bones: true,
  implant: true,
  xray: false,
  labels: true,
  axes: true,
  cut: false,
  explode: false,
  motion: false
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b16);
scene.fog = new THREE.Fog(0x050b16, 4.4, 8.4);

const renderer = new THREE.WebGLRenderer({ canvas: $('viewer'), antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.01, 100);
camera.position.set(2.35, 1.25, 3.25);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0.36, 0.16, 0.08);
orbit.enableDamping = true;
orbit.minDistance = 1.3;
orbit.maxDistance = 7.5;

scene.add(new THREE.HemisphereLight(0xffffff, 0x0f172a, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 2.45);
key.position.set(2.8, 4.2, 3.2);
scene.add(key);
const rim = new THREE.DirectionalLight(0x7dd3fc, 1.0);
rim.position.set(-3, 1.4, -2.4);
scene.add(rim);

const stage = new THREE.Group();
scene.add(stage);

const grid = new THREE.GridHelper(4.4, 36, 0x36506d, 0x17243a);
grid.position.y = -1.72;
stage.add(grid);

const hip = new THREE.Vector3(0.55, 0.30, 0.22);
const groups = {
  pelvis: new THREE.Group(),
  femurRig: new THREE.Group(),
  femur: new THREE.Group(),
  cup: new THREE.Group(),
  femoral: new THREE.Group(),
  axes: new THREE.Group(),
  plane: new THREE.Group()
};
groups.femurRig.position.copy(hip);
groups.femurRig.add(groups.femur, groups.femoral);
stage.add(groups.pelvis, groups.cup, groups.femurRig, groups.axes, groups.plane);

const mat = {
  bone: new THREE.MeshStandardMaterial({ color: 0xf1e4c9, roughness: 0.62, transparent: true, opacity: 1 }),
  bone2: new THREE.MeshStandardMaterial({ color: 0xd6c19e, roughness: 0.68, transparent: true, opacity: 1 }),
  cart: new THREE.MeshStandardMaterial({ color: 0x9bdaf2, roughness: 0.36, transparent: true, opacity: 0.60 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xaeb8c5, roughness: 0.20, metalness: 0.82 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x56616f, roughness: 0.25, metalness: 0.75 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 }),
  liner: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, transparent: true, opacity: 0.94 }),
  plane: new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
  yellow: new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
  green: new THREE.LineBasicMaterial({ color: 0x22ff88 }),
  blue: new THREE.LineBasicMaterial({ color: 0x60a5fa }),
  orange: new THREE.LineBasicMaterial({ color: 0xfb923c })
};
const boneMats = [mat.bone, mat.bone2, mat.cart];
const labels = [];
let offsetBase = 0;
let head;

function rel(parent, point) {
  return point.clone().sub(parent.getWorldPosition(new THREE.Vector3()));
}

function ball(parent, name, point, scale, material, detail = 48) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, detail, detail / 2), material);
  mesh.name = name;
  mesh.position.copy(rel(parent, point));
  mesh.scale.copy(scale);
  parent.add(mesh);
  return mesh;
}

function tube(parent, name, a, b, r1, r2, material, sides = 36) {
  const aa = rel(parent, a);
  const bb = rel(parent, b);
  const dir = bb.clone().sub(aa);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2 ?? r1, dir.length(), sides), material);
  mesh.name = name;
  mesh.position.copy(aa.clone().add(bb).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

function panel(parent, name, point, size, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.name = name;
  mesh.position.copy(rel(parent, point));
  parent.add(mesh);
  return mesh;
}

function ring(parent, name, point, radius, tubeSize, material) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tubeSize, 18, 96), material);
  mesh.name = name;
  mesh.position.copy(rel(parent, point));
  parent.add(mesh);
  return mesh;
}

function segment(parent, name, a, b, material) {
  const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints([rel(parent, a), rel(parent, b)]), material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function addLabel(text, target) {
  const card = document.createElement('div');
  card.className = 'labelCard';
  card.textContent = text;
  ui.labels.appendChild(card);
  labels.push({ target, card });
}

function build() {
  const p = groups.pelvis;
  ball(p, 'Ilion derecho', new THREE.Vector3(0.62, 0.92, -0.02), new THREE.Vector3(0.58, 0.46, 0.22), mat.bone);
  ball(p, 'Ilion izquierdo', new THREE.Vector3(-0.58, 0.92, -0.04), new THREE.Vector3(0.52, 0.42, 0.20), mat.bone);
  ball(p, 'Sacro', new THREE.Vector3(0, 0.85, -0.23), new THREE.Vector3(0.28, 0.50, 0.16), mat.bone2);
  ball(p, 'Isquion derecho', new THREE.Vector3(0.56, 0.02, -0.02), new THREE.Vector3(0.22, 0.34, 0.15), mat.bone);
  ball(p, 'Pubis derecho', new THREE.Vector3(0.22, 0.10, 0.03), new THREE.Vector3(0.22, 0.16, 0.12), mat.bone);
  tube(p, 'Rama superior', new THREE.Vector3(0.10, 0.28, 0.02), new THREE.Vector3(0.46, 0.34, 0.05), 0.055, 0.065, mat.bone);
  tube(p, 'Rama inferior', new THREE.Vector3(0.24, -0.02, 0), new THREE.Vector3(0.55, -0.17, 0), 0.055, 0.075, mat.bone);
  ball(p, 'Acetábulo', new THREE.Vector3(0.55, 0.36, 0.12), new THREE.Vector3(0.35, 0.29, 0.18), mat.bone2);
  ball(p, 'Cartílago', new THREE.Vector3(0.55, 0.34, 0.25), new THREE.Vector3(0.25, 0.21, 0.045), mat.cart);
  const acetRim = ring(p, 'Reborde acetabular', new THREE.Vector3(0.55, 0.35, 0.24), 0.31, 0.025, mat.bone);
  acetRim.scale.y = 0.76;
  acetRim.rotation.x = 0.05;

  const f = groups.femur;
  tube(f, 'Diáfisis', new THREE.Vector3(0.50, -1.62, 0.02), new THREE.Vector3(0.68, -0.45, 0.07), 0.125, 0.165, mat.bone2);
  ball(f, 'Metáfisis', new THREE.Vector3(0.66, -0.38, 0.06), new THREE.Vector3(0.19, 0.24, 0.16), mat.bone);
  tube(f, 'Segmento proximal', new THREE.Vector3(0.66, -0.30, 0.08), new THREE.Vector3(0.56, 0.12, 0.18), 0.080, 0.112, mat.bone);
  const native = ball(f, 'Cabeza nativa', hip, new THREE.Vector3(0.22, 0.22, 0.22), mat.cart);
  native.material.opacity = 0.28;
  ball(f, 'Trocánter mayor', new THREE.Vector3(0.83, -0.18, 0.01), new THREE.Vector3(0.19, 0.30, 0.14), mat.bone);
  ball(f, 'Trocánter menor', new THREE.Vector3(0.49, -0.43, 0.11), new THREE.Vector3(0.11, 0.12, 0.09), mat.bone);

  const cup = groups.cup;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.35, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.52), mat.metal);
  shell.position.copy(rel(cup, hip.clone().add(new THREE.Vector3(0, 0.02, 0.01))));
  shell.rotation.x = Math.PI / 2;
  shell.scale.set(1, 0.82, 1);
  cup.add(shell);
  const cupRim = ring(cup, 'Borde del cotilo', hip.clone().add(new THREE.Vector3(0, 0.01, 0.02)), 0.34, 0.025, mat.dark);
  cupRim.scale.y = 0.82;
  cupRim.rotation.x = 0.04;
  ball(cup, 'Liner', hip.clone().add(new THREE.Vector3(0, 0.01, 0.055)), new THREE.Vector3(0.245, 0.205, 0.052), mat.liner);
  ball(cup, 'Orificio 1', hip.clone().add(new THREE.Vector3(-0.11, 0.17, 0.09)), new THREE.Vector3(0.035, 0.035, 0.010), new THREE.MeshBasicMaterial({ color: 0x172033 }));
  ball(cup, 'Orificio 2', hip.clone().add(new THREE.Vector3(0.11, 0.08, 0.10)), new THREE.Vector3(0.030, 0.030, 0.010), new THREE.MeshBasicMaterial({ color: 0x172033 }));

  const fi = groups.femoral;
  head = ball(fi, 'Cabeza protésica', hip.clone().add(new THREE.Vector3(0, 0, 0.035)), new THREE.Vector3(0.175, 0.175, 0.175), mat.ceramic);
  tube(fi, 'Cono modular', new THREE.Vector3(0.57, 0.12, 0.19), new THREE.Vector3(0.68, -0.23, 0.10), 0.052, 0.066, mat.metal);
  ball(fi, 'Collar', new THREE.Vector3(0.68, -0.27, 0.09), new THREE.Vector3(0.15, 0.055, 0.11), mat.metal);
  tube(fi, 'Vástago', new THREE.Vector3(0.68, -0.27, 0.09), new THREE.Vector3(0.46, -1.45, 0.015), 0.055, 0.105, mat.metal, 6);

  segment(groups.axes, 'Eje mecánico', new THREE.Vector3(0.50, 1.18, 0.30), new THREE.Vector3(0.45, -1.62, 0.02), mat.green);
  segment(groups.axes, 'Línea interacetabular', new THREE.Vector3(-0.55, 0.36, 0.26), new THREE.Vector3(0.78, 0.36, 0.26), mat.blue);
  segment(groups.axes, 'Vector offset', hip.clone().add(new THREE.Vector3(0, 0, 0.36)), new THREE.Vector3(0.82, 0.08, 0.43), mat.orange);
  const plane = panel(groups.plane, 'Plano femoral', new THREE.Vector3(0.62, -0.08, 0.18), new THREE.Vector3(0.46, 0.012, 0.34), mat.plane);
  plane.rotation.z = THREE.MathUtils.degToRad(-19);
  plane.rotation.y = THREE.MathUtils.degToRad(11);

  addLabel('Cotilo + liner', shell);
  addLabel('Centro de rotación', head);
  addLabel('Vástago femoral', fi.children[3]);
  addLabel('Trocánter mayor', f.children[4]);
  addLabel('Offset femoral', fi.children[1]);
  addLabel('Plano femoral', plane);
}

function toast(text) {
  ui.toast.textContent = text;
  ui.toast.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ui.toast.style.display = 'none', 1700);
}

function setStatus(text, kind) {
  ui.status.textContent = text;
  ui.status.className = 'status ' + (kind || 'ok');
}

function setOpacity(material, value) {
  material.opacity = value;
  material.transparent = value < 1;
  material.needsUpdate = true;
}

function updateMeasurements() {
  const inc = Number(ui.inclination.value);
  const ant = Number(ui.anteversion.value);
  const off = Number(ui.offset.value);
  const mod = Number(ui.modular.value);
  const bone = Number(ui.boneOpacity.value) / 100;
  offsetBase = off / 110;

  $('inclinationValue').textContent = inc + '°';
  $('anteversionValue').textContent = ant + '°';
  $('offsetValue').textContent = off + ' mm';
  $('neckValue').textContent = mod + ' mm';
  $('boneOpacityValue').textContent = Math.round(bone * 100) + '%';
  $('offsetMetric').textContent = off + ' mm';
  $('legMetric').textContent = (mod > 0 ? '+' : '') + mod + ' mm';
  $('versionMetric').textContent = ant + '°';
  $('safeMetric').textContent = inc >= 35 && inc <= 50 && ant >= 10 && ant <= 25 ? 'Zona segura' : 'Revisar';

  groups.cup.rotation.z = THREE.MathUtils.degToRad(inc - 40);
  groups.cup.rotation.y = THREE.MathUtils.degToRad(ant - 15);
  if (head) head.position.z = rel(groups.femoral, hip.clone().add(new THREE.Vector3(0, 0, 0.035 + mod / 150))).z;
  if (!state.xray) boneMats.forEach(m => setOpacity(m, bone));
}

function applyVisibility() {
  groups.pelvis.visible = state.bones;
  groups.femur.visible = state.bones;
  groups.cup.visible = state.implant;
  groups.femoral.visible = state.implant;
  groups.axes.visible = state.axes;
  groups.plane.visible = state.cut;
  document.body.classList.toggle('xr', state.xray);
  labels.forEach(item => item.card.style.display = state.labels ? 'block' : 'none');

  if (state.xray) {
    setOpacity(mat.bone, 0.24);
    setOpacity(mat.bone2, 0.20);
    setOpacity(mat.cart, 0.16);
  } else {
    updateMeasurements();
  }

  document.querySelectorAll('#controls button').forEach(btn => {
    const key = btn.dataset.toggle;
    if (key) btn.classList.toggle('active', !!state[key]);
  });
}

function setView(name) {
  const views = {
    ap: [[0.35, 0.28, 3.7], [0.36, 0.18, 0.04]],
    lateral: [[3.55, 0.28, 0.04], [0.35, 0.12, 0.04]],
    axial: [[0.35, 3.9, 0.10], [0.35, 0.10, 0.05]],
    oblique: [[2.35, 1.25, 3.25], [0.36, 0.16, 0.08]]
  };
  const view = views[name] || views.oblique;
  camera.position.set(...view[0]);
  orbit.target.set(...view[1]);
  orbit.update();
  toast('Vista ' + name.toUpperCase());
}

function resetScene() {
  Object.assign(state, { bones: true, implant: true, xray: false, labels: true, axes: true, cut: false, explode: false, motion: false });
  ui.inclination.value = 40;
  ui.anteversion.value = 15;
  ui.offset.value = 0;
  ui.modular.value = 0;
  ui.boneOpacity.value = 100;
  groups.femurRig.rotation.set(0, 0, 0);
  updateMeasurements();
  applyVisibility();
  setView('oblique');
  toast('Modelo reiniciado');
}

function handle(btn) {
  const key = btn.dataset.toggle;
  const action = btn.dataset.action;
  const view = btn.dataset.view;
  if (key) {
    state[key] = !state[key];
    applyVisibility();
    toast(key + ': ' + (state[key] ? 'ON' : 'OFF'));
  }
  if (view) setView(view);
  if (action === 'panel') ui.panel.classList.toggle('open');
  if (action === 'reset') resetScene();
  if (action === 'test') {
    setStatus('online', 'ok');
    toast('JavaScript funcionando');
  }
}

function updateLabels() {
  const v = new THREE.Vector3();
  for (const item of labels) {
    if (!state.labels || !item.target.visible) {
      item.card.style.display = 'none';
      continue;
    }
    item.target.getWorldPosition(v);
    v.project(camera);
    if (v.z < -1 || v.z > 1) {
      item.card.style.display = 'none';
      continue;
    }
    item.card.style.display = 'block';
    item.card.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    item.card.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
  }
}

ui.controls.addEventListener('click', ev => {
  const btn = ev.target.closest('button');
  if (btn) handle(btn);
});
ui.closePanel.addEventListener('click', () => ui.panel.classList.remove('open'));
[ui.inclination, ui.anteversion, ui.offset, ui.modular, ui.boneOpacity].forEach(s => s.addEventListener('input', updateMeasurements));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}, { passive: true });

addEventListener('error', ev => {
  setStatus('error', 'err');
  toast('Error: ' + ev.message);
});

build();
updateMeasurements();
applyVisibility();
setView('oblique');
setStatus('online', 'ok');
ui.loader.classList.add('hide');
toast('Cadera 3D Pro lista');

function animate() {
  requestAnimationFrame(animate);
  const t = performance.now() * 0.001;
  if (state.motion) {
    groups.femurRig.rotation.z = Math.sin(t * 1.25) * 0.18;
    groups.femurRig.rotation.x = Math.sin(t * 0.95) * 0.08;
  } else {
    groups.femurRig.rotation.z *= 0.92;
    groups.femurRig.rotation.x *= 0.92;
  }

  const cupTarget = state.explode ? new THREE.Vector3(-0.15, 0.04, 0.25) : new THREE.Vector3(0, 0, 0);
  const femTarget = state.explode ? new THREE.Vector3(offsetBase + 0.34, -0.05, 0.14) : new THREE.Vector3(offsetBase, 0, 0);
  groups.cup.position.lerp(cupTarget, 0.10);
  groups.femoral.position.lerp(femTarget, 0.10);

  orbit.update();
  updateLabels();
  renderer.render(scene, camera);
}
animate();
