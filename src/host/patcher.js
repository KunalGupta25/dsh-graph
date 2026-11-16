import { toYaml } from './util.js';

/**
 * Builds cordis.patch.yml text from staged changes and renders a real line diff.
 * Row shapes follow the dsh-doc bundle rules: `- insert:` adds rows; a row restating an existing
 * Loader row id overrides it (used for preset `plugins` lists).
 */
export class CordisPatcher {
  /**
   * @param {{addedPlugins?: Array, overriddenPresets?: Array, removedPlugins?: string[]}} staging
   */
  generatePatch(staging = {}) {
    const rows = [];
    const added = (staging.addedPlugins || []).filter((p) => p && p.name);
    if (added.length) {
      rows.push({
        insert: added.map((p) => {
          const row = { id: p.id || String(p.name).replace(/^@[^/]+\//, ''), name: p.name };
          if (p.config && Object.keys(p.config).length) row.config = p.config;
          return row;
        }),
      });
    }
    for (const preset of staging.overriddenPresets || []) {
      rows.push({
        id: preset.rowId || `preset-${preset.id}`,
        name: '@deepseek-ai/dsh-agent-preset',
        config: {
          id: preset.id,
          name: preset.name,
          description: preset.description,
          order: preset.order ?? 10,
          plugins: preset.plugins || [],
        },
      });
    }
    for (const rowId of staging.removedPlugins || []) rows.push({ id: rowId, disabled: true });
    return toYaml(rows);
  }

  /** Line diff using LCS. Returns a unified-style string plus structured hunks for the UI. */
  computeDiff(before = '', after = '') {
    const a = String(before).split('\n');
    const b = String(after).split('\n');
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const lines = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { lines.push({ t: ' ', s: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { lines.push({ t: '-', s: a[i++] }); }
      else { lines.push({ t: '+', s: b[j++] }); }
    }
    while (i < n) lines.push({ t: '-', s: a[i++] });
    while (j < m) lines.push({ t: '+', s: b[j++] });
    const changed = lines.filter((l) => l.t !== ' ').length;
    return {
      changed,
      lines,
      text: ['--- current', '+++ staged', ...lines.map((l) => `${l.t} ${l.s}`)].join('\n'),
    };
  }

  serializeYaml(data) {
    return toYaml(data);
  }
}
