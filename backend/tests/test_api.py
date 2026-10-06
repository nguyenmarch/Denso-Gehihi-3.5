"""
TODO (handoff - A/B: API tests)
- Add tests for `/incidents/simulate` success and error flows
- Test invalid incident types and node-not-found responses
- Add tests ensuring API response shape matches `SimulationResponse`
"""

import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] in {"ok", "degraded"}

def test_invalid_simulation_node_is_rejected():
    from app.schemas.incident import SimulationRequest
    with pytest.raises(ValueError):
        SimulationRequest(node_id="bad id", incident_type="MACHINE_BREAKDOWN")
