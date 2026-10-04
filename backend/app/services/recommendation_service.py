from typing import Dict
from app.models.playbooks import DEFAULT_ACTION_RULES

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
