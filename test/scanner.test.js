import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { CordisGraphScanner } from '../src/host/scanner.js';

describe('CordisGraphScanner', () => {
  let scanner;
  let mockCtx;

  beforeEach(() => {
    const mockLoader = {
      entries: function* () {
        yield { id: 'test-plugin', options: { id: 'test-plugin', name: 'Test Plugin', config: { key: 'value' }, disabled: false } };
      },
    };
    mockCtx = {
      get: mock.fn((key) => {
        if (key === 'tools') return { register: mock.fn(), list: async () => ['tool1'] };
        if (key === 'sessions') return { create: mock.fn() };
        if (key === 'agents') return { create: mock.fn() };
        if (key === 'llm') return { registerAdapter: mock.fn() };
        if (key === 'skills') return { list: mock.fn() };
        if (key === 'subagents') return { spawn: mock.fn() };
        if (key === 'pluginManager') return { list: mock.fn() };
        if (key === 'pluginMarket') return { search: mock.fn() };
        if (key === 'settings') return { get: mock.fn() };
        if (key === 'credentials') return { get: mock.fn() };
        if (key === 'storage') return { get: mock.fn() };
        if (key === 'fs') return { read: mock.fn() };
        if (key === 'shell') return { exec: mock.fn() };
        if (key === 'webServer') return { register: mock.fn() };
        if (key === 'workflowEngine') return { create: mock.fn() };
        if (key === 'loader') return mockLoader;
        return undefined;
      }),
    };
    scanner = new CordisGraphScanner(mockCtx, { skillRoots: [] });
  });

  test('scan returns core services', async () => {
    const graph = await scanner.scan();
    assert.ok(graph.nodes.length > 0);
    const coreNodes = graph.nodes.filter(n => n.type === 'core');
    assert.ok(coreNodes.length > 0);
  });

  test('scan includes live loader entries', async () => {
    const graph = await scanner.scan();
    // Nodes from loader entries have state 'active' (not 'declared' or 'disabled')
    const liveNodes = graph.nodes.filter(n => n.state === 'active');
    assert.ok(liveNodes.length > 0);
  });

  test('loaderEntries handles sync generator', async () => {
    const sources = {};
    const entries = await scanner.loaderEntries(sources);
    assert.ok(Array.isArray(entries));
    assert.ok(sources.loader === true);
  });

  test('findEntry returns entry by rowId', async () => {
    const entry = await scanner.findEntry('test-plugin');
    assert.ok(entry);
    assert.strictEqual(entry.options.id, 'test-plugin');
  });
});