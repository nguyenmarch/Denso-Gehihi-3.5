import { tr, useLanguage } from '../i18n';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Focus, Maximize2, Minus, Plus, Search, Tags, X } from 'lucide-react';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import { GraphTopology, ImpactedNode } from '../types';

// Relations the backend PropagationService walks (backend/app/services/propagation_service.py).
const PROPAGATION_RELATIONS = new Set(['OPERATES_IN', 'FLOWS_TO', 'AFFECTS']);

interface GraphCanvasProps {
  topology: GraphTopology;
  impactedNodes?: ImpactedNode[];
  originId?: string;
  selectedId?: string;
  onNodeClick?: (nodeId: string) => void;
}

const nodeName = (properties: Record<string, unknown>, fallback: string) =>
  typeof properties.name === 'string' && properties.name ? properties.name : fallback;


const NODE_TYPES: Record<string, string> = {
  processstep: 'Công đoạn', equipment: 'Thiết bị', batch: 'Lô', department: 'Bộ phận',
  incidentevent: 'Kiểu lỗi đã biết', machineevent: 'Event máy', profilecheck: 'Kiểm tra profile',
  machine: 'Thiết bị', process: 'Công đoạn', step: 'Công đoạn', fault: 'Lỗi', part: 'Linh kiện', document: 'Tài liệu',
};
const cardLabel = (name: string, category: string) => `${tr(NODE_TYPES[category.toLowerCase()] ?? category)}\n${name}`;

const COL_GAP = 210;
// Rows above/below the process line, keyed by node label.
const ROW_Y: Record<string, number> = { IncidentEvent: -280, Batch: -140, ProcessStep: 0, Equipment: 140, MachineEvent: 215, ProfileCheck: 215, Department: 290 };
// Which relation anchors a node to a process-step column.
const ANCHOR_RELATION: Record<string, { type: string; dir: 'out' | 'in' }> = {
  Equipment: { type: 'OPERATES_IN', dir: 'out' },
  Batch: { type: 'PROCESSED_BY', dir: 'out' },
  IncidentEvent: { type: 'AFFECTS', dir: 'out' },
};
// Machine events and profile checks sit in the column of the equipment they belong to.
const EQUIPMENT_RELATION: Record<string, string> = { MachineEvent: 'RAISED_BY', ProfileCheck: 'CHECKS' };

// Deterministic production-line layout from the real topology: process steps left→right by `sequence`,
// equipment/batches/events in the column of the step they attach to, departments and unknown nodes in rows below.
const computePositions = (topology: GraphTopology): Record<string, { x: number; y: number }> => {
  const steps = topology.nodes
    .filter(n => n.label === 'ProcessStep')
    .sort((a, b) => (Number(a.properties.sequence) || 0) - (Number(b.properties.sequence) || 0) || a.id.localeCompare(b.id));
  const column = new Map(steps.map((s, i) => [s.id, i]));
  const equipmentColumn = new Map(topology.edges.filter(e => e.type === 'OPERATES_IN' && column.has(e.target)).map(e => [e.source, column.get(e.target)!]));
  const width = Math.max(steps.length - 1, 1) * COL_GAP;
  const positions: Record<string, { x: number; y: number }> = {};
  const cells = new Map<string, string[]>();
  const loose: Record<string, string[]> = {};

  topology.nodes.forEach(node => {
    if (node.label === 'ProcessStep') { positions[node.id] = { x: column.get(node.id)! * COL_GAP, y: 0 }; return; }
    const anchor = ANCHOR_RELATION[node.label];
    const edge = anchor && topology.edges.find(e => e.type === anchor.type && (anchor.dir === 'out' ? e.source === node.id : e.target === node.id) && column.has(anchor.dir === 'out' ? e.target : e.source));
    const relation = EQUIPMENT_RELATION[node.label];
    const owner = relation ? topology.edges.find(e => e.type === relation && e.source === node.id && equipmentColumn.has(e.target)) : undefined;
    if (edge || owner) {
      const col = edge ? column.get(anchor.dir === 'out' ? edge.target : edge.source) : equipmentColumn.get(owner!.target);
      const key = `${node.label}|${col}`;
      cells.set(key, [...(cells.get(key) ?? []), node.id]);
    } else {
      const row = node.label in ROW_Y ? node.label : 'Other';
      (loose[row] ??= []).push(node.id);
    }
  });

  // Nodes sharing a cell are spread horizontally around the column.
  cells.forEach((ids, key) => {
    const [label, col] = key.split('|');
    ids.sort().forEach((id, i) => { positions[id] = { x: Number(col) * COL_GAP + (i - (ids.length - 1) / 2) * 70, y: ROW_Y[label] + (i % 2) * 18 }; });
  });
  // Unanchored nodes are spread across the full width of their row.
  Object.entries(loose).forEach(([row, ids], r) => {
    const y = ROW_Y[row] ?? 310 + r * 90;
    ids.sort().forEach((id, i) => { positions[id] = { x: ids.length === 1 ? width / 2 : (i * width) / (ids.length - 1), y }; });
  });
  return positions;
};

