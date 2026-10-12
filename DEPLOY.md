# Deploy guide

## Option 1: fastest and easiest

### Backend on Railway

1. Push repo to GitHub.
2. Create a new Railway project.
3. Add a service from the repository.
4. Set the service root to `backend`.
5. Use the existing Dockerfile.
6. Add environment variables:

```env
NEO4J_URI=bolt://<your-neo4j-host>:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<your-password>
CORS_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:5173
INAV_AI_MODE=knowledge
INAV_DATA_POLICY=local_only
INAV_GEMINI_API_KEY=
```

7. Deploy.
8. Confirm health check: `https://<railway-url>/health`

### Frontend on Vercel

1. Import the repo to Vercel.
2. Set root directory to `frontend`.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variable:

```env
VITE_API_BASE=https://<railway-url>/api/v1
```

6. Deploy.

### Database on Neo4j AuraDB

1. Create a Neo4j AuraDB instance.
2. Copy the connection URI.
3. Set `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` from AuraDB.

---

## Option 2: one-click local Docker deploy

```bash
cd chain-incident-graph
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose up --build
```

Then check:

- Backend: http://localhost:8000/health
- Neo4j browser: http://localhost:7474

---

## Notes

- Do not deploy with `--reload`; it is only for local development.
- The frontend reads `VITE_API_BASE` from env instead of assuming `localhost:8000`.
- The backend `CORS_ORIGINS` must include the exact Vercel domain used in production.
