from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.events import startup_handler, shutdown_handler
from app.api.v1.router import api_router
from app.core.config import settings

@asynccontextmanager
async def lifespan(_: FastAPI):
    await startup_handler()
    try:
        yield
    finally:
        await shutdown_handler()


app = FastAPI(title="Production Incident Propagation Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    from app.core.database import db_pool
    connected = await db_pool.verify_connectivity()
    return {"status": "ok" if connected else "degraded", "database": "connected" if connected else "unavailable",
            "capabilities": {"synthetic_ingestion": "enabled", "optional_ai": "enabled" if settings.INAV_AI_MODE == "gemini" else "disabled",
                             "external_factory_integration": "disabled", "control_write": "disabled"},
            "dependencies": {"ai": {"mode": settings.INAV_AI_MODE,
                                     "configured": bool(settings.INAV_GEMINI_API_KEY.get_secret_value()),
                                     "policy": settings.INAV_DATA_POLICY},
                             "plant_simulation": "running"}}