// Damped force relaxation around semantic bands. Tethers preserve process order
// and type hierarchy while label-sized collision forces separate crowded cells.
// A fixed iteration count and stable node order make the final layout repeatable.
const settlePositions = (topology: GraphTopology) => {
  const anchors = computePositions(topology);
  const positions = Object.fromEntries(Object.entries(anchors).map(([id, p]) => [id, { ...p }]));
  const ids = topology.nodes.map(n => n.id).sort();
  const velocity = Object.fromEntries(ids.map(id => [id, { x: 0, y: 0 }]));
  for (let iteration = 0; iteration < 240; iteration++) {
    const forces = Object.fromEntries(ids.map(id => [id, { x: (anchors[id].x - positions[id].x) * 0.035, y: (anchors[id].y - positions[id].y) * 0.12 }]));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const dx = positions[b].x - positions[a].x, dy = positions[b].y - positions[a].y;
      if (Math.abs(dx) < 170 && Math.abs(dy) < 90) {
        const force = (170 - Math.abs(dx)) * (1 - Math.abs(dy) / 90) * 0.12;
        const direction = dx === 0 ? 1 : Math.sign(dx);
        forces[a].x -= force * direction; forces[b].x += force * direction;
      }
    }
    topology.edges.forEach(edge => {
      const a = positions[edge.source], b = positions[edge.target];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1;
      const initial = Math.hypot(anchors[edge.target].x - anchors[edge.source].x, anchors[edge.target].y - anchors[edge.source].y);
      const pull = (distance - Math.max(initial, 170)) * 0.003;
      forces[edge.source].x += dx / distance * pull; forces[edge.target].x -= dx / distance * pull;
      forces[edge.source].y += dy / distance * pull; forces[edge.target].y -= dy / distance * pull;
    });
    ids.forEach(id => {
      velocity[id].x = (velocity[id].x + forces[id].x) * 0.65;
      velocity[id].y = (velocity[id].y + forces[id].y) * 0.65;
      positions[id].x += Math.max(-8, Math.min(8, velocity[id].x));
      positions[id].y += Math.max(-4, Math.min(4, velocity[id].y));
    });
  }
  return positions;
};

const toElements = (topology: GraphTopology): ElementDefinition[] => {
  const positions = settlePositions(topology);
  return [
    ...topology.nodes.map(node => ({
      data: { id: node.id, name: nodeName(node.properties, node.id), label: cardLabel(nodeName(node.properties, node.id), node.label), category: node.label },
      position: positions[node.id],
    })),
    // Preserve parallel relationships as separate edges; malformed topology surfaces an error.
    ...topology.edges
      .map((edge, index) => ({ data: { id: `edge:${edge.id ?? index}:${edge.source}:${edge.type}:${edge.target}`, source: edge.source, target: edge.target, label: edge.type, walked: PROPAGATION_RELATIONS.has(edge.type) ? 1 : 0 } })),
  ];
};

