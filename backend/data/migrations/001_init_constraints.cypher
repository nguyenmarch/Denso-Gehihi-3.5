// Neo4j 5 idempotent constraints and indexes.
CREATE CONSTRAINT unique_equipment_id IF NOT EXISTS FOR (e:Equipment) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT unique_process_id IF NOT EXISTS FOR (p:ProcessStep) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT unique_batch_id IF NOT EXISTS FOR (b:Batch) REQUIRE b.id IS UNIQUE;
CREATE CONSTRAINT unique_department_id IF NOT EXISTS FOR (d:Department) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT unique_incident_id IF NOT EXISTS FOR (i:IncidentEvent) REQUIRE i.id IS UNIQUE;

CREATE INDEX idx_process_name IF NOT EXISTS FOR (p:ProcessStep) ON (p.name);
CREATE INDEX idx_equipment_name IF NOT EXISTS FOR (e:Equipment) ON (e.name);
CREATE INDEX idx_batch_status IF NOT EXISTS FOR (b:Batch) ON (b.status);
CREATE INDEX idx_incident_status IF NOT EXISTS FOR (i:IncidentEvent) ON (i.status);
CREATE INDEX idx_incident_severity IF NOT EXISTS FOR (i:IncidentEvent) ON (i.severity);
