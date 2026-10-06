import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import get_db_driver
from app.main import app


class FakeResult:
    def __init__(self, *, record=None, records=None):
        self.record = record
        self.records = records or []

    async def single(self):
        return self.record

    async def data(self):
        return self.records


class FakeSession:
    def __init__(self, *, origin_exists=True, records=None, error=None):
        self.origin_exists = origin_exists
        self.records = records or []
        self.error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def run(self, query, **_params):
        if self.error:
            raise self.error
        if "count(origin) > 0 AS origin_exists" in query:
            return FakeResult(record={"origin_exists": self.origin_exists})
        return FakeResult(records=self.records)


class FakeDriver:
    def __init__(self, session):
        self.session_instance = session

    def session(self):
        return self.session_instance


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


async def post_simulation(driver, payload):
    app.dependency_overrides[get_db_driver] = lambda: driver
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.post("/api/v1/incidents/simulate", json=payload)


@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] in {"ok", "degraded"}


@pytest.mark.asyncio
async def test_simulation_returns_stable_response_contract():
    driver = FakeDriver(
        FakeSession(
            records=[
                {"node_id": "STEP_REFLOW", "node_type": "ProcessStep", "name": "Reflow", "distance": 1},
                {"node_id": "STEP_AOI", "node_type": "ProcessStep", "name": "AOI", "distance": 2},
            ]
        )
    )

    response = await post_simulation(
        driver,
        {
            "node_id": "EQ_OVEN_01",
            "incident_type": " machine_breakdown ",
            "severity": 1.0,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["origin_id"] == "EQ_OVEN_01"
    assert body["incident_type"] == "MACHINE_BREAKDOWN"
    assert body["impacted_nodes"] == [
        {
            "node_id": "STEP_REFLOW",
            "node_type": "ProcessStep",
            "name": "Reflow",
            "distance": 1,
            "impact_score": 0.75,
        },
        {
            "node_id": "STEP_AOI",
            "node_type": "ProcessStep",
            "name": "AOI",
            "distance": 2,
            "impact_score": 0.562,
        },
    ]
    assert set(body["actions_by_department"]) >= {
        "DEP_MAINT",
        "DEP_PROD",
        "DEP_QA",
        "DEP_SCM",
        "CONTEXT",
    }


@pytest.mark.asyncio
async def test_simulation_returns_404_for_missing_origin_node():
    response = await post_simulation(
        FakeDriver(FakeSession(origin_exists=False)),
        {
            "node_id": "UNKNOWN",
            "incident_type": "MACHINE_BREAKDOWN",
            "severity": 1.0,
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "node_not_found"


@pytest.mark.asyncio
async def test_simulation_returns_503_when_graph_store_fails():
    response = await post_simulation(
        FakeDriver(FakeSession(error=RuntimeError("connection refused"))),
        {
            "node_id": "EQ_OVEN_01",
            "incident_type": "MACHINE_BREAKDOWN",
            "severity": 1.0,
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "graph_store_unavailable"


@pytest.mark.asyncio
async def test_simulation_rejects_invalid_payloads_before_database_access():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        invalid_type = await client.post(
            "/api/v1/incidents/simulate",
            json={"node_id": "EQ_OVEN_01", "incident_type": "UNKNOWN", "severity": 1.0},
        )
        invalid_type_value = await client.post(
            "/api/v1/incidents/simulate",
            json={"node_id": "EQ_OVEN_01", "incident_type": 123, "severity": 1.0},
        )
        invalid_severity = await client.post(
            "/api/v1/incidents/simulate",
            json={"node_id": "EQ_OVEN_01", "incident_type": "MACHINE_BREAKDOWN", "severity": 0},
        )
        invalid_node = await client.post(
            "/api/v1/incidents/simulate",
            json={"node_id": "bad id", "incident_type": "MACHINE_BREAKDOWN", "severity": 1.0},
        )

    assert invalid_type.status_code == 422
    assert invalid_type_value.status_code == 422
    assert invalid_severity.status_code == 422
    assert invalid_node.status_code == 422
