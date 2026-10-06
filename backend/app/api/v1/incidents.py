"""
TODO (handoff - A: Incidents API)
- Ensure `POST /incidents/simulate` validates input and returns stable `SimulationResponse`
- Do not leak raw Neo4j objects; use DTOs from schemas
- Document example request/response for frontend integration
"""

from fastapi import APIRouter, Depends
from neo4j import AsyncDriver
from app.core.database import get_db_driver
from app.schemas.incident import SimulationRequest, SimulationResponse, RootCauseRequest
from app.services.root_cause_service import RootCauseService
from app.services.propagation_service import PropagationService
from app.services.recommendation_service import RecommendationService

router = APIRouter()

@router.post("/simulate", response_model=SimulationResponse)
async def simulate_incident(
    payload: SimulationRequest,
    driver: AsyncDriver = Depends(get_db_driver)
):
    propagation_svc = PropagationService(driver)
    rec_svc = RecommendationService()

    impacted = await propagation_svc.calculate_forward_impact(payload.node_id, payload.severity)
    actions = rec_svc.get_actions(payload.incident_type, {"node_id": payload.node_id})

    return SimulationResponse(
        origin_id=payload.node_id,
        incident_type=payload.incident_type,
        impacted_nodes=impacted,
        actions_by_department=actions
    )

@router.post("/root-cause")
async def root_cause(payload: RootCauseRequest, driver: AsyncDriver = Depends(get_db_driver)):
    return {"defect_node_id": payload.defect_node_id, "root_causes": await RootCauseService(driver).trace_root_causes(payload.defect_node_id)}
