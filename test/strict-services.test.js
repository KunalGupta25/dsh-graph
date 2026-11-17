import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CordisGraphScanner } from '../src/host/scanner.js';
import { AiBackend } from '../src/host/ai.js';
import { MarketplaceBridge } from '../src/host/market-bridge.js';
import { HarnessOps } from '../src/host/ops.js';

// DSH throws `cannot get property "<service>" without inject` when code reads a service that the plugin
// did not declare in `inject` as a property (ctx.webServer). ctx.get('<service>') is always allowed and
// returns undefined when the service is missing. This context behaves the same way.
const SERVICES = /^(webServer|credentials|llm|pluginMarket|pluginManager|configEditor|loader|tools|skills|settings|storage|fs|shell)$/;

function strictCtx(provided = {}) {
  const base = { get: (name) => provided[name] };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && SERVICES.test(prop)) throw new Error(`cannot get property "${prop}" without inject`);
      return undefined;
    },
  });
}

describe('services are read with ctx.get(), never as properties', () => {
  test('MarketplaceBridge.discoverUpdateApi', async () => {
    const market = new MarketplaceBridge(strictCtx({ webServer: { register() {} } }), {});
    assert.strictEqual(await market.discoverUpdateApi(), null);
    assert.strictEqual(await new MarketplaceBridge(strictCtx(), {}).discoverUpdateApi(), null);
  });

  test('MarketplaceBridge.fromPluginMarket without a pluginMarket service fails softly', async () => {
    // search() records this as a per-source status line; it must be this plain error, not the strict-access one.
    const market = new MarketplaceBridge(strictCtx(), {});
    await assert.rejects(() => market.fromPluginMarket('x'), (e) => /service unavailable/.test(e.message) && !/without inject/.test(e.message));
  });

  test('AiBackend settings and model list without credentials / llm services', async () => {
    const ai = new AiBackend(strictCtx(), {});
    assert.doesNotThrow(() => ai.getSettings());
    const models = await ai.listModels();
    assert.ok(Array.isArray(models.models) && models.models.length > 0);
  });

  test('AiBackend reads the key from the credentials service when present', () => {
    const prev = { a: process.env.DEEPSEEK_API_KEY, b: process.env.DSH_STUDIO_AI_KEY, h: process.env.DSH_HOME };
    delete process.env.DEEPSEEK_API_KEY; delete process.env.DSH_STUDIO_AI_KEY; process.env.DSH_HOME = '/nonexistent-dsh-home';
    try {
      const ai = new AiBackend(strictCtx({ credentials: { get: (k) => (k === 'DEEPSEEK_API_KEY' ? 'sk-test' : undefined) } }), {});
      assert.strictEqual(ai.getSettings().hasKey, true);
    } finally {
      for (const [k, v] of [['DEEPSEEK_API_KEY', prev.a], ['DSH_STUDIO_AI_KEY', prev.b], ['DSH_HOME', prev.h]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });

  test('CordisGraphScanner.scan without loader / pluginManager / skills services', async () => {
    const scanner = new CordisGraphScanner(strictCtx({ tools: {} }), {});
    const graph = await scanner.scan();
    assert.ok(Array.isArray(graph.nodes) && Array.isArray(graph.edges));
    assert.ok(graph.nodes.some((n) => n.id === 'core:tools'), 'a provided core service is still listed');
  });

  test('CordisGraphScanner.scan uses the loader service when provided', async () => {
    const entry = { options: { id: 'demo', name: '@local/demo', config: {} }, fiber: {} };
    const loader = { *entries() { yield entry; } };
    const graph = await new CordisGraphScanner(strictCtx({ loader }), {}).scan();
    assert.ok(graph.nodes.some((n) => n.id === 'row:demo'), 'live loader entries must be found through ctx.get');
    assert.strictEqual(await new CordisGraphScanner(strictCtx({ loader }), {}).findEntry('demo'), entry);
  });

  test('HarnessOps reports a missing configEditor instead of throwing', async () => {
    const scanner = { findEntry: async () => ({ options: { config: {} } }) };
    const ops = new HarnessOps(strictCtx(), { scanner, creator: {}, market: {} });
    const res = await ops.setConfig('demo', { a: 1 });
    assert.strictEqual(res.ok, false);
  });
});
