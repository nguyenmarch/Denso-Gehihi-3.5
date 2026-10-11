"""
TODO (handoff - B: Neo4j connectivity & migrations)
- Add migrations/seed helpers under `backend/data/` and document usage
- Ensure connector exposes health/verify methods and handles unavailable DB
- Document idempotent seed process (no duplicates on rerun)
"""

from neo4j import AsyncGraphDatabase, AsyncDriver
from app.core.config import settings
import asyncio

class Neo4jConnector:
    def __init__(self):
        self.driver: AsyncDriver | None = None

    async def connect(self) -> AsyncDriver:
        if self.driver is None:
            self.driver = AsyncGraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                connection_timeout=3,
                connection_acquisition_timeout=3,
            )
        return self.driver

    async def verify_connectivity(self) -> bool:
        if self.driver is None:
            await self.connect()
        try:
            await asyncio.wait_for(self.driver.verify_connectivity(), timeout=2)
            return True
        except Exception:
            return False

    async def close(self):
        if self.driver:
            await self.driver.close()
            self.driver = None

db_pool = Neo4jConnector()

async def get_db_driver() -> AsyncDriver:
    return await db_pool.connect()
