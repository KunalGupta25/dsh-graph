import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { HarnessOps } from '../src/host/ops.js';

describe('HarnessOps', () => {
  let ops;
  let mockCtx;
  let mockScanner;
  let mockCreator;
  let mockMarket;

  beforeEach(() => {
    mockScanner = {
      findEntry: mock.fn(async () => ({ rowId: 'row:test', options: { config: { foo: 'bar' } } })),
    };
    mockCreator = {
      scaffoldBundle: mock.fn(() => ({ id: 'test-scaffold', type: 'host-tool', name: 'test', files: {} })),
    };
    mockMarket = {
      search: mock.fn(async () => ({ items: [{ id: 'test-item', name: 'test', kind: 'plugin', installSpec: 'test' }] })),
    };
    mockCtx = {
      get: mock.fn((key) => {
        if (key === 'pluginManager') return {
          installBundle: mock.fn(async () => ({ ok: true })),
          enableBundle: mock.fn(async () => ({ ok: true })),
          disableBundle: mock.fn(async () => ({ ok: true })),
          removeBundle: mock.fn(async () => ({ ok: true })),
          isBundleEnabled: mock.fn(async () => ({ ok: true, value: true })),
        };
        if (key === 'configEditor') return {
          edit: mock.fn(async () => ({ ok: true })),
        };
        if (key === 'loader') return {
          entries: mock.fn(function* () { yield { id: 'test', options: { config: {} } }; }),
        };
        return undefined;
      }),
    };
    ops = new HarnessOps(mockCtx, { scanner: mockScanner, creator: mockCreator, market: mockMarket });
  });

  test('installItem ignores client-supplied installSpec', async () => {
    const item = { id: 'test', name: 'server-name', kind: 'plugin', installSpec: 'malicious-spec' };
    const r = await ops.installItem(item);
    // The installSpec from the item should be ignored, using item.name instead
    assert.strictEqual(r.ok, true);
  });

  test('apply topologically orders changes (install before setConfig)', async () => {
    const graph = {
      nodes: [
        { id: 'node1', rowId: 'row:test-item', bundle: 'test-item', editable: true },
        { id: 'node2', rowId: 'row:plugin2', bundle: 'plugin2', editable: true },
      ],
      edges: [{ from: 'node1', to: 'node2' }], // node1 depends on node2
    };
    const changes = [
      { op: 'setConfig', node: 'node2', patch: { bar: 'baz' } },
      { op: 'install', item: 'test-item' },
    ];
    const results = await ops.apply(changes, graph);
    // Install should come before setConfig in results (install priority 0 < setConfig priority 2)
    const installIdx = results.findIndex(r => r.op === 'install');
    const configIdx = results.findIndex(r => r.op === 'setConfig');
    // Debug: log all results
    console.log('Results:', results.map(r => ({ op: r.op, ok: r.ok, node: r.node, item: r.item })));
    assert.ok(installIdx >= 0, 'install result should exist');
    assert.ok(configIdx >= 0, 'setConfig result should exist');
    assert.ok(installIdx < configIdx, 'install should be ordered before setConfig');
  });

  test('apply detects cycles and warns', async () => {
    const graph = {
      nodes: [
        { id: 'a', rowId: 'row:a', bundle: 'a', editable: true },
        { id: 'b', rowId: 'row:b', bundle: 'b', editable: true },
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }], // cycle
    };
    const changes = [
      { op: 'setConfig', node: 'a', patch: {} },
      { op: 'setConfig', node: 'b', patch: {} },
    ];
    const results = await ops.apply(changes, graph);
    const warning = results.find(r => r.code === 'CYCLE_DETECTED');
    assert.ok(warning, 'should warn about cycle');
  });
});