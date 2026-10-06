"""
TODO (handoff - A: Incident schema & contract)
- Validate `node_id`, `incident_type`, and `severity` per API contract
- Ensure response model is stable for frontend (no raw DB objects)
- Add tests for invalid nodes and invalid incident types
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Literal
from pydantic import field_validator

IncidentType = Literal["MACHINE_BREAKDOWN", "MATERIAL_DEFECT", "CYCLE_TIME_SPIKE"]

class SimulationRequest(BaseModel):
    node_id: str = Field(..., min_length=2, max_length=100, pattern=r"^[A-Za-z0-9_-]+$", description="ID of equipment or process step failing")
    incident_type: IncidentType
    severity: float = Field(default=1.0, ge=0.1, le=1.0, description="Base incident severity")

    @field_validator("incident_type", mode="before")
    @classmethod
    def normalize_type(cls, value: str) -> str:
        return value.strip().upper()

class ImpactedNodeDTO(BaseModel):
    node_id: str
    node_type: str
    name: str
    distance: int
    impact_score: float

class SimulationResponse(BaseModel):
    origin_id: str
    incident_type: str
    impacted_nodes: List[ImpactedNodeDTO]
    actions_by_department: Dict[str, str]

class RootCauseRequest(BaseModel):
    defect_node_id: str = Field(..., min_length=2, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
