window.__ModuleLoader__.load({
  id: '@local/dsh-workflow-studio',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, useRef, useMemo, useCallback, createElement: h } = React;

    const API = '/api/workflow-studio';
    const MASK = '••••••••';
    const safeHref = (u) => { try { const url = new URL(u); return url.protocol === 'https:' || url.protocol === 'http:' ? u : ''; } catch { return ''; } };

    // ---- Theme: verified DSH tokens from @deepseek-ai/dsh-client-ui-theme ----
    const tv = (name, fb) => `var(--dsw-alias-${name}, ${fb})`;
    const C = {
      bg: tv('bg-base', '#14161a'),
      surface: tv('bg-l1', '#1d2129'),
      surface2: tv('bg-l2', '#252b36'),
      border: tv('border-l1', 'rgba(255,255,255,0.09)'),
      text: tv('label-primary', '#edf0f5'),
      text2: tv('label-secondary', '#8c95a6'),
      muted: tv('label-tertiary', '#5d6575'),
      accent: tv('brand-primary', '#4f78e8'),
      danger: tv('state-error-primary', '#ef4444'),
      ok: tv('state-success-primary', '#10b981'),
      warn: tv('state-warn-primary', '#f59e0b'),
    };
    const TYPE = {
      core: { c: '#64748b', l: 'Core' }, plugin: { c: '#4f78e8', l: 'Plugin' }, tool: { c: '#10b981', l: 'Tool' },
      mcp: { c: '#06b6d4', l: 'MCP' }, preset: { c: '#f59e0b', l: 'Preset' }, skill: { c: '#a855f7', l: 'Skill' },
      bundle: { c: '#6366f1', l: 'Bundle' }, draft: { c: '#eab308', l: 'Draft' },
    };
    const NW = 240, NH = 72;

    // Resolve against the directory the host UI is served from, so a reverse-proxy path prefix works
    // (same approach as dsh-market's api()).
    function apiUrl(path) {
      const rel = (API + path).replace(/^\/+/, '');
      if (typeof document === 'undefined') return `/${rel}`;
      try { return new URL(rel, document.baseURI).pathname; } catch { return `/${rel}`; }
    }
    // Capability disclosure labels from the catalog's static scan; risky ones are highlighted.
    const RISKY_CAPS = /shell|exec|credential|dynamic|eval|network|env/i;
    const CapBadges = (item) => (item.capabilities === undefined
      ? Badge('not scanned', C.muted)
      : item.capabilities.length === 0 ? Badge('scan: nothing detected', C.ok)
        : item.capabilities.slice(0, 8).map((c) => h('span', { key: c }, Badge(c, RISKY_CAPS.test(c) ? C.warn : C.text2), ' ')));

    async function api(path, body) {
      const init = body === undefined ? { credentials: 'same-origin' } : {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      };
      const res = await fetch(apiUrl(path), init);
      let j = {};
      try { j = await res.json(); } catch { /* non-JSON */ }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      return j;
    }
    const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

    // ---- Layout: n8n-style multi-tier columns with sub-column wrapping to prevent vertical spikes or stacking ----
    const TIER = { core: 0, preset: 1, bundle: 1, plugin: 2, tool: 2, mcp: 3, skill: 4, draft: 4 };
    function autoLayout(nodes) {
      const cols = {};
      for (const n of nodes) {
        const tier = TIER[n.type] ?? 2;
        (cols[tier] ||= []).push(n);
      }
      const pos = {};
      let colOffset = 0;
      for (let t = 0; t <= 4; t++) {
        const list = cols[t] || [];
        if (!list.length) continue;
        const maxPerCol = 6;
        list.forEach((n, i) => {
          const subCol = Math.floor(i / maxPerCol);
          const row = i % maxPerCol;
          pos[n.id] = {
            x: 50 + (colOffset + subCol) * (NW + 70),
            y: 50 + row * (NH + 32),
          };
        });
        colOffset += Math.ceil(list.length / maxPerCol);
      }
      return pos;
    }

    // Discard any corrupt stored positions where nodes share the exact same coordinates (unstack)
    function sanitizePositions(stored, nodes) {
      if (!stored || typeof stored !== 'object') return {};
      const result = {};
      const seen = new Set();
      for (const n of nodes) {
        const p = stored[n.id];
        if (p && typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y)) {
          const key = `${Math.round(p.x)},${Math.round(p.y)}`;
          if (!seen.has(key) && !(p.x === 0 && p.y === 0)) {
            seen.add(key);
            result[n.id] = p;
          }
        }
      }
      return result;
    }

    const btn = (extra) => ({
      background: C.surface2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px',
      fontSize: 12, cursor: 'pointer', ...extra,
    });
    const primary = (extra) => btn({ background: C.accent, border: `1px solid ${C.accent}`, color: '#fff', ...extra });
    const input = (extra) => ({
      background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px',
      fontSize: 12, width: '100%', boxSizing: 'border-box', outline: 'none', ...extra,
    });
    const Badge = (text, color) => h('span', {
      style: { fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${color}22`, color, border: `1px solid ${color}55`, whiteSpace: 'nowrap' },
    }, text);

    // ---------- Node card (n8n-style with input/output port dots) ----------
    function NodeCard({ n, pos, selected, onDown, onClick }) {
      const t = TYPE[n.type] || TYPE.plugin;
      const locked = n.editable === false;
      const dim = n.state === 'disabled';
      return h('div', {
        onPointerDown: (e) => onDown(e, n), onClick: (e) => { e.stopPropagation(); onClick(n); },
        title: locked ? (n.lockReason || 'Read-only') : 'Editable',
        style: {
          position: 'absolute', left: pos.x, top: pos.y, width: NW, height: NH, boxSizing: 'border-box', cursor: 'grab',
          background: C.surface, borderRadius: 10, padding: '8px 12px', userSelect: 'none',
          border: `1px ${n.type === 'draft' ? 'dashed' : 'solid'} ${selected ? C.accent : C.border}`,
          boxShadow: selected ? `0 0 0 2px ${C.accent}88, 0 4px 12px rgba(0,0,0,.35)` : '0 2px 6px rgba(0,0,0,.25)',
          borderLeft: `5px solid ${t.c}`, opacity: dim ? 0.55 : 1, transition: 'border-color 0.15s, box-shadow 0.15s',
        },
      },
        // n8n-style input/output port dots
        h('span', { style: { position: 'absolute', left: -6, top: '50%', marginTop: -5, width: 10, height: 10, borderRadius: '50%', background: C.surface, border: `2px solid ${t.c}`, pointerEvents: 'none' } }),
        h('span', { style: { position: 'absolute', right: -6, top: '50%', marginTop: -5, width: 10, height: 10, borderRadius: '50%', background: C.surface, border: `2px solid ${t.c}`, pointerEvents: 'none' } }),
        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' } },
          h('span', { style: { color: C.text, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, n.label),
          h('span', { style: { fontSize: 11, color: locked ? C.muted : C.ok } }, locked ? '🔒' : '✎')),
        h('div', { style: { display: 'flex', gap: 5, marginTop: 5, alignItems: 'center' } },
          Badge(t.l, t.c),
          n.state && n.state !== 'active' && Badge(n.state, n.state === 'error' ? C.danger : C.warn),
          n.tools && Badge(`${n.tools.length} tools`, C.text2)),
        h('div', { style: { color: C.muted, fontSize: 10, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, n.package || ''));
    }

    // ---------- Settings editor ----------
    function ConfigEditor({ node, staged, onStage }) {
      const base = node.config || {};
      const existing = staged.find((s) => s.op === 'setConfig' && s.node === node.id);
      const [draft, setDraft] = useState(() => ({ ...base, ...(existing?.patch || {}) }));
      const [newKey, setNewKey] = useState('');
      useEffect(() => { setDraft({ ...base, ...(existing?.patch || {}) }); }, [node.id]);
      const locked = node.editable === false;
      const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
      const keys = Object.keys(draft);
      const diff = {};
      for (const k of keys) if (JSON.stringify(draft[k]) !== JSON.stringify(base[k])) diff[k] = draft[k];
      const field = (k) => {
        const v = draft[k];
        const secret = v === MASK || /key|token|secret|password/i.test(k);
        const row = (ctl) => h('label', { key: k, style: { display: 'block', marginBottom: 8 } },
          h('div', { style: { fontSize: 11, color: C.text2, marginBottom: 3 } }, k, v === MASK ? ' (stored secret)' : ''), ctl);
        if (typeof v === 'boolean') return row(h('input', { type: 'checkbox', checked: v, disabled: locked, onChange: (e) => set(k, e.target.checked) }));
        if (typeof v === 'number') return row(h('input', { style: input(), type: 'number', value: v, disabled: locked, onChange: (e) => set(k, Number(e.target.value)) }));
        if (v && typeof v === 'object') {
          return row(h('textarea', {
            style: input({ minHeight: 70, fontFamily: 'monospace' }), disabled: locked, defaultValue: JSON.stringify(v, null, 2),
            onBlur: (e) => { try { set(k, JSON.parse(e.target.value)); e.target.style.borderColor = ''; } catch { e.target.style.borderColor = 'red'; } },
          }));
        }
        return row(h('input', {
          style: input(), type: secret ? 'password' : 'text', value: v ?? '', disabled: locked, autoComplete: 'off',
          placeholder: v === MASK ? 'Leave as is to keep the stored value' : '', onChange: (e) => set(k, e.target.value),
          onFocus: (e) => { if (v === MASK) e.target.select(); },
        }));
      };
      return h('div', null,
        locked && h('div', { style: { fontSize: 11, color: C.warn, marginBottom: 8 } }, node.lockReason || 'Read-only'),
        keys.length === 0 && h('div', { style: { color: C.muted, fontSize: 12, marginBottom: 8 } }, 'No configuration fields.'),
        keys.map(field),
        !locked && h('div', { style: { display: 'flex', gap: 6, marginBottom: 10 } },
          h('input', { style: input(), placeholder: 'New field name (e.g. apiKey)', value: newKey, onChange: (e) => setNewKey(e.target.value) }),
          h('button', { style: btn(), onClick: () => { if (newKey.trim() && !(newKey in draft)) { set(newKey.trim(), ''); setNewKey(''); } } }, 'Add')),
        !locked && h('div', { style: { display: 'flex', gap: 6 } },
          h('button', {
            style: primary({ opacity: Object.keys(diff).length ? 1 : 0.5 }), disabled: !Object.keys(diff).length,
            onClick: () => onStage({ op: 'setConfig', node: node.id, patch: diff, label: `Edit ${node.label}: ${Object.keys(diff).join(', ')}` }),
          }, 'Stage changes'),
          existing && h('button', { style: btn(), onClick: () => onStage({ op: 'unstage', key: existing.key }) }, 'Discard staged')));
    }

    // ---------- Inspector ----------
    function Inspector({ sel, staged, onStage, onClose, onAsk, inCompare, onCompare }) {
      const [tab, setTab] = useState('about');
      useEffect(() => setTab('about'), [sel?.id]);
      if (!sel) return null;
      const isMarket = sel.__market;
      const item = sel;
      const t = TYPE[isMarket ? 'plugin' : sel.type] || TYPE.plugin;
      const tabs = isMarket ? ['about'] : ['about', 'settings'];
      return h('div', { style: { width: 320, background: C.surface, borderLeft: `1px solid ${C.border}`, overflow: 'auto', padding: 14, flexShrink: 0 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('div', { style: { fontSize: 15, fontWeight: 700, color: C.text } }, isMarket ? (item.title || item.name) : item.label),
          h('button', { style: btn({ padding: '1px 7px' }), onClick: onClose, 'aria-label': 'Close' }, '×')),
        h('div', { style: { display: 'flex', gap: 5, margin: '6px 0 10px', flexWrap: 'wrap' } },
          Badge(isMarket ? item.kind : t.l, t.c), isMarket && Badge(item.source, C.text2), isMarket && item.official && Badge('official', C.ok),
          isMarket && item.deprecated && Badge('deprecated', C.danger),
          !isMarket && Badge(item.editable === false ? 'read-only' : 'editable', item.editable === false ? C.muted : C.ok),
          !isMarket && item.state && Badge(item.state, item.state === 'active' ? C.ok : C.warn)),
        h('div', { style: { display: 'flex', gap: 4, marginBottom: 10 } },
          tabs.map((x) => h('button', { key: x, style: btn({ background: tab === x ? C.accent : C.surface2, color: tab === x ? '#fff' : C.text }), onClick: () => setTab(x) }, x === 'about' ? 'About' : 'Settings'))),
        tab === 'about' && h('div', { style: { fontSize: 12, color: C.text2, lineHeight: 1.5 } },
          h('p', { style: { margin: '0 0 8px', color: C.text } }, item.description || 'No description available.'),
          h('dl', { style: { margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px' } },
            ...(isMarket
              ? [['Package', item.name], ['Version', item.version], ['Author', item.author], ['Home', item.homepage || item.repository]]
              : [['Package', item.package], ['Origin', item.origin], ['Bundle', item.bundle], ['Row id', item.rowId], ['Path', item.path]])
              .filter(([, v]) => v).flatMap(([k, v]) => [h('dt', { key: k, style: { color: C.muted } }, k), h('dd', { key: k + 'v', style: { margin: 0, color: C.text, wordBreak: 'break-all' } }, String(v))])),
          item.tools?.length > 0 && h('div', { style: { marginTop: 10 } }, h('div', { style: { color: C.muted, marginBottom: 4 } }, 'Tools exposed'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } }, item.tools.slice(0, 40).map((x) => Badge(x, C.mcp)))),
          item.presetPlugins?.length > 0 && h('div', { style: { marginTop: 10 } }, h('div', { style: { color: C.muted, marginBottom: 4 } }, 'Preset contains'),
            item.presetPlugins.map((p) => h('div', { key: p.id || p.name, style: { color: C.text } }, '• ', p.id || p.name))),
          isMarket && item.deprecated && h('div', { style: { marginTop: 10, color: C.danger } }, 'Deprecated', item.replacement ? ` — suggested replacement: ${item.replacement}` : ''),
          isMarket && !item.official && h('div', { style: { marginTop: 10 } }, h('div', { style: { color: C.muted, marginBottom: 4 } }, 'Capabilities (static scan by the catalog; disclosure, not a verdict)'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } }, CapBadges(item)),
            item.capabilityRedLines?.length > 0 && h('div', { style: { marginTop: 6, color: C.warn } }, item.capabilityRedLines.map((r) => h('div', { key: r }, '⚠ ', r)))),
          isMarket && item.envVars?.length > 0 && h('div', { style: { marginTop: 10 } }, h('div', { style: { color: C.muted } }, 'Needs environment variables'),
            item.envVars.map((e) => h('div', { key: e.name || e, style: { color: C.text } }, '• ', e.name || e))),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' } },
            isMarket && item.installable !== false && h('button', { style: primary(), onClick: () => onStage({ op: 'install', item: item.id, itemData: stripMarket(item), label: `Install ${item.title || item.name}` }) }, 'Add to harness'),
            isMarket && h('button', { style: btn(), onClick: () => onCompare(item) }, inCompare ? 'Remove from compare' : 'Compare'),
            isMarket && safeHref(item.homepage || item.repository) && h('a', { href: safeHref(item.homepage || item.repository), target: '_blank', rel: 'noopener noreferrer', style: { ...btn(), textDecoration: 'none' } }, 'Open page'),
            !isMarket && item.editable !== false && item.bundle && h('button', { style: btn(), onClick: () => onStage({ op: 'toggle', node: item.id, enabled: item.state === 'disabled', label: `${item.state === 'disabled' ? 'Enable' : 'Disable'} ${item.label}` }) }, item.state === 'disabled' ? 'Enable' : 'Disable'),
            !isMarket && item.editable !== false && item.bundle && h('button', { style: btn({ color: C.danger }), onClick: () => onStage({ op: 'remove', node: item.id, label: `Remove ${item.label}` }) }, 'Remove'),
            !isMarket && item.type === 'draft' && h('button', { style: btn({ color: C.danger }), onClick: async () => { await api('/drafts/clean', { id: item.stagedKey || item.id }); onClose(); } }, 'Clean draft files'),
            h('button', { style: btn(), onClick: () => onAsk(isMarket ? `Tell me about the marketplace item "${item.title || item.name}" and whether it fits my harness.` : `Explain what the node "${item.label}" (${item.package}) does in my harness.`) }, 'Ask AI'))),
        tab === 'settings' && !isMarket && h(ConfigEditor, { node: sel, staged, onStage }));
    }
    const stripMarket = (i) => { if (!i) return {}; const { __market, ...rest } = i; return rest; };

    // ---------- Marketplace drawer ----------
    function Market({ onPick, selectedId, items, status, loading, kind, setKind, query, setQuery, run, compare, links = [] }) {
      return h('div', { style: { width: 300, background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 } },
        h('div', { style: { padding: 10, borderBottom: `1px solid ${C.border}` } },
          h('div', { style: { fontWeight: 700, color: C.text, marginBottom: 8 } }, 'Marketplace'),
          h('form', { onSubmit: (e) => { e.preventDefault(); run(); }, style: { display: 'flex', gap: 6 } },
            h('input', { style: input(), placeholder: 'Search plugins, MCP, skills…', value: query, onChange: (e) => setQuery(e.target.value) }),
            h('button', { style: primary(), type: 'submit' }, 'Go')),
          h('div', { style: { display: 'flex', gap: 4, marginTop: 8 } },
            ['all', 'plugin', 'mcp', 'skill'].map((k) => h('button', { key: k, style: btn({ padding: '3px 8px', background: kind === k ? C.accent : C.surface2, color: kind === k ? '#fff' : C.text }), onClick: () => setKind(k) }, k))),
          status && h('div', { style: { fontSize: 10, color: C.muted, marginTop: 6 } },
            Object.entries(status).map(([k, v]) => `${k}: ${v === true || v === 'ok' ? 'ok' : (v?.error || v)}`).join(' · ')),
          links.length > 0 && h('div', { style: { fontSize: 10, color: C.muted, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 } }, 'Browse:',
            links.map((l) => h('a', { key: l.url, href: l.url, target: '_blank', rel: 'noopener noreferrer', style: { color: C.accent } }, l.name)))),
        h('div', { style: { overflow: 'auto', flex: 1, padding: 8 } },
          loading && h('div', { style: { color: C.muted, fontSize: 12 } }, 'Searching…'),
          !loading && items.length === 0 && h('div', { style: { color: C.muted, fontSize: 12 } }, 'No results. Try another search.'),
          items.map((i) => h('div', {
            key: i.id, onClick: () => onPick(i),
            style: { padding: 8, borderRadius: 8, marginBottom: 6, cursor: 'pointer', background: selectedId === i.id ? C.surface2 : 'transparent', border: `1px solid ${selectedId === i.id ? C.accent : C.border}` },
          },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 6 } },
              h('span', { style: { color: C.text, fontSize: 12, fontWeight: 600 } }, i.title || i.name),
              compare.includes(i.id) && Badge('compare', C.accent)),
            h('div', { style: { display: 'flex', gap: 4, margin: '4px 0' } }, Badge(i.kind, (TYPE[i.kind === 'plugin' ? 'plugin' : i.kind] || TYPE.plugin).c), Badge(i.source, C.text2), i.official && Badge('official', C.ok), i.deprecated && Badge('deprecated', C.danger), i.capabilities?.some((c) => RISKY_CAPS.test(c)) && Badge('needs review', C.warn)),
            h('div', { style: { color: C.text2, fontSize: 11, lineHeight: 1.4, maxHeight: 48, overflow: 'hidden' } }, i.description)))));
    }

    // ---------- Changes panel ----------
    function Changes({ staged, onUnstage, onApply, applying, results, onClose }) {
      const [diff, setDiff] = useState(null);
      const [diffLoading, setDiffLoading] = useState(false);
      const previewDiff = useCallback(async () => {
        setDiffLoading(true);
        try {
          const changes = staged.map(({ key, label, ...c }) => c);
          const r = await api('/diff', { baseline: '', staging: changes });
          setDiff(r.diff || r.text || 'No diff available');
        } catch (e) {
          setDiff(`Error: ${e.message}`);
        } finally {
          setDiffLoading(false);
        }
      }, [staged]);
      return h('div', { style: { position: 'absolute', right: 12, top: 52, width: 380, maxHeight: '70%', overflow: 'auto', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, zIndex: 20, boxShadow: '0 8px 30px rgba(0,0,0,.4)' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } }, h('b', { style: { color: C.text } }, `Staged changes (${staged.length})`), h('button', { style: btn({ padding: '1px 7px' }), onClick: onClose }, '×')),
        staged.length === 0 && h('div', { style: { color: C.muted, fontSize: 12 } }, 'Nothing staged. Edit a node or add something from the marketplace.'),
        staged.map((s) => h('div', { key: s.key, style: { border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, marginBottom: 6 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 6 } }, h('span', { style: { color: C.text, fontSize: 12 } }, s.label || s.op), h('button', { style: btn({ padding: '0 6px' }), onClick: () => onUnstage(s.key) }, 'Undo')),
          s.op === 'setConfig' && h('pre', { style: { margin: '6px 0 0', fontSize: 11, color: C.text2, whiteSpace: 'pre-wrap' } }, Object.entries(s.patch).map(([k, v]) => `+ ${k}: ${v === MASK ? MASK : JSON.stringify(v)}`).join('\n')),
          s.op === 'scaffold' && h('div', { style: { fontSize: 11, color: C.text2, marginTop: 4 } }, `Writes a draft bundle (${s.spec.type}) under the studio drafts folder${s.install ? ' and installs it' : ''}.`),
          s.op === 'install' && s.itemData?.installSpec && h('div', { style: { fontSize: 11, color: C.text2, marginTop: 4 } }, `Installs ${s.itemData.installSpec} (runs third-party code in the Host).`))),
        results && h('div', { style: { marginTop: 8 } }, results.map((r, i) => h('div', { key: i, style: { fontSize: 12, color: r.ok ? C.ok : C.danger, marginBottom: 3 } }, `${r.ok ? '✓' : '✗'} ${r.op}: ${r.ok ? (r.detail || 'done') : r.error}`)),
          results.some((r) => r.ok) && h('div', { style: { fontSize: 11, color: C.text2 } }, 'Package changes may need a restart or a plugin reload to take effect.')),
        staged.length > 0 && h('div', { style: { display: 'flex', gap: 6, marginTop: 6 } },
          h('button', { style: primary({ flex: 1 }), disabled: applying, onClick: onApply }, applying ? 'Applying…' : 'Apply to harness'),
          h('button', { style: btn({ flex: 1 }), disabled: diffLoading, onClick: previewDiff }, diffLoading ? 'Preview…' : 'Preview (dry-run)')),
        diff !== null && h('div', { style: { marginTop: 8, padding: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, maxHeight: 200, overflow: 'auto', fontSize: 11, color: C.text2, whiteSpace: 'pre-wrap', fontFamily: 'monospace' } }, diff));
    }

    // ---------- AI panel ----------
    function AiPanel({ open, setOpen, selected, market, onStageAction, seed, clearSeed, compareItems }) {
      const [msgs, setMsgs] = useState([]);
      const [text, setText] = useState('');
      const [busy, setBusy] = useState(false);
      const [models, setModels] = useState({ models: [], current: '' });
      const [model, setModel] = useState('');
      const [settings, setSettings] = useState(null);
      const [showCfg, setShowCfg] = useState(false);
      const [cfg, setCfg] = useState({ baseUrl: '', apiKey: '' });
      const endRef = useRef(null);
      const load = useCallback(async () => {
        try { const s = await api('/ai/settings'); setSettings(s); setCfg({ baseUrl: s.baseUrl || '', apiKey: s.apiKey || '' }); } catch { /* ignore */ }
        try { const m = await api('/ai/models'); setModels(m); setModel((cur) => cur || m.current || 'deepseek-flash'); } catch { /* ignore */ }
      }, []);
      useEffect(() => { load(); }, [load]);
      useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [msgs, busy]);
      const send = useCallback(async (content) => {
        if (!content.trim() || busy) return;
        const next = [...msgs, { role: 'user', content }];
        setMsgs(next); setText(''); setBusy(true);
        try {
          const r = await api('/ai/chat', {
            messages: next, model,
            selected: selected ? { id: selected.id, label: selected.label || selected.title, package: selected.package || selected.name } : null,
            market: (market || []).filter(Boolean).map(stripMarket),
          });
          setMsgs([...next, { role: 'assistant', content: r.text || '(no text)', actions: r.actions || [], model: r.model }]);
        } catch (e) {
          setMsgs([...next, { role: 'assistant', content: `⚠ ${e.message}`, error: true }]);
          if (/key/i.test(e.message)) setShowCfg(true);
        } finally { setBusy(false); }
      }, [msgs, busy, model, selected, market]);
      useEffect(() => { if (seed && open) { send(seed); clearSeed(); } }, [seed, open]);
      if (!open) return h('button', { style: btn({ position: 'absolute', right: 12, bottom: 12, zIndex: 10 }), onClick: () => setOpen(true) }, '✦ AI');
      const describe = (a) => {
        if (a.op === 'install') return `Install ${a.item}`;
        if (a.op === 'setConfig') return `Set ${Object.keys(a.patch || {}).join(', ')} on ${a.node}`;
        if (a.op === 'toggle') return `${a.enabled === false ? 'Disable' : 'Enable'} ${a.node}`;
        if (a.op === 'remove') return `Remove ${a.node}`;
        if (a.op === 'scaffold') return `Create ${a.spec?.type} “${a.spec?.title || a.spec?.name}”`;
        if (a.op === 'compare') return `Compare ${(a.items || []).join(' vs ')}`;
        return a.op;
      };
      return h('div', { style: { width: 340, background: C.surface, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 } },
        h('div', { style: { padding: 10, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 6, alignItems: 'center' } },
          h('b', { style: { color: C.text, flex: 1 } }, '✦ Assistant'),
          h('select', { style: input({ width: 130 }), value: model, onChange: (e) => setModel(e.target.value), 'aria-label': 'Model' },
            (models.models.length ? models.models : [model || 'deepseek-flash']).map((m) => h('option', { key: m, value: m }, m))),
          h('button', { style: btn({ padding: '3px 7px' }), title: 'AI settings', onClick: () => setShowCfg((v) => !v) }, '⚙'),
          h('button', { style: btn({ padding: '3px 7px' }), title: 'Collapse', onClick: () => setOpen(false) }, '»')),
        showCfg && h('div', { style: { padding: 10, borderBottom: `1px solid ${C.border}` } },
          h('div', { style: { fontSize: 11, color: C.text2, marginBottom: 6 } }, settings?.hasKey ? `API key set (${settings.keySource}).` : 'No API key set. DeepSeek is the default provider.'),
          h('label', { style: { display: 'block', fontSize: 11, color: C.muted, marginBottom: 2 } }, 'Base URL'),
          h('input', { style: input({ marginBottom: 6 }), value: cfg.baseUrl, onChange: (e) => setCfg({ ...cfg, baseUrl: e.target.value }), placeholder: 'https://api.deepseek.com' }),
          h('label', { style: { display: 'block', fontSize: 11, color: C.muted, marginBottom: 2 } }, 'Model'),
          h('input', { style: input({ marginBottom: 6 }), value: model, onChange: (e) => setModel(e.target.value), placeholder: 'deepseek-flash' }),
          h('label', { style: { display: 'block', fontSize: 11, color: C.muted, marginBottom: 2 } }, 'API Key'),
          h('input', { style: input({ marginBottom: 6 }), type: 'password', autoComplete: 'off', value: cfg.apiKey, onChange: (e) => setCfg({ ...cfg, apiKey: e.target.value }), onFocus: (e) => e.target.select() }),
          h('button', { style: primary(), onClick: async () => { try { const s = await api('/ai/settings', { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model }); setSettings(s); setShowCfg(false); load(); } catch (e) { setMsgs((m) => [...m, { role: 'assistant', content: `⚠ ${e.message}`, error: true }]); } } }, 'Save'),
          h('div', { style: { fontSize: 10, color: C.muted, marginTop: 6 } }, 'Default is DeepSeek (https://api.deepseek.com). Settings are stored locally with owner-only permissions.')),
        h('div', { style: { flex: 1, overflow: 'auto', padding: 10 } },
          !settings?.hasKey && h('div', { style: { margin: '0 0 10px', padding: 10, borderRadius: 8, background: `${C.warn}18`, border: `1px solid ${C.warn}50` } },
            h('div', { style: { fontWeight: 600, color: C.warn, fontSize: 12, marginBottom: 4 } }, 'Assistant API Key Required'),
            h('div', { style: { fontSize: 11, color: C.text2, marginBottom: 6 } }, 'Enter an API key (DeepSeek or OpenRouter) to enable chat:'),
            h('div', { style: { display: 'flex', gap: 6 } },
              h('input', { style: input({ flex: 1 }), type: 'password', placeholder: 'sk-...', value: cfg.apiKey, onChange: (e) => setCfg({ ...cfg, apiKey: e.target.value }) }),
              h('button', { style: primary({ flexShrink: 0, padding: '4px 10px' }), onClick: async () => {
                try {
                  const s = await api('/ai/settings', { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model });
                  setSettings(s);
                  load();
                } catch (e) {
                  setMsgs((m) => [...m, { role: 'assistant', content: `⚠ ${e.message}`, error: true }]);
                }
              } }, 'Save Key'))),
          msgs.length === 0 && h('div', { style: { color: C.muted, fontSize: 12, lineHeight: 1.5 } },
            'Ask about your harness, compare marketplace items, or have me design a plugin, MCP connection or skill. Changes I propose are only staged; you review and apply them.',
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 } },
              [['Compare marketplace items', compareItems.length ? `Compare these marketplace items for my harness and recommend one: ${compareItems.map((i) => i.id).join(', ')}` : 'Compare the top marketplace results for my current search and recommend one.'],
                ['Create a plugin', 'Help me create a new plugin. Ask what it should do, then propose a scaffold.'],
                ['Audit my harness', 'Review my current harness graph and point out risks or redundant plugins.']].map(([l, p]) => h('button', { key: l, style: btn({ textAlign: 'left' }), onClick: () => send(p) }, l)))),
          msgs.map((m, i) => h('div', { key: i, style: { marginBottom: 10, textAlign: m.role === 'user' ? 'right' : 'left' } },
            h('div', { style: { display: 'inline-block', maxWidth: '95%', textAlign: 'left', padding: '7px 10px', borderRadius: 10, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: m.role === 'user' ? C.accent : C.surface2, color: m.role === 'user' ? '#fff' : (m.error ? C.danger : C.text) } }, m.content),
            m.actions?.length > 0 && h('div', { style: { marginTop: 6 } }, m.actions.map((a, j) => h('div', { key: j, style: { display: 'flex', gap: 6, alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px', marginBottom: 4, fontSize: 12, color: C.text } },
              h('span', { style: { flex: 1 } }, describe(a)), a.op !== 'compare' && h('button', { style: primary({ padding: '2px 8px' }), onClick: () => onStageAction(a) }, 'Stage')))))),
          busy && h('div', { style: { color: C.muted, fontSize: 12 } }, 'Thinking…'), h('div', { ref: endRef })),
        h('form', { style: { padding: 10, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 6 }, onSubmit: (e) => { e.preventDefault(); send(text); } },
          h('input', { style: input(), value: text, placeholder: selected ? `Ask about ${selected.label || selected.title || selected.name}…` : 'Ask anything…', onChange: (e) => setText(e.target.value) }),
          h('button', { style: primary(), type: 'submit', disabled: busy }, 'Send')));
    }

    // ---------- Main app ----------
    let keySeq = 0;
    function StudioApp() {
      const [graph, setGraph] = useState({ nodes: [], edges: [], sources: {} });
      const [err, setErr] = useState('');
      const [loading, setLoading] = useState(true);
      const [pos, setPos] = useState(() => lsGet('dsh-studio-pos', {}));
      const [view, setView] = useState({ x: 0, y: 0, k: 1 });
      const [sel, setSel] = useState(null);
      const [marketOpen, setMarketOpen] = useState(true);
      const [aiOpen, setAiOpen] = useState(() => lsGet('dsh-studio-ai', true));
      const [q, setQ] = useState('');
      const [kind, setKind] = useState('all');
      const [mItems, setMItems] = useState([]);
      const [mStatus, setMStatus] = useState(null);
      const [mLoading, setMLoading] = useState(false);
      const [mLinks, setMLinks] = useState([]);
      const [compare, setCompare] = useState([]);
      const [staged, setStaged] = useState([]);
      const [showChanges, setShowChanges] = useState(false);
      const [applying, setApplying] = useState(false);
      const [results, setResults] = useState(null);
      const [seed, setSeed] = useState('');
      const [filter, setFilter] = useState('');
      const wrap = useRef(null);
      const drag = useRef(null);

      const refresh = useCallback(async () => {
        setLoading(true);
        try { setGraph(await api('/graph')); setErr(''); } catch (e) { setErr(e.message); } finally { setLoading(false); }
      }, []);
      useEffect(() => { refresh(); }, [refresh]);
      useEffect(() => { lsSet('dsh-studio-ai', aiOpen); }, [aiOpen]);

      const runMarket = useCallback(async () => {
        setMLoading(true);
        try { const r = await api('/market', { query: q, kind }); setMItems(r.items || []); setMStatus(r.status || null); setMLinks(r.links || []); } catch (e) { setMStatus({ error: e.message }); } finally { setMLoading(false); }
      }, [q, kind]);
      useEffect(() => { runMarket(); }, [q, kind]);

      // staged installs/scaffolds appear as draft nodes
      const draftNodes = useMemo(() => staged.filter((s) => s.op === 'install' || s.op === 'scaffold').map((s) => ({
        id: `draft:${s.key}`, label: s.op === 'install' ? (s.itemData?.title || s.item) : (s.spec?.title || s.spec?.name), type: 'draft', package: s.op === 'install' ? s.itemData?.name : s.spec?.type, editable: true, state: 'staged', description: 'Staged, not applied yet.', stagedKey: s.key,
      })), [staged]);
      const allNodes = useMemo(() => [...graph.nodes, ...draftNodes], [graph, draftNodes]);
      const auto = useMemo(() => autoLayout(allNodes), [allNodes]);
      const cleanPos = useMemo(() => sanitizePositions(pos, allNodes), [pos, allNodes]);
      const P = (id) => cleanPos[id] || auto[id] || { x: 0, y: 0 };
      const shown = useMemo(() => { const f = filter.trim().toLowerCase(); return f ? new Set(allNodes.filter((n) => `${n.label} ${n.package} ${n.type}`.toLowerCase().includes(f)).map((n) => n.id)) : null; }, [filter, allNodes]);

      const stage = useCallback((c) => {
        if (c.op === 'unstage') { setStaged((s) => s.filter((x) => x.key !== c.key)); return; }
        setStaged((s) => {
          const key = c.op === 'setConfig' ? `cfg:${c.node}` : c.op === 'toggle' || c.op === 'remove' ? `${c.op}:${c.node}` : `k${++keySeq}`;
          return [...s.filter((x) => x.key !== key), { ...c, key }];
        });
        setResults(null); setShowChanges(true);
      }, []);
      const stageAction = useCallback((a) => {
        if (a.op === 'install') {
          const item = mItems.find((i) => i.id === a.item);
          if (!item) { setSeed(`I could not find marketplace item "${a.item}" in the current results. Search for it first.`); return; }
          stage({ op: 'install', item: item.id, itemData: stripMarket(item), label: `Install ${item.title || item.name}` });
        } else if (a.op === 'scaffold') stage({ op: 'scaffold', spec: a.spec || {}, label: `Create ${a.spec?.title || a.spec?.name || 'plugin'}` });
        else if (['setConfig', 'toggle', 'remove'].includes(a.op)) stage({ ...a, label: `${a.op} ${a.node}` });
      }, [mItems, stage]);

      const apply = useCallback(async () => {
        setApplying(true);
        try {
          const changes = staged.map(({ key, label, ...c }) => c);
          const r = await api('/apply', { changes });
          setResults(r.results);
          setStaged((s) => s.filter((x, i) => {
            const res = r.results?.[i];
            // Keep staged item if no corresponding result (length mismatch) or if result indicates failure
            return !res || res.ok !== true;
          }));
          refresh();
        } catch (e) { setResults([{ op: 'apply', ok: false, error: e.message }]); } finally { setApplying(false); }
      }, [staged, refresh]);

      // pan / zoom (coordinates relative to the canvas rect)
      // Infinite canvas: no bounds. Ctrl/Cmd+wheel or a mouse wheel zooms at the cursor; trackpad scroll pans.
      const zoomAt = (mx, my, factor) => setView((v) => {
        const k = Math.min(2.5, Math.max(0.15, v.k * factor));
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
      });
      const onWheel = (e) => {
        e.preventDefault();
        const r = wrap.current.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const mouseNotch = e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50;
        if (e.ctrlKey || e.metaKey || mouseNotch) zoomAt(mx, my, Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * (e.ctrlKey ? 0.01 : 0.0025)));
        else setView((v) => ({ ...v, x: v.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) }));
      };
      const zoomBy = (f) => { const r = wrap.current?.getBoundingClientRect(); if (r) zoomAt(r.width / 2, r.height / 2, f); };
      useEffect(() => { const el = wrap.current; if (!el) return; el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel); });
      // Drag handling uses window-level listeners so panning keeps working when the pointer leaves the canvas
      // or the host swallows pointer capture. Any mouse button on empty canvas pans.
      const moved = useRef(false);
      const startDrag = (d) => {
        drag.current = d; moved.current = false;
        const mv = (e) => {
          const dd = drag.current; if (!dd) return;
          const dx = e.clientX - dd.sx, dy = e.clientY - dd.sy;
          if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
          if (dd.type === 'pan') setView((v) => ({ ...v, x: dd.ox + dx, y: dd.oy + dy }));
          else setPos((p) => ({ ...p, [dd.id]: { x: dd.ox + dx / dd.k, y: dd.oy + dy / dd.k } }));
        };
        const up = () => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
          const dd = drag.current; drag.current = null;
          if (dd?.type === 'node' && moved.current) setPos((p) => { lsSet('dsh-studio-pos', p); return p; });
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      };
      const onBgDown = (e) => { if (e.button > 1) return; e.preventDefault(); startDrag({ type: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }); };
      const onNodeDown = (e, n) => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); const p = P(n.id); startDrag({ type: 'node', id: n.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, k: view.k }); };
      const fit = useCallback(() => {
        const r = wrap.current?.getBoundingClientRect(); if (!r || !allNodes.length) return;
        const xs = allNodes.map((n) => P(n.id)); const minX = Math.min(...xs.map((p) => p.x)), maxX = Math.max(...xs.map((p) => p.x + NW)), minY = Math.min(...xs.map((p) => p.y)), maxY = Math.max(...xs.map((p) => p.y + NH));
        const k = Math.min(1.2, Math.max(0.3, Math.min(r.width / (maxX - minX + 80), r.height / (maxY - minY + 80))));
        setView({ k, x: (r.width - (maxX - minX) * k) / 2 - minX * k, y: (r.height - (maxY - minY) * k) / 2 - minY * k });
      }, [allNodes, cleanPos, auto]);
      useEffect(() => { if (!loading && graph.nodes.length) fit(); }, [loading]);

      const resetLayout = () => {
        const fresh = autoLayout(allNodes);
        setPos(fresh);
        lsSet('dsh-studio-pos', fresh);
        setTimeout(fit, 60);
      };

      const selectNode = (n) => setSel(n.type === 'draft' ? { ...n } : n);
      const selectedNode = sel && !sel.__market ? (allNodes.find((n) => n.id === sel.id) || sel) : sel;
      const edgePath = (e) => {
        const a = P(e.from), b = P(e.to);
        // Connect from right port of source node to left port of target node
        const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
        const dx = Math.max(40, Math.abs(x2 - x1) / 2);
        return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      };
      const compareItems = mItems.filter((i) => compare.includes(i.id));
      const toggleCompare = (i) => setCompare((c) => (c.includes(i.id) ? c.filter((x) => x !== i.id) : [...c, i.id].slice(-4)));
      const src = graph.sources || {};
      const degraded = ['pluginManager', 'loader'].filter((k) => src[k] === false);

      return h('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: C.bg, color: C.text, fontFamily: 'inherit' } },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${C.border}`, background: C.surface } },
          h('b', { style: { fontSize: 14 } }, 'Workflow Studio'),
          h('input', { style: input({ width: 200 }), placeholder: 'Filter nodes…', value: filter, onChange: (e) => setFilter(e.target.value) }),
          h('button', { style: btn(), onClick: refresh }, loading ? '…' : 'Refresh'),
          h('button', { style: btn(), onClick: resetLayout }, 'Auto Layout'),
          h('button', { style: btn(), onClick: fit }, 'Fit'),
          h('button', { style: btn({ background: marketOpen ? C.surface2 : C.surface }), onClick: () => setMarketOpen((v) => !v) }, 'Marketplace'),
          h('span', { style: { flex: 1 } }),
          degraded.length > 0 && h('span', { style: { fontSize: 11, color: C.warn }, title: 'Some harness services could not be read; the graph may be incomplete.' }, `⚠ partial data (${degraded.join(', ')})`),
          h('button', { style: staged.length ? primary() : btn(), onClick: () => setShowChanges((v) => !v) }, `Changes${staged.length ? ` (${staged.length})` : ''}`)),
        err && h('div', { style: { padding: '6px 12px', color: C.danger, fontSize: 12 } }, `Could not load the harness graph: ${err}`),
        h('div', { style: { flex: 1, display: 'flex', minHeight: 0, position: 'relative' } },
          marketOpen && h(Market, { onPick: (i) => setSel({ ...i, __market: true }), selectedId: sel?.__market ? sel.id : null, items: mItems, status: mStatus, loading: mLoading, kind, setKind, query: q, setQuery: setQ, run: runMarket, compare, links: mLinks }),
          h('div', {
            ref: wrap, onPointerDown: onBgDown, onClick: () => { if (!moved.current) setSel(null); },
            style: { flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none', cursor: 'grab', userSelect: 'none', backgroundImage: `radial-gradient(${C.border} 1px, transparent 1px)`, backgroundSize: `${20 * view.k}px ${20 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` },
          },
            h('div', { style: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.x}px,${view.y}px) scale(${view.k})` } },
              h('svg', { width: 1, height: 1, style: { position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' } },
                graph.edges.map((e) => h('path', { key: e.id, d: edgePath(e), fill: 'none', stroke: C.muted, strokeWidth: 1.5, opacity: shown && !(shown.has(e.from) && shown.has(e.to)) ? 0.1 : 0.7 }))),
              allNodes.map((n) => h('div', { key: n.id, style: { opacity: shown && !shown.has(n.id) ? 0.2 : 1 } }, h(NodeCard, { n, pos: P(n.id), selected: selectedNode?.id === n.id, onDown: onNodeDown, onClick: selectNode })))),
            h('div', { onPointerDown: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation(), style: { position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 4, zIndex: 5 } },
              h('button', { style: btn({ padding: '3px 9px' }), title: 'Zoom out', onClick: () => zoomBy(1 / 1.25) }, '−'),
              h('button', { style: btn({ padding: '3px 9px' }), title: 'Zoom in', onClick: () => zoomBy(1.25) }, '+'),
              h('button', { style: btn({ padding: '3px 9px' }), title: 'Fit to screen', onClick: fit }, '⤢')),
            !loading && allNodes.length === 0 && h('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: C.muted, fontSize: 13 } }, 'No nodes found. Check that the harness services are available.')),
          selectedNode && h(Inspector, { sel: selectedNode, staged, onStage: stage, onClose: () => setSel(null), onAsk: (p) => { setAiOpen(true); setSeed(p); }, inCompare: compare.includes(selectedNode.id), onCompare: toggleCompare }),
          h(AiPanel, { open: aiOpen, setOpen: setAiOpen, selected: selectedNode, market: compareItems.length ? compareItems : mItems.slice(0, 15), onStageAction: stageAction, seed, clearSeed: () => setSeed(''), compareItems }),
          showChanges && h(Changes, { staged, onUnstage: (key) => stage({ op: 'unstage', key }), onApply: apply, applying, results, onClose: () => setShowChanges(false) })));
    }

    function PanelIcon({ size = 18 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('rect', { x: 3, y: 3, width: 6, height: 6, rx: 1.5 }), h('rect', { x: 15, y: 3, width: 6, height: 6, rx: 1.5 }), h('rect', { x: 9, y: 15, width: 6, height: 6, rx: 1.5 }),
        h('path', { d: 'M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9' }), h('path', { d: 'M12 13v2' }));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'workflow-studio', order: 20, label: () => 'Workflow Studio' }, PanelIcon));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'workflow-studio' }, StudioApp));
      },
    };
  },
});
