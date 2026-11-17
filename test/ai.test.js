import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AiBackend } from '../src/host/ai.js';

function makeLlm({ providers, models = {}, chunks, onStream } = {}) {
  return {
    listProviders: () => providers,
    listModels: async (id) => models[id] || [],
    stream(req) {
      onStream?.(req);
      return (async function* gen() { for (const c of chunks) yield c; })();
    },
  };
}

const ctxWith = (llm) => ({ get: (name) => (name === 'llm' ? llm : undefined) });

describe('AiBackend (uses the harness model service)', () => {
  let llm;
  let ai;

  beforeEach(() => {
    llm = makeLlm({
      providers: [{ id: 'deepseek', name: 'DeepSeek' }, { id: 'tencent' }],
      models: { deepseek: [{ id: 'deepseek-flash' }], tencent: [{ id: 'hy4-flash', name: 'HY4 Flash' }] },
      chunks: [{ type: 'text-delta', text: 'Hello' }, { type: 'finish', reason: { kind: 'stop' } }],
    });
    ai = new AiBackend(ctxWith(llm), {});
  });

  test('listModels returns every provider registered in the harness with its models', async () => {
    const r = await ai.listModels();
    assert.deepStrictEqual(r.providers.map((p) => p.id), ['deepseek', 'tencent']);
    assert.deepStrictEqual(r.providers[1].models, [{ id: 'hy4-flash', name: 'HY4 Flash' }]);
    assert.ok(r.current.provider);
    assert.ok(r.current.model);
  });

  test('getSettings never exposes credentials', () => {
    const s = ai.getSettings();
    assert.ok(!('apiKey' in s));
    assert.ok(!('keySource' in s));
    assert.strictEqual(s.hasProvider, true);
  });

  test('chat sends the request through ctx.llm with the chosen provider and model', async () => {
    let req;
    llm.stream = (r) => { req = r; return (async function* g() { yield { type: 'text-delta', text: 'Hi there' }; })(); };
    const r = await ai.chat([{ role: 'user', content: 'hello' }], { provider: 'tencent', model: 'hy4-flash' });
    assert.strictEqual(r.text, 'Hi there');
    assert.strictEqual(r.provider, 'tencent');
    assert.strictEqual(req.provider, 'tencent');
    assert.strictEqual(req.model, 'hy4-flash');
  });

  test('chat parses dsh-actions blocks', async () => {
    const reply = 'Sure.\n```dsh-actions\n[{"op":"toggle","node":"a","enabled":false}]\n```';
    llm.stream = () => (async function* g() { yield { type: 'text-delta', text: reply }; })();
    const r = await ai.chat([{ role: 'user', content: 'disable a' }], { provider: 'deepseek', model: 'deepseek-flash' });
    assert.strictEqual(r.text, 'Sure.');
    assert.deepStrictEqual(r.actions, [{ op: 'toggle', node: 'a', enabled: false }]);
  });

  test('chat rejects an unknown provider with NO_PROVIDER', async () => {
    await assert.rejects(
      ai.chat([{ role: 'user', content: 'x' }], { provider: 'nope', model: 'm' }),
      (e) => e.code === 'NO_PROVIDER',
    );
  });

  test('chat reports NO_PROVIDER when the harness has no providers', async () => {
    const empty = new AiBackend(ctxWith(makeLlm({ providers: [], chunks: [] })), {});
    await assert.rejects(empty.chat([{ role: 'user', content: 'x' }]), (e) => e.code === 'NO_PROVIDER');
  });

  test('credential failures from the provider point to the Models settings page', async () => {
    llm.stream = () => (async function* g() {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'MISSING_CREDENTIAL', message: 'no key' } } };
    })();
    await assert.rejects(
      ai.chat([{ role: 'user', content: 'x' }], { provider: 'deepseek', model: 'deepseek-flash' }),
      (e) => e.code === 'MISSING_CREDENTIAL' && /Models settings/.test(e.message),
    );
  });
});
