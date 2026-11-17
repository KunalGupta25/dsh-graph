import path from 'node:path';
import { studioDir, readJsonFile, writeJsonFile } from './util.js';

// The assistant has no provider, key or endpoint of its own. It sends every request through the harness's
// model service (`ctx.llm`), so it uses exactly the providers and credentials already set up on the dsh
// settings page. All this file stores is which provider/model the user last picked in the panel.

const CHAT_TIMEOUT_MS = 120000;
const CATALOG_TIMEOUT_MS = 10000;
const CREDENTIAL_CODES = new Set(['MISSING_CREDENTIAL', 'INVALID_CREDENTIAL', 'AUTH']);

export const SYSTEM_PROMPT = `You are the assistant inside "Workflow Studio", a node-graph editor for DeepSeek Harness (DSH).
The user's harness is given as JSON (nodes = plugins, MCP connections, skills, presets, services; plus marketplace results).
Help them compare marketplace plugins, plan harness changes and design new plugins/MCP connections/skills.
Rules:
- Be concise. Only cite facts present in the provided context; say when something is unknown.
- Never ask for or repeat secrets.
- To propose changes, append ONE fenced block tagged dsh-actions containing a JSON array. Nothing is applied until the user reviews and applies it. Allowed actions:
  {"op":"install","item":"<marketplace item id>"}
  {"op":"setConfig","node":"<node id>","patch":{"field":"value"}}
  {"op":"toggle","node":"<node id>","enabled":false}
  {"op":"remove","node":"<node id>"}
  {"op":"scaffold","spec":{"type":"host-tool|decoration|mcp|preset|skill","name":"...","title":"...","description":"...", "url":"(mcp)", "command":"(mcp stdio)", "args":[]}}
  {"op":"compare","items":["<id>","<id>"]}
Propose only what the user asked for.`;

