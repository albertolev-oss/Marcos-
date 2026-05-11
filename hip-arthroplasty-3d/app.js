import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);

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
scene.fog = new THREE.Fog(0x050b16, 4.8, 9.2);

const renderer = new THREE.WebGLRenderer({
  canvas: $('viewer'),
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 100);
camera.position.set(2.55, 1.35, 3.55);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0.34, 0.18, 0.08);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.rotateSpeed = 0.72;
orbit.panSpeed = 0.56;
orbit.minDistance = 1.3;
orbit.maxDistance = 8;

scene.add(new THREE.HemisphereLight(0xffffff, 0x102033, 2.25));
const key = new THREE.DirectionalLight(0xffffff, 2.65);
key.position.set(2.8, 4.4, 3.0);
scene.add(key);
const rim = new THREE.DirectionalLight(0x7dd3fc, 1.25);
rim.position.set(-3.3, 1.4, -2.4);
scene.add(rim);
const warm = new THREE.DirectionalLight(0xffe0b2, 0.62);
warm.position.set(1.2, -0.2, 3.6);
scene.add(warm);

const stage = new THREE.Group();
scene.add(stage);

const grid = new THREE.GridHelper(4.7, 36, 0x36506d, 0x17243a);
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
  bone: new THREE.MeshStandardMaterial({ color: 0xf0dfbf, roughness: 0.74, transparent: true, opacity: 1 }),
  bone2: new THREE.MeshStandardMaterial({ color: 0xd7bd91, roughness: 0.78, transparent: true, opacity: 1 }),
  cancellous: new THREE.MeshStandardMaterial({ color: 0xc99d6a, roughness: 0.85, transparent: true, opacity: 0.82 }),
  cart: new THREE.MeshStandardMaterial({ color: 0x8fd8ef, roughness: 0.38, transparent: true, opacity: 0.62 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x030712, transparent: true, opacity: 0.68, side: THREE.DoubleSide }),
  metal: new THREE.MeshStandardMaterial({ color: 0xaeb8c5, roughness: 0.18, metalness: 0.86 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.24, metalness: 0.78 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.20, metalness: 0.04 }),
  liner: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, transparent: true, opacity: 0.95 }),
  cut: new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.44, side: THREE.DoubleSide }),
  yellow: new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
  greenLine: new THREE.LineBasicMaterial({ color: 0x22ff88 }),
  blueLine: new THREE.LineBasicMaterial({ color: 0x60a5fa }),
  orangeLine: new THREE.LineBasicMaterial({ color: 0xfb923c })
};

const boneMats = [mat.bone, mat.bone2, mat.cancellous, mat.cart];
const labels = [];
let offsetBase = 0;
let headMesh;

function local(parent, worldPoint) {
  const parentWorld = new THREE.Vector3();
  parent.getWorldPosition(parentWorld);
  return worldPoint.clone().sub(parentWorld);
}

function ellipsoid(parent, name, worldPoint, scale, material, detail = 64) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, detail, Math.floor(detail / 2)), material);
  mesh.name = name;
  mesh.position.copy(local(parent, worldPoint));
  mesh.scale.copy(scale);
  parent.add(mesh);
  return mesh;
}

function cylinderBetween(parent, name, a, b, radiusTop, radiusBottom, material, sides = 48) {
  const aa = local(parent, a);
  const bb = local(parent, b);
  const dir = bb.clone().sub(aa);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom ?? radiusTop, dir.length(), sides), material);
  mesh.name = name;
  mesh.position.copy(aa.clone().add(bb).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

function curveTube(parent, name, worldPoints, radius, material, tubularSegments = 90, radialSegments = 18) {
  const localPoints = worldPoints.map((p) => local(parent, p));
  const curve = new THREE.CatmullRomCurve3(localPoints);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function flatOval(parent, name, worldPoint, scale, material) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 96), material);
  mesh.name = name;
  mesh.position.copy(local(parent, worldPoint));
  mesh.scale.copy(scale);
  parent.add(mesh);
  return mesh;
}

function torus(parent, name, worldPoint, radius, tube, material) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 20, 128), material);
  mesh.name = name;
  mesh.position.copy(local(parent, worldPoint));
  parent.add(mesh);
  return mesh;
}

function box(parent, name, worldPoint, size, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.name = name;
  mesh.position.copy(local(parent, worldPoint));
  parent.add(mesh);
  return mesh;
}

