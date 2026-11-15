/**
 * Handles Cordis patch generation, diff calculation, and validation for staging.
 */
export class CordisPatcher {
  /**
   * Generates a unified cordis.patch.yml from staged node mutations.
   * @param {Object} staging 
   * @param {Array} staging.addedPlugins
   * @param {Array} staging.removedPlugins
   * @param {Array} staging.overriddenPresets
   */
  generatePatch(staging = {}) {
    const patchRows = [];

    // 1. New insertions
    if (Array.isArray(staging.addedPlugins) && staging.addedPlugins.length > 0) {
      const inserts = staging.addedPlugins.map(p => ({
        id: p.id || p.name.replace(/^@.*\//, ''),
        name: p.name,
        config: p.config || {}
      }));
      patchRows.push({ insert: inserts });
    }

    // 2. Preset overrides / modifications
    if (Array.isArray(staging.overriddenPresets)) {
      for (const preset of staging.overriddenPresets) {
        patchRows.push({
          id: `preset-${preset.id}`,
          name: '@deepseek-ai/dsh-agent-preset',
          config: {
            id: preset.id,
            name: preset.name,
            description: preset.description,
            order: preset.order || 10,
            plugins: preset.plugins || []
          }
        });
      }
    }

    // 3. Removed / disabled rows
    if (Array.isArray(staging.removedPlugins)) {
      for (const rowId of staging.removedPlugins) {
        patchRows.push({
          id: rowId,
          disabled: true
        });
      }
    }

    return this.serializeYaml(patchRows);
  }

  /**
   * Generates a readable unified diff format for user preview.
   */
  computeDiff(baselineYaml, stagedYaml) {
    const baseLines = baselineYaml.split('\n');
    const stagedLines = stagedYaml.split('\n');

    const diff = [];
    diff.push('--- baseline/cordis.patch.yml');
    diff.push('+++ staged/cordis.patch.yml');
    diff.push('@@ -1,' + baseLines.length + ' +1,' + stagedLines.length + ' @@');

    for (const line of stagedLines) {
      if (!baseLines.includes(line)) {
        diff.push(`+ ${line}`);
      } else {
        diff.push(`  ${line}`);
      }
    }

    return diff.join('\n');
  }

  /**
   * Minimal YAML serializer for Cordis patch arrays.
   */
  serializeYaml(data, indent = 0) {
    const pad = '  '.repeat(indent);
    let out = '';

    if (Array.isArray(data)) {
      for (const item of data) {
        if (typeof item === 'object' && item !== null) {
          const keys = Object.keys(item);
          if (keys.length === 0) continue;
          const firstKey = keys[0];
          const firstVal = item[firstKey];

          if (Array.isArray(firstVal)) {
            out += `${pad}- ${firstKey}:\n${this.serializeYaml(firstVal, indent + 2)}`;
          } else if (typeof firstVal === 'object' && firstVal !== null) {
            out += `${pad}- ${firstKey}:\n${this.serializeYaml(firstVal, indent + 2)}`;
          } else {
            out += `${pad}- ${firstKey}: ${firstVal}\n`;
          }

          for (let i = 1; i < keys.length; i++) {
            const k = keys[i];
            const v = item[k];
            if (typeof v === 'object' && v !== null) {
              out += `${pad}  ${k}:\n${this.serializeYaml(v, indent + 2)}`;
            } else {
              out += `${pad}  ${k}: ${v}\n`;
            }
          }
        }
      }
    } else if (typeof data === 'object' && data !== null) {
      for (const [k, v] of Object.entries(data)) {
        if (Array.isArray(v)) {
          out += `${pad}${k}:\n${this.serializeYaml(v, indent + 1)}`;
        } else if (typeof v === 'object' && v !== null) {
          out += `${pad}${k}:\n${this.serializeYaml(v, indent + 1)}`;
        } else {
          out += `${pad}${k}: ${v}\n`;
        }
      }
    }

    return out;
  }
}
