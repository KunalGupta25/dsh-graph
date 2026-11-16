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
    try { return this.ctx.get?.(key) ?? this.ctx[key]; } catch { return undefined; }
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
    const spec = item.installSpec || item.name;
    const r = await callAny(pm, ['installBundle', 'install'], [[spec], [{ spec }], [{ name: spec }]]);
    return { ...r, detail: r.ok ? `Installed ${spec}` : undefined };
  }

  async setConfig(rowId, patch) {
    const entry = this.scanner.findEntry(rowId);
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
    const results = [];
    for (const c of changes || []) {
      let r;
      try {
        const node = c.node ? byId.get(c.node) : undefined;
        if (node && node.editable === false && ['setConfig', 'toggle', 'remove'].includes(c.op)) {
          r = { ok: false, error: node.lockReason || 'Node is not editable' };
        } else if (c.op === 'install') {
          const found = c.itemData || (await this.market.search(c.item || '', 'all')).items.find((i) => i.id === c.item);
          r = await this.installItem(found);
        } else if (c.op === 'setConfig') {
          r = await this.setConfig(node?.rowId || c.rowId, c.patch || {});
        } else if (c.op === 'toggle') {
          r = await this.toggle(node?.bundle || c.bundle, c.enabled !== false);
        } else if (c.op === 'remove') {
          r = await this.remove(node?.bundle || c.bundle);
        } else if (c.op === 'scaffold') {
          const sc = this.creator.scaffoldBundle(c.spec || {});
          const dir = this.writeDraft(sc);
          r = { ok: true, detail: `Draft written to ${dir}`, draft: dir, scaffold: sc.id };
          if (c.install && sc.type !== 'skill') r = { ...(await this.installFromDir(dir)), draft: dir };
        } else {
          r = { ok: false, error: `Unsupported operation: ${c.op}` };
        }
      } catch (e) {
        r = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      results.push({ op: c.op, node: c.node, item: c.item, ok: !!r.ok, detail: r.detail, error: r.ok ? undefined : r.error, draft: r.draft });
    }
    return results;
  }
}
