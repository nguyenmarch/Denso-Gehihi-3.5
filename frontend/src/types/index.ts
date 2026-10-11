// Mirrors backend/app/schemas/incident.py and backend/app/schemas/graph.py.
// Keep in sync with the backend contract; do not add UI-only fields here.

export const INCIDENT_TYPES = ['MACHINE_BREAKDOWN', 'MATERIAL_DEFECT', 'CYCLE_TIME_SPIKE'] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const SEVERITY_MIN = 0.1;
export const SEVERITY_MAX = 1.0;

export interface SimulationRequest {
  node_id: string;
  incident_type: IncidentType;
  severity: number;
}

// backend ImpactedNodeDTO
export interface ImpactedNode {
  node_id: string;
  node_type: string;
  name: string;
  distance: number;
  impact_score: number;
}

// backend SimulationResponse. `actions_by_department` keys are DEP_* plus an optional CONTEXT entry.
export interface SimulationResult {
  origin_id: string;
  incident_type: IncidentType;
  impacted_nodes: ImpactedNode[];
  actions_by_department: Record<string, string>;
}

// backend GraphNodeDTO / GraphEdgeDTO / GraphTopologyResponse
export interface GraphNode { id: string; label: string; properties: Record<string, unknown>; }
export interface GraphEdge { id?: string; source: string; target: string; type: string; }
export interface GraphTopology { nodes: GraphNode[]; edges: GraphEdge[]; }

export interface HealthStatus { status: 'ok' | 'degraded'; database: 'connected' | 'unavailable'; }

export type ApiErrorKind = 'network' | 'validation' | 'not_found' | 'unavailable' | 'server' | 'bad_response';

export interface ApiErrorInfo {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  message: string;
  // Field → message for validation errors, so forms can show them next to the input.
  fields?: Record<string, string>;
}
