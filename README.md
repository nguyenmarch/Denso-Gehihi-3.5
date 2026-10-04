# Production Chain Incident Propagation & Root Cause Engine

An event-driven knowledge graph and dashboard for analyzing incident propagation across electronics and precision assembly lines.

The example production flow is:

```text
Solder Paste → SMT Pick & Place → Reflow Soldering → AOI Inspection → Final Packaging
```

The system supports forward impact simulation, backward root-cause tracing, and department-specific response playbooks for Maintenance, Production, QA/QC, and SCM.

## Architecture

- **Neo4j** stores the process, equipment, batch, department, and incident graph.
- **FastAPI** exposes propagation, root-cause, topology, and recommendation APIs.
- **React + TypeScript + Cytoscape.js** renders the interactive production graph.
- **Background workers** provide SCADA anomaly checks and MES batch synchronization hooks.

Impact propagation uses:

```text
ImpactScore = Severity × (0.75 ^ distance)
```

The decay rate and maximum traversal depth are configurable through environment variables.

## Project structure

```text
backend/
  app/
    api/             FastAPI routes
    core/            Configuration, database, lifecycle handlers
    models/          Graph constants and incident playbooks
    schemas/         Request and response DTOs
    services/        Propagation, root-cause, and recommendation logic
    workers/         SCADA and MES worker implementations
  data/
    migrations/      Neo4j constraints and indexes
    seed_scenarios.cypher
  tests/
frontend/
  src/
    components/      Graph canvas, incident controls, action matrix
    services/        Backend API client
    types/           Shared TypeScript types
```

## Quick start with Docker

Requirements: Docker and Docker Compose.

1. Start Neo4j and the backend:

   ```bash
   docker compose up --build
   ```

2. Apply the schema and seed data:

   ```bash
   docker exec -i incident_neo4j cypher-shell \
     -u neo4j -p incidentpassword123 \
     < backend/data/migrations/001_init_constraints.cypher

   docker exec -i incident_neo4j cypher-shell \
     -u neo4j -p incidentpassword123 \
     < backend/data/seed_scenarios.cypher
   ```

3. Check the backend:

   ```bash
   curl http://localhost:8000/health
   ```

Neo4j Browser is available at [http://localhost:7474](http://localhost:7474).

## Local development

### Backend

Use Python 3.11+:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```

Set `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD` in `.env`. For a locally running Neo4j instance, use `NEO4J_URI=bolt://localhost:7687`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend defaults to `http://localhost:5173` and calls the backend at `http://localhost:8000/api/v1`. Override the API URL with:

```bash
VITE_API_BASE=http://localhost:8000/api/v1 npm run dev
```

## API overview

Interactive OpenAPI documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

### Simulate forward impact

```bash
curl -X POST http://localhost:8000/api/v1/incidents/simulate \
  -H 'Content-Type: application/json' \
  -d '{
    "node_id": "EQ_OVEN_01",
    "incident_type": "MACHINE_BREAKDOWN",
    "severity": 1.0
  }'
```

Supported incident types:

- `MACHINE_BREAKDOWN` — Reflow oven heater failure
- `MATERIAL_DEFECT` — Capacitor tolerance drift at SMT
- `CYCLE_TIME_SPIKE` — AOI inspection bottleneck

### Trace root causes

```bash
curl -X POST http://localhost:8000/api/v1/incidents/root-cause \
  -H 'Content-Type: application/json' \
  -d '{"defect_node_id": "STEP_AOI"}'
```

### Retrieve graph data

```bash
curl http://localhost:8000/api/v1/graph/topology
curl http://localhost:8000/api/v1/graph/node/STEP_AOI
```

### Retrieve a playbook

```bash
curl http://localhost:8000/api/v1/recommendations/MACHINE_BREAKDOWN
```

## Configuration

The backend reads these settings from environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j Bolt endpoint |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `incidentpassword123` | Neo4j password |
| `DECAY_RATE` | `0.75` | Per-hop impact decay |
| `MAX_HOPS` | `4` | Maximum forward traversal depth |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Comma-separated browser origins |

## Testing

From the repository root:

```bash
PYTHONPATH=backend pytest -q
```

For a frontend production build:

```bash
cd frontend
npm run build
```

## Operational notes

- Seed scripts are idempotent and use `MERGE`, so they can be safely rerun during development.
- The backend remains available in a degraded state when Neo4j is unavailable; `/health` reports database connectivity.
- The SCADA and MES workers are integration boundaries for real MQTT/Kafka and MES adapters. Their current loops provide deterministic development behavior.
