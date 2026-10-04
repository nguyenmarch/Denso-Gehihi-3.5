import React, { useState } from 'react';
import { ArrowRight, Flame, Gauge, PackageSearch } from 'lucide-react';

interface IncidentTriggerProps {
  onRunSimulation: (nodeId: string, type: 'MACHINE_BREAKDOWN' | 'MATERIAL_DEFECT' | 'CYCLE_TIME_SPIKE', severity: number) => void;
  loading?: boolean;
}

export const IncidentTrigger: React.FC<IncidentTriggerProps> = ({ onRunSimulation, loading = false }) => {
  const [nodeId, setNodeId] = useState('EQ_OVEN_01');
  const [incidentType, setIncidentType] = useState('MACHINE_BREAKDOWN');

  const [severity, setSeverity] = useState(1);

  return (
    <div className="trigger-card"><div className="scenario-grid"><button className={`scenario-option ${incidentType === 'MACHINE_BREAKDOWN' ? 'selected' : ''}`} onClick={() => { setNodeId('EQ_OVEN_01'); setIncidentType('MACHINE_BREAKDOWN'); }}><span className="scenario-icon orange"><Flame size={18} /></span><span><b>Machine breakdown</b><small>Reflow oven heater failure</small></span><i /></button><button className={`scenario-option ${incidentType === 'MATERIAL_DEFECT' ? 'selected' : ''}`} onClick={() => { setNodeId('STEP_SMT'); setIncidentType('MATERIAL_DEFECT'); }}><span className="scenario-icon purple"><PackageSearch size={18} /></span><span><b>Material quality defect</b><small>Capacitor tolerance drift</small></span><i /></button><button className={`scenario-option ${incidentType === 'CYCLE_TIME_SPIKE' ? 'selected' : ''}`} onClick={() => { setNodeId('STEP_AOI'); setIncidentType('CYCLE_TIME_SPIKE'); }}><span className="scenario-icon blue"><Gauge size={18} /></span><span><b>Inspection bottleneck</b><small>AOI cycle-time spike</small></span><i /></button></div><div className="trigger-controls"><label className="field-label">ORIGIN NODE<select value={`${nodeId}|${incidentType}`} onChange={e => { const [node, kind] = e.target.value.split('|'); setNodeId(node); setIncidentType(kind); }}><option value="EQ_OVEN_01|MACHINE_BREAKDOWN">EQ_OVEN_01</option><option value="STEP_SMT|MATERIAL_DEFECT">STEP_SMT</option><option value="STEP_AOI|CYCLE_TIME_SPIKE">STEP_AOI</option></select></label><label className="severity-control"><span className="field-label">SEVERITY <b>{severity.toFixed(1)}</b></span><input type="range" min="0.1" max="1" step="0.1" value={severity} onChange={e => setSeverity(Number(e.target.value))} /></label><button className="run-button" disabled={loading} onClick={() => onRunSimulation(nodeId, incidentType as 'MACHINE_BREAKDOWN' | 'MATERIAL_DEFECT' | 'CYCLE_TIME_SPIKE', severity)}>{loading ? 'Analyzing...' : 'Run simulation'} <ArrowRight size={17} /></button></div></div>
  );
};
