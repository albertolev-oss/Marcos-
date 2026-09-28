import test from 'node:test';
import assert from 'node:assert/strict';
import { agentTools, dispatchTool } from '../src/agent-tools.js';
import { createAgentsClient } from '../src/agents-client.js';
import { demoSession, runDemo } from '../src/agent-runner.js';
import { loadConfig } from '../src/config.js';

const names = ['status', 'navigate', 'back', 'forward', 'reload', 'find', 'read'];
const config = loadConfig({ DEMO_ORIGIN: 'http://127.0.0.1:8081' });
const sessionId = 'sess_synthetic';
const turnId = 'turn_synthetic';
const pending = (name, args = {}, callId = `call_${name}`) => ({
  type: 'function_call', name, arguments: args, call_id: callId, turn_id: turnId
});
const turn = (status, overrides = {}) => ({ id: turnId, session_id: sessionId, subagent_id: null, status, ...overrides });
const message = (text, overrides = {}) => ({
  id: 'msg_synthetic', type: 'message', turn_id: turnId, role: 'assistant',
  phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text }], ...overrides
});
const page = (data, overrides = {}) => ({ data, has_more: false, last_id: data.at(-1)?.id ?? null, object: 'list', ...overrides });

function makeActions() {
  const state = { locked: true, calls: [] };
  return Object.assign(state, {
    isLocked: () => state.locked,
    async execute(name, value) {
      state.calls.push({ name, value });
      return { action: name, synthetic: true, ...(value === undefined ? {} : { value }) };
    }
  });
}

function scriptedClient({ polls = [{ status: 'idle', turns: [turn('completed')] }], pages = [page([message('DEMO-0001: prueba sintética.')])] } = {}) {
  const calls = { create: [], retrieve: [], turns: [], results: [], items: [], cancel: [] };
  let poll = -1;
  let itemPage = 0;
  return {
    calls,
    async create(body, signal) { calls.create.push({ body, signal }); return { id: sessionId }; },
    async retrieve(id) {
      calls.retrieve.push(id);
      poll++;
      assert.ok(poll < polls.length, 'unexpected extra session poll');
      const state = polls[poll];
      return { id, status: state.status, required_actions: state.actions ?? [] };
    },
    async turns(id) { calls.turns.push(id); return page(polls[poll].turns ?? [turn('in_progress')]); },
    async results(id, events, key) { calls.results.push({ id, events, key }); },
    async items(id, after) {
      calls.items.push({ id, after });
      assert.ok(itemPage < pages.length, 'unexpected extra items page');
      return pages[itemPage++];
    },
    async cancel(id) { calls.cancel.push(id); }
  };
}

function run(client, actions = makeActions(), options = {}) {
  return runDemo({ client, actions, config, pollMs: 0, ...options });
}

test('el agente publica exactamente las siete tools y esquemas cerrados de Agents API', () => {
  assert.deepEqual(agentTools.map(tool => tool.name), names);
  for (const tool of agentTools) {
    assert.equal(tool.type, 'function');
    assert.equal(tool.parameters.type, 'object');
    assert.equal(tool.parameters.additionalProperties, false);
    assert.ok(tool.description);
    assert.equal(Object.hasOwn(tool, 'strict'), false, 'no mezcla campos de Responses API');
    const hasValue = tool.name === 'navigate' || tool.name === 'find';
    assert.deepEqual(Object.keys(tool.parameters.properties), hasValue ? ['value'] : []);
    assert.deepEqual(tool.parameters.required, hasValue ? ['value'] : []);
  }
  const session = demoSession(config);
  assert.deepEqual(session.environment, { type: 'none' });
  assert.deepEqual(session.agent.tools, agentTools);
  assert.equal(session.agent.model, config.agentsModel);
  assert.ok(session.input.includes(`${config.demoOrigin}/mock-sihosp.html`));
  assert.ok(session.input.includes(`${config.demoOrigin}/mock-pacs.html`));
  assert.ok(session.input.includes('DEMO-0001'));
});

test('todas las tools válidas despachan únicamente su acción y su valor', async () => {
  const actions = makeActions();
  for (const name of names) {
    const value = name === 'navigate' ? `${config.demoOrigin}/mock-sihosp.html` : name === 'find' ? 'DEMO-0001' : undefined;
    const result = await dispatchTool(actions, name, value === undefined ? {} : { value });
    assert.equal(result.action, name);
    assert.deepEqual(actions.calls.at(-1), { name, value });
  }
  assert.equal(actions.calls.length, 7);
});

