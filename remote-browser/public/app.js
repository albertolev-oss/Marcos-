let locked = false;
const $ = id => document.getElementById(id);
async function post(path, body = {}) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
}
async function action(action, value) { try { const data = await post('/api/action', { action, value }); $('output').textContent = data.text || JSON.stringify(data, null, 2); } catch (e) { $('output').textContent = `Detenido: ${e.message}`; } }
$('lock').onclick = async () => { locked = !locked; await post(locked ? '/api/lock' : '/api/unlock'); $('shield').classList.toggle('active', locked); $('mode').textContent = locked ? 'SOLO LECTURA' : 'Inicio manual'; $('lock').textContent = locked ? 'Volver al inicio manual' : 'Activar modo lectura'; };
$('go').onclick = () => action('navigate', $('url').value); $('back').onclick = () => action('back'); $('forward').onclick = () => action('forward'); $('reload').onclick = () => action('reload'); $('find').onclick = () => action('find', $('query').value); $('read').onclick = () => action('read');
let installPrompt; window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('install').hidden = false; }); $('install').onclick = () => installPrompt?.prompt();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