function line(parent, name, a, b, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints([local(parent, a), local(parent, b)]);
  const mesh = new THREE.Line(geometry, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function iliacWing(parent, name, worldPoint, side = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.42 * side, -0.36);
  shape.bezierCurveTo(-0.16 * side, -0.64, 0.33 * side, -0.43, 0.42 * side, -0.05);
  shape.bezierCurveTo(0.55 * side, 0.48, 0.24 * side, 0.78, -0.20 * side, 0.67);
  shape.bezierCurveTo(-0.56 * side, 0.58, -0.72 * side, 0.18, -0.52 * side, -0.20);
  shape.bezierCurveTo(-0.50 * side, -0.27, -0.46 * side, -0.32, -0.42 * side, -0.36);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 8,
    curveSegments: 28
  });
  geometry.center();
  const mesh = new THREE.Mesh(geometry, mat.bone);
  mesh.name = name;
  mesh.position.copy(local(parent, worldPoint));
  mesh.rotation.y = side > 0 ? -0.18 : 0.18;
  mesh.rotation.z = side > 0 ? -0.08 : 0.08;
  parent.add(mesh);
  return mesh;
}

function cupShell(parent, name, center, material) {
  const geometry = new THREE.SphereGeometry(0.355, 96, 44, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(local(parent, center));
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.set(1.0, 0.86, 1.0);
  parent.add(mesh);
  return mesh;
}

function porousDots(parent, center, count) {
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.55 });
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = 0.08 + (i % 3) * 0.055;
    ellipsoid(parent, 'porosidad', center.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.72, 0.115)), new THREE.Vector3(0.012, 0.012, 0.004), dotMat, 16);
  }
}

function label(text, target) {
  const card = document.createElement('div');
  card.className = 'labelCard';
  card.textContent = text;
  ui.labels.appendChild(card);
  labels.push({ target, card });
}

function buildPelvis() {
  const p = groups.pelvis;
  iliacWing(p, 'Ala ilíaca derecha', new THREE.Vector3(0.56, 0.90, -0.04), 1);
  iliacWing(p, 'Ala ilíaca izquierda', new THREE.Vector3(-0.58, 0.88, -0.08), -1);
  ellipsoid(p, 'Sacro', new THREE.Vector3(-0.02, 0.80, -0.23), new THREE.Vector3(0.25, 0.48, 0.15), mat.bone2, 56);

  curveTube(p, 'Cresta ilíaca derecha', [
    new THREE.Vector3(0.15, 1.22, 0.00),
    new THREE.Vector3(0.45, 1.37, 0.03),
    new THREE.Vector3(0.92, 1.20, 0.02),
    new THREE.Vector3(1.01, 0.78, -0.02)
  ], 0.045, mat.bone2, 80, 16);
  curveTube(p, 'Cresta ilíaca izquierda', [
    new THREE.Vector3(-0.18, 1.18, -0.03),
    new THREE.Vector3(-0.48, 1.31, -0.04),
    new THREE.Vector3(-0.88, 1.12, -0.04),
    new THREE.Vector3(-0.92, 0.75, -0.06)
  ], 0.040, mat.bone2, 80, 16);

  const acetabulum = ellipsoid(p, 'Cavidad acetabular', new THREE.Vector3(0.55, 0.35, 0.12), new THREE.Vector3(0.36, 0.29, 0.19), mat.bone2, 72);
  const cavity = ellipsoid(p, 'Profundidad acetabular', new THREE.Vector3(0.55, 0.35, 0.245), new THREE.Vector3(0.255, 0.205, 0.035), mat.shadow, 64);
  const cartilage = ellipsoid(p, 'Cartílago acetabular', new THREE.Vector3(0.55, 0.34, 0.268), new THREE.Vector3(0.245, 0.195, 0.025), mat.cart, 64);
  const rim = torus(p, 'Reborde acetabular', new THREE.Vector3(0.55, 0.35, 0.27), 0.31, 0.025, mat.bone);
  rim.scale.y = 0.78;
  rim.rotation.z = -0.16;

  const hole = flatOval(p, 'Foramen obturador', new THREE.Vector3(0.36, -0.18, 0.045), new THREE.Vector3(0.25, 0.35, 1), mat.shadow);
  hole.rotation.z = -0.12;
  curveTube(p, 'Rama superior del pubis', [
    new THREE.Vector3(0.18, 0.24, 0.02),
    new THREE.Vector3(0.34, 0.31, 0.04),
    new THREE.Vector3(0.52, 0.30, 0.07)
  ], 0.060, mat.bone, 48, 16);
  curveTube(p, 'Rama inferior del pubis', [
    new THREE.Vector3(0.20, -0.02, 0.02),
    new THREE.Vector3(0.35, -0.29, 0.02),
    new THREE.Vector3(0.62, -0.25, 0.02)
  ], 0.070, mat.bone, 60, 16);
  curveTube(p, 'Isquion', [
    new THREE.Vector3(0.62, 0.23, 0.04),
    new THREE.Vector3(0.70, -0.04, 0.02),
    new THREE.Vector3(0.60, -0.32, 0.00)
  ], 0.082, mat.bone2, 60, 18);

  return { acetabulum, cartilage, cavity };
}