function coded(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Request-only user input cannot carry assistant turns (durable messages need ids and sources), so earlier
 * turns are folded into one user message and the latest message is stated last.
 */
function buildPrompt(messages) {
  const turns = (Array.isArray(messages) ? messages : []).slice(-20)
    .map((m) => ({ who: m?.role === 'assistant' ? 'Assistant' : 'User', text: String(m?.content || '').slice(0, 8000) }))
    .filter((t) => t.text.trim());
  const last = turns.pop();
  if (!last || last.who !== 'User') throw coded('There is no message to send.', 'AI_ERROR');
  if (!turns.length) return last.text;
  return `Earlier in this conversation:\n${turns.map((t) => `${t.who}: ${t.text}`).join('\n\n')}\n\nLatest user message:\n${last.text}`;
}

/** Fenced dsh-actions block first; a bare JSON object {text, actions} is accepted as a fallback. */
function parseReply(content) {
  const fenced = AiBackend.parse(content);
  if (fenced.actions.length || !/^\s*\{/.test(content)) return fenced;
  try {
    const obj = JSON.parse(content);
    if (obj && typeof obj === 'object' && typeof obj.text === 'string') {
      return { text: obj.text, actions: Array.isArray(obj.actions) ? obj.actions.filter((a) => a && typeof a.op === 'string') : [] };
    }
  } catch { /* plain text */ }
  return fenced;
}

export class AiBackend {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.options = options;
    this.file = path.join(studioDir(), 'ai.json');
  }

  /** The harness model service. Read with ctx.get(): reading `ctx.llm` as a property throws "without inject". */
  _llm() {
    return typeof this.ctx?.get === 'function' ? this.ctx.get('llm') : undefined;
  }

  /** The provider/model last chosen in the panel (or set in the plugin's config row). */
  _saved() {
    const s = readJsonFile(this.file, {}) || {};
    if (str(s.provider)) return { provider: str(s.provider), model: str(s.model) };
    const o = this.options || {};
    return { provider: str(o.provider), model: str(o.model) };
  }

  /** Provider routes the harness has registered right now, in registration order. */
  _providers() {
    const llm = this._llm();
    if (!llm || typeof llm.listProviders !== 'function') return [];
    try {
      return (llm.listProviders() || [])
        .filter((p) => p && typeof p.id === 'string' && p.id)
        .map((p) => ({ id: p.id, name: p.name || p.id }));
    } catch { return []; }
  }

  /** Models one provider advertises. The catalog is advisory: some providers list none, and any id may still work. */
  async _modelsFor(provider) {
    const llm = this._llm();
    try {
      const list = await withTimeout(Promise.resolve().then(() => llm.listModels(provider)), CATALOG_TIMEOUT_MS, 'The model list');
      return { models: (list || []).filter((m) => m && m.id).map((m) => ({ id: m.id, name: m.name || m.id })) };
    } catch (e) {
      return { models: [], error: String(e?.message || e).slice(0, 200) };
    }
  }

  _pick(providers, wanted) {
    const hit = providers.find((p) => p.id === wanted.provider);
    if (hit) return { provider: hit.id, model: wanted.model || hit.models[0]?.id || '' };
    const first = providers.find((p) => p.models.length) || providers[0];
    return first ? { provider: first.id, model: first.models[0]?.id || '' } : { provider: '', model: '' };
  }

  /** Settings safe to send to the browser: the saved choice only, never a credential. */
  getSettings() {
    const saved = this._saved();
    const providers = this._providers();
    const known = providers.some((p) => p.id === saved.provider);
    return { provider: known ? saved.provider : '', model: known ? saved.model : '', hasProvider: providers.length > 0 };
  }

  /** Remembers the provider/model choice. Rewrites the file, which also drops any key an older version stored. */
  saveSettings(next = {}) {
    const cur = this._stored();
    const provider = str(next.provider) || cur.provider;
    const model = str(next.model) || (str(next.provider) && str(next.provider) !== cur.provider ? '' : cur.model);
    const out = {};
    if (provider) out.provider = provider.slice(0, 200);
    if (model) out.model = model.slice(0, 200);
    writeJsonFile(this.file, out, 0o600);
    return this.getSettings();
  }

  _stored() {
    const s = readJsonFile(this.file, {}) || {};
    return { provider: str(s.provider), model: str(s.model) };
  }

  /** Providers with their models, plus the selection the panel should start from. */
  async listModels() {
    const providers = await Promise.all(this._providers().map(async (p) => ({ ...p, ...(await this._modelsFor(p.id)) })));
    return { providers, current: this._pick(providers, this._saved()) };
  }

  async _resolve(provider, model) {
    const providers = this._providers();
    if (!providers.length) {
      throw coded('No model provider is available in this harness. Add one on the dsh Models settings page, then try again.', 'NO_PROVIDER');
    }
    const requested = str(provider);
    if (requested && !providers.some((p) => p.id === requested)) {
      throw coded(`The provider "${requested}" is not available in this harness. Pick another one in the panel.`, 'NO_PROVIDER');
    }
    const wanted = requested ? { provider: requested, model: str(model) } : this._saved();
    if (wanted.provider && wanted.model && providers.some((p) => p.id === wanted.provider)) return wanted;
    const withModels = await Promise.all(providers.map(async (p) => ({ ...p, ...(await this._modelsFor(p.id)) })));
    const pick = this._pick(withModels, wanted);
    if (!pick.provider || !pick.model) throw coded('Choose a model for the assistant in the panel.', 'NO_PROVIDER');
    return pick;
  }

  _failure(failure, provider, timedOut) {
    if (timedOut) return coded(`The model did not answer within ${CHAT_TIMEOUT_MS / 1000} seconds.`, 'TIMEOUT');
    const code = failure.code || 'AI_ERROR';
    if (CREDENTIAL_CODES.has(code)) {
      return coded(`The provider "${provider}" has no working credential. Check it on the dsh Models settings page.`, code);
    }
    return coded(String(failure.message || 'The model request failed.').slice(0, 300), code);
  }

  /**
   * @param {{role:string,content:string}[]} messages  user/assistant turns
   * @param {{provider?:string, model?:string, context?:object}} opts
   * @returns {Promise<{text:string, actions:Array, provider:string, model:string, usage?:object}>}
   */
  async chat(messages, opts = {}) {
    const llm = this._llm();
    if (!llm || typeof llm.stream !== 'function') {
      throw coded('The harness model service is not available. Check that a model provider is enabled, then try again.', 'NO_PROVIDER');
    }
    const { provider, model } = await this._resolve(opts.provider, opts.model);
    const prompt = buildPrompt(messages);
    const system = `${SYSTEM_PROMPT}\n\nCONTEXT:\n${JSON.stringify(opts.context || {}).slice(0, 60000)}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CHAT_TIMEOUT_MS);
    let text = '';
    let usage;
    let failure;
    try {
      const stream = llm.stream({
        provider, model, system, signal: ac.signal,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      });
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') text += chunk.text;
        else if (chunk.type === 'usage') usage = chunk.usage;
        else if (chunk.type === 'finish' && (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted')) {
          failure = chunk.reason.failure || { message: `The request ${chunk.reason.kind}.`, code: chunk.reason.kind.toUpperCase() };
        }
      }
    } catch (e) {
      failure ||= { message: e instanceof Error ? e.message : String(e), code: e?.code };
    } finally {
      clearTimeout(timer);
    }
    if (failure) throw this._failure(failure, provider, ac.signal.aborted);
    if (!text.trim()) throw coded(`The model "${model}" returned an empty reply.`, 'EMPTY_RESPONSE');
    return { ...parseReply(text), provider, model, usage };
  }

  /** Splits the reply into display text and structured actions. */
  static parse(content) {
    const actions = [];
    const text = String(content).replace(/```dsh-actions\s*([\s\S]*?)```/g, (_m, body) => {
      try {
        const arr = JSON.parse(body);
        if (Array.isArray(arr)) for (const a of arr) if (a && typeof a.op === 'string') actions.push(a);
      } catch { /* ignore malformed block */ }
      return '';
    }).trim();
    return { text, actions };
  }
}
