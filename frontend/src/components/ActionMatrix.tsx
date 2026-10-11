import React from 'react';
import { Check, Circle, Info } from 'lucide-react';

interface ActionMatrixProps {
  // `SimulationResult.actions_by_department`: DEP_* → action, plus an optional CONTEXT note.
  actions: Record<string, string>;
  // Department id → display name, taken from Department nodes in the topology.
  departmentNames?: Record<string, string>;
}

export const ActionMatrix: React.FC<ActionMatrixProps> = ({ actions, departmentNames = {} }) => {
  // Completion is local demo state only; App remounts this component per simulation so it resets.
  const [completed, setCompleted] = React.useState<Record<string, boolean>>({});
  const context = actions.CONTEXT;
  const entries = Object.entries(actions).filter(([key]) => key !== 'CONTEXT');
  const doneCount = entries.filter(([dept]) => completed[dept]).length;

  return (
    <div className="actions-area">
      <div className="actions-heading">
        <div><p className="eyebrow">MA TRẬN PHẢN ỨNG</p><h2>Hành động đề xuất</h2><p>Các bước playbook theo bộ phận cho loại sự cố này.</p></div>
        {entries.length > 0 && <span className="status-chip"><span className="status-dot" /> {doneCount}/{entries.length} hoàn thành</span>}
      </div>
      {context && <div className="context-note"><Info size={14} /><span>{context}</span></div>}
      {entries.length === 0
        ? <div className="state-box compact"><p>Backend không trả về action nào cho incident type này.</p></div>
        : (
          <div className="actions-grid">
            {entries.map(([dept, action]) => {
              const short = dept.replace(/^DEP_/, '');
              return (
                <article key={dept} className={`action-card ${completed[dept] ? 'done' : ''}`}>
                  <div className="action-card-top"><span className="dept-avatar">{short.slice(0, 2)}</span><div><strong>{departmentNames[dept] ?? short}</strong><small>{dept}</small></div></div>
                  <p>{action}</p>
                  <label className="complete-check"><input type="checkbox" checked={!!completed[dept]} onChange={e => setCompleted({ ...completed, [dept]: e.target.checked })} />{completed[dept] ? <Check size={14} /> : <Circle size={14} />} {completed[dept] ? 'Đã hoàn thành' : 'Đánh dấu hoàn thành'}</label>
                </article>
              );
            })}
          </div>
        )}
    </div>
  );
};