function buildFemur() {
  const f = groups.femur;
  curveTube(f, 'Diáfisis femoral anatómica', [
    new THREE.Vector3(0.49, -1.68, 0.02),
    new THREE.Vector3(0.47, -1.25, 0.02),
    new THREE.Vector3(0.55, -0.82, 0.04),
    new THREE.Vector3(0.68, -0.43, 0.07)
  ], 0.145, mat.bone2, 100, 28);
  curveTube(f, 'Canal medular visible', [
    new THREE.Vector3(0.49, -1.58, 0.045),
    new THREE.Vector3(0.53, -1.02, 0.06),
    new THREE.Vector3(0.64, -0.48, 0.08)
  ], 0.070, mat.cancellous, 80, 18);
  ellipsoid(f, 'Metáfisis proximal', new THREE.Vector3(0.68, -0.38, 0.06), new THREE.Vector3(0.23, 0.29, 0.17), mat.bone, 72);
  curveTube(f, 'Cuello femoral', [
    new THREE.Vector3(0.67, -0.28, 0.08),
    new THREE.Vector3(0.62, -0.06, 0.13),
    new THREE.Vector3(0.56, 0.12, 0.18)
  ], 0.105, mat.bone, 68, 24);
  const nativeHead = ellipsoid(f, 'Cabeza femoral nativa resecada', hip, new THREE.Vector3(0.225, 0.225, 0.225), mat.cart, 72);
  nativeHead.material.opacity = 0.25;
  const greater = ellipsoid(f, 'Trocánter mayor', new THREE.Vector3(0.84, -0.16, 0.02), new THREE.Vector3(0.20, 0.33, 0.15), mat.bone, 72);
  ellipsoid(f, 'Cresta intertrocantérica', new THREE.Vector3(0.77, -0.34, 0.04), new THREE.Vector3(0.10, 0.20, 0.08), mat.bone2, 48);
  const lesser = ellipsoid(f, 'Trocánter menor', new THREE.Vector3(0.48, -0.43, 0.10), new THREE.Vector3(0.105, 0.135, 0.09), mat.bone, 48);
  return { nativeHead, greater, lesser };
}

function buildImplants() {
  const c = groups.cup;
  const shell = cupShell(c, 'Cotilo hemisférico metálico', hip.clone().add(new THREE.Vector3(0, 0.018, 0.025)), mat.metal);
  shell.rotation.z = -0.10;
  const rim = torus(c, 'Borde pulido del cotilo', hip.clone().add(new THREE.Vector3(0, 0.01, 0.055)), 0.342, 0.026, mat.darkMetal);
  rim.scale.y = 0.83;
  rim.rotation.z = -0.10;
  const liner = ellipsoid(c, 'Liner de polietileno', hip.clone().add(new THREE.Vector3(0, 0.006, 0.095)), new THREE.Vector3(0.235, 0.194, 0.045), mat.liner, 72);
  porousDots(c, hip.clone().add(new THREE.Vector3(0, 0.015, 0.09)), 21);

  const f = groups.femoral;
  headMesh = ellipsoid(f, 'Cabeza cerámica', hip.clone().add(new THREE.Vector3(0, 0, 0.047)), new THREE.Vector3(0.178, 0.178, 0.178), mat.ceramic, 96);
  const cone = cylinderBetween(f, 'Cono modular', new THREE.Vector3(0.56, 0.12, 0.20), new THREE.Vector3(0.69, -0.23, 0.10), 0.044, 0.066, mat.metal, 48);
  const collar = ellipsoid(f, 'Collar femoral', new THREE.Vector3(0.69, -0.27, 0.09), new THREE.Vector3(0.16, 0.055, 0.115), mat.metal, 48);
  const stem = cylinderBetween(f, 'Vástago femoral anatómico', new THREE.Vector3(0.69, -0.29, 0.09), new THREE.Vector3(0.45, -1.48, 0.015), 0.050, 0.115, mat.metal, 7);
  stem.scale.x = 0.72;
  stem.scale.z = 1.18;
  for (let i = 0; i < 6; i++) {
    const y = -0.48 - i * 0.14;
    const band = cylinderBetween(f, 'Estrías del vástago', new THREE.Vector3(0.65 - i * 0.025, y, 0.102), new THREE.Vector3(0.57 - i * 0.025, y - 0.01, 0.107), 0.008, 0.008, mat.darkMetal, 12);
    band.scale.x = 0.35;
  }
  return { shell, liner, headMesh, stem, cone, collar };
}

