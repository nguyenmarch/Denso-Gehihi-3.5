import React from 'react';

interface ActionMatrixProps {
  actions: Record<string, string>;
}

export const ActionMatrix: React.FC<ActionMatrixProps> = ({ actions }) => {
  const [completed, setCompleted] = React.useState<Record<string, boolean>>({});
  return (
    <div style={{ marginTop: '20px' }}>
      <h3>Department Action Matrix</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {Object.entries(actions).filter(([key]) => key !== 'CONTEXT').map(([dept, action]) => (
          <article key={dept} style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
            <strong>{dept}</strong><span style={{ marginLeft: 8, color: '#b45309' }}>HIGH</span><p>{action}</p>
            <label><input type="checkbox" checked={!!completed[dept]} onChange={e => setCompleted({ ...completed, [dept]: e.target.checked })} /> Complete</label>
          </article>
        ))}
      </div>
    </div>
  );
};
