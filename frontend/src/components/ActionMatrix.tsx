/*
TODO (handoff - C: ActionMatrix)
- Render department actions from `SimulationResult.actions_by_department`
- Ensure `CONTEXT` entries are used in cards where relevant
- Allow marking steps complete for demo purposes
*/

import React from 'react';
import { Check, Circle } from 'lucide-react';

interface ActionMatrixProps {
  actions: Record<string, string>;
}

export const ActionMatrix: React.FC<ActionMatrixProps> = ({ actions }) => {
  const [completed, setCompleted] = React.useState<Record<string, boolean>>({});
  return (
    <div className="actions-area">
      <div className="actions-heading"><div><p className="eyebrow">RESPONSE MATRIX</p><h2>Recommended actions</h2><p>Role-based next steps for the incident response team.</p></div><span className="status-chip"><span className="status-dot" /> Live SOP</span></div>
      <div className="actions-grid">
        {Object.entries(actions).filter(([key]) => key !== 'CONTEXT').map(([dept, action]) => (
          <article key={dept} className={`action-card ${completed[dept] ? 'done' : ''}`}>
            <div className="action-card-top"><span className="dept-avatar">{dept.replace('DEP_', '').slice(0, 2)}</span><div><strong>{dept.replace('DEP_', '')}</strong><small>Priority response</small></div><span className="high-badge">HIGH</span></div><p>{action}</p>
            <label className="complete-check"><input type="checkbox" checked={!!completed[dept]} onChange={e => setCompleted({ ...completed, [dept]: e.target.checked })} />{completed[dept] ? <Check size={14} /> : <Circle size={14} />} {completed[dept] ? 'Marked complete' : 'Mark as complete'}</label>
          </article>
        ))}
      </div>
    </div>
  );
};
