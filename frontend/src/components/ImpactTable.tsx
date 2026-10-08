import React from 'react';
import { ImpactedNode } from '../types';

interface ImpactTableProps {
  nodes: ImpactedNode[];
  onSelect?: (nodeId: string) => void;
}

// Renders `impacted_nodes` exactly as returned by the backend (already sorted by distance, then node_id).
export const ImpactTable: React.FC<ImpactTableProps> = ({ nodes, onSelect }) => (
  <div className="impact-area">
    <div className="actions-heading"><div><p className="eyebrow">IMPACT ANALYSIS</p><h2>Downstream impact</h2><p>impact_score = severity × decay<sup>distance</sup>, from the propagation engine.</p></div></div>
    <div className="impact-table-wrap">
      <table className="impact-table">
        <thead><tr><th>Node</th><th>Type</th><th className="num">Hops</th><th>Impact score</th></tr></thead>
        <tbody>
          {nodes.map(n => (
            <tr key={n.node_id} onClick={() => onSelect?.(n.node_id)}>
              <td><strong>{n.name}</strong><small>{n.node_id}</small></td>
              <td><span className={`type-pill ${n.node_type.toLowerCase()}`}>{n.node_type}</span></td>
              <td className="num">{n.distance}</td>
              <td><div className="score-cell"><div className="score-bar"><i style={{ width: `${Math.min(100, n.impact_score * 100)}%` }} /></div><b>{n.impact_score.toFixed(3)}</b></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
