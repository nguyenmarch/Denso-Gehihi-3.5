import { tr } from '../i18n';
import React from 'react';
import { ImpactedNode } from '../types';

interface ImpactTableProps {
  nodes: ImpactedNode[];
  onSelect?: (nodeId: string) => void;
}

// Renders `impacted_nodes` exactly as returned by the backend (already sorted by distance, then node_id).
export const ImpactTable: React.FC<ImpactTableProps> = ({ nodes, onSelect }) => (
  <div className="impact-area">
    <div className="actions-heading"><div><p className="eyebrow">{tr("PHÂN TÍCH ẢNH HƯỞNG")}</p><h2>{tr("Ảnh hưởng phía sau")}</h2><p>{tr("impact_score = mức độ × decay")}<sup>{tr("khoảng cách")}</sup>{" "}{tr(", tính bởi propagation engine.")}</p></div></div>
    <div className="impact-table-wrap">
      <table className="impact-table">
        <thead><tr><th>Node</th><th>{tr("Loại")}</th><th className="num">{tr("Số bước")}</th><th>{tr("Điểm ảnh hưởng")}</th></tr></thead>
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
