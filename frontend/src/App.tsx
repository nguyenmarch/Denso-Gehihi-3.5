/*
TODO (handoff - C: Frontend integration)
- Use real `/graph/topology` data and render via `GraphCanvas` (no fake topology)
- Ensure simulation flow calls `/incidents/simulate` and displays `SimulationResult`
- Handle loading, backend errors, and empty states for demo
*/

import React, { useCallback, useState } from 'react';
import { Activity, AlertTriangle, Boxes, BrainCircuit, CheckCircle2, ChevronRight, Factory, Gauge, ShieldCheck, Wifi } from 'lucide-react';
import { IncidentTrigger } from './components/IncidentTrigger';
import { GraphCanvas } from './components/GraphCanvas';
import { ActionMatrix } from './components/ActionMatrix';
import { triggerSimulation } from './services/api';
import { IncidentType, SimulationResult } from './types';
import './app.css';

export const App: React.FC = () => {
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSimulate = useCallback(async (nodeId: string, type: IncidentType, severity = 1) => {
    setLoading(true);
    setError('');
    try {
      const data = await triggerSimulation(nodeId, type, severity);
      setSimResult(data);
    } catch {
      setError('Không thể kết nối Incident Engine. Hãy kiểm tra backend và Neo4j.');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><BrainCircuit size={22} /></div><div><strong>Chain<span>Guard</span></strong><small>Incident Intelligence</small></div></div>
        <nav><p className="nav-label">WORKSPACE</p><a className="nav-item active"><Activity size={17} /> Command center</a><a className="nav-item"><Boxes size={17} /> Knowledge graph <span className="nav-count">2</span></a><a className="nav-item"><ShieldCheck size={17} /> Response playbooks</a><p className="nav-label nav-space">MONITORING</p><a className="nav-item"><Gauge size={17} /> Line telemetry</a><a className="nav-item"><Factory size={17} /> Production flow</a></nav>
        <div className="sidebar-status"><div className="status-dot pulse" /><div><strong>All systems nominal</strong><small>Last sync · just now</small></div></div>
        <div className="user-card"><div className="avatar">NH</div><div><strong>Nguyen Hoang</strong><small>Operations lead</small></div><ChevronRight size={15} /></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div><p className="eyebrow">SUNDAY, OCTOBER 04, 2026</p><h1>Good evening, Nguyen <span>✦</span></h1><p className="subheading">Here is what is happening across your production chain.</p></div><div className="top-actions"><div className="live-pill"><span className="live-dot" /> LIVE MONITORING</div><button className="icon-button" aria-label="Notifications"><AlertTriangle size={18} /><i /></button><div className="top-avatar">NH</div></div></header>
        <section className="kpi-grid"><div className="kpi-card blue"><div className="kpi-icon"><Activity size={19} /></div><span>LINE HEALTH</span><strong>94.8%</strong><small><b className="positive">↑ 2.4%</b> vs last shift</small><div className="sparkline"><i /><i /><i /><i /><i /><i /><i /><i /></div></div><div className="kpi-card"><div className="kpi-icon violet"><Boxes size={19} /></div><span>ACTIVE BATCHES</span><strong>12</strong><small><b>3</b> high priority</small><div className="mini-bars"><i /><i /><i /><i /><i /></div></div><div className="kpi-card"><div className="kpi-icon amber"><AlertTriangle size={19} /></div><span>OPEN INCIDENTS</span><strong>{simResult ? simResult.impacted_nodes.length : '03'}</strong><small><b className="warning">02</b> require attention</small><div className="incident-lines"><i /><i /><i /></div></div><div className="kpi-card"><div className="kpi-icon green"><CheckCircle2 size={19} /></div><span>AVG. RESPONSE</span><strong>08<span>m</span> 42<span>s</span></strong><small><b className="positive">↓ 18%</b> faster this week</small><div className="progress"><i /></div></div></section>
        <section className="content-grid"><div className="panel graph-panel"><div className="panel-heading"><div><div className="heading-row"><h2>Propagation topology</h2><span className="tag blue-tag">LIVE GRAPH</span></div><p>Trace impact across your entire production chain</p></div><div className="graph-legend"><span><i className="legend-dot process" />Process</span><span><i className="legend-dot equipment" />Equipment</span><span><i className="legend-dot batch" />Batch</span></div></div><div className="graph-wrap"><GraphCanvas highlightNodes={simResult?.impacted_nodes.map(n => n.node_id)} /></div><div className="graph-footer"><span><Wifi size={14} /> Graph synchronized</span><span>Depth decay <b>0.75×</b></span><span>Max hops <b>4</b></span></div></div><div className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Events from the production floor</p></div><button className="more-button">View all <ChevronRight size={14} /></button></div><div className="activity-list"><div className="activity-item"><div className="event-icon red"><AlertTriangle size={15} /></div><div><strong>Heater anomaly detected</strong><p>EQ_OVEN_01 · Reflow Soldering</p></div><time>2m ago</time></div><div className="activity-item"><div className="event-icon cyan"><Activity size={15} /></div><div><strong>Batch lineage updated</strong><p>BATCH_2026_001 moved to Reflow</p></div><time>8m ago</time></div><div className="activity-item"><div className="event-icon green"><CheckCircle2 size={15} /></div><div><strong>QA gate passed</strong><p>AOI Inspection · 98.6% yield</p></div><time>14m ago</time></div><div className="activity-item"><div className="event-icon purple"><Boxes size={15} /></div><div><strong>New material lot received</strong><p>Capacitors · Supplier VN-204</p></div><time>21m ago</time></div></div></div></section>
        <section className="simulation-section"><div className="section-title"><div><p className="eyebrow">WHAT-IF ANALYSIS</p><h2>Simulate an incident</h2><p>See how a disruption propagates before it impacts your line.</p></div><div className="engine-state"><span className="status-dot" /> Engine ready</div></div><IncidentTrigger onRunSimulation={handleSimulate} loading={loading} />{error && <div className="error-banner"><AlertTriangle size={16} />{error}</div>}</section>
        {simResult && <section className="results-section"><div className="result-banner"><div className="result-icon"><BrainCircuit size={20} /></div><div><strong>Simulation complete</strong><p>{simResult.origin_id} · {simResult.impacted_nodes.length} downstream nodes affected</p></div><span className="severity-badge">IMPACT MAPPED</span></div><ActionMatrix actions={simResult.actions_by_department} /></section>}
      </main>
    </div>
  );
};

export default App;
