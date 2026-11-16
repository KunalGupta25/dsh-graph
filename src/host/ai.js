import { studioDir, readJsonFile, writeJsonFile, SECRET_MASK, dshHome } from './util.js';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' };
const FALLBACK_MODELS = ['deepseek-flash', 'deepseek-v4-pro'];

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

    // Use ctx.credentials if available (DSH's built-in credential store)
    if (!apiKey && this.ctx?.credentials) {
      try {
        const creds = this.ctx.credentials;
        if (typeof creds.get === 'function') {
          const dk = creds.get('DEEPSEEK_API_KEY');
          const ok = creds.get('OPENROUTER_API_KEY');
          if (dk) { apiKey = dk; keySource = 'ctx.credentials:deepseek'; }
          else if (ok) { apiKey = ok; keySource = 'ctx.credentials:openrouter'; }
        }
      } catch { /* ignore credential errors */ }
    }

    // Fallback: search ~/.dsh/.credentials.yaml (legacy)
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
    // Do not expose keySource details beyond a safe boolean (AGENTS.md: never expose internals)
    return { baseUrl: r.baseUrl, model: r.model, hasKey: !!r.apiKey, apiKey: r.apiKey ? SECRET_MASK : '' };
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
    // Try DSH's LLM registry first (ctx.llm.listModels)
    if (this.ctx?.llm && typeof this.ctx.llm.listModels === 'function') {
      try {
        const res = await this.ctx.llm.listModels();
        if (res && Array.isArray(res)) {
          return { models: res.map((m) => m.id || m.name).filter(Boolean), current: this._resolved().model, live: true };
        }
      } catch { /* fall through */ }
    }
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
   * @param {{model?:string, context?:object, tools?:Array}} opts
   * @returns {{text:string, actions:Array, model:string, usage?:object, reasoningContent?:string}}
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
    const hasTools = Array.isArray(opts.tools) && opts.tools.length > 0;
    const body = {
      model,
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXT:\n${ctxJson}` },
        ...messages.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 8000) })),
      ],
      stream: false,
      // Thinking is ON by default in DeepSeek API; disable to avoid temperature being ignored and reduce latency
      thinking: { type: 'disabled' },
      // Request structured JSON output instead of fragile fenced-block parsing
      response_format: { type: 'json_object' },
    };
    // When tools are present, the API requires reasoning_content to be echoed back on subsequent turns
    // We don't render it, but we return it so the caller can include it in the next request if needed
    const res = await this._fetchWithRetry(`${r.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${r.apiKey}` },
      body: JSON.stringify(body),
    }, 120000);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      const err = new Error(`AI request failed (HTTP ${res.status}) ${t.slice(0, 200)}`);
      err.code = res.status === 429 ? 'RATE_LIMIT' : res.status >= 500 ? 'SERVER_ERROR' : 'AI_ERROR';
      throw err;
    }
    const j = await res.json();
    const msg = j.choices?.[0]?.message || {};
    const content = msg.content || '';
    const reasoningContent = msg.reasoning_content || '';
    // Parse structured response (expecting JSON with text and actions fields)
    let parsed = { text: content, actions: [] };
    try {
      const obj = JSON.parse(content);
      if (obj && typeof obj === 'object') {
        parsed.text = obj.text || content;
        parsed.actions = Array.isArray(obj.actions) ? obj.actions : [];
      }
    } catch {
      // Fallback to legacy fenced-block parsing for backward compatibility
      parsed = AiBackend.parse(content);
    }
    return { ...parsed, model, usage: j.usage, reasoningContent };
  }

  /**
   * Fetch with retry/backoff for 429, 500, 502, 503, 504.
   * @param {string} url
   * @param {RequestInit} init
   * @param {number} timeoutMs
   * @returns {Promise<Response>}
   */
  async _fetchWithRetry(url, init, timeoutMs) {
    const maxRetries = 3;
    const baseDelay = 1000;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await this._fetch(url, init, timeoutMs);
      if (res.ok) return res;
      // Retry on rate limit or server errors
      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < maxRetries) {
        const retryAfter = res.headers.get('retry-after');
        const delay = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 30000) : baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    }
    return res;
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
