import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Packaging / Preflight', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  test('package.json has test script', () => {
    assert.ok(pkg.scripts && pkg.scripts.test, 'missing test script');
  });

  test('package.json has check script', () => {
    assert.ok(pkg.scripts && pkg.scripts.check, 'missing check script');
  });

  test('package.json has prepack script', () => {
    assert.ok(pkg.scripts && pkg.scripts.prepack, 'missing prepack script');
  });

  test('package.json declares required files', () => {
    assert.ok(pkg.files && pkg.files.includes('index.js'));
    assert.ok(pkg.files && pkg.files.includes('client.js'));
    assert.ok(pkg.files && pkg.files.includes('cordis.patch.yml'));
    assert.ok(pkg.files && pkg.files.includes('icon.svg'));
  });

  test('package.json exports client and locale', () => {
    assert.ok(pkg.exports && pkg.exports['./client']);
    assert.ok(pkg.exports && pkg.exports['./locale/*.json']);
  });

  test('dsh.client.inject includes required UI packages', () => {
    const inject = pkg.dsh?.client?.inject || [];
    assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-layout'));
    assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-sidebar'));
  });

  test('cordis.patch.yml exists and has correct structure', () => {
    const patchPath = path.join(path.dirname(pkgPath), 'cordis.patch.yml');
    assert.ok(fs.existsSync(patchPath), 'cordis.patch.yml missing');
    const content = fs.readFileSync(patchPath, 'utf8');
    assert.ok(content.includes('dsh-workflow-studio'));
    assert.ok(content.includes('@local/dsh-workflow-studio'));
  });

  test('locale files exist and have matching keys', () => {
    const enPath = path.join(path.dirname(pkgPath), 'locale', 'en.json');
    const zhPath = path.join(path.dirname(pkgPath), 'locale', 'zh.json');
    assert.ok(fs.existsSync(enPath), 'en.json missing');
    assert.ok(fs.existsSync(zhPath), 'zh.json missing');
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
    const enKeys = Object.keys(en);
    const zhKeys = Object.keys(zh);
    assert.deepStrictEqual(enKeys.sort(), zhKeys.sort(), 'locale key mismatch');
  });

  test('icon.svg exists and is valid SVG', () => {
    const iconPath = path.join(path.dirname(pkgPath), 'icon.svg');
    assert.ok(fs.existsSync(iconPath), 'icon.svg missing');
    const content = fs.readFileSync(iconPath, 'utf8');
    assert.ok(content.trim().startsWith('<svg'), 'not valid SVG');
  });
});