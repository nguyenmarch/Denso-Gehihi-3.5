import pytest

from app.core.config import settings
from app.models.playbooks import DEFAULT_ACTION_RULES
from app.services.propagation_service import (
    PropagationDependencyError,
    PropagationNodeNotFoundError,
    PropagationService,
)
from app.services.recommendation_service import RecommendationService


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
        self.queries = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def run(self, query, **params):
        self.queries.append((query, params))
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


def test_decay_calculation():
    severity = 1.0
    decay = 0.75
    distance = 2
    expected = severity * (decay ** distance)
    assert round(expected, 3) == 0.562


def test_playbooks_cover_all_departments():
    assert set(DEFAULT_ACTION_RULES) == {"MACHINE_BREAKDOWN", "MATERIAL_DEFECT", "CYCLE_TIME_SPIKE"}
    for actions in DEFAULT_ACTION_RULES.values():
        assert {"DEP_MAINT", "DEP_PROD", "DEP_QA", "DEP_SCM"} <= set(actions)


def test_recommendation_context():
    actions = RecommendationService().get_actions("machine_breakdown", {"node_id": "EQ_OVEN_01"})
    assert "EQ_OVEN_01" in actions["CONTEXT"]


def test_recommendation_does_not_reuse_another_assets_playbook():
    actions = RecommendationService().get_actions("MACHINE_BREAKDOWN", {"node_id": "EQ_PACK_01"})
    assert set(actions) == {"CONTEXT"}
    assert "EQ_PACK_01" in actions["CONTEXT"] and "EQ_OVEN_01" in actions["CONTEXT"]


@pytest.mark.asyncio
async def test_forward_impact_applies_decay_shortest_distance_and_stable_order():
    session = FakeSession(
        records=[
            {"node_id": "STEP_PACK", "node_type": "ProcessStep", "name": "Packaging", "distance": 3},
            {"node_id": "STEP_AOI", "node_type": "ProcessStep", "name": "AOI", "distance": 2},
            {"node_id": "STEP_REFLOW", "node_type": "ProcessStep", "name": "Reflow", "distance": 2},
            {"node_id": "STEP_AOI", "node_type": "ProcessStep", "name": "AOI", "distance": 1},
            {"node_id": "OUT_OF_RANGE", "node_type": "ProcessStep", "name": "Ignored", "distance": 5},
        ]
    )

    result = await PropagationService(FakeDriver(session)).calculate_forward_impact("EQ_OVEN_01", 1.0)

    assert [(item.node_id, item.distance, item.impact_score) for item in result] == [
        ("STEP_AOI", 1, 0.75),
        ("STEP_REFLOW", 2, 0.562),
        ("STEP_PACK", 3, 0.422),
    ]
    assert ":OPERATES_IN|FLOWS_TO|AFFECTS*1..4" in session.queries[1][0]
    assert session.queries[1][1] == {"node_id": "EQ_OVEN_01"}


@pytest.mark.asyncio
async def test_forward_impact_applies_different_severity():
    session = FakeSession(
        records=[
            {"node_id": "STEP_REFLOW", "node_type": "ProcessStep", "name": "Reflow", "distance": 1},
            {"node_id": "STEP_AOI", "node_type": "ProcessStep", "name": "AOI", "distance": 2},
            {"node_id": "STEP_PACK", "node_type": "ProcessStep", "name": "Packaging", "distance": 3},
        ]
    )

    result = await PropagationService(FakeDriver(session)).calculate_forward_impact("EQ_OVEN_01", 0.5)

    assert [item.impact_score for item in result] == [0.375, 0.281, 0.211]


@pytest.mark.asyncio
async def test_forward_impact_enforces_configured_max_hops(monkeypatch):
    monkeypatch.setattr(settings, "MAX_HOPS", 2)
    session = FakeSession(
        records=[
            {"node_id": "STEP_REFLOW", "node_type": "ProcessStep", "name": "Reflow", "distance": 1},
            {"node_id": "STEP_AOI", "node_type": "ProcessStep", "name": "AOI", "distance": 2},
            {"node_id": "STEP_PACK", "node_type": "ProcessStep", "name": "Packaging", "distance": 3},
        ]
    )

    result = await PropagationService(FakeDriver(session)).calculate_forward_impact("EQ_OVEN_01", 1.0)

    assert [item.node_id for item in result] == ["STEP_REFLOW", "STEP_AOI"]
    assert "*1..2" in session.queries[1][0]


@pytest.mark.asyncio
async def test_forward_impact_rejects_missing_origin_node():
    session = FakeSession(origin_exists=False)

    with pytest.raises(PropagationNodeNotFoundError):
        await PropagationService(FakeDriver(session)).calculate_forward_impact("UNKNOWN", 1.0)

    assert len(session.queries) == 1


@pytest.mark.asyncio
async def test_forward_impact_wraps_graph_failure():
    session = FakeSession(error=RuntimeError("connection refused"))

    with pytest.raises(PropagationDependencyError):
        await PropagationService(FakeDriver(session)).calculate_forward_impact("EQ_OVEN_01", 1.0)
