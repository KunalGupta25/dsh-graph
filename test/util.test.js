import { test, describe, mock } from 'node:test';
import assert from 'node:assert';
import { readBody, maskSecrets, restoreSecrets, SECRET_MASK, isSecretKey, slug, callAny } from '../src/host/util.js';

describe('util', () => {
  describe('readBody', () => {
    test('parses valid JSON', async () => {
      const req = {
        on: (event, cb) => {
          if (event === 'data') cb(Buffer.from('{"foo":"bar"}'));
          if (event === 'end') cb();
        },
        destroy: () => {},
      };
      const body = await readBody(req);
      assert.deepStrictEqual(body, { foo: 'bar' });
    });

    test('rejects oversized body with BODY_TOO_LARGE code', async () => {
      const largeData = 'x'.repeat(3 * 1024 * 1024);
      const req = {
        on: (event, cb) => {
          if (event === 'data') cb(Buffer.from(largeData));
          if (event === 'end') cb();
        },
        destroy: () => {},
      };
      try {
        await readBody(req, 2 * 1024 * 1024);
        assert.fail('should have thrown');
      } catch (e) {
        assert.strictEqual(e.code, 'BODY_TOO_LARGE');
      }
    });

    test('rejects invalid JSON with BAD_JSON code', async () => {
      const req = {
        on: (event, cb) => {
          if (event === 'data') cb(Buffer.from('not json'));
          if (event === 'end') cb();
        },
        destroy: () => {},
      };
      try {
        await readBody(req);
        assert.fail('should have thrown');
      } catch (e) {
        assert.strictEqual(e.code, 'BAD_JSON');
      }
    });
  });

  describe('maskSecrets', () => {
    test('masks secret-looking keys', () => {
      const obj = { apiKey: 'secret', normal: 'value', nested: { token: 'hidden' } };
      const masked = maskSecrets(obj);
      assert.strictEqual(masked.apiKey, SECRET_MASK);
      assert.strictEqual(masked.normal, 'value');
      assert.strictEqual(masked.nested.token, SECRET_MASK);
    });
  });

  describe('restoreSecrets', () => {
    test('restores masked values from previous', () => {
      const next = { apiKey: SECRET_MASK, normal: 'value' };
      const prev = { apiKey: 'real-secret', normal: 'old' };
      const restored = restoreSecrets(next, prev);
      assert.strictEqual(restored.apiKey, 'real-secret');
      assert.strictEqual(restored.normal, 'value');
    });
  });

  describe('isSecretKey', () => {
    test('detects secret keys', () => {
      assert.ok(isSecretKey('apiKey'));
      assert.ok(isSecretKey('api_key'));
      assert.ok(isSecretKey('token'));
      assert.ok(isSecretKey('secret'));
      assert.ok(isSecretKey('password'));
      assert.ok(!isSecretKey('normal'));
    });
  });

  describe('slug', () => {
    test('creates valid slug', () => {
      assert.strictEqual(slug('@scope/name'), 'name');
      assert.strictEqual(slug('Simple Name'), 'simple-name');
      assert.strictEqual(slug('UPPER'), 'upper');
    });
  });

  describe('callAny', () => {
    test('calls first existing method', async () => {
      const target = {
        methodA: () => 'a',
        methodB: () => 'b',
      };
      const result = await callAny(target, ['methodA', 'methodB'], [[1], [2]]);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.value, 'a');
      assert.strictEqual(result.method, 'methodA');
    });

    test('falls back to second method if first fails with TypeError', async () => {
      const target = {
        methodA: () => { throw new TypeError('not a function'); },
        methodB: () => 'b',
      };
      const result = await callAny(target, ['methodA', 'methodB'], [[1], [2]]);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.value, 'b');
    });
  });
});