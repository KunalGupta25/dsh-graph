import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { AiBackend } from '../src/host/ai.js';

describe('AiBackend', () => {
  let ai;
  let mockCtx;

  beforeEach(() => {
    mockCtx = {
      credentials: {
        get: mock.fn((key) => key === 'DEEPSEEK_API_KEY' ? 'test-key' : undefined),
      },
      llm: {
        listModels: async () => [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }],
      },
    };
    ai = new AiBackend(mockCtx, {});
  });

  test('_resolved uses ctx.credentials when available', () => {
    const r = ai._resolved();
    assert.strictEqual(r.apiKey, 'test-key');
    assert.strictEqual(r.keySource, 'ctx.credentials:deepseek');
  });

  test('getSettings does not expose keySource', () => {
    const s = ai.getSettings();
    assert.ok(!('keySource' in s));
    assert.strictEqual(s.hasKey, true);
    assert.strictEqual(s.apiKey, '••••••••');
  });

  test('listModels uses ctx.llm.listModels first', async () => {
    const models = await ai.listModels();
    // ctx.llm.listModels is checked via typeof, so it needs to be a function on the mock
    assert.deepStrictEqual(models.models, ['deepseek-flash', 'deepseek-v4-pro']);
    assert.strictEqual(models.live, true);
  });
});