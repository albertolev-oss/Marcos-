import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const $ = id => document.getElementById(id);
const ui = {
  loader: $('loader'), status: $('status'), panel: $('panel'), toast: $('toast'), labels: $('labelLayer'),
  controls: $('controls'), closePanel: $('closePanel'), file: $('modelInput'), subtitle: $('subtitle'),
  cursor: $('virtualCursor'), cursorDot: $('cursorDot'), cursorCoords: $('cursorCoords'),
  inclination: $('inclination'), anteversion: $('anteversion'), offset: $('offset'), neck: $('neck'), boneOpacity: $('boneOpacity')
};
const state = { bones:true, implant:true, xray:false, labels:false, axes:false, cut:false, explode:false, motion:false, navigation:false, cursor:false, loaded:false };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b16);
scene.fog = new THREE.Fog(0x050b16, 5, 10);
const renderer = new THREE.WebGLRenderer({ canvas:$('viewer'), antialias:true, powerPreference:'high-performance' });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 100);
camera.position.set(2.8, 1.4, 4.1);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0.3, 0.05, 0); orbit.enableDamping = true; orbit.minDistance = 1.2; orbit.maxDistance = 9;
scene.add(new THREE.HemisphereLight(0xffffff, 0x102033, 2.4));
const key = new THREE.DirectionalLight(0xffffff, 2.7); key.position.set(3, 5, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0x7dd3fc, 1.2); rim.position.set(-3, 1.5, -2.5); scene.add(rim);

const root = new THREE.Group(); root.position.y = -0.08; scene.add(root);
const grid = new THREE.GridHelper(4.8, 36, 0x36506d, 0x17243a); grid.position.y = -1.78; grid.material.transparent = true; grid.material.opacity = 0.38; root.add(grid);
const demo = new THREE.Group(), real = new THREE.Group(), implant = new THREE.Group(), guide = new THREE.Group();
root.add(demo, real, implant, guide);

const mat = {
  bone: new THREE.MeshStandardMaterial({ color:0xe9d6b2, roughness:.82, transparent:true, opacity:1 }),
  bone2: new THREE.MeshStandardMaterial({ color:0xd1b181, roughness:.86, transparent:true, opacity:1 }),
  dark: new THREE.MeshBasicMaterial({ color:0x030712, transparent:true, opacity:.58, side:THREE.DoubleSide }),
  metal: new THREE.MeshStandardMaterial({ color:0xb7c0ca, roughness:.18, metalness:.86 }),
  cup: new THREE.MeshStandardMaterial({ color:0x9fb7cf, roughness:.2, metalness:.82, transparent:true, opacity:.62, side:THREE.DoubleSide }),
  liner: new THREE.MeshStandardMaterial({ color:0xffffff, roughness:.45, transparent:true, opacity:.88 }),
  ceramic: new THREE.MeshStandardMaterial({ color:0xfffbf2, roughness:.18 }),
  plan: new THREE.MeshBasicMaterial({ color:0x22ff88, transparent:true, opacity:.34, side:THREE.DoubleSide }),
  actual: new THREE.MeshBasicMaterial({ color:0xfacc15, transparent:true, opacity:.40, side:THREE.DoubleSide }),
  red: new THREE.MeshBasicMaterial({ color:0xff3b3b, transparent:true, opacity:.32, side:THREE.DoubleSide }),
  greenLine: new THREE.LineBasicMaterial({ color:0x22ff88 }), blueLine: new THREE.LineBasicMaterial({ color:0x60a5fa }), orangeLine: new THREE.LineBasicMaterial({ color:0xfb923c })
};
let head, cutPlane, planRing, actualRing, pointerBall, offBase = 0;
const labelItems = [];
const raycaster = new THREE.Raycaster();
const cursorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -.28);
const cursorHit = new THREE.Vector3();
const cursorPos = { x: innerWidth * .5, y: innerHeight * .5, active: false };

