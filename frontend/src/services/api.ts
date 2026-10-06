/*
TODO (handoff - C: Frontend API)
- Confirm `API_BASE` matches backend host/port used in deployment/demo
- Add example request/response and error handling for UI integration
*/

import axios from 'axios';
import { GraphTopology, IncidentType, SimulationResult } from '../types';

const API_BASE = 'http://localhost:8000/api/v1';

export const triggerSimulation = async (
  nodeId: string, 
  incidentType: IncidentType,
  severity: number = 1.0
): Promise<SimulationResult> => {
  const response = await axios.post(`${API_BASE}/incidents/simulate`, {
    node_id: nodeId,
    incident_type: incidentType,
    severity: severity
  });
  return response.data;
};

export const fetchTopology = async (): Promise<GraphTopology> => {
  const response = await axios.get(`${API_BASE}/graph/topology`);
  return response.data;
};