test('click/type/submit/upload y tools desconocidas se bloquean antes del navegador', async () => {
  const actions = makeActions();
  for (const name of ['click', 'type', 'submit', 'upload', 'evaluate', 'execute', '__proto__', 'constructor', 'Read']) {
    await assert.rejects(dispatchTool(actions, name, {}), /no permitida/);
  }
  assert.deepEqual(actions.calls, []);
});

test('rechaza contraseñas, campos extra y argumentos no objetos sin ejecutar acciones', async () => {
  const actions = makeActions();
  for (const [name, args] of [
    ['read', { password: 'synthetic-never-send' }],
    ['navigate', { value: `${config.demoOrigin}/mock-sihosp.html`, password: 'synthetic-never-send' }],
    ['find', { value: 'DEMO-0001', click: true }],
    ['status', { value: 'ignored' }],
    ['read', { selector: '#secret' }],
    ['read', null], ['read', []], ['read', '{}'], ['read', 7],
    ['navigate', {}], ['find', {}], ['find', { value: '' }],
    ['find', { value: '   ' }], ['navigate', { value: 3 }],
    ['find', { value: 'a'.repeat(201) }], ['navigate', { value: 'a'.repeat(2049) }]
  ]) await assert.rejects(dispatchTool(actions, name, args));
  assert.deepEqual(actions.calls, []);
});

test('cliente REST usa origen fijo, beta, JSON y acepta results/cancel 202 vacío', async () => {
  const requests = [];
  const client = createAgentsClient({ apiKey: 'synthetic-api-key', fetchImpl: async (url, options) => {
    requests.push({ url, ...options });
    return url.endsWith('/events') ? new Response(null, { status: 202 }) : Response.json({ id: sessionId });
  } });
  const body = demoSession(config);
  await client.create(body);
  await client.retrieve(sessionId);
  await client.turns(sessionId);
  await client.items(sessionId);
  await client.items(sessionId, 'item_after');
  const event = { type: 'agent.session.input.tool_result', turn_id: turnId, call_id: 'call_read', success: true, output: '{"synthetic":true}' };
  assert.equal(await client.results(sessionId, [event], 'synthetic-idempotency'), undefined);
  assert.equal(await client.cancel(sessionId), undefined);
  const base = `https://api.openai.com/v1/agents/sessions`;
  assert.deepEqual(requests.map(r => [r.method, r.url]), [
    ['POST', base], ['GET', `${base}/${sessionId}`],
    ['GET', `${base}/${sessionId}/turns?order=desc&limit=100`],
    ['GET', `${base}/${sessionId}/items?order=asc&limit=100`],
    ['GET', `${base}/${sessionId}/items?order=asc&limit=100&after=item_after`],
    ['POST', `${base}/${sessionId}/events`], ['POST', `${base}/${sessionId}/events`]
  ]);
  for (const request of requests) {
    assert.equal(request.headers.Authorization, 'Bearer synthetic-api-key');
    assert.equal(request.headers['OpenAI-Beta'], 'agents=v1');
    assert.equal(request.headers['Content-Type'], 'application/json');
    assert.equal(request.redirect, 'error');
    assert.ok(request.signal instanceof AbortSignal);
  }
  assert.deepEqual(JSON.parse(requests[0].body), body);
  assert.deepEqual(JSON.parse(requests[5].body), { events: [event] });
  assert.equal(requests[5].headers['Idempotency-Key'], 'synthetic-idempotency');
  assert.deepEqual(JSON.parse(requests[6].body), { events: [{ type: 'agent.session.input.cancel' }] });
});

test('cliente bloquea IDs que alteran rutas y no filtra cuerpos de errores del proveedor', async () => {
  let fetched = 0;
  const client = createAgentsClient({ apiKey: 'synthetic-api-key', fetchImpl: async () => {
    fetched++;
    return new Response('provider-secret-synthetic', { status: 403 });
  } });
  for (const id of ['../another', 'sess_1?extra=true', 'https://other.test', '', null]) {
    assert.throws(() => client.retrieve(id), /Identificador/);
  }
  assert.throws(() => client.items(sessionId, '../cursor'), /Identificador/);
  assert.equal(fetched, 0);
  await assert.rejects(client.retrieve(sessionId), { message: 'Agents API HTTP 403' });
  assert.throws(() => createAgentsClient({ apiKey: '' }), /Falta OPENAI_API_KEY/);
});

