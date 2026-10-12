"""
TODO (handoff - B: Graph schema)
- Ensure `GraphTopologyResponse` and DTOs map cleanly to frontend cytoscape data
- Confirm node `id` uniqueness and properties required by the UI (e.g., `name`)
"""

from pydantic import BaseModel
from typing import List, Dict, Any

class GraphNodeDTO(BaseModel):
    id: str
    label: str
    properties: Dict[str, Any]

    @property
    def cytoscape_data(self) -> Dict[str, Any]:
        return {"id": self.id, "label": self.label, **self.properties}

class GraphEdgeDTO(BaseModel):
    id: str | None = None
    source: str
    target: str
    type: str

    @property
    def cytoscape_data(self) -> Dict[str, Any]:
        return {"id": f"{self.source}-{self.type}-{self.target}", "source": self.source, "target": self.target, "type": self.type}

class GraphTopologyResponse(BaseModel):
    nodes: List[GraphNodeDTO]
    edges: List[GraphEdgeDTO]
