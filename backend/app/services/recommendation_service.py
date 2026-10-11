import re
from typing import Dict
from app.models.playbooks import CONTEXT_GUIDANCE, DEFAULT_ACTION_RULES

GRAPH_ID = re.compile(r'\b(?:EQ_|STEP_|DEP_|BATCH_)\w+')

class RecommendationService:
    def __init__(self):
        self.playbook = DEFAULT_ACTION_RULES

    def get_actions(self, incident_type: str, context: dict | None = None) -> Dict[str, str]:
        context = context or {}
        actions = dict(self.playbook.get(incident_type.upper(), {
            "DEP_PROD": "Contain the incident, identify the last-good state and notify the shift manager."
        }))
        if context.get("node_id"):
            actions["CONTEXT"] = f"Incident origin: {context['node_id']}. Follow the site escalation matrix and record timestamps."
        return actions

    def get_context_guidance(self, asset: dict, incident_type: str) -> dict | None:
        """Steps of the playbook written for this asset, or None when there is none (knowledge gap)."""
        key = CONTEXT_GUIDANCE.get((asset["id"], incident_type))
        if key is None:
            return None
        actions = self.playbook[key]
        # Name the asset instead of its graph ID so text is readable and safe to send to the LLM.
        name = lambda m: asset["name"] if m.group(0) == asset["id"] else "thiết bị liên quan"
        steps = [{"id": f"s{i + 1}", "text": GRAPH_ID.sub(name, text)} for i, text in enumerate(actions.values())]
        containment = GRAPH_ID.sub(name, actions["DEP_QA"]) if "DEP_QA" in actions else None
        return {"source": f"playbook:{asset['id']}/{incident_type}", "steps": steps, "containment": containment}
