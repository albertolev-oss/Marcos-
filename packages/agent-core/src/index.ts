import { detectAuthentication, isSensitiveInstruction, requireConfirmation, type DomElement } from '../../security/src/index.ts';

export const ALLOWED_ACTIONS = ['navigate','click','type','select','scroll','read','wait','screenshot'] as const;
export type AgentAction = { kind: typeof ALLOWED_ACTIONS[number]; target?: string; value?: string };
export type AgentDecision = { status: 'ready'|'paused'|'blocked'; message: string; actions: AgentAction[] };

// Page text is deliberately never parsed as an instruction. Only the user's text enters this function.
export function planInstruction(userInstruction: string, dom: DomElement[], allowWrites = false): AgentDecision {
  const auth = detectAuthentication(dom);
  if (auth) return { status: 'paused', message: auth, actions: [] };
  if (isSensitiveInstruction(userInstruction)) {
    const decision = requireConfirmation('modify', allowWrites);
    return { status: decision === 'blocked' ? 'blocked' : 'paused', message: decision === 'blocked' ? 'Modo lectura: la modificación clínica está bloqueada' : 'Confirmación explícita requerida', actions: [] };
  }
  const query = userInstruction.match(/(?:busc[aá]|buscar).*?(?:DNI\s*)?(\d{7,8}|[\p{L}][\p{L}\s]{2,})/iu)?.[1]?.trim();
  if (query) return { status: 'ready', message: 'Búsqueda de solo lectura preparada', actions: [{kind:'click',target:'search'},{kind:'type',target:'search',value:query},{kind:'click',target:'buscar'},{kind:'read',target:'results'}] };
  return { status: 'ready', message: 'Lectura preparada', actions: [{kind:'read',target:'main'}] };
}

export class ActionQueue {
  private stopped = false;
  stop() { this.stopped = true; }
  resume() { this.stopped = false; }
  async run(actions: AgentAction[], execute: (a: AgentAction) => Promise<void>) {
    for (const action of actions) { if (this.stopped) break; await execute(action); }
  }
}
