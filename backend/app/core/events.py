from app.core.database import db_pool
import logging

logger = logging.getLogger(__name__)

async def startup_handler():
    await db_pool.connect()
    if not await db_pool.verify_connectivity():
        logger.warning("Neo4j is not reachable; API remains available for health diagnostics")

async def shutdown_handler():
    await db_pool.close()
