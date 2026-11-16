import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SECRET_MASK = '••••••••';
const SECRET_KEY = /(api[-_]?key|token|secret|password|passwd|credential|authorization)/i;

export const dshHome = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
export const studioDir = () => path.join(dshHome(), 'studio');

export function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJsonFile(file, data, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, mode ? { mode } : undefined);
  if (mode) {
    try { fs.chmodSync(file, mode); } catch { /* Windows may ignore modes */ }
  }
}

export function sendJson(res, status, body) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Body is not valid JSON'));
      }
    });
  });
}

export function isSecretKey(key) {
  return SECRET_KEY.test(String(key));
}

/** Deep copy with secret-looking string values replaced by SECRET_MASK. */
export function maskSecrets(value, key = '') {
  if (Array.isArray(value)) return value.map((v) => maskSecrets(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = maskSecrets(v, k);
    return out;
  }
  if (typeof value === 'string' && value && isSecretKey(key)) return SECRET_MASK;
  if (typeof value === 'function') return '[expression]';
  return value;
}

/** Where `next` still holds SECRET_MASK, keep the value from `prev`. */
export function restoreSecrets(next, prev) {
  if (next === SECRET_MASK) return prev;
  if (Array.isArray(next)) return next.map((v, i) => restoreSecrets(v, Array.isArray(prev) ? prev[i] : undefined));
  if (next && typeof next === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(next)) out[k] = restoreSecrets(v, prev && typeof prev === 'object' ? prev[k] : undefined);
    return out;
  }
  return next;
}

/**
 * Call the first method of `target` that exists. Each entry of `argSets` is tried
 * in order when the previous attempt throws a TypeError-like argument problem.
 * Returns { ok, method, value, error }.
 */
export async function callAny(target, names, argSets = [[]]) {
  if (!target) return { ok: false, error: 'service unavailable' };
  let lastError = 'no matching method';
  for (const name of names) {
    if (typeof target[name] !== 'function') continue;
    for (const args of argSets) {
      try {
        const value = await target[name](...args);
        return { ok: true, method: name, value };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }
  return { ok: false, error: lastError };
}

function scalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new Error(`Value of type ${typeof v} cannot be written to YAML`);
}

const isEmpty = (v) => (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);

/** Minimal YAML emitter for JSON-compatible data (strings are emitted as JSON strings). */
export function toYaml(value, indent = 0) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]\n`;
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          if (isEmpty(item)) return `${pad}- ${Array.isArray(item) ? '[]' : '{}'}\n`;
          return `${pad}- ${toYaml(item, indent + 1).slice((indent + 1) * 2)}`;
        }
        return `${pad}- ${scalar(item)}\n`;
      })
      .join('');
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined && typeof value[k] !== 'function');
    if (!keys.length) return `${pad}{}\n`;
    return keys
      .map((k) => {
        const v = value[k];
        const key = /^[A-Za-z_][\w-]*$/.test(k) ? k : JSON.stringify(k);
        if (v && typeof v === 'object') {
          if (isEmpty(v)) return `${pad}${key}: ${Array.isArray(v) ? '[]' : '{}'}\n`;
          return `${pad}${key}:\n${toYaml(v, indent + 1)}`;
        }
        return `${pad}${key}: ${scalar(v)}\n`;
      })
      .join('');
  }
  return `${pad}${scalar(value)}\n`;
}

export function slug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
