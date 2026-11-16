import { studioDir, readJsonFile, writeJsonFile, SECRET_MASK, dshHome } from './util.js';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' };
const FALLBACK_MODELS = ['deepseek-chat', 'deepseek-reasoner'];

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

export class AiBackend {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.options = options;
    this.file = path.join(studioDir(), 'ai.json');
  }

  _stored() { return readJsonFile(this.file, {}) || {}; }

  _resolved() {
    const s = this._stored();
    const o = this.options || {};
    let apiKey = s.apiKey || o.apiKey || process.env.DSH_STUDIO_AI_KEY || process.env.DEEPSEEK_API_KEY || '';
    let baseUrl = s.baseUrl || o.baseUrl || process.env.DSH_STUDIO_AI_BASE_URL || DEFAULTS.baseUrl;
    let keySource = s.apiKey ? 'stored' : o.apiKey ? 'config' : (process.env.DSH_STUDIO_AI_KEY || process.env.DEEPSEEK_API_KEY) ? 'env' : 'none';

    // If still no key, search ~/.dsh/.credentials.yaml for available API keys
    if (!apiKey) {
      try {
        const credPath = path.join(dshHome(), '.credentials.yaml');
        if (fs.existsSync(credPath)) {
          const credText = fs.readFileSync(credPath, 'utf8');
          const mDs = /DEEPSEEK_API_KEY:\s*([^\r\n]+)/.exec(credText);
          const mOr = /OPENROUTER_API_KEY:\s*([^\r\n]+)/.exec(credText);
          if (mDs && mDs[1].trim()) {
            apiKey = mDs[1].trim().replace(/^['"]|['"]$/g, '');
            keySource = 'dsh-credentials:deepseek';
          } else if (mOr && mOr[1].trim()) {
            apiKey = mOr[1].trim().replace(/^['"]|['"]$/g, '');
            if (!s.baseUrl && !o.baseUrl && !process.env.DSH_STUDIO_AI_BASE_URL) {
              baseUrl = 'https://openrouter.ai/api/v1';
            }
            keySource = 'dsh-credentials:openrouter';
          }
        }
      } catch { /* ignore filesystem errors */ }
    }

    return {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      model: s.model || o.model || DEFAULTS.model,
      apiKey,
      keySource,
    };
  }

  /** Settings safe to send to the browser. */
  getSettings() {
    const r = this._resolved();
    return { baseUrl: r.baseUrl, model: r.model, hasKey: !!r.apiKey, keySource: r.keySource, apiKey: r.apiKey ? SECRET_MASK : '' };
  }

  saveSettings(next = {}) {
    const cur = this._stored();
    const out = { ...cur };
    if (typeof next.baseUrl === 'string' && /^https?:\/\//.test(next.baseUrl)) out.baseUrl = next.baseUrl.trim();
    if (typeof next.model === 'string' && next.model.trim()) out.model = next.model.trim();
    if (typeof next.apiKey === 'string' && next.apiKey !== SECRET_MASK) {
      if (next.apiKey.trim()) out.apiKey = next.apiKey.trim(); else delete out.apiKey;
    }
    writeJsonFile(this.file, out, 0o600);
    return this.getSettings();
  }

  async _fetch(url, init, timeoutMs = 60000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try { return await fetch(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
  }

  async listModels() {
    const r = this._resolved();
    if (!r.apiKey) return { models: FALLBACK_MODELS, current: r.model, live: false };
    try {
      const res = await this._fetch(`${r.baseUrl}/models`, { headers: { authorization: `Bearer ${r.apiKey}` } }, 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const ids = (j.data || []).map((m) => m.id).filter(Boolean);
      return { models: ids.length ? ids : FALLBACK_MODELS, current: r.model, live: ids.length > 0 };
    } catch (e) {
      return { models: FALLBACK_MODELS, current: r.model, live: false, error: String(e.message || e) };
    }
  }

  /**
   * @param {{role:string,content:string}[]} messages  user/assistant turns
   * @param {{model?:string, context?:object}} opts
   * @returns {{text:string, actions:Array, model:string}}
   */
  async chat(messages, opts = {}) {
    const r = this._resolved();
    if (!r.apiKey) {
      const err = new Error('No API key configured for the AI panel. Add one in the panel settings or set DEEPSEEK_API_KEY.');
      err.code = 'NO_KEY';
      throw err;
    }
    const model = opts.model || r.model;
    const ctxJson = JSON.stringify(opts.context || {}).slice(0, 60000);
    const body = {
      model,
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXT:\n${ctxJson}` },
        ...messages.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 8000) })),
      ],
      stream: false,
    };
    const res = await this._fetch(`${r.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${r.apiKey}` },
      body: JSON.stringify(body),
    }, 120000);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`AI request failed (HTTP ${res.status}) ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    const content = j.choices?.[0]?.message?.content || '';
    return { ...AiBackend.parse(content), model };
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