// Text lives inside cards so labels remain attached to their nodes while panning and zooming.
const STYLE: cytoscape.StylesheetJson = [
  { selector: 'node', style: {
    label: 'data(label)', shape: 'round-rectangle', 'background-color': '#edf4ff', 'border-color': '#6399d6',
    'border-width': 1.5, color: '#244364', width: 150, height: 64, 'font-size': 12,
    'font-family': 'Arial', 'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap',
    'text-max-width': '130px', 'line-height': 1.3, 'overlay-opacity': 0,
    'transition-property': 'background-color, border-color, opacity', 'transition-duration': 180,
  } as cytoscape.Css.Node },
  { selector: 'node[category = "Equipment"], node[category = "machine"], node[category = "Machine"]', style: { 'background-color': '#eaf8f4', 'border-color': '#57a88f', color: '#225e4d' } },
  { selector: 'node[category = "Batch"], node[category = "part"], node[category = "Part"]', style: { 'background-color': '#f3edff', 'border-color': '#a488cc', color: '#604182' } },
  { selector: 'node[category = "Department"]', style: { 'background-color': '#f0f2f5', 'border-color': '#99a4b3', color: '#495667' } },
  { selector: 'node[category = "IncidentEvent"], node[category = "fault"], node[category = "Fault"]', style: { 'background-color': '#fff5e8', 'border-color': '#d9a360', color: '#86571f' } },
  { selector: 'node[category = "MachineEvent"]', style: { 'background-color': '#fff0ed', 'border-color': '#d48c7b', color: '#974c3a' } },
  { selector: 'node[category = "ProfileCheck"]', style: { 'background-color': '#eff8ee', 'border-color': '#90b488', color: '#466c3e' } },
  { selector: 'node[category = "document"], node[category = "Document"]', style: { 'background-color': '#eef4fa', 'border-color': '#75a5d3', color: '#3e6184' } },
  { selector: 'edge', style: {
    width: 1.4, 'curve-style': 'bezier', 'line-color': '#b5bdc5', 'target-arrow-color': '#b5bdc5',
    'target-arrow-shape': 'triangle', 'arrow-scale': 1, 'font-size': 9, color: '#56616c',
    'text-rotation': 'autorotate', 'text-background-color': '#ffffff', 'text-background-opacity': 1,
    'text-background-padding': '4px', 'text-margin-y': -8,
  } as cytoscape.Css.Edge },
  { selector: 'edge[walked = 1]', style: { width: 2, 'line-color': '#8797a8', 'target-arrow-color': '#8797a8' } },
  { selector: 'edge[walked = 0]', style: { 'line-style': 'dashed', 'line-dash-pattern': [5, 5], opacity: 0.55 } as cytoscape.Css.Edge },
  { selector: 'edge.show-relations, edge:selected, edge.hover', style: { label: 'data(label)' } },
  { selector: '.context-hidden', style: { display: 'none' } },
  { selector: 'node.faded', style: { opacity: 0.78 } },
  { selector: 'edge.faded', style: { opacity: 0.28 } },
  { selector: 'edge.neighbor', style: { opacity: 1, width: 2.5, 'line-color': '#c84b65', 'target-arrow-color': '#c84b65' } },
  { selector: 'node.impacted', style: {
    'background-color': 'mapData(impact, 0, 1, #fff6e5, #ffd5de)', 'border-color': '#d97756',
    'border-width': 2, height: 80, color: '#923c30', 'font-weight': 'bold',
  } as cytoscape.Css.Node },
  { selector: 'node.origin', style: { 'background-color': '#e60033', 'border-color': '#bf002b', 'border-width': 2, height: 80, color: '#ffffff', 'font-weight': 'bold' } as cytoscape.Css.Node },
  { selector: 'edge.propagation', style: { width: 3.5, 'line-color': '#e60033', 'target-arrow-color': '#e60033', opacity: 1, 'line-style': 'solid', 'z-index': 10 } as cytoscape.Css.Edge },
  { selector: 'node.selected', style: { 'border-color': '#e60033', 'border-width': 3, 'underlay-color': '#e60033', 'underlay-opacity': 0.08, 'underlay-padding': 7, 'underlay-shape': 'round-rectangle' } as cytoscape.Css.Node },
];

