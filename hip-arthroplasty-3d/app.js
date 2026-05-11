import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('viewer');
const statusEl = document.getElementById('status');
const panel = document.getElementById('panel');
const toast = document.getElementById('toast');
const label = document.getElementById('label');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07111f);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
camera.position.set(2.2, 1.35, 3.3);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.2, 0);
controls.minDistance = 1.4;
controls.maxDistance = 7;

scene.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 4, 3);
scene.add(key);
const fill = new THREE.DirectionalLight(0x93c5fd, 0.9);
fill.position.set(-3, 1, -2);
scene.add(fill);

const grid = new THREE.GridHelper(4, 28, 0x36506d, 0x1b2c44);
grid.position.y = -1.65;
scene.add(grid);

const root = new THREE.Group();
scene.add(root);

const bones = new THREE.Group();
const implant = new THREE.Group();
const labels = new THREE.Group();
root.add(bones, implant, labels);

const boneMat = new THREE.MeshStandardMaterial({ color: 0xf0e4c8, roughness: 0.58, transparent: true, opacity: 1 });
const boneMat2 = new THREE.MeshStandardMaterial({ color: 0xdccfb3, roughness: 0.64, transparent: true, opacity: 1 });
const cartilageMat = new THREE.MeshStandardMaterial({ color: 0xa9def5, roughness: 0.35, transparent: true, opacity: 0.62 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.22, metalness: 0.75 });
const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28, metalness: 0.05 });
const linerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, transparent: true, opacity: 0.92 });
const hotMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

function sphere(parent, name, x, y, z, sx, sy, sz, mat) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 36), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function cyl(parent, name, p1, p2, r, mat, radial = 48) {
  const a = new THREE.Vector3(...p1);
  const b = new THREE.Vector3(...p2);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, radial), mat);
  mesh.name = name;
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

function box(parent, name, x, y, z, sx, sy, sz, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function marker(name, x, y, z) {
  const mesh = sphere(labels, name, x, y, z, 0.045, 0.045, 0.045, hotMat);
  mesh.userData.label = name;
  return mesh;
}

// Pelvis conceptual.
sphere(bones, 'Ilion izquierdo', -0.55, 0.9, 0, 0.55, 0.42, 0.22, boneMat);
sphere(bones, 'Ilion derecho', 0.55, 0.9, 0, 0.55, 0.42, 0.22, boneMat);
sphere(bones, 'Sacro', 0, 0.86, -0.14, 0.28, 0.48, 0.18, boneMat2);
sphere(bones, 'Acetábulo', 0.52, 0.42, 0.15, 0.34, 0.29, 0.22, boneMat2);
sphere(bones, 'Cartílago acetabular', 0.52, 0.42, 0.22, 0.25, 0.21, 0.045, cartilageMat);

// Fémur proximal conceptual.
cyl(bones, 'Diáfisis femoral', [0.35, -1.55, 0.02], [0.55, -0.35, 0.07], 0.14, boneMat2);
cyl(bones, 'Cuello femoral', [0.55, -0.25, 0.08], [0.42, 0.18, 0.18], 0.105, boneMat2);
sphere(bones, 'Cabeza femoral nativa', 0.42, 0.28, 0.2, 0.24, 0.24, 0.24, boneMat);
sphere(bones, 'Trocánter mayor', 0.76, -0.18, 0.02, 0.18, 0.28, 0.14, boneMat);
sphere(bones, 'Trocánter menor', 0.42, -0.42, 0.1, 0.12, 0.12, 0.1, boneMat);

// Implante.
const cup = sphere(implant, 'Cotilo metálico', 0.52, 0.42, 0.22, 0.27, 0.23, 0.055, metalMat);
const liner = sphere(implant, 'Liner', 0.52, 0.42, 0.26, 0.21, 0.18, 0.04, linerMat);
const head = sphere(implant, 'Cabeza protésica', 0.42, 0.25, 0.25, 0.18, 0.18, 0.18, ceramicMat);
const neck = cyl(implant, 'Cuello protésico', [0.45, 0.12, 0.22], [0.58, -0.22, 0.13], 0.055, metalMat);
const stem = cyl(implant, 'Vástago femoral', [0.58, -0.22, 0.13], [0.38, -1.35, 0.02], 0.075, metalMat, 6);
stem.scale.x = 0.72;

// Ejes y plano.
const axis = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.45, 1.25, 0.34), new THREE.Vector3(0.4, -1.55, 0.02)]),
  new THREE.LineBasicMaterial({ color: 0x22ff88 })
);
axis.name = 'Eje mecánico simulado';
root.add(axis);

