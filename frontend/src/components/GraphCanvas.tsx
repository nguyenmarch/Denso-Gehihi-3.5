import React, { useEffect, useRef } from 'react';
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
      data: { id: node.id, label: nodeName(node.properties, node.id), baseLabel: nodeName(node.properties, node.id), category: node.label },
      position: positions[node.id],
    })),
    // Preserve parallel relationships as separate edges; malformed topology surfaces an error.
    ...topology.edges
      .map((edge, index) => ({ data: { id: `edge:${edge.id ?? index}:${edge.source}:${edge.type}:${edge.target}`, source: edge.source, target: edge.target, label: edge.type, walked: PROPAGATION_RELATIONS.has(edge.type) ? 1 : 0 } })),
  ];
};

const STYLE: cytoscape.StylesheetJson = [
  { selector: 'node', style: { label: 'data(label)', 'background-color': '#378bf3', color: '#b9d6ea', 'font-size': 13, 'text-valign': 'bottom', 'text-margin-y': 5, 'text-wrap': 'wrap', 'text-max-width': '150px', width: 22, height: 22, 'border-width': 2, 'border-color': '#0b2338', 'transition-property': 'background-color, border-color, opacity', 'transition-duration': 250 } as cytoscape.Css.Node },
  { selector: 'node[category = "Equipment"]', style: { 'background-color': '#15cbb1', shape: 'round-rectangle' } },
  { selector: 'node[category = "Batch"]', style: { 'background-color': '#a482fb' } },
  { selector: 'node[category = "Department"]', style: { 'background-color': '#5d7891', shape: 'round-rectangle' } },
  { selector: 'node[category = "IncidentEvent"]', style: { 'background-color': '#d68745', shape: 'diamond' } },
  { selector: 'node[category = "MachineEvent"]', style: { 'background-color': '#e5604f', shape: 'diamond' } },
  { selector: 'node[category = "ProfileCheck"]', style: { 'background-color': '#6fbf73', shape: 'tag' } },
  { selector: 'edge', style: { width: 1.4, 'curve-style': 'bezier', 'line-color': '#2b4d68', 'target-arrow-color': '#2b4d68', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'font-size': 7, color: '#ffb48f', 'text-rotation': 'autorotate', 'text-background-color': '#081a2c', 'text-background-opacity': 0.85, 'text-background-padding': '2px' } as cytoscape.Css.Edge },
  { selector: 'edge[walked = 1]', style: { width: 1.8, 'line-color': '#3d6889', 'target-arrow-color': '#3d6889' } },
  { selector: 'edge[walked = 0]', style: { 'line-style': 'dashed', 'line-dash-pattern': [4, 4], opacity: 0.45 } as cytoscape.Css.Edge },
  { selector: 'edge:selected, edge.hover', style: { label: 'data(label)', color: '#9fc3da' } },
  { selector: '.faded', style: { opacity: 0.6 } },
  { selector: 'node[category = "machine"], node[category = "Machine"]', style: { 'background-color': '#15cbb1', shape: 'round-rectangle' } },
  { selector: 'node[category = "process"], node[category = "Process"]', style: { 'background-color': '#378bf3', shape: 'ellipse' } },
  { selector: 'node[category = "step"], node[category = "Step"]', style: { 'background-color': '#378bf3', shape: 'ellipse' } },
  { selector: 'node[category = "fault"], node[category = "Fault"]', style: { 'background-color': '#d68745', shape: 'diamond' } },
  { selector: 'node[category = "part"], node[category = "Part"]', style: { 'background-color': '#a482fb', shape: 'hexagon' } },
  { selector: 'node[category = "document"], node[category = "Document"]', style: { 'background-color': '#75a5d3', shape: 'rectangle' } },
  { selector: 'edge.neighbor', style: { opacity: 1, width: 2.5, 'line-color': '#5ecbfa', 'target-arrow-color': '#5ecbfa' } },
  { selector: 'node.impacted', style: { 'background-color': 'mapData(impact, 0, 1, #f5b04a, #ff4d5e)', 'border-color': '#ffd7a0', 'border-width': 3, width: 28, height: 28, color: '#ffe3c2', 'font-weight': 'bold' } as cytoscape.Css.Node },
  { selector: 'node.origin', style: { 'background-color': '#ff3048', 'border-color': '#ffffff', 'border-width': 4, width: 34, height: 34, color: '#ffffff', 'font-weight': 'bold' } as cytoscape.Css.Node },
  { selector: 'edge.propagation', style: { width: 3, 'line-color': '#ff8a5c', 'target-arrow-color': '#ff8a5c', label: 'data(label)', opacity: 1, 'line-style': 'solid', 'z-index': 10 } as cytoscape.Css.Edge },
  { selector: 'node.selected', style: { 'underlay-color': '#5ecbfa', 'underlay-opacity': 0.35, 'underlay-padding': 7, 'underlay-shape': 'ellipse' } as cytoscape.Css.Node },
];