test('runDemo conserva el login manual: requiere lock antes de crear una sesión', async () => {
  const client = scriptedClient();
  const actions = makeActions();
  actions.locked = false;
  await assert.rejects(run(client, actions), /modo lectura/);
  assert.deepEqual(actions.calls, []);
  assert.deepEqual(client.calls.create, []);
});

test('runDemo ejecuta cada llamada pendiente una sola vez y repite resultado con misma idempotencia', async () => {
  const actions = makeActions();
  const action = pending('find', { value: 'DEMO-0001' });
  const client = scriptedClient({ polls: [
    { status: 'requires_action', actions: [action], turns: [turn('waiting')] },
    { status: 'requires_action', actions: [action], turns: [turn('completed')] }
  ] });
  const result = await run(client, actions);
  assert.deepEqual(actions.calls, [{ name: 'status', value: undefined }, { name: 'find', value: 'DEMO-0001' }]);
  assert.equal(client.calls.results.length, 2);
  assert.deepEqual(client.calls.results[0], client.calls.results[1]);
  const [{ events, key }] = client.calls.results;
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.deepEqual(events[0], {
    type: 'agent.session.input.tool_result', turn_id: turnId, call_id: 'call_find', success: true,
    output: JSON.stringify({ action: 'find', synthetic: true, value: 'DEMO-0001' })
  });
  assert.equal(result.toolCalls, 1);
  assert.equal(result.toolErrors, 0);
  assert.equal(result.synthetic, true);
  assert.deepEqual(client.calls.cancel, []);
});

test('runDemo devuelve fallo de tool prohibida o argumentos serializados sin efectos en el navegador', async () => {
  const actions = makeActions();
  const actionList = [
    ...['click', 'type', 'submit', 'upload'].map(name => pending(name)),
    pending('read', '{}', 'call_string_arguments'),
    pending('read', { password: 'synthetic-secret' }, 'call_password')
  ];
  const client = scriptedClient({ polls: [{ status: 'requires_action', actions: actionList, turns: [turn('completed')] }] });
  const result = await run(client, actions);
  assert.deepEqual(actions.calls, [{ name: 'status', value: undefined }]);
  assert.equal(result.toolErrors, actionList.length);
  assert.equal(result.toolCalls, actionList.length);
  for (const { events } of client.calls.results) {
    assert.equal(events[0].success, false);
    assert.equal(Object.hasOwn(events[0], 'output'), false);
    assert.doesNotMatch(events[0].error, /synthetic-secret/);
  }
});

test('runDemo no trata idle ni turnos de subagente como finalización', async () => {
  const client = scriptedClient({ polls: [
    { status: 'idle', turns: [turn('completed', { id: 'turn_child', subagent_id: 'subagent_1' })] },
    { status: 'idle', turns: [turn('in_progress')] },
    { status: 'idle', turns: [turn('completed')] }
  ] });
  const result = await run(client);
  assert.equal(result.turnId, turnId);
  assert.equal(client.calls.retrieve.length, 3);
  assert.equal(client.calls.items.length, 1);
});

test('runDemo mantiene el turno raíz elegido y pagina solo su respuesta final', async () => {
  const client = scriptedClient({ polls: [
    { status: 'in_progress', turns: [turn('in_progress')] },
    { status: 'idle', turns: [turn('completed', { id: 'turn_other' }), turn('completed')] }
  ], pages: [
    page([
      message('otro turno', { id: 'msg_other', turn_id: 'turn_other' }),
      message('comentario', { id: 'msg_comment', phase: 'commentary' }),
      message('usuario', { id: 'msg_user', role: 'user' }),
      message('incompleto', { id: 'msg_incomplete', status: 'incomplete' }),
      message('Primera parte.', { id: 'msg_first', content: [{ type: 'output_text', text: 'Primera parte.' }, { type: 'input_text', text: 'no incluir' }] })
    ], { has_more: true, last_id: 'msg_first' }),
    page([message('Segunda parte.', { id: 'msg_second' })])
  ] });
  const result = await run(client);
  assert.equal(result.turnId, turnId);
  assert.equal(result.text, 'Primera parte.\nSegunda parte.');
  assert.deepEqual(client.calls.items, [{ id: sessionId, after: undefined }, { id: sessionId, after: 'msg_first' }]);
});

