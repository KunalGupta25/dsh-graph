import fs from 'node:fs';
import path from 'node:path';
import { callAny, restoreSecrets, studioDir, slug } from './util.js';

/**
 * Applies staged changes to the harness. Every operation goes through documented services
 * (`ctx.pluginManager`, `ctx.configEditor`); method names are feature-detected and an operation
 * that no service can perform is reported as failed instead of pretending it worked.
 */
export class HarnessOps {
  constructor(ctx, { scanner, creator, market }) {
    this.ctx = ctx;
    this.scanner = scanner;
    this.creator = creator;
    this.market = market;
  }

  svc(key) {
    try { return typeof this.ctx.get === 'function' ? this.ctx.get(key) : this.ctx[key]; } catch { return undefined; }
  }

  draftDir(id) {
    return path.join(studioDir(), 'drafts', slug(id) || 'draft');
  }

  /**
   * Explicitly cleans a draft folder when requested by the user.
   * Rules: Draft files are preserved when a bundle is removed and are NEVER deleted automatically.
   */
  cleanDraft(id) {
    if (!id) return { ok: false, error: 'No draft id provided' };
    const dir = this.draftDir(id);
    if (!fs.existsSync(dir)) return { ok: true, detail: 'Draft folder does not exist or already cleaned' };
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return { ok: true, detail: `Cleaned draft folder: ${dir}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /** Writes scaffolded files under $DSH_HOME/studio/drafts/<id>. Never touches profile files. */
  writeDraft(scaffold) {
    const dir = this.draftDir(scaffold.id);
    for (const [rel, content] of Object.entries(scaffold.files)) {
      const target = path.resolve(dir, rel);
      if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error(`Refusing path outside draft: ${rel}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }
    return dir;
  }

  async installFromDir(dir) {
    const pm = this.svc('pluginManager');
    return callAny(pm, ['installBundle', 'install'], [[dir], [{ path: dir }], [{ source: dir }]]);
  }

  async installItem(item) {
    if (!item) return { ok: false, error: 'Unknown marketplace item' };
    const pm = this.svc('pluginManager');
    if (item.kind === 'mcp' && item.mcp) {
      const scaffold = this.creator.scaffoldBundle({
        type: 'mcp', name: item.name, title: item.title || item.name, description: item.description,
        serverName: slug(item.name).split('-').pop() || slug(item.name),
        ...(item.mcp.transport === 'streamable-http' ? { url: item.mcp.url } : { command: item.mcp.command, args: item.mcp.args }),
      });
      const dir = this.writeDraft(scaffold);
      const r = await this.installFromDir(dir);
      return { ...r, detail: r.ok ? `Installed MCP bundle ${scaffold.name}` : undefined, draft: dir };
    }
    if (item.kind === 'skill') {
      return { ok: false, error: 'Skill install is not automated: copy the skill folder into your skills directory.', manual: item.repository || item.homepage };
    }
    // Never trust client-supplied installSpec; use the item's name from market search
    const spec = item.name;
    const r = await callAny(pm, ['installBundle', 'install'], [[spec], [{ spec }], [{ name: spec }]]);
    return { ...r, detail: r.ok ? `Installed ${spec}` : undefined };
  }

  async setConfig(rowId, patch) {
    const entry = await this.scanner.findEntry(rowId);
    const editor = this.svc('configEditor');
    if (!entry || !editor) return { ok: false, error: !entry ? `No live plugin entry for ${rowId}` : 'ctx.configEditor is unavailable' };
    const prev = entry.options?.config ?? {};
    const merged = restoreSecrets({ ...prev, ...patch }, prev);
    // Verified: ctx.configEditor.edit(entry, change) in @deepseek-ai/dsh-config-editor/lib/index.js.
    const r = await callAny(editor, ['edit'], [
      [entry, (cfg) => { if (cfg && typeof cfg === 'object') Object.assign(cfg, merged); return merged; }],
    ]);
    return { ...r, detail: r.ok ? `Updated ${Object.keys(patch).join(', ')} on ${rowId}` : undefined };
  }

