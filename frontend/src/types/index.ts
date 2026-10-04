export type IncidentType = 'MACHINE_BREAKDOWN' | 'MATERIAL_DEFECT' | 'CYCLE_TIME_SPIKE';
export interface ImpactedNode {
  node_id: string;
  node_type: string;
  name: string;
  distance: number;
  impact_score: number;
}

export interface SimulationResult {
  origin_id: string;
  incident_type: string;
  impacted_nodes: ImpactedNode[];
  actions_by_department: Record<string, string>;
}
export interface GraphNode { id: string; label: string; properties: Record<string, unknown>; }
export interface GraphEdge { source: string; target: string; type: string; }
export interface GraphTopology { nodes: GraphNode[]; edges: GraphEdge[]; }

export interface GraphElement {
  data: {
    id: string;
    label?: string;
    source?: string;
    target?: string;
    type?: string;
  };
}