export const GraphCanvas: React.FC<GraphCanvasProps> = ({ topology, impactedNodes, originId, selectedId, onNodeClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | undefined>(undefined);
  // Read the latest callback without re-creating the graph on every render.
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: toElements(topology),
      style: STYLE,
      layout: { name: 'preset', fit: true, padding: 45 },
      wheelSensitivity: 0.2,
      minZoom: 0.05,
      maxZoom: 2.5,
    });
    cy.on('tap', 'node', event => onNodeClickRef.current?.(event.target.id()));
    cy.on('mouseover', 'edge', event => event.target.addClass('hover'));
    cy.on('mouseout', 'edge', event => event.target.removeClass('hover'));
    cyRef.current = cy;
    const observer = new ResizeObserver(() => { cy.resize(); });
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); cy.destroy(); cyRef.current = undefined; };
  }, [topology]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('impacted origin propagation faded');
      cy.nodes().forEach(n => { n.data('label', n.data('baseLabel')); n.removeData('impact'); });
      if (!originId || !impactedNodes) return;

      const distance = new Map<string, number>([[originId, 0]]);
      impactedNodes.forEach(n => distance.set(n.node_id, n.distance));
      cy.getElementById(originId).addClass('origin');
      impactedNodes.forEach(n => {
        const el = cy.getElementById(n.node_id);
        if (el.empty()) return;
        el.addClass('impacted').data({ impact: n.impact_score, label: `${el.data('baseLabel')}\n▲ ${n.impact_score.toFixed(3)}` });
      });
      // Shortest-path propagation edges: a walked relation going from distance d to distance d+1.
      cy.edges().forEach(edge => {
        const from = distance.get(edge.source().id());
        const to = distance.get(edge.target().id());
        if (from !== undefined && to === from + 1 && PROPAGATION_RELATIONS.has(edge.data('label'))) edge.addClass('propagation');
      });
      cy.elements().not('.origin, .impacted, .propagation').addClass('faded');
    });
  }, [impactedNodes, originId, topology]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('selected neighbor');
    if (selectedId) { const node = cy.getElementById(selectedId); node.addClass('selected'); node.connectedEdges().addClass('neighbor'); }
  }, [selectedId, topology]);

  return <div className="graph-canvas-frame"><div className="graph-toolbar"><button className="ghost-button" onClick={() => cyRef.current?.fit(undefined, 45)}>Vừa khung</button><button className="ghost-button" aria-label="Phóng to" onClick={() => { const cy = cyRef.current; if (cy) cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: cy.width()/2, y: cy.height()/2 } }); }}>+</button><button className="ghost-button" aria-label="Thu nhỏ" onClick={() => { const cy = cyRef.current; if (cy) cy.zoom({ level: cy.zoom() / 1.2, renderedPosition: { x: cy.width()/2, y: cy.height()/2 } }); }}>−</button></div><div ref={containerRef} className="graph-canvas" role="img" aria-label={`Graph chuỗi sản xuất: ${topology.nodes.length} node, ${topology.edges.length} quan hệ`} /></div>;
};