export const GraphCanvas: React.FC<GraphCanvasProps> = ({ topology, impactedNodes, originId, selectedId, onNodeClick }) => {
  const language = useLanguage();
  const [zoom, setZoom] = useState(1);
  const [showRelations, setShowRelations] = useState(false);
  const [focused, setFocused] = useState(() => window.innerWidth < 600);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | undefined>(undefined);
  const overviewPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const wasFocusedRef = useRef(false);
  const initialMobileCenterRef = useRef(false);
  const selectedNode = topology.nodes.find(node => node.id === selectedId);
  const related = useMemo(() => topology.edges
    .filter(edge => edge.source === selectedId || edge.target === selectedId)
    .map(edge => ({ edge, other: topology.nodes.find(node => node.id === (edge.source === selectedId ? edge.target : edge.source)) }))
    .filter((entry): entry is { edge: typeof topology.edges[number]; other: typeof topology.nodes[number] } => !!entry.other), [selectedId, topology]);
  const matches = useMemo(() => query.trim() ? topology.nodes.filter(node =>
    `${node.id} ${nodeName(node.properties, node.id)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 6) : [], [query, topology]);
  // Read the latest callback without re-creating the graph on every render.
  const initialSelectionRef = useRef(selectedId);
  initialSelectionRef.current = selectedId;
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: toElements(topology),
      style: STYLE,
      layout: { name: 'preset', fit: true, padding: 60 },
      wheelSensitivity: 0.2,
      minZoom: 0.05,
      maxZoom: 2.5,
    });
    cy.on('tap', 'node', event => onNodeClickRef.current?.(event.target.id()));
    cy.on('mouseover', 'edge', event => event.target.addClass('hover'));
    cy.on('mouseout', 'edge', event => event.target.removeClass('hover'));
    cyRef.current = cy;
    overviewPositionsRef.current = Object.fromEntries(cy.nodes().map(node => [node.id(), { ...node.position() }]));
    // Small screens open around the selected node at a readable scale; Fit remains an overview.
    if (cy.width() < 600) {
      const focus = initialSelectionRef.current ? cy.getElementById(initialSelectionRef.current) : cy.nodes().first();
      cy.zoom(0.8);
      if (focus.nonempty()) cy.center(focus);
    }
    setZoom(cy.zoom());
    cy.on('zoom', () => setZoom(cy.zoom()));
    let previousWidth = cy.width();
    const observer = new ResizeObserver(() => {
      cy.resize();
      const width = cy.width();
      if (previousWidth >= 600 && width < 600) {
        const focus = initialSelectionRef.current ? cy.getElementById(initialSelectionRef.current) : cy.nodes().first();
        if (focus.nonempty()) { cy.zoom(0.9); cy.center(focus); }
      }
      previousWidth = width;
    });
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); cy.destroy(); cyRef.current = undefined; };
  }, [topology]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('impacted origin propagation faded');
      cy.nodes().forEach(n => {
        const label = cardLabel(n.data('name'), n.data('category'));
        n.data({ label, baseLabel: label }); n.removeData('impact');
      });
      if (!originId || !impactedNodes) return;

      const distance = new Map<string, number>([[originId, 0]]);
      impactedNodes.forEach(n => distance.set(n.node_id, n.distance));
      const origin = cy.getElementById(originId);
      origin.addClass('origin').data('label', `${origin.data('baseLabel')}\n${tr('Điểm phát sinh')}`);
      impactedNodes.forEach(n => {
        const el = cy.getElementById(n.node_id);
        if (el.empty()) return;
        el.addClass('impacted').data({ impact: n.impact_score, label: `${el.data('baseLabel')}\n${tr('Điểm ảnh hưởng')}: ${n.impact_score.toFixed(3)}` });
      });
      // Shortest-path propagation edges: a walked relation going from distance d to distance d+1.
      cy.edges().forEach(edge => {
        const from = distance.get(edge.source().id());
        const to = distance.get(edge.target().id());
        if (from !== undefined && to === from + 1 && PROPAGATION_RELATIONS.has(edge.data('label'))) edge.addClass('propagation');
      });
      cy.elements().not('.origin, .impacted, .propagation').addClass('faded');
    });
  }, [impactedNodes, originId, topology, language]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('selected neighbor');
    if (selectedId) {
      const node = cy.getElementById(selectedId);
      node.addClass('selected'); node.connectedEdges().addClass('neighbor');
      if (cy.width() < 600 && !initialMobileCenterRef.current && node.nonempty()) {
        cy.zoom(0.9);
        cy.center(node);
        initialMobileCenterRef.current = true;
      }
    }
  }, [selectedId, topology]);

  useEffect(() => {
    cyRef.current?.edges().toggleClass('show-relations', showRelations);
  }, [showRelations, topology]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const visible = new Set<string>();
    if (focused && selectedId) {
      visible.add(selectedId);
      topology.edges.forEach(edge => {
        if (edge.source === selectedId) visible.add(edge.target);
        if (edge.target === selectedId) visible.add(edge.source);
      });
    }
    cy.batch(() => {
      cy.nodes().forEach(node => { node.toggleClass('context-hidden', focused && !visible.has(node.id())); });
      cy.edges().forEach(edge => { edge.toggleClass('context-hidden', focused && (!visible.has(edge.source().id()) || !visible.has(edge.target().id()))); });
      if (focused && selectedId) {
        cy.getElementById(selectedId).position({ x: 0, y: 0 });
        const neighbors = [...visible].filter(id => id !== selectedId).sort();
        const radius = cy.width() < 600 ? 175 : 235;
        neighbors.forEach((id, index) => {
          const angle = -Math.PI / 2 + index * 2 * Math.PI / Math.max(neighbors.length, 1);
          cy.getElementById(id).position({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
        });
      } else if (wasFocusedRef.current) {
        cy.nodes().forEach(node => { const position = overviewPositionsRef.current[node.id()]; if (position) node.position(position); });
      }
    });
    if (focused && visible.size) cy.fit(cy.elements().not('.context-hidden'), cy.width() < 600 ? 30 : 92);
    else if (wasFocusedRef.current) cy.fit(undefined, 60);
    wasFocusedRef.current = focused;
  }, [focused, selectedId, topology, originId, impactedNodes]);

  const selectNode = (id: string) => {
    onNodeClickRef.current?.(id);
    setQuery('');
    if (!focused) {
      const cy = cyRef.current;
      const node = cy?.getElementById(id);
      if (cy && node?.nonempty()) {
        cy.zoom(Math.max(cy.zoom(), 1.15));
        cy.center(node);
      }
    }
  };

  const changeZoom = (factor: number) => {
    const cy = cyRef.current;
    if (cy) cy.zoom({ level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  return <div className="graph-canvas-frame">
    <div className="graph-toolbar" role="toolbar" aria-label={tr('Điều khiển graph')}>
      <div className="graph-explore">
        <div className="graph-search">
          <Search size={15} aria-hidden="true" />
          <input aria-label={tr('Tìm node trong graph')} placeholder={tr('Tìm node hoặc thiết bị…')} value={query} onChange={event => setQuery(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && matches[0]) selectNode(matches[0].id); if (event.key === 'Escape') setQuery(''); }} />
          {query && <button type="button" aria-label={tr('Xóa tìm kiếm')} onClick={() => setQuery('')}><X size={14} /></button>}
          {query && <div className="graph-search-results" role="listbox" aria-label={tr('Kết quả tìm kiếm')}>
            {matches.length ? matches.map(node => <button type="button" key={node.id} onClick={() => selectNode(node.id)}>
              <strong>{nodeName(node.properties, node.id)}</strong><small>{tr(NODE_TYPES[node.label.toLowerCase()] ?? node.label)} · {node.id}</small>
            </button>) : <p>{tr('Không tìm thấy node')}</p>}
          </div>}
        </div>
        <button type="button" className={`ghost-button graph-focus ${focused ? 'active' : ''}`} aria-pressed={focused} disabled={!selectedId} onClick={() => setFocused(value => !value)}>
          <Focus size={14} />{focused ? tr('Xem toàn bộ') : tr('Tập trung')}
        </button>
      </div>
      <div className="graph-zoom-controls">
        <button type="button" className={`ghost-button relation-toggle ${showRelations ? 'active' : ''}`} aria-label={tr('Tên quan hệ')} aria-pressed={showRelations} onClick={() => setShowRelations(value => !value)} title={tr('Tên quan hệ')}><Tags size={15} /></button>
        <button type="button" className="ghost-button" aria-label={tr('Thu nhỏ')} onClick={() => changeZoom(1 / 1.2)}><Minus size={15} /></button>
        <span className="graph-zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" className="ghost-button" aria-label={tr('Phóng to')} onClick={() => changeZoom(1.2)}><Plus size={15} /></button>
        <button type="button" className="ghost-button graph-fit" onClick={() => cyRef.current?.fit(focused ? cyRef.current?.elements().not('.context-hidden') : undefined, 60)}><Maximize2 size={14} />{tr('Vừa khung')}</button>
      </div>
    </div>
    <div ref={containerRef} className="graph-canvas" role="img" aria-label={tr('Graph chuỗi sản xuất: {0} node, {1} quan hệ', topology.nodes.length, topology.edges.length)} />
    <div className="graph-help">{tr('Kéo để di chuyển · Cuộn để zoom · Chọn thẻ để xem liên kết')}</div>
    <div className="graph-selection">
      {selectedNode ? <>
      <span className={`graph-selection-swatch ${selectedNode.label.toLowerCase()}`} />
      <div className="graph-selection-name"><small>{tr('NODE ĐANG CHỌN')} · {tr(NODE_TYPES[selectedNode.label.toLowerCase()] ?? selectedNode.label)}</small><strong>{nodeName(selectedNode.properties, selectedNode.id)}</strong><code>{selectedNode.id}</code></div>
      <div className="graph-selection-links"><small>{tr('LIÊN KẾT TRỰC TIẾP')} · {related.length}</small><div>
        {related.length ? related.map(({ edge, other }) => <button type="button" key={`${edge.id ?? edge.type}:${edge.source}:${edge.target}`} onClick={() => selectNode(other.id)} title={`${edge.type} · ${other.id}`}>
          <span>{edge.source === selectedId ? '→' : '←'}</span> {nodeName(other.properties, other.id)} <small>{edge.type}</small>
        </button>) : <span className="muted">{tr('Không có liên kết trực tiếp')}</span>}
      </div></div></> : <span className="muted">{tr('Chọn một node để xem liên kết')}</span>}
    </div>
  </div>;
};