const pelvisPlane = box(root, 'Plano interacetabular', 0, 0.42, 0.32, 1.45, 0.01, 0.02, new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.5 }));

marker('Cotilo', 0.52, 0.68, 0.32);
marker('Centro de rotación', 0.42, 0.25, 0.5);
marker('Cabeza protésica', 0.23, 0.27, 0.43);
marker('Vástago', 0.18, -0.72, 0.2);
marker('Trocánter mayor', 0.91, -0.02, 0.15);
marker('Offset femoral', 0.64, 0.08, 0.42);

function message(text) {
  toast.textContent = text;
  toast.style.display = 'block';
  clearTimeout(message.timer);
  message.timer = setTimeout(() => toast.style.display = 'none', 1800);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function updateMeasurements() {
  const inclination = Number(document.getElementById('inclination').value);
  const anteversion = Number(document.getElementById('anteversion').value);
  const offset = Number(document.getElementById('offset').value);

  document.getElementById('inclinationValue').textContent = inclination + '°';
  document.getElementById('anteversionValue').textContent = anteversion + '°';
  document.getElementById('offsetValue').textContent = offset + ' mm';
  document.getElementById('cupMetric').textContent = inclination + '°';
  document.getElementById('legMetric').textContent = offset + ' mm';

  cup.rotation.z = THREE.MathUtils.degToRad(inclination - 40);
  liner.rotation.z = cup.rotation.z;
  cup.rotation.y = THREE.MathUtils.degToRad(anteversion - 15);
  liner.rotation.y = cup.rotation.y;
  implant.position.x = offset / 90;
}

document.getElementById('inclination').addEventListener('input', updateMeasurements);
document.getElementById('anteversion').addEventListener('input', updateMeasurements);
document.getElementById('offset').addEventListener('input', updateMeasurements);

const state = { xray: false };

document.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const viewName = btn.dataset.view;

    if (action === 'implant') {
      implant.visible = !implant.visible;
      message(implant.visible ? 'Implante visible' : 'Implante oculto');
    }
    if (action === 'bones') {
      bones.visible = !bones.visible;
      message(bones.visible ? 'Hueso visible' : 'Hueso oculto');
    }
    if (action === 'xray') {
      state.xray = !state.xray;
      document.body.classList.toggle('xr', state.xray);
      boneMat.opacity = state.xray ? 0.42 : 1;
      boneMat2.opacity = state.xray ? 0.42 : 1;
      message(state.xray ? 'Modo Rx' : 'Modo normal');
    }
    if (action === 'labels') {
      labels.visible = !labels.visible;
      message(labels.visible ? 'Puntos visibles' : 'Puntos ocultos');
    }
    if (action === 'panel') {
      panel.classList.toggle('open');
    }
    if (action === 'reset') {
      camera.position.set(2.2, 1.35, 3.3);
      controls.target.set(0, 0.2, 0);
      controls.update();
      message('Cámara reset');
    }
    if (action === 'test') {
      message('JS funcionando correctamente');
      alert('JS funcionando correctamente');
    }
    if (viewName) {
      if (viewName === 'front') camera.position.set(0, 0.35, 3.4);
      if (viewName === 'lateral') camera.position.set(3.4, 0.35, 0.05);
      if (viewName === 'axial') camera.position.set(0.1, 3.8, 0.1);
      controls.target.set(0.35, 0.15, 0.08);
      controls.update();
      message('Vista ' + viewName);
    }
  });
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(5, 5);

addEventListener('pointermove', e => {
  pointer.x = e.clientX / innerWidth * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
}, { passive: true });

function updateLabel() {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(labels.children, false)[0];
  if (hit && labels.visible) {
    const p = hit.object.getWorldPosition(new THREE.Vector3());
    p.project(camera);
    label.style.left = (p.x * 0.5 + 0.5) * innerWidth + 'px';
    label.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px';
    label.textContent = hit.object.userData.label;
    label.style.display = 'block';
  } else {
    label.style.display = 'none';
  }
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateLabel();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

addEventListener('error', e => {
  setStatus('⚠ error');
  message('Error: ' + e.message);
});

updateMeasurements();
setStatus('● online');
message('Cadera 3D lista');
animate();
