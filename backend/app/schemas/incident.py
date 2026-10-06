"""Pydantic contracts for incident simulation and root-cause requests."""

from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field
from pydantic import field_validator

IncidentType = Literal["MACHINE_BREAKDOWN", "MATERIAL_DEFECT", "CYCLE_TIME_SPIKE"]

class SimulationRequest(BaseModel):
    node_id: str = Field(..., min_length=2, max_length=100, pattern=r"^[A-Za-z0-9_-]+$", description="ID of equipment or process step failing")
    incident_type: IncidentType
    severity: float = Field(default=1.0, ge=0.1, le=1.0, description="Base incident severity")

    @field_validator("incident_type", mode="before")
    @classmethod
    def normalize_type(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().upper()
        return value

class ImpactedNodeDTO(BaseModel):
    node_id: str = Field(..., min_length=1)
    node_type: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    distance: int = Field(..., ge=1)
    impact_score: float = Field(..., ge=0)

class SimulationResponse(BaseModel):
    origin_id: str
    incident_type: IncidentType
    impacted_nodes: List[ImpactedNodeDTO]
    actions_by_department: Dict[str, str]

class RootCauseRequest(BaseModel):
    defect_node_id: str = Field(..., min_length=2, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
