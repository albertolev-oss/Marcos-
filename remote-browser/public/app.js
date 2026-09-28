const $ = id => document.getElementById(id);
let locked = null;
let pending = false;
let agentBusy = false;
let agentEnabled = false;
let demoTargets = null;
const actionButtons = ['go', 'back', 'forward', 'reload', 'find', 'read', 'demo-sihosp', 'demo-pacs'];

async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  return data;
}
function post(path, body = {}) {
  return request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function renderState() {
  const busy = pending || agentBusy;
  $('shield').classList.toggle('active', locked !== false);
  $('desktop-frame').inert = locked !== false;
  $('desktop-frame').tabIndex = locked === false ? 0 : -1;
  if (locked !== false && document.activeElement === $('desktop-frame')) $('desktop-frame').blur();
  $('shield-message').textContent = locked === null ? 'Verificando estado del navegador…' : 'Modo lectura activo';
  $('mode').textContent = locked === null ? 'Verificando estado' : locked ? 'SOLO LECTURA' : 'Inicio manual · demo';
  $('lock').textContent = locked ? (agentBusy ? 'Detener agente y volver al inicio manual' : 'Volver al inicio manual') : 'Activar modo lectura';
  $('lock').disabled = pending || locked === null || (agentBusy && !locked);
  $('status').disabled = pending;
  for (const id of actionButtons) $(id).disabled = busy || locked !== true || !demoTargets;
  $('agent-run').disabled = busy || !agentEnabled || locked !== true || !demoTargets;
  $('agent-run').textContent = agentBusy ? 'Agente en ejecución…' : 'Ejecutar prueba sintética';
}
function setStatus(data) {
  if (typeof data.locked === 'boolean') locked = data.locked;
  renderState();
}
function showError(error) { $('output').textContent = `Detenido: ${error.message}`; }
async function action(name, value) {
  if (pending || (agentBusy && name !== 'status')) return;
  pending = true;
  renderState();
  try {
    const data = await post('/api/action', { action: name, ...(value === undefined ? {} : { value }) });
    setStatus(data);
    $('output').textContent = data.text || JSON.stringify(data, null, 2);
    if (data.url) $('url').value = data.url;
  } catch (error) { showError(error); }
  finally { pending = false; renderState(); }
}
async function refreshAgentStatus() {
  try {
    const data = await request('/api/agent/status');
    agentEnabled = data.enabled === true;
    agentBusy = data.busy === true || data.running === true;
    $('agent-status').textContent = agentBusy ? 'Prueba en ejecución. Esperá a que termine.' : agentEnabled ? 'Agente disponible. Requiere modo lectura.' : `Agente deshabilitado. ${data.message || data.reason || 'Configurá la clave de API únicamente en el servidor.'}`;
  } catch (error) {
    agentEnabled = false;
    $('agent-status').textContent = `No se pudo consultar el agente: ${error.message}`;
  }
  renderState();
}
$('lock').onclick = async () => {
  if (pending || locked === null || (agentBusy && !locked)) return;
  pending = true;
  renderState();
  try {
    const data = await post(locked ? '/api/unlock' : '/api/lock');
    if (typeof data.locked !== 'boolean') throw new Error('El servidor no confirmó el estado del navegador');
    setStatus(data);
    if (!locked) agentBusy = false;
    $('output').textContent = locked ? 'Lectura activa. Podés abrir SIHOSP demo, PACS demo o ejecutar la prueba del agente.' : 'Ingresá únicamente los datos ficticios indicados en la pantalla de login del escritorio.';
  } catch (error) { showError(error); }
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
  if (pending || agentBusy || !agentEnabled || locked !== true) return;
  agentBusy = true;
  $('agent-status').textContent = 'Leyendo los dos portales sintéticos. Puede tardar hasta dos minutos.';
  renderState();
  try {
    const result = await post('/api/agent/run', {});
    $('output').textContent = JSON.stringify(result, null, 2);
  } catch (error) { showError(error); }
  finally { agentBusy = false; await refreshAgentStatus(); }
};
async function initialize() {
  renderState();
  try {
    const config = await request('/api/config');
    demoTargets = config.targets;
    $('url').value = `${config.demoOrigin}/login.html`;
    $('demo-origin').textContent = config.demoOrigin;
    for (const target of ['sihosp', 'pacs']) {
      const link = $(`institutional-${target}`);
      link.href = config.institutionalTargets[target];
      link.hidden = false;
    }
    await action('status');
  } catch (error) { showError(error); }
  await refreshAgentStatus();
}
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install').hidden = false; });
$('install').onclick = () => installPrompt?.prompt();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
void initialize();
