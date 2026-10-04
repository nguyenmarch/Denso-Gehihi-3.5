import asyncio
from app.models.playbooks import DEFAULT_ACTION_RULES
from app.services.recommendation_service import RecommendationService
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

def test_forward_impact_applies_decay():
    class Result:
        async def data(self):
            return [{"node_id": "A", "node_type": "ProcessStep", "name": "A", "depth": 1}, {"node_id": "B", "node_type": "ProcessStep", "name": "B", "depth": 2}]
    class Session:
        async def __aenter__(self): return self
        async def __aexit__(self, *_): return None
        async def run(self, *_args, **_kwargs): return Result()
    class Driver:
        def session(self): return Session()
    from app.services.propagation_service import PropagationService
    result = asyncio.run(PropagationService(Driver()).calculate_forward_impact("ORIGIN", 1.0))
    assert [item.impact_score for item in result] == [0.75, 0.562]