for (const failure of ['failed', 'cancelled']) {
  test(`runDemo informa turno ${failure} y solicita cancelación`, async () => {
    const client = scriptedClient({ polls: [{ status: 'idle', turns: [turn(failure)] }] });
    await assert.rejects(run(client), new RegExp(failure));
    assert.deepEqual(client.calls.items, []);
    assert.deepEqual(client.calls.cancel, [sessionId]);
  });
}

test('runDemo cancela al abortar después de crear la sesión', async () => {
  const controller = new AbortController();
  const client = scriptedClient();
  const create = client.create;
  client.create = async (...args) => {
    const created = await create(...args);
    controller.abort();
    return created;
  };
  await assert.rejects(run(client, makeActions(), { signal: controller.signal }), /interrumpida/);
  assert.deepEqual(client.calls.retrieve, []);
  assert.deepEqual(client.calls.cancel, [sessionId]);
});

test('runDemo cancela si se vuelve al modo manual durante una tool', async () => {
  const actions = makeActions();
  const execute = actions.execute;
  actions.execute = async (name, value) => {
    const result = await execute(name, value);
    if (name === 'read') actions.locked = false;
    return result;
  };
  const client = scriptedClient({ polls: [{ status: 'requires_action', actions: [pending('read')] }] });
  await assert.rejects(run(client, actions), /lectura desactivado/);
  assert.deepEqual(client.calls.results, []);
  assert.deepEqual(client.calls.cancel, [sessionId]);
});

test('runDemo cancela si se desbloquea mientras llega el resultado final', async () => {
  const actions = makeActions();
  const client = scriptedClient();
  const items = client.items;
  client.items = async (...args) => {
    const result = await items(...args);
    actions.locked = false;
    return result;
  };
  await assert.rejects(run(client, actions), /modo manual|lectura desactivado/);
  assert.deepEqual(client.calls.cancel, [sessionId]);
});

test('runDemo cancela si se aborta mientras llega el resultado final', async () => {
  const controller = new AbortController();
  const client = scriptedClient();
  const items = client.items;
  client.items = async (...args) => {
    const result = await items(...args);
    controller.abort();
    return result;
  };
  await assert.rejects(run(client, makeActions(), { signal: controller.signal }), /interrumpida/);
  assert.deepEqual(client.calls.cancel, [sessionId]);
});

test('runDemo no reejecuta una llamada repetida con argumentos diferentes', async () => {
  const actions = makeActions();
  const client = scriptedClient({ polls: [
    { status: 'requires_action', actions: [pending('find', { value: 'DEMO-0001' })] },
    { status: 'requires_action', actions: [pending('find', { value: 'DEMO-0002' })] }
  ] });
  await assert.rejects(run(client, actions), /argumentos distintos/);
  assert.equal(actions.calls.filter(c => c.name === 'find').length, 1);
  assert.deepEqual(client.calls.cancel, [sessionId]);
});

test('runDemo limita herramientas y cancela capacidades distintas a function_call', async () => {
  const actions = makeActions();
  const capped = scriptedClient({ polls: [{ status: 'requires_action', actions: [pending('read'), pending('find', { value: 'DEMO-0001' })] }] });
  await assert.rejects(run(capped, actions, { maxCalls: 1 }), /Límite de tools/);
  assert.equal(actions.calls.filter(c => c.name !== 'status').length, 1);
  assert.deepEqual(capped.calls.cancel, [sessionId]);
  const external = scriptedClient({ polls: [{ status: 'requires_action', actions: [{ type: 'environment_connection', environment_id: 'env_never_connect' }] }] });
  await assert.rejects(run(external), /capacidad no permitida/);
  assert.deepEqual(external.calls.cancel, [sessionId]);
});

test('runDemo rechaza paginación que no avanza y no declara una respuesta parcial', async () => {
  const client = scriptedClient({ pages: [
    page([message('Primera parte.')], { has_more: true, last_id: 'msg_stuck' }),
    page([message('Parte repetida.')], { has_more: true, last_id: 'msg_stuck' })
  ] });
  await assert.rejects(run(client), /Paginación inválida/);
  assert.deepEqual(client.calls.cancel, [sessionId]);
});
