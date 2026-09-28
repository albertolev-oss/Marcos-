// Official REST contract: /api/docs/guides/agents-api/tools/functions.
// Keep the API host fixed; browser/page input cannot redirect credentials.
export function createAgentsClient({ apiKey, fetchImpl = fetch, requestTimeoutMs = 15_000 }) {
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY en el servidor');
  const id = value => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new Error('Identificador de Agents API inválido');
    return value;
  };
  async function request(path, { method = 'GET', body, signal, idempotencyKey } = {}) {
    const timeout = AbortSignal.timeout(requestTimeoutMs);
    const response = await fetchImpl(`https://api.openai.com/v1/agents/sessions${path}`, {
      method, redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Beta': 'agents=v1',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(`Agents API HTTP ${response.status}`);
    const text = await response.text();
    if (!text) return undefined; // events.create returns 202 with no body.
    try { return JSON.parse(text); } catch { throw new Error('Respuesta de Agents API inválida'); }
  }
  return {
    create: (body, signal) => request('', { method: 'POST', body, signal }),
    retrieve: (sessionId, signal) => request(`/${id(sessionId)}`, { signal }),
    turns: (sessionId, signal) => request(`/${id(sessionId)}/turns?order=desc&limit=100`, { signal }),
    items: (sessionId, after, signal) => request(`/${id(sessionId)}/items?order=asc&limit=100${after ? `&after=${id(after)}` : ''}`, { signal }),
    results: (sessionId, events, key, signal) => request(`/${id(sessionId)}/events`, { method: 'POST', body: { events }, idempotencyKey: key, signal }),
    cancel: sessionId => request(`/${id(sessionId)}/events`, { method: 'POST', body: { events: [{ type: 'agent.session.input.cancel' }] } })
  };
}
