import React, { useCallback, useState } from 'react';
import { IncidentTrigger } from './components/IncidentTrigger';
import { GraphCanvas } from './components/GraphCanvas';
import { ActionMatrix } from './components/ActionMatrix';
import { triggerSimulation } from './services/api';
import { IncidentType, SimulationResult } from './types';

export const App: React.FC = () => {
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);

  const handleSimulate = useCallback(async (nodeId: string, type: IncidentType, severity = 1) => {
    try {
      const data = await triggerSimulation(nodeId, type, severity);
      setSimResult(data);
    } catch (err) {
      console.error("Simulation failed", err);
    }
  }, []);

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Production Incident & Propagation Knowledge Graph</h1>
      <IncidentTrigger onRunSimulation={handleSimulate} />
      <GraphCanvas 
        highlightNodes={simResult?.impacted_nodes.map(n => n.node_id)} 
      />
      {simResult && <ActionMatrix actions={simResult.actions_by_department} />}
    </div>
  );
};

export default App;
