import re
from typing import Dict
from app.models.playbooks import CONTEXT_GUIDANCE, DEFAULT_ACTION_RULES

GRAPH_ID = re.compile(r'\b(?:EQ_|STEP_|DEP_|BATCH_)\w+')

class RecommendationService:
    def __init__(self):
        self.playbook = DEFAULT_ACTION_RULES

    def get_actions(self, incident_type: str, context: dict | None = None) -> Dict[str, str]:
        context = context or {}
        incident_type = incident_type.upper()
        node_id = context.get("node_id")
        # Playbooks are written for one asset each (see CONTEXT_GUIDANCE); applying the oven's steps to
        # another node would show instructions for the wrong machine, so other origins get only a gap note.
        written_for = [asset for (asset, kind) in CONTEXT_GUIDANCE if kind == incident_type]
        if node_id and written_for and node_id not in written_for:
            return {"CONTEXT": f"Chưa có playbook {incident_type} cho {node_id} (playbook hiện viết cho {', '.join(written_for)}). "
                               "Không áp dụng hành động của thiết bị khác; cần chuyên gia bổ sung."}
        actions = dict(self.playbook.get(incident_type, {
            "DEP_PROD": "Contain the incident, identify the last-good state and notify the shift manager."
        }))
        if node_id:
            actions["CONTEXT"] = f"Incident origin: {node_id}. Follow the site escalation matrix and record timestamps."
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
