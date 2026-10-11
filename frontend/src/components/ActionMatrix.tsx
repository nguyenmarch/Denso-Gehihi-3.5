import React from 'react';
import { Info } from 'lucide-react';

interface ActionMatrixProps {
  // `SimulationResult.actions_by_department`: DEP_* → action, plus an optional CONTEXT note.
  actions: Record<string, string>;
  // Department id → display name, taken from Department nodes in the topology.
  departmentNames?: Record<string, string>;
}

// Read-only playbook reference: the simulation creates no work, so there is nothing to tick off here.
export const ActionMatrix: React.FC<ActionMatrixProps> = ({ actions, departmentNames = {} }) => {
  const context = actions.CONTEXT;
  const entries = Object.entries(actions).filter(([key]) => key !== 'CONTEXT');

  return (
    <div className="actions-area">
      <div className="actions-heading">
        <div><p className="eyebrow">MA TRẬN PHẢN ỨNG</p><h2>Hành động theo playbook</h2><p>Playbook của thiết bị và loại sự cố này, chia theo bộ phận. Chỉ để tham khảo, không tạo việc.</p></div>
      </div>
      {context && <div className="context-note"><Info size={14} /><span>{context}</span></div>}
      {entries.length === 0 && !context && <div className="state-box compact"><p>Backend không trả về hành động nào cho lần mô phỏng này.</p></div>}
      {entries.length > 0 && (
        <div className="actions-grid">
          {entries.map(([dept, action]) => {
            const short = dept.replace(/^DEP_/, '');
            return (
              <article key={dept} className="action-card">
                <div className="action-card-top"><span className="dept-avatar">{short.slice(0, 2)}</span><div><strong>{departmentNames[dept] ?? short}</strong><small>{dept}</small></div></div>
                <p>{action}</p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