function buildReferences() {
  line(groups.axes, 'Eje mecánico', new THREE.Vector3(0.50, 1.20, 0.30), new THREE.Vector3(0.45, -1.64, 0.02), mat.greenLine);
  line(groups.axes, 'Línea interacetabular', new THREE.Vector3(-0.55, 0.36, 0.28), new THREE.Vector3(0.80, 0.36, 0.28), mat.blueLine);
  line(groups.axes, 'Offset femoral', hip.clone().add(new THREE.Vector3(0.00, 0.00, 0.38)), new THREE.Vector3(0.84, 0.08, 0.44), mat.orangeLine);
  const plane = box(groups.plane, 'Plano de osteotomía femoral', new THREE.Vector3(0.62, -0.08, 0.18), new THREE.Vector3(0.48, 0.012, 0.34), mat.cut);
  plane.rotation.z = THREE.MathUtils.degToRad(-19);
  plane.rotation.y = THREE.MathUtils.degToRad(11);
  return { plane };
}

function addFloatingLabels(objects) {
  label('Cotilo hemisférico', objects.shell);
  label('Liner', objects.liner);
  label('Centro de rotación', objects.headMesh);
  label('Vástago anatómico', objects.stem);
  label('Cono modular', objects.cone);
  label('Trocánter mayor', objects.greater);
  label('Plano de corte', objects.plane);
}

function toast(text) {
  ui.toast.textContent = text;
  ui.toast.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ui.toast.style.display = 'none', 1700);
}

function setStatus(text, kind = 'ok') {
  ui.status.textContent = text;
  ui.status.className = 'status ' + kind;
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
  offsetBase = off / 115;

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
  if (headMesh) headMesh.position.z = local(groups.femoral, hip.clone().add(new THREE.Vector3(0, 0, 0.047 + mod / 145))).z;
  if (!state.xray) boneMats.forEach((m) => setOpacity(m, bone));
}

function applyVisibility() {
  groups.pelvis.visible = state.bones;
  groups.femur.visible = state.bones;
  groups.cup.visible = state.implant;
  groups.femoral.visible = state.implant;
  groups.axes.visible = state.axes;
  groups.plane.visible = state.cut;
  document.body.classList.toggle('xr', state.xray);
  labels.forEach((item) => item.card.style.display = state.labels ? 'block' : 'none');

  if (state.xray) {
    setOpacity(mat.bone, 0.28);
    setOpacity(mat.bone2, 0.22);
    setOpacity(mat.cancellous, 0.18);
    setOpacity(mat.cart, 0.14);
  } else {
    updateMeasurements();
  }

  document.querySelectorAll('#controls button').forEach((btn) => {
    const key = btn.dataset.toggle;
    if (key) btn.classList.toggle('active', Boolean(state[key]));
  });
}

function setView(name) {
  const views = {
    ap: [[0.35, 0.28, 3.9], [0.36, 0.18, 0.05]],
    lateral: [[3.75, 0.28, 0.04], [0.36, 0.12, 0.04]],
    axial: [[0.35, 4.1, 0.10], [0.35, 0.10, 0.05]],
    oblique: [[2.55, 1.35, 3.55], [0.34, 0.18, 0.08]]
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

function handleButton(btn) {
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

ui.controls.addEventListener('click', (event) => {
  const btn = event.target.closest('button');
  if (btn) handleButton(btn);
});
ui.closePanel.addEventListener('click', () => ui.panel.classList.remove('open'));
[ui.inclination, ui.anteversion, ui.offset, ui.modular, ui.boneOpacity].forEach((slider) => slider.addEventListener('input', updateMeasurements));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}, { passive: true });

addEventListener('error', (event) => {
  setStatus('error', 'err');
  toast('Error: ' + event.message);
});

const pelvisObjects = buildPelvis();
const femurObjects = buildFemur();
const implantObjects = buildImplants();
const referenceObjects = buildReferences();
addFloatingLabels({ ...pelvisObjects, ...femurObjects, ...implantObjects, ...referenceObjects });
updateMeasurements();
applyVisibility();
setView('oblique');
setStatus('online', 'ok');
ui.loader.classList.add('hide');
toast('Gráficos mejorados');

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

  const cupTarget = state.explode ? new THREE.Vector3(-0.18, 0.05, 0.30) : new THREE.Vector3(0, 0, 0);
  const femTarget = state.explode ? new THREE.Vector3(offsetBase + 0.40, -0.06, 0.18) : new THREE.Vector3(offsetBase, 0, 0);
  groups.cup.position.lerp(cupTarget, 0.10);
  groups.femoral.position.lerp(femTarget, 0.10);

  orbit.update();
  updateLabels();
  renderer.render(scene, camera);
}

animate();
