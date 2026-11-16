import { readBody, sendJson } from './util.js';

export const BASE = '/api/workflow-studio';

/**
 * HTTP API used by the Studio client. Registered through the documented `ctx.webServer.register`
 * (exact + prefix). Requests are checked with `ctx.connection.requestRejection` when available,
 * and mutating requests must be JSON (blocks cross-site form posts).
 */
export function createRouter({ ctx, studio, ai, ops }) {
  const routes = {
    'GET /graph': async () => studio.getGraph(),
    'POST /market': async (b) => studio.searchMarketplace(String(b.query || ''), String(b.kind || 'all')),
    'POST /alternatives': async (b) => {
      const { items } = await studio.searchMarketplace(String(b.query || b.target || ''), 'all');
      return { items: studio.findAlternatives(String(b.target || ''), items) };
    },
    'GET /ai/settings': async () => ai.getSettings(),
    'POST /ai/settings': async (b) => ai.saveSettings(b),
    'GET /ai/models': async () => ai.listModels(),
    'POST /ai/chat': async (b) => {
      const graph = await studio.getGraph();
      const compact = graph.nodes.map((n) => ({
        id: n.id, label: n.label, type: n.type, package: n.package, state: n.state, editable: n.editable,
        description: String(n.description || '').slice(0, 160),
      }));
      return ai.chat(Array.isArray(b.messages) ? b.messages : [], {
        model: b.model,
        context: { nodes: compact, selected: b.selected || null, market: (b.market || []).slice(0, 25) },
      });
    },
    'POST /diff': async (b) => {
      const patch = studio.generatePatch(b.staging || {});
      return { patch, diff: studio.computeDiff(String(b.baseline || ''), patch) };
    },
    'POST /scaffold': async (b) => studio.scaffoldPlugin(b.spec || {}),
    'POST /drafts/clean': async (b) => ops.cleanDraft(b.id || b.draft),
    'POST /apply': async (b) => {
      const graph = await studio.getGraph();
      return { results: await ops.apply(Array.isArray(b.changes) ? b.changes : [], graph) };
    },
  };

  async function handle(req, res) {
    try {
      const rejection = ctx.connection?.requestRejection?.(req);
      if (rejection) return sendJson(res, 403, { error: 'Forbidden' });
      const url = new URL(req.url || '/', 'http://localhost');
      const sub = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) || '/' : url.pathname;
      const method = (req.method || 'GET').toUpperCase();
      const fn = routes[`${method} ${sub}`];
      if (!fn) return sendJson(res, 404, { error: 'Not found' });
      let body = {};
      if (method === 'POST') {
        if (!/application\/json/i.test(String(req.headers?.['content-type'] || ''))) {
          return sendJson(res, 415, { error: 'JSON required' });
        }
        // Same-origin check (as dsh-market does): if the browser sent an Origin it must match Host.
        // An absent Origin is allowed; the host's requestRejection gate above remains the primary fence.
        const origin = req.headers?.origin;
        if (origin) {
          let ok = false;
          try { ok = new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase(); } catch { ok = false; }
          if (!ok) return sendJson(res, 403, { error: 'Cross-origin request refused' });
        }
        body = await readBody(req);
      }
      return sendJson(res, 200, await fn(body));
    } catch (e) {
      let code = 500;
      if (e?.code === 'NO_KEY') code = 400;
      else if (e?.code === 'BAD_JSON') code = 400;
      else if (e?.code === 'BODY_TOO_LARGE') code = 413;
      return sendJson(res, code, { error: e instanceof Error ? e.message : String(e), code: e?.code });
    }
  }

  return { handle, base: BASE };
}

/** 
 * Registers the router; returns a dispose function. Throws nothing when webServer is absent.
 * Verified: ws.register({ kind, path, handler }) signature matches @deepseek-ai/dsh-host-webserver/lib/index.js.
 */
export function registerRoutes(ctx, router) {
  const ws = ctx.get('webServer');
  if (!ws?.register) return { ok: false, dispose() {} };
  const disposers = [];
  for (const kind of ['exact', 'prefix']) {
    try {
      // Both exact and prefix accept router.base ('/api/workflow-studio').
      const d = ws.register({ kind, path: router.base, handler: router.handle });
      if (typeof d === 'function') disposers.push(d);
    } catch { /* route already registered or unsupported kind */ }
  }
  return { ok: true, dispose: () => disposers.forEach((d) => { try { d(); } catch { /* ignore */ } }) };
}
