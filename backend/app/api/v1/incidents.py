"""Incident simulation and root-cause API endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from neo4j import AsyncDriver

from app.core.database import get_db_driver
from app.schemas.incident import SimulationRequest, SimulationResponse, RootCauseRequest
from app.services.root_cause_service import RootCauseService
from app.services.propagation_service import (
    PropagationDependencyError,
    PropagationNodeNotFoundError,
    PropagationService,
)
from app.services.recommendation_service import RecommendationService

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/simulate", response_model=SimulationResponse)
async def simulate_incident(
    payload: SimulationRequest,
    driver: AsyncDriver = Depends(get_db_driver)
):
    propagation_svc = PropagationService(driver)
    rec_svc = RecommendationService()

    try:
        impacted = await propagation_svc.calculate_forward_impact(payload.node_id, payload.severity)
    except PropagationNodeNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "node_not_found",
                "message": "The requested propagation origin node does not exist.",
            },
        ) from exc
    except PropagationDependencyError as exc:
        logger.warning("Propagation dependency unavailable for node %s", payload.node_id)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "graph_store_unavailable",
                "message": "The graph store is unavailable. Try again later.",
            },
        ) from exc

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
