# Constants and Node Labels mapping
class NodeLabels:
    PROCESS_STEP = "ProcessStep"
    EQUIPMENT = "Equipment"
    BATCH = "Batch"
    INCIDENT_EVENT = "IncidentEvent"
    DEPARTMENT = "Department"

class RelationTypes:
    FLOWS_TO = "FLOWS_TO"
    OPERATES_IN = "OPERATES_IN"
    PROCESSED_BY = "PROCESSED_BY"
    CAN_CAUSE = "CAN_CAUSE"
    AFFECTS = "AFFECTS"
    RESPONSIBLE_FOR = "RESPONSIBLE_FOR"
