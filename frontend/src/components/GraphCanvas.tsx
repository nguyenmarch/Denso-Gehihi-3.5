import React, { useEffect, useRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
import { fetchTopology } from '../services/api';

interface GraphCanvasProps {
  highlightNodes?: string[];
  onNodeClick?: (nodeId: string) => void;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({ highlightNodes, onNodeClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    fetchTopology().then(topology => {
      if (disposed || !containerRef.current) return;
      const elements = [...topology.nodes.map(node => ({ data: { id: node.id, label: node.properties.name || node.label, category: node.label } })), ...topology.edges.map(edge => ({ data: { id: `${edge.source}-${edge.type}-${edge.target}`, source: edge.source, target: edge.target, label: edge.type } }))];
      cyRef.current?.destroy();
      cyRef.current = cytoscape({ container: containerRef.current, elements, layout: { name: 'breadthfirst', directed: true, padding: 30 }, style: [
        { selector: 'node', style: { label: 'data(label)', 'background-color': '#2563eb', 'text-valign': 'bottom', 'font-size': 10 } },
        { selector: 'node[category = "Equipment"]', style: { 'background-color': '#0d9488' } },
        { selector: 'node[category = "Batch"]', style: { 'background-color': '#7c3aed' } },
        { selector: 'edge', style: { width: 2, 'line-color': '#94a3b8', 'target-arrow-color': '#64748b', 'target-arrow-shape': 'triangle', label: 'data(label)', 'font-size': 7 } },
        { selector: '.impacted', style: { 'background-color': '#ef4444', 'border-width': 5, 'border-color': '#fbbf24' } }
      ]});
      cyRef.current.on('tap', 'node', event => onNodeClick?.(event.target.id()));
    }).catch(() => undefined);
    return () => { disposed = true; cyRef.current?.destroy(); };
  }, [onNodeClick]);
  useEffect(() => { cyRef.current?.nodes().removeClass('impacted'); (highlightNodes || []).forEach(id => cyRef.current?.getElementById(id).addClass('impacted')); }, [highlightNodes]);

  return (
    <div 
      ref={containerRef} 
      style={{ width: '100%', height: '500px', border: '1px solid #ccc', borderRadius: '8px' }}
    >
      {/* Cytoscape renders inside this canvas container */}
    </div>
  );
};
