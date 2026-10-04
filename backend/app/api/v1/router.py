from fastapi import APIRouter
from app.api.v1 import incidents, graph, recommendations

api_router = APIRouter()
api_router.include_router(incidents.router, prefix="/incidents", tags=["Incidents"])
api_router.include_router(graph.router, prefix="/graph", tags=["Knowledge Graph"])
api_router.include_router(recommendations.router, prefix="/recommendations", tags=["Action Playbooks"])
