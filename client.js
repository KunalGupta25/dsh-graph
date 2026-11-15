window.__ModuleLoader__.load({
  id: '@local/dsh-workflow-studio',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, createElement: h } = React;

    // --- DeepSeek Harness Native Theme Tokens ---
    const THEME = {
      bg: '#14161a',              // DSH deep neutral-bluish canvas
      gridDot: '#232731',         // n8n dot grid
      surface: '#1d2129',          // node card surface
      surfaceHover: '#252b36',    // hovered card surface
      surfaceSelected: '#2a313d', // selected node highlight
      border: 'rgba(255, 255, 255, 0.08)',
      borderHover: 'rgba(255, 255, 255, 0.18)',
      textPrimary: '#edf0f5',     // DSH off-white text
      textSecondary: '#8c95a6',   // cool gray label text
      textMuted: '#5d6575',
      accent: '#4f78e8',          // DSH brand blue
      accentGlow: 'rgba(79, 120, 232, 0.25)',
      core: '#64748b',            // slate
      preset: '#f59e0b',          // amber
      tool: '#10b981',            // emerald
      mcp: '#06b6d4',             // cyan
      skill: '#a855f7',           // purple
      draft: '#eab308'            // gold
    };

    /**
     * Initial baseline topological DAG layout (collision-free 4-tier arrangement)
     */
    function computeTopologicalLayout(rawNodes) {
      const tier0 = []; // Core
      const tier1 = []; // Presets
      const tier2 = []; // Skills & MCPs
      const tier3 = []; // Tools & Plugins

      for (const n of rawNodes) {
        if (n.type === 'core') tier0.push(n);
        else if (n.type === 'preset') tier1.push(n);
        else if (n.type === 'skill' || n.type === 'mcp') tier2.push(n);
        else tier3.push(n);
      }

      const Y_PITCH = 115;
      const copy = rawNodes.map(n => ({ ...n }));

      tier0.forEach((n, i) => { n.x = 80; n.y = 80 + i * Y_PITCH; });
      tier1.forEach((n, i) => { n.x = 380; n.y = 80 + i * (Y_PITCH + 10); });
      tier2.forEach((n, i) => { n.x = 680; n.y = 80 + i * Y_PITCH; });
      tier3.forEach((n, i) => { n.x = 980; n.y = 80 + i * Y_PITCH; });

      return copy;
    }

    /**
     * Workflow Studio Full Page & Interactive Canvas
     */
    function WorkflowStudioApp({ isOpen = true, onClose, embedded = false }) {
      if (!isOpen && !embedded) return null;

      // Active Drawers: 'inspector' | 'copilot' | 'market' | 'diff' | null
      const [activeDrawer, setActiveDrawer] = useState('inspector');
      const [copilotTab, setCopilotTab] = useState('chat'); // 'chat' | 'creator'
      const [marketCategory, setMarketCategory] = useState('all');
      const [marketSearch, setMarketSearch] = useState('');

      // Canvas Navigation State
      const [scale, setScale] = useState(1);
      const [pan, setPan] = useState({ x: 60, y: 40 });
      const [isPanning, setIsPanning] = useState(false);
      const [panStart, setPanStart] = useState({ x: 0, y: 0 });

      // Node Dragging State (Every node is movable!)
      const [draggedNodeId, setDraggedNodeId] = useState(null);
      const [nodeDragOffset, setNodeDragOffset] = useState({ x: 0, y: 0 });
      const [selectedNode, setSelectedNode] = useState(null);

      // Interactive Cable Wiring State
      const [wiringStart, setWiringStart] = useState(null); // { nodeId, x, y }
      const [wiringMouse, setWiringMouse] = useState({ x: 0, y: 0 });
      const [selectedEdgeId, setSelectedEdgeId] = useState(null);

      // Graph Nodes & Edges State
      const [nodes, setNodes] = useState(() => computeTopologicalLayout([
        { id: 'core:tools', label: 'Tools Engine', fullPackage: '@deepseek-ai/dsh-tools', type: 'core', readOnly: true, desc: 'Central tool registry and execution pipeline' },
        { id: 'core:sessions', label: 'Session Store', fullPackage: '@deepseek-ai/dsh-session', type: 'core', readOnly: true, desc: 'Event-sourced conversation storage' },
        { id: 'core:agents', label: 'Agent Runtime', fullPackage: '@deepseek-ai/dsh-agent', type: 'core', readOnly: true, desc: 'Agent loop and execution dispatch' },
        { id: 'core:pluginManager', label: 'Plugin Manager', fullPackage: '@deepseek-ai/dsh-plugin-manager', type: 'core', readOnly: true, desc: 'Profile-wide bundle composer' },
        { id: 'preset:standard', label: 'Standard Agent', fullPackage: '@deepseek-ai/dsh-agent-preset', type: 'preset', readOnly: true, desc: 'Default agent with bash and editing tools' },
        { id: 'preset:ptc', label: 'PTC Agent', fullPackage: '@deepseek-ai/dsh-agent-preset', type: 'preset', readOnly: true, desc: 'Programmatic tool calling agent' },
        { id: 'skill:gravitas', label: 'Skill: gravitas', fullPackage: 'skill://gravitas', type: 'skill', readOnly: false, desc: 'Engineering reliability runtime directives' },
        { id: 'skill:rextend', label: 'Skill: rextend', fullPackage: 'skill://rextend', type: 'skill', readOnly: false, desc: 'Reverse engineering and knowledge preservation' },
        { id: 'mcp:builtin', label: 'Local MCP Server', fullPackage: '@deepseek-ai/dsh-mcp-client', type: 'mcp', readOnly: false, desc: 'Model Context Protocol local bridge' },
        { id: 'plugin:tool-bash', label: 'Bash Tool', fullPackage: '@deepseek-ai/dsh-tool-bash', type: 'tool', readOnly: true, desc: 'Model-facing terminal command tool' },
        { id: 'plugin:tool-editor', label: 'Str Replace Editor', fullPackage: '@deepseek-ai/dsh-tool-str-replace-editor', type: 'tool', readOnly: true, desc: 'Precise text file replace editor' }
      ]));

      const [edges, setEdges] = useState([
        { id: 'e1', from: 'core:agents', to: 'preset:standard' },
        { id: 'e2', from: 'core:agents', to: 'preset:ptc' },
        { id: 'e3', from: 'preset:standard', to: 'skill:gravitas' },
        { id: 'e4', from: 'preset:standard', to: 'skill:rextend' },
        { id: 'e5', from: 'preset:standard', to: 'mcp:builtin' },
        { id: 'e6', from: 'preset:standard', to: 'plugin:tool-bash' },
        { id: 'e7', from: 'preset:standard', to: 'plugin:tool-editor' }
      ]);

      // Staging Diff State
      const [stagedChanges, setStagedChanges] = useState([]);

      // Creator Mode Form
      const [creatorForm, setCreatorForm] = useState({
        name: 'custom-tool',
        type: 'host-tool',
        title: 'Custom Tool',
        description: 'Custom capability generated in Creator Mode'
      });

      // Copilot Chat
      const [chatMessages, setChatMessages] = useState([
        { role: 'assistant', text: 'Welcome to Workflow Studio. You can drag any node, connect cables from output to input ports, click cables to disconnect, or use Creator Mode to scaffold plugins.' }
      ]);
      const [chatInput, setChatInput] = useState('');

      // Auto-select first node on mount
      useEffect(() => {
        if (!selectedNode && nodes.length > 0) {
          setSelectedNode(nodes.find(n => n.id === 'preset:standard') || nodes[0]);
        }
      }, []);

      // --- Pointer / Drag / Wiring Handlers ---
      const handleCanvasMouseDown = (e) => {
        if (e.target.id === 'canvas-bg' || e.target.tagName === 'svg') {
          setIsPanning(true);
          setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
          setSelectedEdgeId(null);
        }
      };

      const handleNodeMouseDown = (e, node) => {
        e.stopPropagation();
        setSelectedNode(node);
        setSelectedEdgeId(null);
        setActiveDrawer('inspector');
        setDraggedNodeId(node.id);
        const nodeX = node.x || 0;
        const nodeY = node.y || 0;
        setNodeDragOffset({
          x: (e.clientX - pan.x) / scale - nodeX,
          y: (e.clientY - pan.y) / scale - nodeY
        });
      };

      const handlePortMouseDown = (e, node, type) => {
        e.stopPropagation();
        if (type === 'output') {
          const startX = (node.x || 0) + 210;
          const startY = (node.y || 0) + 41;
          setWiringStart({ nodeId: node.id, x: startX, y: startY });
          setWiringMouse({ x: startX, y: startY });
        }
      };

      const handlePortMouseUp = (e, targetNode, type) => {
        e.stopPropagation();
        if (wiringStart && wiringStart.nodeId !== targetNode.id && type === 'input') {
          const exists = edges.some(edge => edge.from === wiringStart.nodeId && edge.to === targetNode.id);
          if (!exists) {
            const newEdgeId = 'e_' + Date.now();
            const newEdge = { id: newEdgeId, from: wiringStart.nodeId, to: targetNode.id, type: 'user' };
            setEdges(prev => [...prev, newEdge]);
            const sourceNode = nodes.find(n => n.id === wiringStart.nodeId);
            setStagedChanges(prev => [
              { action: 'connect', from: wiringStart.nodeId, to: targetNode.id, label: (sourceNode ? sourceNode.label : wiringStart.nodeId) + ' ➔ ' + targetNode.label },
              ...prev
            ]);
          }
        }
        setWiringStart(null);
      };

      const handleMouseMove = (e) => {
        if (wiringStart) {
          const currentX = (e.clientX - pan.x) / scale;
          const currentY = (e.clientY - pan.y) / scale;
          setWiringMouse({ x: currentX, y: currentY });
        } else if (draggedNodeId) {
          const currentX = (e.clientX - pan.x) / scale - nodeDragOffset.x;
          const currentY = (e.clientY - pan.y) / scale - nodeDragOffset.y;
          setNodes(prev => prev.map(n => n.id === draggedNodeId ? { ...n, x: Math.round(currentX), y: Math.round(currentY) } : n));
        } else if (isPanning) {
          setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
        }
      };

      const handleMouseUp = () => {
        setDraggedNodeId(null);
        setIsPanning(false);
        setWiringStart(null);
      };

      // Disconnect specific edge
      const handleDeleteEdge = (edgeId) => {
        setEdges(prev => prev.filter(e => e.id !== edgeId));
        if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
        setStagedChanges(prev => [{ action: 'disconnect', edgeId }, ...prev]);
      };

      // Disconnect all edges for selected node
      const handleDisconnectAllNodeEdges = (nodeId) => {
        const removed = edges.filter(e => e.from === nodeId || e.to === nodeId);
        setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
        setStagedChanges(prev => [{ action: 'disconnect-all', nodeId, count: removed.length }, ...prev]);
      };

      // Auto-arrange Toolbar Action
      const handleAutoArrange = () => {
        setNodes(prev => computeTopologicalLayout(prev));
      };

      // Add Marketplace Item to Graph
      const handleAddMarketplaceItem = (item) => {
        const nodeId = 'market:' + item.id;
        if (nodes.some(n => n.id === nodeId)) return;

        // Position on Tier 3 with safe Y offset
        const tier3Count = nodes.filter(n => n.x >= 900).length;
        const newNode = {
          id: nodeId,
          label: item.title,
          fullPackage: item.name,
          type: item.type === 'mcp' ? 'mcp' : item.type === 'skill' ? 'skill' : 'tool',
          readOnly: false,
          status: 'ready',
          description: item.description,
          x: 980,
          y: 80 + tier3Count * 115,
          isDraft: true
        };

        setNodes(prev => [...prev, newNode]);
        setEdges(prev => [...prev, { id: 'edge:preset:standard->' + nodeId, from: 'preset:standard', to: nodeId }]);
        setStagedChanges(prev => [...prev, { action: 'insert', package: item.name, id: item.id }]);
        setSelectedNode(newNode);
        setActiveDrawer('inspector');
      };

      // Delete Node Action
      const handleDeleteNode = (nodeId) => {
        setNodes(prev => prev.filter(n => n.id !== nodeId));
        setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
        setStagedChanges(prev => [...prev, { action: 'remove', id: nodeId }]);
        setSelectedNode(null);
      };

      // Scaffold in Creator Mode
      const handleScaffoldSubmit = () => {
        const cleanName = creatorForm.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const nodeId = 'draft:' + cleanName;
        const tier3Count = nodes.filter(n => n.x >= 900).length;

        const newNode = {
          id: nodeId,
          label: creatorForm.title,
          fullPackage: '@local/' + cleanName,
          type: 'draft',
          readOnly: false,
          status: 'draft',
          description: creatorForm.description,
          x: 980,
          y: 80 + tier3Count * 115,
          isDraft: true
        };

        setNodes(prev => [...prev, newNode]);
        setEdges(prev => [...prev, { id: 'edge:preset:standard->' + nodeId, from: 'preset:standard', to: nodeId }]);
        setStagedChanges(prev => [...prev, { action: 'scaffold', package: '@local/' + cleanName, type: creatorForm.type }]);
        setSelectedNode(newNode);
        setActiveDrawer('inspector');
      };

      // Copilot Chat
      const handleChatSubmit = (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        const q = chatInput;
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', text: q }]);

        setTimeout(() => {
          let reply = 'I analyzed your workflow. Standard Agent is currently connected to ' + edges.filter(ed => ed.from === 'preset:standard').length + ' components.';
          if (q.toLowerCase().includes('arrange') || q.toLowerCase().includes('clean') || q.toLowerCase().includes('overlap')) {
            handleAutoArrange();
            reply = 'I ran the topological auto-arrange engine! Nodes are now cleanly aligned with zero overlaps.';
          } else if (q.toLowerCase().includes('postgres') || q.toLowerCase().includes('database') || q.toLowerCase().includes('sql')) {
            reply = 'For databases, I recommend @community/dsh-plugin-postgres. Click Marketplace to add it to your canvas.';
          } else if (q.toLowerCase().includes('focus') || q.toLowerCase().includes('preset')) {
            const presetNode = nodes.find(n => n.id === 'preset:standard');
            if (presetNode) setSelectedNode(presetNode);
            reply = 'Focused on Standard Agent Preset in the inspector.';
          }
          setChatMessages(prev => [...prev, { role: 'assistant', text: reply }]);
        }, 300);
      };

      return h('div', {
        style: {
          position: embedded ? 'relative' : 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100%',
          height: '100%',
          backgroundColor: THEME.bg,
          color: THEME.textPrimary,
          zIndex: embedded ? 1 : 9999,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          userSelect: 'none'
        }
      },
        // --- Top Navigation & Control Bar ---
        h('div', {
          style: {
            height: 48,
            backgroundColor: THEME.surface,
            borderBottom: '1px solid ' + THEME.border,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            zIndex: 100
          }
        },
          // Left Brand & Status
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
            h('div', {
              style: {
                display: 'flex', alignItems: 'center', gap: 6,
                fontWeight: 700, fontSize: 14, color: THEME.textPrimary
              }
            },
              h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: THEME.accent, strokeWidth: 2.2 },
                h('rect', { x: 3, y: 3, width: 6, height: 6, rx: 1.5 }),
                h('rect', { x: 15, y: 3, width: 6, height: 6, rx: 1.5 }),
                h('rect', { x: 9, y: 15, width: 6, height: 6, rx: 1.5 }),
                h('path', { d: 'M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9' }),
                h('path', { d: 'M12 13v2' })
              ),
              h('span', null, 'Workflow Studio')
            ),
            h('span', {
              style: {
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: 'rgba(79, 120, 232, 0.12)',
                color: THEME.accent,
                fontWeight: 600
              }
            }, nodes.length + ' Nodes • ' + edges.length + ' Connections'),
            stagedChanges.length > 0 && h('span', {
              style: {
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                color: THEME.preset,
                fontWeight: 600
              }
            }, '● ' + stagedChanges.length + ' Staged')
          ),

          // Center Actions & Tools
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('button', {
              onClick: handleAutoArrange,
              style: topBtnStyle(false),
              title: 'Re-align all nodes into collision-free topological tiers'
            }, '⚡ Auto-Arrange'),

            h('button', {
              onClick: () => setActiveDrawer(activeDrawer === 'market' ? null : 'market'),
              style: topBtnStyle(activeDrawer === 'market')
            }, '+ Add Component'),

            h('button', {
              onClick: () => setActiveDrawer(activeDrawer === 'copilot' ? null : 'copilot'),
              style: topBtnStyle(activeDrawer === 'copilot')
            }, '✨ AI Copilot'),

            h('button', {
              onClick: () => setActiveDrawer(activeDrawer === 'diff' ? null : 'diff'),
              style: {
                ...topBtnStyle(activeDrawer === 'diff'),
                borderColor: stagedChanges.length > 0 ? THEME.preset : THEME.border
              }
            }, 'Review Diff (' + stagedChanges.length + ')')
          ),

          // Right Controls
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            !embedded && h('button', {
              onClick: onClose,
              style: { ...topBtnStyle(false), color: THEME.textSecondary }
            }, 'Close')
          )
        ),

        // --- Studio Main Workspace ---
        h('div', {
          style: { flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' },
          onMouseMove: handleMouseMove,
          onMouseUp: handleMouseUp,
          onMouseLeave: handleMouseUp
        },
          // --- SVG Infinite Canvas Area ---
          h('div', {
            id: 'canvas-bg',
            onMouseDown: handleCanvasMouseDown,
            style: {
              flex: 1,
              position: 'relative',
              cursor: isPanning ? 'grabbing' : draggedNodeId ? 'grabbing' : wiringStart ? 'crosshair' : 'grab',
              overflow: 'hidden'
            }
          },
            // Zoom & Canvas Controls Overlay
            h('div', {
              style: {
                position: 'absolute',
                bottom: 20,
                left: 20,
                display: 'flex',
                gap: 4,
                backgroundColor: THEME.surface,
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid ' + THEME.border,
                zIndex: 50
              }
            },
              h('button', { onClick: () => setScale(s => Math.min(2, s + 0.15)), style: zoomBtnStyle }, '+'),
              h('button', { onClick: () => setScale(s => Math.max(0.4, s - 0.15)), style: zoomBtnStyle }, '-'),
              h('button', { onClick: () => { setScale(1); setPan({ x: 60, y: 40 }); }, style: zoomBtnStyle }, 'Reset')
            ),

            // SVG Surface
            h('svg', {
              style: {
                width: '100%',
                height: '100%',
                transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + scale + ')',
                transformOrigin: '0 0'
              }
            },
              // Dot Grid Pattern definition
              h('defs', null,
                h('pattern', { id: 'dot-grid', width: 24, height: 24, patternUnits: 'userSpaceOnUse' },
                  h('circle', { cx: 2, cy: 2, r: 1.2, fill: THEME.gridDot })
                )
              ),
              h('rect', { x: -3000, y: -3000, width: 9000, height: 9000, fill: 'url(#dot-grid)' }),

              // --- Spline Edges ---
              edges.map(e => {
                const src = nodes.find(n => n.id === e.from);
                const dst = nodes.find(n => n.id === e.to);
                if (!src || !dst) return null;

                const startX = (src.x || 0) + 210;
                const startY = (src.y || 0) + 41;
                const endX = dst.x || 0;
                const endY = (dst.y || 0) + 41;

                const dx = Math.max(60, Math.abs(endX - startX) * 0.45);
                const pathD = 'M ' + startX + ' ' + startY + ' C ' + (startX + dx) + ' ' + startY + ', ' + (endX - dx) + ' ' + endY + ', ' + endX + ' ' + endY;
                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;
                const isSelectedEdge = selectedEdgeId === e.id;

                return h('g', {
                  key: e.id,
                  style: { cursor: 'pointer' },
                  onClick: (ev) => {
                    ev.stopPropagation();
                    setSelectedEdgeId(e.id);
                  }
                },
                  // Wide invisible stroke for easy clicking/hovering
                  h('path', { d: pathD, stroke: 'transparent', strokeWidth: 16, fill: 'none' }),
                  // Shadow / Halo path
                  h('path', { d: pathD, stroke: 'rgba(0,0,0,0.5)', strokeWidth: isSelectedEdge ? 6 : 4, fill: 'none' }),
                  // Active bezier spline
                  h('path', {
                    d: pathD,
                    stroke: isSelectedEdge ? '#f43f5e' : (e.type === 'draft' || e.type === 'user') ? THEME.draft : THEME.accent,
                    strokeWidth: isSelectedEdge ? 3 : 2,
                    strokeDasharray: (e.type === 'draft' || e.type === 'user') ? '5 4' : undefined,
                    fill: 'none'
                  }),
                  // Selected Edge Delete Badge
                  isSelectedEdge && h('g', {
                    transform: 'translate(' + midX + ', ' + midY + ')',
                    onClick: (ev) => {
                      ev.stopPropagation();
                      handleDeleteEdge(e.id);
                    }
                  },
                    h('circle', { cx: 0, cy: 0, r: 10, fill: '#f43f5e', stroke: THEME.bg, strokeWidth: 2 }),
                    h('text', { x: 0, y: 0, textAnchor: 'middle', dominantBaseline: 'central', fill: '#fff', fontSize: 11, fontWeight: 700 }, '✕')
                  )
                );
              }),

              // Live Wiring Preview Spline
              wiringStart && (() => {
                const dx = Math.max(40, Math.abs(wiringMouse.x - wiringStart.x) * 0.5);
                const previewPath = 'M ' + wiringStart.x + ' ' + wiringStart.y + ' C ' + (wiringStart.x + dx) + ' ' + wiringStart.y + ', ' + (wiringMouse.x - dx) + ' ' + wiringMouse.y + ', ' + wiringMouse.x + ' ' + wiringMouse.y;
                return h('g', null,
                  h('path', { d: previewPath, stroke: 'rgba(0,0,0,0.5)', strokeWidth: 4, fill: 'none' }),
                  h('path', {
                    d: previewPath,
                    stroke: THEME.accent,
                    strokeWidth: 2.5,
                    strokeDasharray: '6 4',
                    fill: 'none'
                  }),
                  h('circle', { cx: wiringMouse.x, cy: wiringMouse.y, r: 5, fill: THEME.accent, stroke: '#fff', strokeWidth: 2 })
                );
              })(),

              // --- n8n-Style Node Cards ---
              nodes.map(node => {
                const isSelected = selectedNode?.id === node.id;
                const isDragged = draggedNodeId === node.id;

                let categoryColor = THEME.tool;
                let categoryLabel = 'TOOL';
                let iconChar = '⚡';

                if (node.type === 'core') {
                  categoryColor = THEME.core;
                  categoryLabel = 'CORE SERVICE';
                  iconChar = '⚙';
                } else if (node.type === 'preset') {
                  categoryColor = THEME.preset;
                  categoryLabel = 'AGENT PRESET';
                  iconChar = '👤';
                } else if (node.type === 'skill') {
                  categoryColor = THEME.skill;
                  categoryLabel = 'SKILL';
                  iconChar = '📖';
                } else if (node.type === 'mcp') {
                  categoryColor = THEME.mcp;
                  categoryLabel = 'MCP SERVER';
                  iconChar = '🔌';
                } else if (node.type === 'draft') {
                  categoryColor = THEME.draft;
                  categoryLabel = 'DRAFT';
                  iconChar = '✨';
                }

                return h('g', {
                  key: node.id,
                  transform: 'translate(' + (node.x || 0) + ', ' + (node.y || 0) + ')',
                  onMouseDown: (e) => handleNodeMouseDown(e, node),
                  style: { cursor: isDragged ? 'grabbing' : 'grab' }
                },
                  // Card Drop Shadow & Card Frame
                  h('rect', {
                    width: 210,
                    height: 82,
                    rx: 8,
                    fill: isSelected ? THEME.surfaceSelected : THEME.surface,
                    stroke: isSelected ? THEME.accent : isDragged ? THEME.borderHover : THEME.border,
                    strokeWidth: isSelected ? 2 : 1,
                    filter: 'drop-shadow(0px 4px 10px rgba(0,0,0,0.35))'
                  }),

                  // Left Category Color Stripe
                  h('path', {
                    d: 'M 0 8 Q 0 0 8 0 L 8 82 Q 0 82 0 74 Z',
                    fill: categoryColor
                  }),

                  // Icon Tile Box
                  h('rect', {
                    x: 14, y: 14, width: 26, height: 26, rx: 6,
                    fill: 'rgba(255, 255, 255, 0.05)',
                    stroke: 'rgba(255, 255, 255, 0.08)',
                    strokeWidth: 1
                  }),
                  h('text', {
                    x: 27, y: 31,
                    textAnchor: 'middle',
                    fill: categoryColor,
                    fontSize: 13,
                    fontWeight: 700
                  }, iconChar),

                  // Category Label Pill
                  h('text', {
                    x: 48, y: 22,
                    fill: categoryColor,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.5
                  }, categoryLabel),

                  // Node Main Title
                  h('text', {
                    x: 48, y: 38,
                    fill: THEME.textPrimary,
                    fontSize: 12,
                    fontWeight: 600
                  }, node.label.length > 20 ? node.label.substring(0, 18) + '…' : node.label),

                  // Subtitle / Package Name
                  h('text', {
                    x: 48, y: 52,
                    fill: THEME.textSecondary,
                    fontSize: 9
                  }, (node.fullPackage || '').replace('@deepseek-ai/', '')),

                  // Status Indicator Row
                  h('circle', {
                    cx: 52, cy: 68, r: 3,
                    fill: node.readOnly ? THEME.core : THEME.tool
                  }),
                  h('text', {
                    x: 60, y: 71,
                    fill: THEME.textMuted,
                    fontSize: 9,
                    fontWeight: 500
                  }, node.readOnly ? 'Locked Core' : node.isDraft ? 'Staged Draft' : 'Active'),

                  // Left Input Port (Handle) - Drop target for wiring
                  h('circle', {
                    cx: 0, cy: 41, r: 6,
                    fill: THEME.accent,
                    stroke: THEME.bg,
                    strokeWidth: 2,
                    style: { cursor: 'crosshair' },
                    onMouseUp: (e) => handlePortMouseUp(e, node, 'input')
                  }),

                  // Right Output Port (Handle) - Drag source for wiring
                  h('circle', {
                    cx: 210, cy: 41, r: 6,
                    fill: categoryColor,
                    stroke: THEME.bg,
                    strokeWidth: 2,
                    style: { cursor: 'crosshair' },
                    onMouseDown: (e) => handlePortMouseDown(e, node, 'output')
                  })
                );
              })
            )
          ),

          // --- Right Slide-Over Inspector / Copilot / Marketplace Drawer ---
          activeDrawer && h('div', {
            style: {
              width: 360,
              backgroundColor: THEME.surface,
              borderLeft: '1px solid ' + THEME.border,
              display: 'flex',
              flexDirection: 'column',
              zIndex: 100
            }
          },
            // Drawer Tabs Header
            h('div', {
              style: {
                height: 44,
                borderBottom: '1px solid ' + THEME.border,
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px'
              }
            },
              h('button', {
                onClick: () => setActiveDrawer('inspector'),
                style: drawerTabStyle(activeDrawer === 'inspector')
              }, 'Inspector'),
              h('button', {
                onClick: () => setActiveDrawer('market'),
                style: drawerTabStyle(activeDrawer === 'market')
              }, 'Marketplace'),
              h('button', {
                onClick: () => setActiveDrawer('copilot'),
                style: drawerTabStyle(activeDrawer === 'copilot')
              }, 'AI Copilot'),
              h('button', {
                onClick: () => setActiveDrawer(null),
                style: { ...drawerTabStyle(false), flex: 'none', padding: '0 12px', color: THEME.textMuted }
              }, '✕')
            ),

            // --- Drawer Content 1: Node Inspector ---
            activeDrawer === 'inspector' && h('div', { style: { flex: 1, overflowY: 'auto', padding: 16 } },
              selectedNode ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
                // Header Card
                h('div', null,
                  h('div', { style: { fontSize: 11, fontWeight: 700, color: THEME.accent, textTransform: 'uppercase' } }, selectedNode.type),
                  h('div', { style: { fontSize: 16, fontWeight: 700, color: THEME.textPrimary, marginTop: 2 } }, selectedNode.label),
                  h('div', { style: { fontSize: 11, color: THEME.textSecondary, marginTop: 2 } }, selectedNode.fullPackage)
                ),

                // Immutability Notice
                h('div', {
                  style: {
                    padding: '8px 12px',
                    borderRadius: 6,
                    backgroundColor: selectedNode.readOnly ? 'rgba(100, 116, 139, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid ' + (selectedNode.readOnly ? 'rgba(100, 116, 139, 0.25)' : 'rgba(16, 185, 129, 0.25)'),
                    fontSize: 12,
                    color: selectedNode.readOnly ? THEME.core : THEME.tool
                  }
                }, selectedNode.readOnly ? '🔒 Core System Component (Read-Only)' : '✏️ User Composition (Configurable & Movable)'),

                // Description
                selectedNode.desc && h('div', null,
                  h('div', { style: fieldLabelStyle }, 'Description'),
                  h('p', { style: { fontSize: 12, color: THEME.textSecondary, margin: '4px 0 0 0', lineHeight: 1.5 } }, selectedNode.desc)
                ),

                // Coordinates
                h('div', null,
                  h('div', { style: fieldLabelStyle }, 'Canvas Position'),
                  h('div', { style: { fontSize: 12, color: THEME.textMuted, marginTop: 4 } },
                    'X: ' + (selectedNode.x || 0) + 'px  •  Y: ' + (selectedNode.y || 0) + 'px (Drag node to move)'
                  )
                ),

                // Injected Services
                Array.isArray(selectedNode.injectedServices) && selectedNode.injectedServices.length > 0 && h('div', null,
                  h('div', { style: fieldLabelStyle }, 'Injected Services'),
                  h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 } },
                    selectedNode.injectedServices.map(s => h('span', { key: s, style: chipStyle }, s))
                  )
                ),

                // Disconnect Connections Action
                (() => {
                  const nodeEdges = edges.filter(e => e.from === selectedNode.id || e.to === selectedNode.id);
                  if (nodeEdges.length === 0) return null;
                  return h('div', { style: { marginTop: 10 } },
                    h('button', {
                      onClick: () => handleDisconnectAllNodeEdges(selectedNode.id),
                      style: {
                        width: '100%',
                        padding: '8px',
                        backgroundColor: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        color: THEME.preset,
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }
                    }, 'Disconnect All Cables (' + nodeEdges.length + ')')
                  );
                })(),

                // Delete Action (if not read-only)
                !selectedNode.readOnly && h('div', { style: { marginTop: 10 } },
                  h('button', {
                    onClick: () => handleDeleteNode(selectedNode.id),
                    style: {
                      width: '100%',
                      padding: '8px',
                      backgroundColor: 'rgba(244, 63, 94, 0.12)',
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                      color: '#f43f5e',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }
                  }, 'Remove from Canvas')
                )
              ) : h('div', { style: { color: THEME.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 40 } },
                'Select any node or drag a cable to inspect details.'
              )
            ),

            // --- Drawer Content 2: Marketplace ---
            activeDrawer === 'market' && h('div', { style: { flex: 1, overflowY: 'auto', padding: 16 } },
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                h('div', { style: { fontSize: 14, fontWeight: 700, color: THEME.textPrimary } }, 'Component Registry'),
                h('div', { style: { fontSize: 12, color: THEME.textSecondary } }, 'Add plugins, curated MCP bridges, or agent skills directly to your graph.'),

                // Search Input
                h('input', {
                  type: 'text',
                  placeholder: 'Search marketplace & skills...',
                  value: marketSearch,
                  onChange: e => setMarketSearch(e.target.value),
                  style: {
                    padding: '8px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid ' + THEME.border,
                    borderRadius: 6,
                    color: THEME.textPrimary,
                    fontSize: 12,
                    outline: 'none'
                  }
                }),

                // Category Filter Pills
                h('div', { style: { display: 'flex', gap: 6, marginTop: 4 } },
                  ['all', 'mcp', 'skill', 'community'].map(cat => h('button', {
                    key: cat,
                    onClick: () => setMarketCategory(cat),
                    style: {
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      border: 'none',
                      backgroundColor: marketCategory === cat ? THEME.accent : 'rgba(255,255,255,0.06)',
                      color: marketCategory === cat ? '#fff' : THEME.textSecondary,
                      cursor: 'pointer'
                    }
                  }, cat.toUpperCase()))
                ),

                // Filtered Catalog List
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 } },
                  MARKETPLACE_CATALOG
                    .filter(item => (marketCategory === 'all' || item.type === marketCategory) &&
                                   (item.title.toLowerCase().includes(marketSearch.toLowerCase()) ||
                                    item.description.toLowerCase().includes(marketSearch.toLowerCase())))
                    .map(item => {
                      const alreadyAdded = nodes.some(n => n.id === 'market:' + item.id || n.fullPackage === item.name);
                      return h('div', {
                        key: item.id,
                        style: {
                          padding: 12,
                          backgroundColor: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid ' + THEME.border,
                          borderRadius: 8,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }
                      },
                        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                          h('span', { style: { fontWeight: 600, fontSize: 13, color: THEME.textPrimary } }, item.title),
                          h('span', {
                            style: {
                              fontSize: 10,
                              fontWeight: 700,
                              color: item.type === 'mcp' ? THEME.mcp : item.type === 'skill' ? THEME.skill : THEME.tool
                            }
                          }, item.type.toUpperCase())
                        ),
                        h('p', { style: { fontSize: 11, color: THEME.textSecondary, margin: 0, lineHeight: 1.4 } }, item.description),
                        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 } },
                          h('span', { style: { fontSize: 10, color: THEME.textMuted } }, item.author),
                          h('button', {
                            onClick: () => handleAddMarketplaceItem(item),
                            disabled: alreadyAdded,
                            style: {
                              padding: '4px 12px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              backgroundColor: alreadyAdded ? 'rgba(255,255,255,0.06)' : THEME.accent,
                              color: alreadyAdded ? THEME.textMuted : '#fff',
                              border: 'none',
                              cursor: alreadyAdded ? 'default' : 'pointer'
                            }
                          }, alreadyAdded ? 'Added' : '+ Add')
                        )
                      );
                    })
                )
              )
            ),

            // --- Drawer Content 3: AI Copilot ---
            activeDrawer === 'copilot' && h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },
              // Subtabs
              h('div', { style: { display: 'flex', borderBottom: '1px solid ' + THEME.border, padding: '4px 8px' } },
                h('button', {
                  onClick: () => setCopilotTab('chat'),
                  style: drawerTabStyle(copilotTab === 'chat')
                }, 'Chat Advisor'),
                h('button', {
                  onClick: () => setCopilotTab('creator'),
                  style: drawerTabStyle(copilotTab === 'creator')
                }, 'Creator Scaffolder')
              ),

              copilotTab === 'chat' ? h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
                // Chat Message Stream
                h('div', { style: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 } },
                  chatMessages.map((m, idx) => h('div', {
                    key: idx,
                    style: {
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      backgroundColor: m.role === 'user' ? THEME.accent : 'rgba(255, 255, 255, 0.05)',
                      color: THEME.textPrimary,
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      lineHeight: 1.4
                    }
                  }, m.text))
                ),
                // Input bar
                h('form', {
                  onSubmit: handleChatSubmit,
                  style: { padding: 8, borderTop: '1px solid ' + THEME.border, display: 'flex', gap: 6 }
                },
                  h('input', {
                    type: 'text',
                    value: chatInput,
                    onChange: e => setChatInput(e.target.value),
                    placeholder: 'Ask about plugins, auto-arranging...',
                    style: {
                      flex: 1,
                      padding: '6px 10px',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid ' + THEME.border,
                      borderRadius: 6,
                      color: THEME.textPrimary,
                      fontSize: 12,
                      outline: 'none'
                    }
                  }),
                  h('button', {
                    type: 'submit',
                    style: {
                      padding: '6px 12px',
                      backgroundColor: THEME.accent,
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }
                  }, 'Send')
                )
              ) : h('div', { style: { flex: 1, overflowY: 'auto', padding: 16 } },
                // Creator Mode Scaffolding Form
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                  h('div', { style: { fontSize: 13, fontWeight: 700, color: THEME.accent } }, 'Scaffold New Cordis Bundle'),
                  h('div', { style: { fontSize: 11, color: THEME.textSecondary } }, 'Generate a compliant DSH plugin with schema, renderers, and patch entry directly onto the canvas.'),

                  h('label', { style: fieldLabelStyle }, 'Package Identifier'),
                  h('input', {
                    type: 'text',
                    value: creatorForm.name,
                    onChange: e => setCreatorForm({ ...creatorForm, name: e.target.value }),
                    style: inputStyle
                  }),

                  h('label', { style: fieldLabelStyle }, 'Display Title'),
                  h('input', {
                    type: 'text',
                    value: creatorForm.title,
                    onChange: e => setCreatorForm({ ...creatorForm, title: e.target.value }),
                    style: inputStyle
                  }),

                  h('label', { style: fieldLabelStyle }, 'Bundle Archetype'),
                  h('select', {
                    value: creatorForm.type,
                    onChange: e => setCreatorForm({ ...creatorForm, type: e.target.value }),
                    style: { ...inputStyle, backgroundColor: THEME.surface }
                  },
                    h('option', { value: 'host-tool' }, 'Host Tool Plugin'),
                    h('option', { value: 'mcp' }, 'MCP Server Bundle'),
                    h('option', { value: 'decoration' }, 'UI Client Plugin')
                  ),

                  h('label', { style: fieldLabelStyle }, 'Description'),
                  h('textarea', {
                    value: creatorForm.description,
                    onChange: e => setCreatorForm({ ...creatorForm, description: e.target.value }),
                    rows: 3,
                    style: { ...inputStyle, resize: 'none' }
                  }),

                  h('button', {
                    onClick: handleScaffoldSubmit,
                    style: {
                      marginTop: 8,
                      padding: '8px 16px',
                      backgroundColor: THEME.preset,
                      color: '#000',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }
                  }, '✨ Scaffold on Canvas')
                )
              )
            ),

            // --- Drawer Content 4: Diff Review ---
            activeDrawer === 'diff' && h('div', { style: { flex: 1, overflowY: 'auto', padding: 16 } },
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                h('div', { style: { fontSize: 14, fontWeight: 700, color: THEME.textPrimary } }, 'Pending Composition Changes'),
                h('div', { style: { fontSize: 12, color: THEME.textSecondary } }, 'Review graph changes before committing to cordis.patch.yml.'),

                stagedChanges.length === 0 ? h('div', { style: { color: THEME.textMuted, fontSize: 12, marginTop: 20, textAlign: 'center' } },
                  'No changes staged. Add marketplace components or drag cables to stage composition diffs.'
                ) : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                  stagedChanges.map((ch, idx) => h('div', {
                    key: idx,
                    style: {
                      padding: '8px 12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid ' + THEME.border,
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: 'monospace'
                    }
                  },
                    ch.action === 'insert' && h('span', { style: { color: THEME.tool } }, '+ add plugin: ' + ch.package),
                    ch.action === 'remove' && h('span', { style: { color: '#f43f5e' } }, '- remove node: ' + ch.id),
                    ch.action === 'connect' && h('span', { style: { color: THEME.accent } }, '⚡ wire: ' + ch.label),
                    ch.action === 'disconnect' && h('span', { style: { color: THEME.preset } }, '✂ disconnect edge: ' + ch.edgeId),
                    ch.action === 'disconnect-all' && h('span', { style: { color: THEME.preset } }, '✂ disconnected ' + ch.count + ' cables from ' + ch.nodeId),
                    ch.action === 'scaffold' && h('span', { style: { color: THEME.draft } }, '✨ scaffold: ' + ch.package)
                  )),

                  h('button', {
                    onClick: () => {
                      alert('Staged composition verified! Ready to write to cordis.patch.yml.');
                      setStagedChanges([]);
                    },
                    style: {
                      marginTop: 12,
                      padding: '8px 16px',
                      backgroundColor: THEME.accent,
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }
                  }, 'Apply Composition to Harness Profile')
                )
              )
            )
          )
        )
      );
    }

    // Shared Styles
    const topBtnStyle = (active) => ({
      padding: '4px 10px',
      fontSize: 12,
      fontWeight: 500,
      backgroundColor: active ? 'rgba(79, 120, 232, 0.15)' : 'rgba(255, 255, 255, 0.04)',
      border: '1px solid ' + (active ? THEME.accent : THEME.border),
      color: active ? THEME.accent : THEME.textPrimary,
      borderRadius: 6,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    });

    const zoomBtnStyle = {
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      border: '1px solid ' + THEME.border,
      color: THEME.textPrimary,
      borderRadius: 4,
      cursor: 'pointer'
    };

    const drawerTabStyle = (active) => ({
      flex: 1,
      height: 32,
      border: 'none',
      borderBottom: '2px solid ' + (active ? THEME.accent : 'transparent'),
      backgroundColor: 'transparent',
      color: active ? THEME.textPrimary : THEME.textSecondary,
      fontSize: 12,
      fontWeight: active ? 600 : 500,
      cursor: 'pointer'
    });

    const fieldLabelStyle = {
      fontSize: 11,
      fontWeight: 600,
      color: THEME.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 6
    };

    const chipStyle = {
      padding: '2px 8px',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: 4,
      fontSize: 11,
      color: THEME.textPrimary,
      border: '1px solid ' + THEME.border
    };

    const inputStyle = {
      width: '100%',
      padding: '6px 10px',
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
      border: '1px solid ' + THEME.border,
      borderRadius: 6,
      color: THEME.textPrimary,
      fontSize: 12,
      outline: 'none',
      boxSizing: 'border-box'
    };

    // Curated Marketplace Registry
    const MARKETPLACE_CATALOG = [
      { id: 'mcp-postgres', name: '@modelcontextprotocol/server-postgres', title: 'PostgreSQL MCP', type: 'mcp', description: 'Read and write schemas and query database tables directly.', author: 'Anthropic' },
      { id: 'mcp-github', name: '@modelcontextprotocol/server-github', title: 'GitHub MCP', type: 'mcp', description: 'Interact with GitHub repositories, issues, PRs and branches.', author: 'GitHub' },
      { id: 'mcp-sqlite', name: '@modelcontextprotocol/server-sqlite', title: 'SQLite MCP', type: 'mcp', description: 'Query and explore local SQLite databases safely.', author: 'Anthropic' },
      { id: 'mcp-brave', name: '@modelcontextprotocol/server-brave-search', title: 'Brave Search MCP', type: 'mcp', description: 'Web search and local search engine integration.', author: 'Brave' },
      { id: 'skill-audit', name: 'skill://security-audit', title: 'Security Audit Skill', type: 'skill', description: 'Audits Cordis configs and detects credential leaks.', author: 'DSH Community' },
      { id: 'skill-mermaid', name: 'skill://mermaid-flowcharts', title: 'Mermaid Visualizer', type: 'skill', description: 'Renders dynamic interactive Mermaid diagrams in chat.', author: 'Core' },
      { id: 'comm-slack', name: '@community/dsh-slack-bridge', title: 'Slack Notification Bridge', type: 'community', description: 'Forwards session events and approvals to Slack channels.', author: 'Community' },
      { id: 'comm-docker', name: '@community/dsh-docker-runner', title: 'Docker Sandbox Runner', type: 'community', description: 'Executes untrusted bash tools in isolated containers.', author: 'DevOps Team' }
    ];

    /**
     * Sidebar Nav Icon Component (used by sidebar.panellist)
     * Matches DeepSeek Harness native icon size (16px or 18px)
     */
    function WorkflowStudioPanelIcon({ size = 18 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      },
        h('rect', { x: 3, y: 3, width: 6, height: 6, rx: 1.5 }),
        h('rect', { x: 15, y: 3, width: 6, height: 6, rx: 1.5 }),
        h('rect', { x: 9, y: 15, width: 6, height: 6, rx: 1.5 }),
        h('path', { d: 'M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9' }),
        h('path', { d: 'M12 13v2' })
      );
    }

    /**
     * Main Page View for Workflow Studio (rendered when selected in the sidebar)
     */
    function WorkflowStudioMainPage() {
      return h(WorkflowStudioApp, { embedded: true });
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // 1. Primary Left Sidebar Panel Entry (sidebar.panellist)
        // Order 20 places it directly below Automation tasks (order 10) and Plugins (order 0)
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'workflow-studio',
          order: 20,
          label: () => 'Workflow Studio'
        }, WorkflowStudioPanelIcon));

        // 2. Main Viewport Panel for Workflow Studio
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'workflow-studio'
        }, WorkflowStudioMainPage));
      }
    };
  }
});
