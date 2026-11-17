import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Context } from '@deepseek-ai/cordis';
import * as plugin from '../index.js';

// FiberState from @deepseek-ai/cordis
const PENDING = 0;
const ACTIVE = 2;

/** A Cordis context with fake `tools` / `webServer` services that record what is registered. */
function makeHost({ tools = true, webServer = true } = {}) {
  const ctx = new Context();
  const seen = { tools: [], routes: [] };
  const fake = {
    tools: { register(def) { seen.tools.push(def.name); return () => { seen.tools.splice(seen.tools.indexOf(def.name), 1); }; } },
    webServer: { register(route) { seen.routes.push(route); return () => { seen.routes.splice(seen.routes.indexOf(route), 1); }; } },
  };
  if (tools) ctx.provide('tools', fake.tools);
  if (webServer) ctx.provide('webServer', fake.webServer);
  return { ctx, seen, fake };
}

/** Validate a row's config the way the Loader does: through the Standard Schema on `Config`. */
function resolveConfig(config) {
  const result = plugin.Config['~standard'].validate(config);
  assert.ok(!result.issues, `config rejected: ${JSON.stringify(result.issues)}`);
  return result.value;
}

const ROW_CONFIG = { enabled: true, allowLiveApply: true }; // what cordis.patch.yml inserts
const settle = () => new Promise((r) => setTimeout(r, 25));

function call(handler, { method = 'GET', url }) {
  return new Promise((resolve, reject) => {
    const req = { method, url, headers: {} };
    const res = {
      headersSent: false,
      writeHead(status) { this.status = status; this.headersSent = true; },
      end(body) { resolve({ status: this.status, body: JSON.parse(body) }); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

describe('Cordis v4 integration', () => {
  test('inject is a plain list of required service names', () => {
    // Cordis 4 treats every inject entry as required and has no "optional" form; an object such as
    // { optional: [...] } is read as services literally named "optional" and the plugin never starts.
    assert.ok(Array.isArray(plugin.inject), 'inject must be an array of service names');
    assert.ok(plugin.inject.every((s) => typeof s === 'string' && s.length > 0));
    for (const optionalService of ['pluginManager', 'pluginMarket', 'configEditor']) {
      assert.ok(!plugin.inject.includes(optionalService), `${optionalService} must be read lazily, not injected`);
    }
  });

  test('Config is a Standard Schema that accepts the row config', () => {
    assert.strictEqual(typeof plugin.Config['~standard']?.validate, 'function');
    const value = resolveConfig(ROW_CONFIG);
    assert.strictEqual(value.enabled, true);
    resolveConfig(undefined); // an empty row must validate too
  });

  test('activates with only tools + webServer (no pluginManager / pluginMarket / configEditor)', async () => {
    const { ctx } = makeHost();
    const fiber = ctx.plugin(plugin, resolveConfig(ROW_CONFIG));
    await settle();
    assert.strictEqual(fiber.state, ACTIVE);
  });

  test('registers the agent tools, the HTTP routes and the workflowStudio service', async () => {
    const { ctx, seen } = makeHost();
    ctx.plugin(plugin, resolveConfig(ROW_CONFIG));
    await settle();
    assert.deepStrictEqual(seen.tools.sort(), ['dsh_workflow_studio_graph', 'dsh_workflow_studio_market', 'dsh_workflow_studio_scaffold']);
    assert.deepStrictEqual(seen.routes.map((r) => r.kind).sort(), ['exact', 'prefix']);
    assert.ok(seen.routes.every((r) => r.path === '/api/workflow-studio'));
    assert.strictEqual(typeof ctx.get('workflowStudio')?.getGraph, 'function');
  });

  test('GET /api/workflow-studio/graph answers through the registered handler', async () => {
    const { ctx, seen } = makeHost();
    ctx.plugin(plugin, resolveConfig(ROW_CONFIG));
    await settle();
    const { status, body } = await call(seen.routes[0].handler, { url: '/api/workflow-studio/graph' });
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body.nodes) && Array.isArray(body.edges));
    const unknown = await call(seen.routes[0].handler, { url: '/api/workflow-studio/nope' });
    assert.strictEqual(unknown.status, 404);
  });

  test('stays active without webServer, and adds the routes once it appears', async () => {
    const { ctx, seen, fake } = makeHost({ webServer: false });
    const fiber = ctx.plugin(plugin, resolveConfig(ROW_CONFIG));
    await settle();
    assert.strictEqual(fiber.state, ACTIVE);
    assert.strictEqual(seen.tools.length, 3, 'agent tools work without the web UI');
    assert.strictEqual(seen.routes.length, 0);
    ctx.provide('webServer', fake.webServer);
    await settle();
    assert.strictEqual(seen.routes.length, 2, 'routes registered when webServer became available');
  });

  test('stays pending (visibly) when the tools service is missing', async () => {
    const { ctx } = makeHost({ tools: false });
    const fiber = ctx.plugin(plugin, resolveConfig(ROW_CONFIG));
    await settle();
    assert.strictEqual(fiber.state, PENDING);
  });

  test('disposing the plugin removes its routes, tools and service (reload-safe)', async () => {
    const { ctx, seen } = makeHost();
    const fiber = ctx.plugin(plugin, resolveConfig(ROW_CONFIG));
    await settle();
    assert.ok(seen.routes.length > 0 && seen.tools.length > 0);
    await fiber.dispose();
    assert.strictEqual(seen.routes.length, 0, 'routes leaked after dispose');
    assert.strictEqual(seen.tools.length, 0, 'tools leaked after dispose');
    assert.strictEqual(ctx.get('workflowStudio'), undefined, 'service leaked after dispose');
  });

  test('reloading the plugin registers everything again without conflicts', async () => {
    const { ctx, seen } = makeHost();
    const fiber = ctx.plugin(plugin, resolveConfig(ROW_CONFIG));
    await settle();
    await fiber.restart();
    await settle();
    assert.strictEqual(fiber.state, ACTIVE);
    assert.strictEqual(seen.routes.length, 2);
    assert.strictEqual(seen.tools.length, 3);
  });

  test('enabled: false loads nothing', async () => {
    const { ctx, seen } = makeHost();
    ctx.plugin(plugin, resolveConfig({ enabled: false }));
    await settle();
    assert.strictEqual(seen.tools.length + seen.routes.length, 0);
  });
});
