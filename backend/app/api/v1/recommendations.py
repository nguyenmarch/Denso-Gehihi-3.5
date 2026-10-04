from fastapi import APIRouter
from app.schemas.recommendation import RecommendationResponse, ActionItemDTO
from app.services.recommendation_service import RecommendationService

router = APIRouter()

@router.get("/{incident_type}", response_model=RecommendationResponse)
async def get_recommendation_by_type(incident_type: str):
    rec_svc = RecommendationService()
    actions = rec_svc.get_actions(incident_type)
    return RecommendationResponse(incident_type=incident_type.upper(), recommendations=[ActionItemDTO(department_id=k, department_name=k, action_text=v, urgency_level="HIGH") for k, v in actions.items()])