  async toggle(bundle, enabled) {
    const pm = this.svc('pluginManager');
    // Verified: ctx.pluginManager.setBundleEnabled(bundle, enabled) in @deepseek-ai/dsh-plugin-manager.
    const names = ['setBundleEnabled', enabled ? 'enableBundle' : 'disableBundle', 'enable', 'disable', 'setEnabled'];
    const r = await callAny(pm, names, [[bundle, enabled], [bundle], [{ name: bundle, enabled }]]);
    return { ...r, detail: r.ok ? `${enabled ? 'Enabled' : 'Disabled'} ${bundle}` : undefined };
  }

  async remove(bundle) {
    const pm = this.svc('pluginManager');
    // Verified: ctx.pluginManager.removeBundle(bundle) in @deepseek-ai/dsh-plugin-manager.
    const r = await callAny(pm, ['removeBundle', 'uninstallBundle', 'remove', 'uninstall'], [[bundle], [{ name: bundle }]]);
    return { ...r, detail: r.ok ? `Removed ${bundle}` : undefined };
  }

  /**
   * @param {Array} changes  [{op, ...}] from the client's staging area.
   * @param {Map<string,object>} nodesById  current graph nodes, to resolve bundle/row ids
   */
  async apply(changes, graph) {
    const byId = new Map((graph?.nodes || []).map((n) => [n.id, n]));

    // --- Build dependency graph from graph edges for topological ordering ---
    const depGraph = new Map();
    const revDepGraph = new Map();
    for (const node of graph?.nodes || []) {
      depGraph.set(node.id, new Set());
      revDepGraph.set(node.id, new Set());
    }
    for (const edge of graph?.edges || []) {
      if (depGraph.has(edge.from) && depGraph.has(edge.to)) {
        depGraph.get(edge.from).add(edge.to);
        revDepGraph.get(edge.to).add(edge.from);
      }
    }

    // --- Topological sort with cycle detection (Kahn's algorithm) ---
    function topoSort(nodes) {
      const inDegree = new Map();
      const nodeSet = new Set(nodes);
      for (const n of nodes) {
        inDegree.set(n, 0);
      }
      for (const n of nodes) {
        for (const dep of depGraph.get(n) || []) {
          if (nodeSet.has(dep)) inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
        }
      }
      const queue = [...nodes].filter((n) => (inDegree.get(n) || 0) === 0);
      const sorted = [];
      while (queue.length) {
        const n = queue.shift();
        sorted.push(n);
        for (const dep of depGraph.get(n) || []) {
          if (!nodeSet.has(dep)) continue;
          const d = inDegree.get(dep) - 1;
          inDegree.set(dep, d);
          if (d === 0) queue.push(dep);
        }
      }
      if (sorted.length !== nodes.length) {
        // Cycle detected - return original order with warning
        return { sorted: nodes, cycle: true };
      }
      return { sorted, cycle: false };
    }

    // --- Order changes by type priority (install → enable → setConfig → preset rewrite → remove) ---
    const typePriority = { install: 0, scaffold: 0, toggle: 1, setConfig: 2, remove: 3 };
    const changeNodes = changes.map((c, idx) => ({ ...c, _idx: idx }));
    changeNodes.sort((a, b) => (typePriority[a.op] ?? 99) - (typePriority[b.op] ?? 99));

    // --- Pre-state snapshot for rollback ---
    const snapshot = new Map();
    for (const c of changes || []) {
      if (c.op === 'setConfig' && c.node) {
        const node = byId.get(c.node);
        if (node?.rowId) {
          const entry = await this.scanner.findEntry(node.rowId);
          if (entry) snapshot.set(c.node, JSON.parse(JSON.stringify(entry.options?.config || {})));
        }
      } else if ((c.op === 'toggle' || c.op === 'remove') && c.node) {
        const node = byId.get(c.node);
        if (node?.bundle) {
          const pm = this.svc('pluginManager');
          // Capture current enabled state
          const isEnabled = await callAny(pm, ['isBundleEnabled', 'getBundleState'], [[node.bundle], [{ name: node.bundle }]]);
          snapshot.set(c.node, { enabled: isEnabled?.ok ? isEnabled.value : true });
        }
      }
    }

    // --- Apply in topological order within each priority group ---
    const results = [];
    const applied = new Set();
    const restartRequired = new Set();
    let anyCycle = false;

    // Group by priority
    const groups = new Map();
    for (const c of changeNodes) {
      const p = typePriority[c.op] ?? 99;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(c);
    }

    for (const priority of [...groups.keys()].sort((a, b) => a - b)) {
      const group = groups.get(priority);
      // Topological sort within group
      const nodeIds = group.map((c) => c.node).filter(Boolean);
      const { sorted, cycle } = topoSort(nodeIds);
      if (cycle) anyCycle = true;
      const order = new Map(sorted.map((id, i) => [id, i]));
      group.sort((a, b) => (order.get(a.node) ?? 999) - (order.get(b.node) ?? 999));

      for (const c of group) {
        let r;
        try {
          const node = c.node ? byId.get(c.node) : undefined;
          if (node && node.editable === false && ['setConfig', 'toggle', 'remove'].includes(c.op)) {
            r = { ok: false, error: node.lockReason || 'Node is not editable', code: 'LOCKED' };
          } else if (c.op === 'install') {
            // Always re-resolve from market search; never trust client-supplied itemData
            const found = (await this.market.search(c.item || '', 'all')).items.find((i) => i.id === c.item);
            if (!found) r = { ok: false, error: `Marketplace item not found: ${c.item}`, code: 'NOT_FOUND' };
            else {
              r = await this.installItem(found);
              if (r.ok) restartRequired.add('plugin_install');
            }
          } else if (c.op === 'setConfig') {
            r = await this.setConfig(node?.rowId || c.rowId, c.patch || {});
            if (r.ok) restartRequired.add('config_change');
          } else if (c.op === 'toggle') {
            r = await this.toggle(node?.bundle || c.bundle, c.enabled !== false);
            if (r.ok) restartRequired.add(c.enabled !== false ? 'plugin_enable' : 'plugin_disable');
          } else if (c.op === 'remove') {
            r = await this.remove(node?.bundle || c.bundle);
            if (r.ok) restartRequired.add('plugin_remove');
          } else if (c.op === 'scaffold') {
            const sc = this.creator.scaffoldBundle(c.spec || {});
            const dir = this.writeDraft(sc);
            r = { ok: true, detail: `Draft written to ${dir}`, draft: dir, scaffold: sc.id };
            if (c.install && sc.type !== 'skill') r = { ...(await this.installFromDir(dir)), draft: dir };
          } else {
            r = { ok: false, error: `Unsupported operation: ${c.op}`, code: 'UNSUPPORTED_OP' };
          }
        } catch (e) {
          r = { ok: false, error: e instanceof Error ? e.message : String(e), code: 'EXCEPTION' };
        }

        // Dependency-aware skip: if dependencies failed, mark as skipped
        const deps = revDepGraph.get(c.node) || new Set();
        const depFailed = [...deps].some((d) => {
          const depResult = results.find((res) => res.node === d);
          return depResult && !depResult.ok;
        });
        if (depFailed) {
          r = { ok: false, error: 'Dependency failed', code: 'DEP_FAILED', skipped: true };
        }

        results.push({ op: c.op, node: c.node, item: c.item, ok: !!r.ok, detail: r.detail, error: r.ok ? undefined : r.error, draft: r.draft, code: r.code, skipped: r.skipped });
        applied.add(c.node);
      }
    }

    // --- Rollback on critical failures (if no partial success allowed) ---
    const criticalFailures = results.filter((r) => !r.ok && !r.skipped && r.code !== 'LOCKED' && r.code !== 'NOT_FOUND' && r.code !== 'UNSUPPORTED_OP');
    if (criticalFailures.length > 0) {
      // Rollback setConfig changes
      for (const [nodeId, prevConfig] of snapshot.entries()) {
        const node = byId.get(nodeId);
        if (node?.rowId) {
          await this.setConfig(node.rowId, prevConfig);
        }
      }
    }

    // Add restart hint to results
    if (restartRequired.size > 0) {
      results.push({ op: 'restart_hint', ok: true, detail: `Restart recommended for: ${[...restartRequired].join(', ')}`, code: 'RESTART_REQUIRED' });
    }

    if (anyCycle) {
      results.unshift({ op: 'warning', ok: true, detail: 'Dependency cycle detected; changes applied in client order', code: 'CYCLE_DETECTED' });
    }

    return results;
  }
}
