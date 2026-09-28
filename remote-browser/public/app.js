const $ = id => document.getElementById(id);
let mode = null;
let targetLabel = '';
let configReady = false;
let allowedTools = new Set();
let locked = null;
let expired = false;
let snapshotReady = false;
let snapshotExpiryTimer;
let pending = false;
let agentBusy = false;
let agentEnabled = false;
let demoTargets = null;
let viewVersion = 0;
let installPrompt;
const isInstitutional = () => mode === 'sihosp' || mode === 'pacs';
const actionButtons = { go: 'navigate', back: 'back', forward: 'forward', reload: 'reload', find: 'find', read: 'read', 'demo-sihosp': 'navigate', 'demo-pacs': 'navigate' };

async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || `Error ${response.status}`);
    error.state = data;
    throw error;
  }
  return data;
}
function post(path, body = {}) {
  return request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function clearPrivateOutput(message = '') {
  viewVersion += 1;
  $('output').textContent = message;
  $('query').value = '';
}
function expireSnapshot() {
  expired = true;
  snapshotReady = false;
  clearPrivateOutput('La captura venció. Volvé al inicio manual y capturá la página de nuevo.');
  renderState();
}
function renderState() {
  const busy = pending || agentBusy;
  const institutional = isInstitutional();
  const readable = configReady && locked === true && !expired && (!institutional || snapshotReady);
  $('shield').classList.toggle('active', locked !== false);
  $('desktop-frame').inert = locked !== false;
  $('desktop-frame').tabIndex = locked === false ? 0 : -1;
  if (locked !== false && document.activeElement === $('desktop-frame')) $('desktop-frame').blur();
  $('shield-message').textContent = locked === null ? 'Verificando estado del navegador…' : institutional ? (expired ? 'Captura vencida. Volvé al inicio manual.' : snapshotReady ? 'Texto capturado · página pausada' : 'Captura no disponible. Volvé al inicio manual.') : 'Modo lectura activo';
  $('mode').textContent = locked === null ? 'Verificando estado' : locked ? (institutional ? (expired ? 'CAPTURA VENCIDA' : snapshotReady ? 'TEXTO CAPTURADO' : 'CAPTURA NO DISPONIBLE') : 'SOLO LECTURA') : `Inicio manual · ${institutional ? targetLabel : 'demo'}`;
  $('lock').textContent = locked ? (agentBusy ? 'Detener agente y volver al inicio manual' : 'Volver al inicio manual') : institutional ? 'Capturar página para lectura' : 'Activar modo lectura';
  $('lock').disabled = pending || locked === null || !configReady || (agentBusy && !locked);
  $('status').disabled = pending;
  for (const [id, name] of Object.entries(actionButtons)) $(id).disabled = busy || !readable || !allowedTools.has(name);
  $('query').disabled = busy || !readable;
  $('agent-run').disabled = busy || !agentEnabled || !readable;
  $('agent-run').textContent = agentBusy ? 'Agente en ejecución…' : institutional ? 'Leer página con el agente' : 'Ejecutar prueba sintética';
}
function setStatus(data) {
  const wasLocked = locked;
  if (typeof data.locked === 'boolean') locked = data.locked;
  if (typeof data.expired === 'boolean') expired = data.expired;
  if (typeof data.snapshotReady === 'boolean') snapshotReady = data.snapshotReady;
  if (locked === false) {
    expired = false;
    snapshotReady = false;
    clearTimeout(snapshotExpiryTimer);
    if (isInstitutional() && wasLocked === true) clearPrivateOutput('Inicio manual. Seleccioná el registro o estudio y capturá la página de nuevo.');
  }
  if (isInstitutional() && locked === true) {
    const expiry = data.snapshotExpiresAt ?? data.snapshot?.expiresAt;
    if (expiry !== undefined && expiry !== null) {
      const timestamp = typeof expiry === 'number' ? expiry : Date.parse(expiry);
      if (Number.isFinite(timestamp)) {
        clearTimeout(snapshotExpiryTimer);
        if (timestamp <= Date.now()) expired = true;
        else snapshotExpiryTimer = setTimeout(expireSnapshot, timestamp - Date.now());
      }
    }
    if (expired) clearPrivateOutput('La captura venció. Volvé al inicio manual y capturá la página de nuevo.');
  }
  renderState();
}
function showError(error, recapture = false) {
  $('output').textContent = `Detenido: ${error.message}${isInstitutional() && recapture ? '\nVolvé al inicio manual y capturá la página de nuevo.' : ''}`;
}
async function action(name, value) {
  if (pending || (agentBusy && name !== 'status')) return;
  if (name !== 'status' && (!allowedTools.has(name) || expired)) return;
  pending = true;
  renderState();
  try {
    const data = await post('/api/action', { action: name, ...(value === undefined ? {} : { value }) });
    setStatus(data);
    if (isInstitutional() && name === 'status') {
      if (!expired) $('output').textContent = locked && !snapshotReady ? 'No hay una captura disponible. Volvé al inicio manual y capturá la página de nuevo.' : locked ? 'Texto capturado disponible. Podés leerlo localmente o enviarlo al agente. La captura dura hasta 5 minutos.' : 'Iniciá sesión manualmente, abrí el registro o estudio y capturá la página para lectura.';
    } else if (!expired) $('output').textContent = data.text || JSON.stringify(data, null, 2);
    if (!isInstitutional() && data.url) $('url').value = data.url;
  } catch (error) {
    if (typeof error.state?.locked === 'boolean') setStatus(error.state);
    showError(error, name === 'read' || name === 'find');
  }
  finally { pending = false; renderState(); }
}
async function refreshAgentStatus() {
  try {
    const data = await request('/api/agent/status');
    agentEnabled = data.enabled === true;
    agentBusy = data.busy === true || data.running === true;
    $('agent-status').textContent = agentBusy ? 'Agente en ejecución. Podés detenerlo volviendo al inicio manual.' : agentEnabled ? (isInstitutional() ? 'Agente disponible para leer el texto capturado.' : 'Agente disponible. Requiere modo lectura.') : `Agente deshabilitado. ${data.message || data.reason || 'Configurá la clave de API únicamente en el servidor.'}`;
  } catch (error) {
    agentEnabled = false;
    $('agent-status').textContent = `No se pudo consultar el agente: ${error.message}`;
  }
  renderState();
}
$('lock').onclick = async () => {
  if (pending || locked === null || (agentBusy && !locked)) return;
  const unlocking = locked;
  if (unlocking && isInstitutional()) clearPrivateOutput('Volviendo al inicio manual…');
  pending = true;
  renderState();
  try {
    const data = await post(unlocking ? '/api/unlock' : '/api/lock');
    if (typeof data.locked !== 'boolean') throw new Error('El servidor no confirmó el estado del navegador');
    if (!unlocking) expired = false;
    setStatus(data);
    if (!locked) agentBusy = false;
    if (isInstitutional()) {
      if (!expired) $('output').textContent = locked ? 'Texto capturado. Usá «Leer texto localmente» para revisarlo. «Leer página con el agente» envía ese texto a OpenAI. La captura dura hasta 5 minutos.' : 'Inicio manual. Seleccioná el registro o estudio y capturá la página de nuevo.';
    } else $('output').textContent = locked ? 'Lectura activa. Podés abrir SIHOSP demo, PACS demo o ejecutar la prueba del agente.' : 'Ingresá únicamente los datos ficticios indicados en la pantalla de login del escritorio.';
  } catch (error) {
    if (isInstitutional() && typeof error.state?.locked === 'boolean') {
      clearPrivateOutput();
      setStatus({ ...error.state, ...(error.state.recoveryRequired ? { snapshotReady: false } : {}) });
    }
    showError(error, !unlocking);
  }
  finally { pending = false; renderState(); }
};
$('status').onclick = async () => { await action('status'); await refreshAgentStatus(); };
$('go').onclick = () => action('navigate', $('url').value);
$('back').onclick = () => action('back');
$('forward').onclick = () => action('forward');
$('reload').onclick = () => action('reload');
$('find').onclick = () => action('find', $('query').value);
$('read').onclick = () => action('read');
$('demo-sihosp').onclick = () => action('navigate', demoTargets?.sihosp);
$('demo-pacs').onclick = () => action('navigate', demoTargets?.pacs);
$('agent-run').onclick = async () => {
  if (pending || agentBusy || !agentEnabled || locked !== true || expired || (isInstitutional() && !snapshotReady)) return;
  const currentView = viewVersion;
  agentBusy = true;
  $('agent-status').textContent = isInstitutional() ? 'El agente está leyendo el texto capturado. Puede tardar hasta dos minutos.' : 'Leyendo los dos portales sintéticos. Puede tardar hasta dos minutos.';
  renderState();
  try {
    const result = await post('/api/agent/run', {});
    if (currentView === viewVersion && locked === true && !expired) $('output').textContent = JSON.stringify(result, null, 2);
  } catch (error) { if (currentView === viewVersion) showError(error, isInstitutional()); }
  finally { agentBusy = false; await refreshAgentStatus(); }
};
async function configureOfflineStorage() {
  if (isInstitutional()) {
    $('install').hidden = true;
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(registration => [registration.active, registration.waiting, registration.installing].some(worker => worker && new URL(worker.scriptURL).pathname === '/sw.js')).map(registration => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('remote-browser-shell-')).map(key => caches.delete(key)));
    }
  } else if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('/sw.js');
    $('install').hidden = !installPrompt;
  }
}
function configureDisplay(config) {
  mode = config.mode || 'demo';
  targetLabel = config.target?.label || mode.toUpperCase();
  const institutional = isInstitutional();
  allowedTools = new Set(config.tools || (institutional ? ['status', 'find', 'read'] : ['status', 'navigate', 'back', 'forward', 'reload', 'find', 'read']));
  if (institutional) allowedTools = new Set([...allowedTools].filter(name => ['status', 'find', 'read'].includes(name)));
  demoTargets = config.targets;
  $('header-brand').textContent = institutional ? `${targetLabel} · lectura de página` : 'SIHOSP + PACS · demo sintética';
  document.title = institutional ? `${targetLabel} — Lectura de texto capturado` : 'Navegador de solo lectura — Demo sintética';
  $('notice-message').textContent = institutional ? `Iniciá sesión manualmente en ${targetLabel} dentro del escritorio y abrí el registro o estudio que querés consultar. «Capturar página para lectura» conserva el texto visible de esa página y pausa su red y scripts. Las credenciales se ingresan únicamente en el escritorio.` : 'Solo datos ficticios. Iniciá sesión manualmente dentro del escritorio con el usuario y la clave ficticios indicados en la demo. No ingreses credenciales institucionales ni datos de pacientes. Después, activá el modo lectura.';
  $('demo-targets').hidden = institutional;
  $('institutional-links').hidden = institutional;
  for (const id of ['go', 'url', 'back', 'forward', 'reload']) $(id).hidden = institutional;
  $('target-origin').textContent = institutional ? `${targetLabel} · ${config.target.origin}` : config.demoOrigin;
  $('target-info').hidden = false;
  $('query').placeholder = institutional ? 'Buscar en el texto capturado' : 'Buscar texto ficticio';
  $('query').setAttribute('aria-label', institutional ? 'Texto a buscar en la captura' : 'Texto sintético a buscar');
  $('read').textContent = institutional ? 'Leer texto localmente' : 'Leer página';
  $('agent-title').textContent = institutional ? 'Lectura asistida' : 'Prueba del agente';
  $('agent-description').textContent = institutional ? 'El agente recibe únicamente el texto capturado de la página actual y dispone de status, find y read. No puede navegar ni interactuar con el portal. Al seleccionar «Leer página con el agente», ese texto se envía a OpenAI. La captura vence a los 5 minutos y se borra al volver al inicio manual.' : 'Consigna fija: consultar los portales SIHOSP y PACS sintéticos y resumir el registro DEMO-0001. El agente dispone únicamente de status, navigate, back, forward, reload, find y read.';
  $('pacs-limitation').hidden = mode !== 'pacs';
  $('output').textContent = institutional ? 'Iniciá sesión manualmente, abrí el registro o estudio y capturá la página para lectura.' : 'Conectate al escritorio e iniciá sesión con los datos ficticios de la demo. Luego activá el modo lectura.';
  if (!institutional) {
    $('url').value = `${config.demoOrigin}/login.html`;
    for (const target of ['sihosp', 'pacs']) {
      const link = $(`institutional-${target}`);
      link.href = config.institutionalTargets[target];
      link.hidden = false;
    }
  }
  configReady = true;
}
async function initialize() {
  renderState();
  try {
    configureDisplay(await request('/api/config'));
    await configureOfflineStorage().catch(() => {});
    await action('status');
  } catch (error) { showError(error); }
  await refreshAgentStatus();
}
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install').hidden = mode !== 'demo'; });
window.addEventListener('pagehide', () => { if (isInstitutional()) clearPrivateOutput(); });
$('install').onclick = () => { if (mode === 'demo') return installPrompt?.prompt(); };
setInterval(async () => {
  if (!isInstitutional() || locked !== true || pending) return;
  const currentView = viewVersion;
  try {
    const data = await post('/api/action', { action: 'status' });
    if (currentView === viewVersion && !pending) setStatus(data);
  }
  catch { /* The explicit status button remains available after connection errors. */ }
}, 15_000);
void initialize();