function toast(t){ ui.toast.textContent=t; ui.toast.style.display='block'; clearTimeout(toast.t); toast.t=setTimeout(()=>ui.toast.style.display='none',1600); }
function status(t,k='ok'){ ui.status.textContent=t; ui.status.className='status '+k; }
function rel(parent,p){ const w=new THREE.Vector3(); parent.getWorldPosition(w); return p.clone().sub(w); }
function sphere(parent,name,p,s,m,detail=64){ const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,detail,Math.floor(detail/2)),m); mesh.name=name; mesh.position.copy(rel(parent,p)); mesh.scale.copy(s); parent.add(mesh); return mesh; }
function tube(parent,name,a,b,r1,r2,m,sides=48){ const aa=rel(parent,a), bb=rel(parent,b), d=bb.clone().sub(aa); const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2??r1,d.length(),sides),m); mesh.name=name; mesh.position.copy(aa.clone().add(bb).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); parent.add(mesh); return mesh; }
function curve(parent,name,pts,r,m){ const c=new THREE.CatmullRomCurve3(pts.map(p=>rel(parent,p))); const mesh=new THREE.Mesh(new THREE.TubeGeometry(c,80,r,18,false),m); mesh.name=name; parent.add(mesh); return mesh; }
function ring(parent,name,p,r,t,m){ const mesh=new THREE.Mesh(new THREE.TorusGeometry(r,t,20,128),m); mesh.name=name; mesh.position.copy(rel(parent,p)); parent.add(mesh); return mesh; }
function line(parent,name,a,b,m){ const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints([rel(parent,a),rel(parent,b)]),m); mesh.name=name; parent.add(mesh); return mesh; }
function label(text,target){ const card=document.createElement('div'); card.className='labelCard'; card.textContent=text; ui.labels.appendChild(card); labelItems.push({target,card}); }
function opacity(m,v){ m.opacity=v; m.transparent=v<1; m.needsUpdate=true; }

