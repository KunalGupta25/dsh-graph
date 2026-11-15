window.__ModuleLoader__.load({
  id: '@local/dsh-workflow-studio',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, useRef, createElement: h } = React;

    // --- Palette & Styles ---
    const THEME = {
      bg: '#0f172a',
      surface: '#1e293b',
      surfaceHover: '#334155',
      border: '#334155',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      accent: '#0ea5e9',
      accentHover: '#0284c7',
      amber: '#f59e0b',
      emerald: '#10b981',
      indigo: '#6366f1',
      purple: '#a855f7',
      rose: '#f43f5e'
    };

    /**
     * Workflow Studio Modal & Canvas Component
     */
    function WorkflowStudioApp({ isOpen, onClose }) {
      if (!isOpen) return null;

      const [activeTab, setActiveTab] = useState('canvas'); // 'canvas' | 'marketplace'
      const [copilotOpen, setCopilotOpen] = useState(true);
      const [copilotTab, setCopilotTab] = useState('chat'); // 'chat' | 'creator' | 'market'
      
      // Canvas state
      const [scale, setScale] = useState(1);
      const [pan, setPan] = useState({ x: 80, y: 60 });
      const [isDragging, setIsDragging] = useState(false);
      const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
      const [selectedNode, setSelectedNode] = useState(null);

      // Graph data
      const [graph, setGraph] = useState({
        nodes: [
          { id: 'core:tools', label: 'Tools Registry (ctx.tools)', type: 'core', readOnly: true, x: 60, y: 80 },
          { id: 'core:sessions', label: 'Session Store (ctx.sessions)', type: 'core', readOnly: true, x: 60, y: 220 },
          { id: 'preset:standard', label: 'Standard Agent Preset', type: 'preset', readOnly: true, x: 340, y: 130, subnodes: ['skill:gravitas', 'mcp:builtin'] },
          { id: 'skill:gravitas', label: 'Skill: gravitas', type: 'skill', readOnly: false, x: 355, y: 210 },
          { id: 'mcp:builtin', label: 'MCP: Local Server', type: 'mcp', readOnly: false, x: 355, y: 260 },
          { id: 'plugin:tool-bash', label: 'Bash Tool (@dsh-tool-bash)', type: 'tool', readOnly: true, x: 620, y: 100 },
          { id: 'plugin:tool-editor', label: 'Str Replace Editor', type: 'tool', readOnly: true, x: 620, y: 220 }
        ],
        edges: [
          { from: 'core:tools', to: 'preset:standard' },
          { from: 'core:sessions', to: 'preset:standard' },
          { from: 'preset:standard', to: 'plugin:tool-bash' },
          { from: 'preset:standard', to: 'plugin:tool-editor' }
        ]
      });

      // Staging changes
      const [stagedChanges, setStagedChanges] = useState([]);
      const [showDiff, setShowDiff] = useState(false);

      // Copilot Chat
      const [messages, setMessages] = useState([
        { role: 'assistant', text: 'Welcome to Workflow Studio! I can explain your current Cordis architecture, suggest alternative plugins, or scaffold custom plugins in Creator Mode.' }
      ]);
      const [chatInput, setChatInput] = useState('');

      // Creator Mode Form
      const [creatorForm, setCreatorForm] = useState({
        name: 'my-custom-tool',
        type: 'host-tool',
        title: 'Custom Tool',
        description: 'Performs specialized tasks for the standard agent.'
      });

      // Pan & Zoom Handlers
      const handleMouseDown = (e) => {
        if (e.target.tagName === 'svg' || e.target.id === 'canvas-bg') {
          setIsDragging(true);
          setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
      };

      const handleMouseMove = (e) => {
        if (isDragging) {
          setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
      };

      const handleMouseUp = () => setIsDragging(false);

      // Stage Node Add
      const handleAddMarketNode = (item) => {
        const newNodeId = `plugin:${item.id}`;
        if (graph.nodes.some(n => n.id === newNodeId)) return;

        const newNode = {
          id: newNodeId,
          label: item.title,
          type: item.type === 'mcp' ? 'mcp' : item.type === 'skill' ? 'skill' : 'tool',
          readOnly: false,
          x: 400 + Math.random() * 80,
          y: 320 + Math.random() * 60,
          isDraft: true
        };

        const newEdge = { from: 'preset:standard', to: newNodeId };

        setGraph(prev => ({
          nodes: [...prev.nodes, newNode],
          edges: [...prev.edges, newEdge]
        }));

        setStagedChanges(prev => [...prev, `Insert plugin: ${item.name}`]);
      };

      // Creator Mode Submit
      const handleScaffoldSubmit = () => {
        const draftId = `draft:${creatorForm.name}`;
        const newDraftNode = {
          id: draftId,
          label: `${creatorForm.title} (Draft)`,
          type: 'draft',
          readOnly: false,
          x: 420,
          y: 350,
          isDraft: true
        };

        setGraph(prev => ({
          nodes: [...prev.nodes, newDraftNode],
          edges: [...prev.edges, { from: 'preset:standard', to: draftId }]
        }));

        setStagedChanges(prev => [...prev, `Created ${creatorForm.type} bundle: @local/${creatorForm.name}`]);
        setMessages(prev => [
          ...prev,
          { role: 'user', text: `Scaffold ${creatorForm.title}` },
          { role: 'assistant', text: `Scaffolded @local/${creatorForm.name} bundle! It has been added to the canvas as a draft node connected to Standard Agent. Review and apply patch when ready.` }
        ]);
        setCopilotTab('chat');
      };

      // Copilot Chat Submit
      const handleChatSubmit = (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        const q = chatInput;
        setChatInput('');

        setMessages(prev => [...prev, { role: 'user', text: q }]);

        setTimeout(() => {
          let reply = "I analyzed your current workflow graph. You have Standard Agent active with Bash and String Replace Editor tools.";
          if (q.toLowerCase().includes('database') || q.toLowerCase().includes('sql') || q.toLowerCase().includes('postgres')) {
            reply = "For databases, I recommend adding '@community/dsh-plugin-postgres' or the 'Postgres MCP Server'. Would you like me to drop it onto your canvas?";
          } else if (q.toLowerCase().includes('alternative')) {
            reply = "Alternative for command execution: PTC (Programmatic Tool Calling) agent provides a strictly sandboxed executor instead of raw bash.";
          }
          setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
        }, 500);
      };

      return h('div', {
        style: {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: THEME.bg,
          color: THEME.textPrimary,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }
      },
        // --- Top Bar ---
        h('div', {
          style: {
            height: 52,
            borderBottom: `1px solid ${THEME.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            backgroundColor: THEME.surface
          }
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
            h('span', { style: { fontWeight: 700, fontSize: 16, color: THEME.accent } }, 'DSH Workflow Studio'),
            h('span', {
              style: {
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: 'rgba(14, 165, 233, 0.15)',
                color: THEME.accent,
                fontWeight: 600
              }
            }, 'Cordis Live Canvas'),
            stagedChanges.length > 0 && h('span', {
              style: {
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                color: THEME.amber,
                fontWeight: 600
              }
            }, `${stagedChanges.length} staged change(s)`)
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            stagedChanges.length > 0 && h('button', {
              onClick: () => setShowDiff(true),
              style: {
                backgroundColor: THEME.amber,
                color: '#000',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer'
              }
            }, 'Review & Apply Patch'),
            h('button', {
              onClick: () => setCopilotOpen(!copilotOpen),
              style: {
                backgroundColor: copilotOpen ? THEME.accent : THEME.surfaceHover,
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer'
              }
            }, copilotOpen ? 'Hide Copilot' : 'Open Copilot'),
            h('button', {
              onClick: onClose,
              style: {
                backgroundColor: 'transparent',
                color: THEME.textSecondary,
                border: `1px solid ${THEME.border}`,
                padding: '6px 12px',
                borderRadius: 6,
                cursor: 'pointer'
              }
            }, 'Close')
          )
        ),

        // --- Main Studio Body ---
        h('div', { style: { flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' } },
          // --- Canvas Area ---
          h('div', {
            id: 'canvas-bg',
            onMouseDown: handleMouseDown,
            onMouseMove: handleMouseMove,
            onMouseUp: handleMouseUp,
            style: {
              flex: 1,
              position: 'relative',
              cursor: isDragging ? 'grabbing' : 'grab',
              overflow: 'hidden'
            }
          },
            // Zoom Controls
            h('div', {
              style: {
                position: 'absolute',
                bottom: 20,
                left: 20,
                display: 'flex',
                gap: 6,
                backgroundColor: THEME.surface,
                padding: 6,
                borderRadius: 8,
                border: `1px solid ${THEME.border}`,
                zIndex: 10
              }
            },
              h('button', { onClick: () => setScale(s => Math.min(2, s + 0.1)), style: btnStyle }, '+'),
              h('button', { onClick: () => setScale(s => Math.max(0.5, s - 0.1)), style: btnStyle }, '-'),
              h('button', { onClick: () => { setScale(1); setPan({ x: 80, y: 60 }); }, style: btnStyle }, 'Reset')
            ),

            // SVG Graph Renderer
            h('svg', {
              style: {
                width: '100%',
                height: '100%',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: '0 0'
              }
            },
              // Edges
              graph.edges.map((e, idx) => {
                const src = graph.nodes.find(n => n.id === e.from);
                const dst = graph.nodes.find(n => n.id === e.to);
                if (!src || !dst) return null;
                const pathD = `M ${src.x + 140} ${src.y + 30} C ${src.x + 220} ${src.y + 30}, ${dst.x - 80} ${dst.y + 30}, ${dst.x} ${dst.y + 30}`;
                return h('path', {
                  key: `edge-${idx}`,
                  d: pathD,
                  stroke: e.type === 'draft' ? THEME.amber : THEME.accent,
                  strokeWidth: 2,
                  strokeDasharray: e.type === 'draft' ? '4 4' : undefined,
                  fill: 'none'
                });
              }),

              // Nodes
              graph.nodes.map(node => {
                const isSelected = selectedNode?.id === node.id;
                let strokeColor = THEME.border;
                let badgeColor = THEME.textSecondary;
                let badgeText = 'Plugin';

                if (node.type === 'core') {
                  strokeColor = '#475569';
                  badgeColor = '#64748b';
                  badgeText = 'Core (Locked)';
                } else if (node.type === 'preset') {
                  strokeColor = THEME.amber;
                  badgeColor = THEME.amber;
                  badgeText = 'Agent Preset';
                } else if (node.type === 'skill') {
                  strokeColor = THEME.purple;
                  badgeColor = THEME.purple;
                  badgeText = 'Skill';
                } else if (node.type === 'mcp') {
                  strokeColor = THEME.emerald;
                  badgeColor = THEME.emerald;
                  badgeText = 'MCP';
                } else if (node.type === 'draft') {
                  strokeColor = THEME.amber;
                  badgeColor = THEME.amber;
                  badgeText = 'Draft Scaffolding';
                }

                return h('g', {
                  key: node.id,
                  transform: `translate(${node.x}, ${node.y})`,
                  onClick: () => setSelectedNode(node),
                  style: { cursor: 'pointer' }
                },
                  h('rect', {
                    width: 160,
                    height: 70,
                    rx: 8,
                    fill: THEME.surface,
                    stroke: isSelected ? '#fff' : strokeColor,
                    strokeWidth: isSelected ? 2.5 : 1.5,
                    strokeDasharray: node.type === 'draft' ? '4 3' : undefined
                  }),
                  // Port In
                  h('circle', { cx: 0, cy: 35, r: 4.5, fill: THEME.accent, stroke: THEME.bg, strokeWidth: 1.5 }),
                  // Port Out
                  h('circle', { cx: 160, cy: 35, r: 4.5, fill: THEME.emerald, stroke: THEME.bg, strokeWidth: 1.5 }),
                  // Badge
                  h('text', {
                    x: 10, y: 20, fill: badgeColor, fontSize: 10, fontWeight: 700
                  }, badgeText),
                  // Title
                  h('text', {
                    x: 10, y: 40, fill: THEME.textPrimary, fontSize: 12, fontWeight: 600
                  }, node.label.length > 20 ? node.label.substring(0, 18) + '...' : node.label),
                  // ReadOnly indicator
                  h('text', {
                    x: 10, y: 56, fill: THEME.textSecondary, fontSize: 9
                  }, node.readOnly ? '🔒 Immutable' : '✏️ Editable')
                );
              })
            )
          ),

          // --- Copilot Side Panel ---
          copilotOpen && h('div', {
            style: {
              width: 360,
              borderLeft: `1px solid ${THEME.border}`,
              backgroundColor: THEME.surface,
              display: 'flex',
              flexDirection: 'column'
            }
          },
            // Copilot Header Tabs
            h('div', {
              style: {
                display: 'flex',
                borderBottom: `1px solid ${THEME.border}`,
                backgroundColor: 'rgba(0,0,0,0.1)'
              }
            },
              h('button', {
                onClick: () => setCopilotTab('chat'),
                style: tabStyle(copilotTab === 'chat')
              }, 'AI Chat'),
              h('button', {
                onClick: () => setCopilotTab('creator'),
                style: tabStyle(copilotTab === 'creator')
              }, 'Creator Mode'),
              h('button', {
                onClick: () => setCopilotTab('market'),
                style: tabStyle(copilotTab === 'market')
              }, 'Marketplace')
            ),

            // Tab 1: AI Chat & Advice
            copilotTab === 'chat' && h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', padding: 12 } },
              h('div', { style: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 } },
                messages.map((m, i) => h('div', {
                  key: i,
                  style: {
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    backgroundColor: m.role === 'user' ? THEME.accent : THEME.surfaceHover,
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    maxWidth: '85%'
                  }
                }, m.text))
              ),
              h('form', { onSubmit: handleChatSubmit, style: { display: 'flex', gap: 6, marginTop: 8 } },
                h('input', {
                  type: 'text',
                  value: chatInput,
                  onChange: e => setChatInput(e.target.value),
                  placeholder: 'Ask about plugins or alternatives...',
                  style: inputStyle
                }),
                h('button', { type: 'submit', style: submitBtnStyle }, 'Send')
              )
            ),

            // Tab 2: Creator Mode Scaffolder
            copilotTab === 'creator' && h('div', { style: { flex: 1, overflowY: 'auto', padding: 16 } },
              h('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 8 } }, 'Scaffold New Plugin Bundle'),
              h('p', { style: { fontSize: 12, color: THEME.textSecondary, marginBottom: 12 } },
                'Generates compliant manifest, cordis.patch.yml, and code using DSH Creator rules.'
              ),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
                h('label', { style: labelStyle }, 'Bundle Type'),
                h('select', {
                  value: creatorForm.type,
                  onChange: e => setCreatorForm({ ...creatorForm, type: e.target.value }),
                  style: inputStyle
                },
                  h('option', { value: 'host-tool' }, 'Host Tool (Model-facing tool)'),
                  h('option', { value: 'mcp' }, 'MCP Server Bridge'),
                  h('option', { value: 'decoration' }, 'UI Decoration Widget'),
                  h('option', { value: 'preset' }, 'Custom Agent Preset')
                ),
                h('label', { style: labelStyle }, 'Package Name'),
                h('input', {
                  value: creatorForm.name,
                  onChange: e => setCreatorForm({ ...creatorForm, name: e.target.value }),
                  placeholder: 'my-custom-plugin',
                  style: inputStyle
                }),
                h('label', { style: labelStyle }, 'Display Title'),
                h('input', {
                  value: creatorForm.title,
                  onChange: e => setCreatorForm({ ...creatorForm, title: e.target.value }),
                  placeholder: 'My Custom Plugin',
                  style: inputStyle
                }),
                h('label', { style: labelStyle }, 'Description'),
                h('textarea', {
                  value: creatorForm.description,
                  onChange: e => setCreatorForm({ ...creatorForm, description: e.target.value }),
                  rows: 3,
                  style: inputStyle
                }),
                h('button', {
                  onClick: handleScaffoldSubmit,
                  style: { ...submitBtnStyle, padding: '8px 12px', marginTop: 10 }
                }, 'Scaffold & Drop on Canvas')
              )
            ),

            // Tab 3: Marketplace Discover
            copilotTab === 'market' && h('div', { style: { flex: 1, overflowY: 'auto', padding: 12 } },
              h('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 8 } }, 'DSH Plugin & MCP Market'),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                [
                  { id: 'dsh-plugin-postgres', title: 'PostgreSQL Manager', author: 'Community', type: 'dsh-plugin' },
                  { id: 'mcp-github', title: 'GitHub MCP Server', author: 'Anthropic', type: 'mcp' },
                  { id: 'mcp-sqlite', title: 'SQLite MCP Server', author: 'Community', type: 'mcp' },
                  { id: 'skill-antislop', title: 'Anti-Slop Clean Code', author: 'Community', type: 'skill' }
                ].map(item => h('div', {
                  key: item.id,
                  style: {
                    padding: 10,
                    backgroundColor: THEME.surfaceHover,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }
                },
                  h('div', null,
                    h('div', { style: { fontWeight: 600, fontSize: 13 } }, item.title),
                    h('div', { style: { fontSize: 11, color: THEME.textSecondary } }, `${item.type.toUpperCase()} • by ${item.author}`)
                  ),
                  h('button', {
                    onClick: () => handleAddMarketNode(item),
                    style: {
                      backgroundColor: THEME.accent,
                      border: 'none',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }
                  }, '+ Add')
                ))
              )
            )
          )
        ),

        // --- Staging Diff Review Modal ---
        showDiff && h('div', {
          style: {
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }
        },
          h('div', {
            style: {
              width: 500,
              backgroundColor: THEME.surface,
              borderRadius: 10,
              border: `1px solid ${THEME.border}`,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }
          },
            h('div', { style: { fontWeight: 700, fontSize: 16 } }, 'Review Staged Patch Diff'),
            h('pre', {
              style: {
                backgroundColor: '#090d16',
                padding: 12,
                borderRadius: 6,
                fontSize: 12,
                color: THEME.emerald,
                overflowX: 'auto',
                maxHeight: 250
              }
            },
              `--- baseline/cordis.patch.yml\n+++ staged/cordis.patch.yml\n` +
              stagedChanges.map(c => `+ # ${c}\n+ - insert:\n+     - id: ${c.split(' ').pop()}\n`).join('')
            ),
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 } },
              h('button', {
                onClick: () => setShowDiff(false),
                style: { backgroundColor: 'transparent', color: THEME.textSecondary, border: `1px solid ${THEME.border}`, padding: '6px 14px', borderRadius: 6, cursor: 'pointer' }
              }, 'Cancel'),
              h('button', {
                onClick: () => {
                  alert('Patch applied! Hot-reloading bundle in DSH.');
                  setShowDiff(false);
                  setStagedChanges([]);
                },
                style: { backgroundColor: THEME.emerald, color: '#000', border: 'none', padding: '6px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }
              }, 'Commit & Apply Live')
            )
          )
        )
      );
    }

    // Helper Styles
    const btnStyle = {
      backgroundColor: THEME.surfaceHover,
      color: '#fff',
      border: 'none',
      width: 28,
      height: 28,
      borderRadius: 4,
      cursor: 'pointer',
      fontWeight: 700
    };

    const tabStyle = (active) => ({
      flex: 1,
      padding: '10px 0',
      backgroundColor: active ? THEME.surface : 'transparent',
      border: 'none',
      borderBottom: active ? `2px solid ${THEME.accent}` : 'none',
      color: active ? THEME.textPrimary : THEME.textSecondary,
      fontWeight: 600,
      fontSize: 12,
      cursor: 'pointer'
    });

    const inputStyle = {
      backgroundColor: '#0f172a',
      border: `1px solid ${THEME.border}`,
      color: '#fff',
      padding: '8px 10px',
      borderRadius: 6,
      fontSize: 13,
      outline: 'none'
    };

    const labelStyle = {
      fontSize: 12,
      color: THEME.textSecondary,
      fontWeight: 600
    };

    const submitBtnStyle = {
      backgroundColor: THEME.accent,
      border: 'none',
      color: '#fff',
      borderRadius: 6,
      padding: '0 14px',
      fontWeight: 600,
      fontSize: 13,
      cursor: 'pointer'
    };

    /**
     * Sidebar Navigation Row for DeepSeek Harness Left Sidebar
     */
    function WorkflowStudioSidebarItem() {
      const [isOpen, setIsOpen] = useState(false);
      const [isHovered, setIsHovered] = useState(false);

      return h(React.Fragment, null,
        h('div', {
          onClick: () => setIsOpen(true),
          onMouseEnter: () => setIsHovered(true),
          onMouseLeave: () => setIsHovered(false),
          title: 'Workflow Studio - Visual Cordis Node Editor',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            margin: '2px 8px',
            borderRadius: 8,
            cursor: 'pointer',
            backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: isHovered ? '#ffffff' : '#cbd5e1',
            fontSize: 13,
            fontWeight: 500,
            transition: 'background-color 0.15s ease'
          }
        },
          // Workflow Graph Node Icon
          h('svg', {
            width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
            stroke: isHovered ? '#38bdf8' : '#94a3b8', strokeWidth: 2,
            strokeLinecap: 'round', strokeLinejoin: 'round'
          },
            h('rect', { x: 3, y: 3, width: 6, height: 6, rx: 1 }),
            h('rect', { x: 15, y: 3, width: 6, height: 6, rx: 1 }),
            h('rect', { x: 9, y: 15, width: 6, height: 6, rx: 1 }),
            h('path', { d: 'M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9' }),
            h('path', { d: 'M12 13v2' })
          ),
          h('span', null, 'Workflow Studio')
        ),
        h(WorkflowStudioApp, { isOpen, onClose: () => setIsOpen(false) })
      );
    }

    /**
     * Floating Quick-Access Pill (Always visible across pages)
     */
    function WorkflowStudioFloatingPill() {
      const [isOpen, setIsOpen] = useState(false);
      const [isHovered, setIsHovered] = useState(false);

      return h(React.Fragment, null,
        h('div', {
          onClick: () => setIsOpen(true),
          onMouseEnter: () => setIsHovered(true),
          onMouseLeave: () => setIsHovered(false),
          title: 'Open DSH Workflow Studio',
          style: {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9000,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 16px',
            borderRadius: '24px',
            backgroundColor: isHovered ? '#0284c7' : '#0ea5e9',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 4px 14px rgba(14, 165, 233, 0.4)',
            cursor: 'pointer',
            transition: 'all 0.18s ease',
            transform: isHovered ? 'scale(1.04)' : 'scale(1)'
          }
        },
          h('span', { style: { fontSize: '14px' } }, '⚡'),
          h('span', null, 'Workflow Studio')
        ),
        h(WorkflowStudioApp, { isOpen, onClose: () => setIsOpen(false) })
      );
    }

    /**
     * Toolbar Launcher Button docked into DSH Composer
     */
    function WorkflowStudioLauncher() {
      const [isOpen, setIsOpen] = useState(false);

      return h(React.Fragment, null,
        h('button', {
          onClick: () => setIsOpen(true),
          title: 'Open DSH Workflow Studio',
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 6,
            backgroundColor: 'rgba(14, 165, 233, 0.12)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            color: '#38bdf8',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }
        },
          h('span', null, '⚡'),
          h('span', null, 'Workflow Studio')
        ),
        h(WorkflowStudioApp, { isOpen, onClose: () => setIsOpen(false) })
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // 1. Primary Left Sidebar Navigation
        ctx.slots.inject('sidebar.entry', () => ctx.slots.register({
          name: 'sidebar.entry',
          id: 'workflow-studio-sidebar',
          order: 12
        }, WorkflowStudioSidebarItem));

        // 2. Sidebar action list fallback
        ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
          name: 'sidebar.panellist.actions',
          id: 'workflow-studio-sidebar-action',
          order: 12
        }, WorkflowStudioSidebarItem));

        // 3. Floating Overlay launcher (visible across any page)
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'workflow-studio-pill',
          order: 100
        }, WorkflowStudioFloatingPill));

        // 4. Conversation Composer Dock (visible inside active chat sessions)
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'workflow-studio-launcher',
          order: 2
        }, WorkflowStudioLauncher));
      }
    };
  }
});
