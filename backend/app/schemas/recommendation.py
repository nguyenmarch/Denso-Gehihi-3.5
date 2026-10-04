from pydantic import BaseModel
from typing import Dict, List

class ActionItemDTO(BaseModel):
    department_id: str
    department_name: str
    action_text: str
    urgency_level: str

class RecommendationResponse(BaseModel):
    incident_type: str
    recommendations: List[ActionItemDTO]