function buildDemo(){
  sphere(demo,'Pelvis',new THREE.Vector3(.50,.75,-.05),new THREE.Vector3(.62,.48,.20),mat.bone,72);
  sphere(demo,'Sacro',new THREE.Vector3(-.08,.80,-.22),new THREE.Vector3(.25,.44,.14),mat.bone2,56);
  sphere(demo,'Acetabulo',new THREE.Vector3(.55,.35,.12),new THREE.Vector3(.34,.27,.16),mat.bone2,72);
  sphere(demo,'Fondo',new THREE.Vector3(.55,.35,.24),new THREE.Vector3(.22,.17,.03),mat.dark,64);
  ring(demo,'Reborde',new THREE.Vector3(.55,.35,.255),.26,.023,mat.bone).scale.y=.78;
  curve(demo,'Rama pubica',[new THREE.Vector3(.18,.20,.02),new THREE.Vector3(.38,.31,.05),new THREE.Vector3(.65,.18,.03)],.06,mat.bone);
  curve(demo,'Rama isquiatica',[new THREE.Vector3(.25,-.05,.01),new THREE.Vector3(.42,-.30,.02),new THREE.Vector3(.65,-.25,.02)],.07,mat.bone2);
  curve(demo,'Femur',[new THREE.Vector3(.49,-1.68,.02),new THREE.Vector3(.49,-1.15,.02),new THREE.Vector3(.58,-.70,.05),new THREE.Vector3(.68,-.38,.07)],.13,mat.bone2);
  curve(demo,'Cuello',[new THREE.Vector3(.67,-.28,.08),new THREE.Vector3(.62,-.06,.13),new THREE.Vector3(.56,.12,.18)],.088,mat.bone);
  sphere(demo,'Trocanter',new THREE.Vector3(.84,-.16,.02),new THREE.Vector3(.18,.30,.13),mat.bone,64);
}
function buildImplant(){
  const h=new THREE.Vector3(.55,.30,.22);
  const cup=new THREE.Mesh(new THREE.SphereGeometry(.285,96,42,0,Math.PI*2,0,Math.PI*.48),mat.cup); cup.position.copy(rel(implant,h.clone().add(new THREE.Vector3(0,.018,.04)))); cup.rotation.x=Math.PI/2; cup.scale.set(1,.84,1); implant.add(cup);
  ring(implant,'Borde cotilo',h.clone().add(new THREE.Vector3(0,.01,.065)),.264,.021,mat.metal).scale.y=.83;
  sphere(implant,'Liner',h.clone().add(new THREE.Vector3(0,.006,.09)),new THREE.Vector3(.178,.145,.036),mat.liner,72);
  head=sphere(implant,'Cabeza',h.clone().add(new THREE.Vector3(0,0,.082)),new THREE.Vector3(.135,.135,.135),mat.ceramic,96);
  tube(implant,'Cono',new THREE.Vector3(.575,.10,.20),new THREE.Vector3(.69,-.23,.10),.036,.056,mat.metal,48);
  tube(implant,'Vastago',new THREE.Vector3(.69,-.29,.09),new THREE.Vector3(.45,-1.48,.015),.045,.103,mat.metal,7);
  label('Cotilo',cup); label('Cabeza',head); label('Vastago',implant.children[4]);
}
function buildGuide(){
  line(guide,'Eje pelvis',new THREE.Vector3(-.95,.36,.28),new THREE.Vector3(1.0,.36,.28),mat.blueLine);
  line(guide,'Eje femoral',new THREE.Vector3(.50,1.20,.30),new THREE.Vector3(.45,-1.64,.02),mat.greenLine);
  line(guide,'Offset',new THREE.Vector3(.55,.30,.55),new THREE.Vector3(.86,.08,.40),mat.orangeLine);
  planRing=ring(guide,'Plan',new THREE.Vector3(.55,.30,.30),.30,.008,mat.plan); planRing.rotation.x=Math.PI/2;
  actualRing=ring(guide,'Actual',new THREE.Vector3(.55,.30,.33),.26,.008,mat.actual); actualRing.rotation.x=Math.PI/2;
  cutPlane=new THREE.Mesh(new THREE.BoxGeometry(.54,.012,.36),mat.red); cutPlane.position.set(.62,-.08,.18); cutPlane.rotation.z=THREE.MathUtils.degToRad(-19); cutPlane.rotation.y=THREE.MathUtils.degToRad(11); guide.add(cutPlane);
  pointerBall=sphere(guide,'Puntero',new THREE.Vector3(.95,.72,.48),new THREE.Vector3(.045,.045,.045),new THREE.MeshBasicMaterial({color:0x22ff88}),24);
  label('Plan',planRing); label('Actual',actualRing); label('Puntero',pointerBall); label('Corte',cutPlane);
}
function normalize(obj){ obj.traverse(c=>{ if(c.isMesh){ c.material=mat.bone; c.geometry.computeVertexNormals(); }}); const box=new THREE.Box3().setFromObject(obj), size=new THREE.Vector3(), center=new THREE.Vector3(); box.getSize(size); box.getCenter(center); obj.position.sub(center); obj.scale.multiplyScalar(3.15/(Math.max(size.x,size.y,size.z)||1)); return obj; }
function loadModel(file){ if(!file) return; const ext=file.name.split('.').pop().toLowerCase(), url=URL.createObjectURL(file); status('cargando','pending'); toast('Cargando archivo'); const done=obj=>{ real.clear(); real.add(normalize(obj)); state.loaded=true; state.bones=true; state.navigation=true; state.axes=true; state.cut=true; state.labels=false; ui.subtitle.textContent='Modelo OBJ/STL cargado localmente. No se sube a GitHub.'; apply(); setView('oblique'); status('modelo local','ok'); toast('Modelo cargado'); URL.revokeObjectURL(url); }; const fail=e=>{ console.error(e); status('error','err'); toast('No pude cargar el archivo'); URL.revokeObjectURL(url); }; if(ext==='obj') new OBJLoader().load(url,done,undefined,fail); else if(ext==='stl') new STLLoader().load(url,g=>done(new THREE.Mesh(g,mat.bone)),undefined,fail); else { toast('Usa OBJ o STL'); URL.revokeObjectURL(url); } }
function update(){ const inc=+ui.inclination.value, ant=+ui.anteversion.value, off=+ui.offset.value, neck=+ui.neck.value, bone=+ui.boneOpacity.value/100; offBase=off/120; $('inclinationValue').textContent=inc+'°'; $('anteversionValue').textContent=ant+'°'; $('offsetValue').textContent=off+' mm'; $('neckValue').textContent=neck+' mm'; $('boneOpacityValue').textContent=Math.round(bone*100)+'%'; $('offsetMetric').textContent=off+' mm'; $('legMetric').textContent=(neck>0?'+':'')+neck+' mm'; $('versionMetric').textContent=ant+'°'; $('safeMetric').textContent=inc>=35&&inc<=50&&ant>=10&&ant<=25?'Zona segura':'Revisar'; if(actualRing){ actualRing.rotation.z=THREE.MathUtils.degToRad(inc-40); actualRing.rotation.y=THREE.MathUtils.degToRad(ant-15); } if(head) head.position.z=.302+neck/160; if(!state.xray)[mat.bone,mat.bone2].forEach(m=>opacity(m,bone)); }
function apply(){ demo.visible=state.bones&&!state.loaded; real.visible=state.bones&&state.loaded; implant.visible=state.implant; guide.visible=state.navigation||state.axes||state.cut||state.cursor; if(cutPlane) cutPlane.visible=state.cut||state.navigation; if(planRing) planRing.visible=state.navigation; if(actualRing) actualRing.visible=state.navigation; if(pointerBall) pointerBall.visible=state.navigation||state.cursor; document.body.classList.toggle('xr',state.xray); document.body.classList.toggle('cursorOn',state.cursor); if(state.xray)[mat.bone,mat.bone2].forEach(m=>opacity(m,.24)); else update(); labelItems.forEach(i=>i.card.style.display=state.labels?'block':'none'); document.querySelectorAll('#controls button').forEach(b=>{ const k=b.dataset.toggle; if(k)b.classList.toggle('active',!!state[k]); }); }
function setView(name){ const v={ap:[[.38,.26,4.65],[.34,.12,.02]],lateral:[[4.35,.28,.08],[.34,.12,.02]],axial:[[.35,4.65,.08],[.35,.10,.04]],oblique:[[2.8,1.4,4.1],[.30,.05,0]]}[name]||[[2.8,1.4,4.1],[.30,.05,0]]; camera.position.set(...v[0]); orbit.target.set(...v[1]); orbit.update(); toast('Vista '+name.toUpperCase()); }
function reset(){ Object.assign(state,{bones:true,implant:true,xray:false,labels:false,axes:false,cut:false,explode:false,motion:false,navigation:false,cursor:false}); ui.inclination.value=40; ui.anteversion.value=15; ui.offset.value=0; ui.neck.value=0; ui.boneOpacity.value=100; update(); apply(); setView('oblique'); }
function handle(btn){ const k=btn.dataset.toggle, a=btn.dataset.action, v=btn.dataset.view; if(k){ state[k]=!state[k]; if(k==='navigation'&&state[k]){state.axes=true;state.cut=true;ui.panel.classList.add('open')} if(k==='cursor'&&state[k]){state.navigation=true;state.axes=true;setCursor(cursorPos.x,cursorPos.y);toast('Cursor virtual activo')} apply(); toast(k+': '+(state[k]?'ON':'OFF')); } if(v)setView(v); if(a==='load')ui.file.click(); if(a==='panel')ui.panel.classList.toggle('open'); if(a==='reset')reset(); if(a==='test'){status('online','ok');toast('JavaScript funcionando')} }
function updateLabels(){ const v=new THREE.Vector3(); for(const item of labelItems){ if(!state.labels||!item.target.visible){item.card.style.display='none';continue} item.target.getWorldPosition(v); v.project(camera); if(v.z<-1||v.z>1){item.card.style.display='none';continue} item.card.style.display='block'; item.card.style.left=((v.x*.5+.5)*innerWidth)+'px'; item.card.style.top=((-v.y*.5+.5)*innerHeight)+'px'; } }
function setCursor(x,y){
  cursorPos.x=THREE.MathUtils.clamp(x,18,innerWidth-18); cursorPos.y=THREE.MathUtils.clamp(y,18,innerHeight-18);
  ui.cursorDot.style.left=cursorPos.x+'px'; ui.cursorDot.style.top=cursorPos.y+'px';
  raycaster.setFromCamera(new THREE.Vector2(cursorPos.x/innerWidth*2-1,-(cursorPos.y/innerHeight)*2+1),camera);
  if(pointerBall&&raycaster.ray.intersectPlane(cursorPlane,cursorHit)){
    pointerBall.position.copy(guide.worldToLocal(cursorHit.clone()));
    ui.cursorCoords.textContent='X '+Math.round(cursorHit.x*100)+' · Y '+Math.round(cursorHit.y*100)+' · Z '+Math.round(cursorHit.z*100);
  }
}
function cursorEvent(e){
  if(!state.cursor) return;
  e.preventDefault(); e.stopPropagation();
  setCursor(e.clientX,e.clientY);
}
ui.cursorDot.addEventListener('pointerdown',e=>{cursorPos.active=true; ui.cursorDot.setPointerCapture(e.pointerId); cursorEvent(e)});
ui.cursorDot.addEventListener('pointermove',e=>{if(cursorPos.active)cursorEvent(e)});
ui.cursorDot.addEventListener('pointerup',e=>{cursorPos.active=false; ui.cursorDot.releasePointerCapture(e.pointerId)});
ui.cursorDot.addEventListener('pointercancel',()=>{cursorPos.active=false});

ui.controls.addEventListener('click',e=>{const b=e.target.closest('button'); if(b)handle(b)}); ui.file.addEventListener('change',e=>loadModel(e.target.files[0])); ui.closePanel.addEventListener('click',()=>ui.panel.classList.remove('open')); [ui.inclination,ui.anteversion,ui.offset,ui.neck,ui.boneOpacity].forEach(s=>s.addEventListener('input',update)); addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);setCursor(cursorPos.x,cursorPos.y)},{passive:true});
buildDemo(); buildImplant(); buildGuide(); update(); apply(); setView('oblique'); status('online','ok'); ui.loader.classList.add('hide'); toast('Visor listo');
function animate(){requestAnimationFrame(animate); const t=performance.now()*.001; if(state.motion)implant.rotation.y=Math.sin(t*1.2)*.12; else implant.rotation.y*=.92; const target=state.explode?new THREE.Vector3(offBase+.34,-.04,.16):new THREE.Vector3(offBase,0,0); implant.position.lerp(target,.10); orbit.update(); updateLabels(); renderer.render(scene,camera)} animate();
