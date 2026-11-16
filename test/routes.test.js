import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { createRouter, registerRoutes } from '../src/host/routes.js';

describe('routes', () => {
  test('createRouter returns handle and base', () => {
    const mockStudio = {
      getGraph: async () => ({ nodes: [], edges: [] }),
      searchMarketplace: async () => ({ items: [], status: {} }),
      findAlternatives: async () => [],
      scaffoldPlugin: async () => ({}),
      generatePatch: () => '',
      computeDiff: () => ({ changed: false, lines: [], text: '' }),
      applyChanges: async () => [],
    };
    const mockAi = {
      chat: async () => ({ text: 'ok', actions: [], model: 'test' }),
      listModels: async () => ({ models: [], current: '' }),
    };
    const mockOps = {
      apply: async () => [],
    };
    const mockCtx = {
      connection: { requestRejection: () => false },
      webServer: { register: () => () => {} },
      on: () => {},
    };

    const router = createRouter({ ctx: mockCtx, studio: mockStudio, ai: mockAi, ops: mockOps });
    assert.strictEqual(typeof router.handle, 'function');
    assert.strictEqual(router.base, '/api/workflow-studio');
  });

  test('registerRoutes handles missing webServer', () => {
    const router = createRouter({ ctx: {}, studio: {}, ai: {}, ops: {} });
    const result = registerRoutes({}, router);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(typeof result.dispose, 'function');
  });
});