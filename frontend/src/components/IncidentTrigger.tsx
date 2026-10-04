import React, { useState } from 'react';

interface IncidentTriggerProps {
  onRunSimulation: (nodeId: string, type: 'MACHINE_BREAKDOWN' | 'MATERIAL_DEFECT' | 'CYCLE_TIME_SPIKE', severity: number) => void;
}

export const IncidentTrigger: React.FC<IncidentTriggerProps> = ({ onRunSimulation }) => {
  const [nodeId, setNodeId] = useState('EQ_OVEN_01');
  const [incidentType, setIncidentType] = useState('MACHINE_BREAKDOWN');

  const [severity, setSeverity] = useState(1);

  return (
    <div style={{ padding: '16px', background: '#f5f5f5', borderRadius: '8px', marginBottom: '16px' }}>
      <h3>Simulate Production Incident (What-If)</h3>
      <select value={`${nodeId}|${incidentType}`} onChange={e => { const [node, kind] = e.target.value.split('|'); setNodeId(node); setIncidentType(kind); }}>
        <option value="EQ_OVEN_01|MACHINE_BREAKDOWN">Machine breakdown — Reflow oven</option>
        <option value="STEP_SMT|MATERIAL_DEFECT">Material defect — Capacitor tolerance</option>
        <option value="STEP_AOI|CYCLE_TIME_SPIKE">Inspection bottleneck — AOI</option>
      </select>
      <label> Severity {severity.toFixed(1)} <input type="range" min="0.1" max="1" step="0.1" value={severity} onChange={e => setSeverity(Number(e.target.value))} /></label>
      <button onClick={() => onRunSimulation(nodeId, incidentType as 'MACHINE_BREAKDOWN' | 'MATERIAL_DEFECT' | 'CYCLE_TIME_SPIKE', severity)}>
        Simulate Impact
      </button>
    </div>
  );
};
